/*
 * Cordyceps growth engine.
 *
 * Draws the slime-mold network behind the page on three fixed canvases:
 *   goo     – thick white growth on black, run through a CSS `blur() contrast()` filter so strokes merge into organic forms
 *   hyphae  – fine threads and specks, unfiltered
 *   spores  – drifting spores, spore puffs and out-of-focus bokeh
 *
 * Growth is driven by scroll: a trunk steers through each chapter's open side, a branch reaches each
 * chapter's text "clearing", and the chapter reveals when the branch lands. Clicks, a timer and the
 * contact form spawn live blooms; pressing and dragging the mouse grows a vein along the cursor. Everything the engine needs from the page is found by id/class:
 *   #hero, #heroText, .chapter > .body, #footer, #footText
 *
 * startGrowth() returns a cleanup function (safe for React Strict Mode's double effects).
 */

import { BLOOM_EVENT, type BloomDetail } from './bloom-event';

type Rect = { l: number; t: number; r: number; b: number; w: number; h: number };
type Box = { l: number; t: number; r: number; b: number };
type Pt = [number, number];

type WalkOpts = {
  x: number; y: number; a: number; w: number; b: number; rate: number; max: number;
  wobble: number; steer: number; taper: number; minW: number; bp: number; depth: number;
  layer?: number; fuse?: boolean; pid?: number; free?: boolean; noBulb?: boolean;
  targets?: Pt[];
  onArrive?: (ti: number, x: number, y: number, b: number) => void;
  onStep?: (x: number, y: number, b: number, a: number) => void;
};

type Sink = { SG: number[]; CI: number[]; max: number };
type Lists = (number[] | undefined)[];
type Bucket = { w: Lists; k: Lists; hy: Lists; cw: number[]; cb: number[]; cd: number[]; cl: number[] };
type Live = { t0: number; SG: ArrayLike<number>; CI: ArrayLike<number>; B: Bucket; max: number; top: number; bot: number; gl: number };
type Strand = Live & { SG: number[]; CI: number[] };
type Flood = { top: number; bot: number; b0: number; b1: number };
type Puff = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number };
type Source = [ArrayLike<number>, ArrayLike<number>, Bucket, number, boolean];

export type GrowthElements = {
  goo: HTMLCanvasElement;
  hyphae: HTMLCanvasElement;
  spores: HTMLCanvasElement;
  substrate: HTMLElement;
};

// segment layout: x1,y1,x2,y2,w,birth,layer  (layer 0 = goo white, 1 = thin hyphae, 2 = goo black)
// circle layout:  x,y,r,birth,layer          (0 = goo white, 2 = goo black, 3 = light speck, 4 = dark speck)
const BH = 256;       // bucket height (px of document)
const HC = 22;        // fusion hash cell
const BSPEED = 0.24;  // live bloom growth, birth units per ms
const CLICK_IGNORE = 'a, button, input, textarea, label, form, nav, .clearing, .hero-text, footer';

export function startGrowth(el: GrowthElements): () => void {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const g = el.goo.getContext('2d');
  const h = el.hyphae.getContext('2d');
  const s = el.spores.getContext('2d');
  const hero = document.getElementById('hero');
  const heroText = document.getElementById('heroText');
  const footer = document.getElementById('footer');
  const footText = document.getElementById('footText');
  const chapters = Array.from(document.querySelectorAll<HTMLElement>('.chapter'));
  if (!g || !h || !s || !hero || !heroText || !footer || !footText) return () => {};

  let alive = true;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => { const id = window.setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms); timers.add(id); return id; };

  if (reduce) { chapters.forEach(c => c.classList.remove('dormant')); footer.classList.remove('dormant'); }

  // ---------- theme colors (re-read when data-theme changes) ----------
  const col = { dim: '#5a5a5a', hypha: '#fff', voidc: '#050505', rgb: '255,255,255' };
  let dirty = true;
  function readColors() {
    const cs = getComputedStyle(root);
    col.dim = cs.getPropertyValue('--hypha-dim').trim() || col.dim;
    col.hypha = cs.getPropertyValue('--hypha').trim() || col.hypha;
    col.voidc = cs.getPropertyValue('--void').trim() || col.voidc;
    col.rgb = cs.getPropertyValue('--rgb').trim() || col.rgb;
    dirty = true;
  }
  const themeObserver = new MutationObserver(() => { readColors(); if (reduce) draw(); });
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- seeded rng ----------
  let seed = 11;
  // A fresh layout on every page load: one seed per visit. It is kept for the whole visit, so rebuilds
  // (resizing, fonts swapping in) regrow the same network instead of reshuffling it.
  const runSeed = (Math.random() * 2 ** 31) | 0;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

  // ---------- network state ----------
  let SG = new Float32Array(0), CI = new Float32Array(0), BK: Bucket[] = [];
  let flood: Flood = { top: 0, bot: 0, b0: Infinity, b1: Infinity };
  let maxBirth = 0, trunkY: number[] = [], trunkB: number[] = [];
  let reveals: { el: HTMLElement; birth: number }[] = [];
  let keep: Box[] = [], hash = new Map<number, number[]>(), lineage = 0, introTarget = 0;
  let OUT: Sink | null = null; // where seg/circ write: the static network during build, or one live bloom

  function seg(x1: number, y1: number, x2: number, y2: number, w: number, b: number, L: number) { const o = OUT!; o.SG.push(x1, y1, x2, y2, w, b, L); if (b > o.max) o.max = b; }
  function circ(x: number, y: number, r: number, b: number, L: number) { const o = OUT!; o.CI.push(x, y, r, b, L); if (b > o.max) o.max = b; }
  function inKeep(x: number, y: number) { for (const k of keep) if (x > k.l && x < k.r && y > k.t && y < k.b) return true; return false; }
  function hput(x: number, y: number, id: number) { const k = Math.floor(x / HC) * 100003 + Math.floor(y / HC); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(x, y, id); }
  function hfind(x: number, y: number, id: number, pid: number, r: number): Pt | null {
    const cx = Math.floor(x / HC), cy = Math.floor(y / HC), r2 = r * r;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const a = hash.get((cx + dx) * 100003 + cy + dy); if (!a) continue;
      for (let i = 0; i < a.length; i += 3) {
        if (a[i + 2] === id || a[i + 2] === pid) continue;
        const ex = a[i] - x, ey = a[i + 1] - y; if (ex * ex + ey * ey < r2) return [a[i], a[i + 1]];
      }
    }
    return null;
  }

  // A growing vein. Thick goo veins are lumpy, fuse into loops and end in bulbs (Physarum-like).
  function walk(o: WalkOpts) {
    const id = ++lineage, pid = o.pid || 0, L = o.layer || 0, gooL = L !== 1, step = 5, T = o.targets;
    let x = o.x, y = o.y, a = o.a, w = o.w, b = o.b, len = 0, ti = 0, n = 0;
    const ph = rnd() * 6.28, ph2 = rnd() * 6.28;
    while (len < o.max) {
      if (T) {
        const t = T[ti], dx = t[0] - x, dy = t[1] - y, d = Math.hypot(dx, dy);
        if (d < 16) { o.onArrive?.(ti, x, y, b); if (++ti >= T.length) break; continue; }
        let da = Math.atan2(dy, dx) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
        a += da * (d < 60 ? 0.6 : o.steer * (d < 160 ? 2 : 1));
      }
      a += (rnd() - 0.5) * o.wobble;
      const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
      if (!o.free && inKeep(nx, ny)) break;
      b += step * o.rate;
      const lump = gooL ? 1 + 0.3 * Math.sin(len * 0.045 + ph) + 0.15 * Math.sin(len * 0.11 + ph2) : 1;
      seg(x, y, nx, ny, w * lump, b, L);
      if (L === 0) hput(nx, ny, id);
      x = nx; y = ny; len += step; n++;
      o.onStep?.(x, y, b, a);
      if (o.fuse && len > 28 && !(n & 1)) {
        const p = hfind(x, y, id, pid, 13);
        if (p) { seg(x, y, p[0], p[1], w, b + 3, L); return; }
      }
      w = Math.max(o.minW, w * o.taper);
      if (o.depth < 3 && rnd() < o.bp) {
        const gooChild = L === 0 && o.depth < 2 && rnd() < 0.74;
        const cw = gooChild ? Math.max(3.2, w * (0.45 + rnd() * 0.2)) : 0.6 + rnd() * 0.7;
        walk({ x, y, a: a + (rnd() < .5 ? -1 : 1) * (0.45 + rnd() * 0.9), w: cw, b, rate: o.rate * 1.15,
               max: gooChild ? 50 + rnd() * 170 : 30 + rnd() * 120, wobble: gooChild ? 0.55 : 0.8, steer: 0,
               taper: gooChild ? 0.994 : 0.99, minW: gooChild ? 3 : 0.5, bp: gooChild ? o.bp * 0.85 : 0.03,
               depth: o.depth + 1, layer: gooChild ? 0 : 1, fuse: gooChild, pid: id });
      }
    }
    if (gooL && !o.noBulb) circ(x, y, w * 0.8 + 1.4, b, L);
  }

  // Amoeboid plasmodium: merged discs, a few bubbles punched through, specks around it.
  function mass(cx: number, cy: number, R: number, b0: number, rate: number, holes: number) {
    const n = Math.round(12 + R * 0.45);
    for (let i = 0; i < n; i++) {
      const t = rnd() * 6.283, rr = Math.sqrt(rnd()) * R;
      circ(cx + Math.cos(t) * rr * 1.25, cy + Math.sin(t) * rr * 0.85, R * (0.12 + rnd() * 0.22), b0 + rr * rate, 0);
    }
    for (let i = 0; i < holes; i++) {
      const t = rnd() * 6.283, rr = Math.sqrt(rnd()) * R * 0.7;
      circ(cx + Math.cos(t) * rr * 1.2, cy + Math.sin(t) * rr * 0.8, 3.6 + rnd() * R * 0.09, b0 + R * rate + 20 + rnd() * 40, 2);
    }
    for (let i = 0; i < Math.round(R * 0.7); i++) {
      const t = rnd() * 6.283, rr = R * (1.1 + rnd() * 1.3);
      circ(cx + Math.cos(t) * rr * 1.3, cy + Math.sin(t) * rr * 0.9, 0.7 + rnd() * 1.5, b0 + rr * rate, 3);
    }
  }

  // A cordyceps fruiting body: a stalk rises out of the growth, swells into a head and bursts spores.
  function fruit(x: number, y: number, a: number, len: number, b0: number, rate: number, L = 0) {
    let tx = x, ty = y, tb = b0;
    walk({ x, y, a, w: L === 2 ? 8 + rnd() * 6 : 4.4 + rnd() * 1.4, b: b0, rate, max: len, wobble: 0.24, steer: 0, taper: 0.996,
           minW: L === 2 ? 5 : 3.2, bp: 0, depth: 3, layer: L, noBulb: true, free: L === 2,
           onStep(px, py, pb) { tx = px; ty = py; tb = pb; } });
    const hb = tb + 12, hr = L === 2 ? 10 + rnd() * 9 : 5 + rnd() * 3.5;
    circ(tx, ty, hr, hb, L);
    const n = L === 2 ? 26 : 16;
    for (let d = 0; d < n; d++) {
      const t = a + (rnd() - .5) * 2.4, rr = hr + 8 + rnd() * (L === 2 ? 90 : 55);
      circ(tx + Math.cos(t) * rr * 1.3, ty + Math.sin(t) * rr * 0.8, 0.6 + rnd() * 1.3, hb + 18 + rr * 0.6, L === 2 ? 4 : 3);
    }
  }

  // A bloom: a plasmodium bursts open, radiates branching veins that fuse into loops, and sprouts fruiting bodies.
  function bloom(x: number, y: number, R: number, b0: number, rate: number, away = -Math.PI / 2) {
    mass(x, y, R * 0.26, b0, rate, Math.max(1, Math.round(R / 30)));
    const rays = 6 + Math.floor(rnd() * 4);
    for (let k = 0; k < rays; k++)
      walk({ x, y, a: (k / rays) * 6.283 + rnd() * 0.5, w: 4.4 + rnd() * 2.4, b: b0 + R * 0.08 * rate, rate, max: R * (0.55 + rnd() * 0.75),
             wobble: 0.55, steer: 0, taper: 0.995, minW: 3.2, bp: 0.11, depth: 1, fuse: true });
    const fr = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < fr; k++) {
      const a = away + (rnd() - .5) * 1.6;
      fruit(x + Math.cos(a) * R * 0.22, y + Math.sin(a) * R * 0.16, a, R * (0.22 + rnd() * 0.3), b0 + R * 0.35 * rate, rate * 0.9);
    }
  }

  // Reticulated network: the centroid dual of a jittered triangular lattice, clipped to an organic blob and
  // grown outward from its entry point by graph distance.
  function mesh(cx: number, cy: number, R: number, b0: number, rate: number, sp: number, entry: Pt, drop = 0.2) {
    const cols = Math.ceil(R * 2.6 / sp) + 2, rows = Math.ceil(R * 2.6 / (sp * 0.866)) + 2;
    const x0 = cx - R * 1.3, y0 = cy - R * 1.3, P: number[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
      P.push(x0 + i * sp + (j & 1 ? sp / 2 : 0) + (rnd() - .5) * sp * 0.64, y0 + j * sp * 0.866 + (rnd() - .5) * sp * 0.64);
    const id = (i: number, j: number) => j * cols + i, T: number[] = [];
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      if (!(j & 1)) T.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
      else T.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
    }
    const nT = T.length / 3, C = new Float64Array(nT * 2);
    for (let t = 0; t < nT; t++) {
      const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
      C[t * 2] = (P[a * 2] + P[b * 2] + P[c * 2]) / 3; C[t * 2 + 1] = (P[a * 2 + 1] + P[b * 2 + 1] + P[c * 2 + 1]) / 3;
    }
    const ph = rnd() * 6.28, k1 = 2 + Math.floor(rnd() * 3);
    const inside = (x: number, y: number) => { const dx = x - cx, dy = y - cy, an = Math.atan2(dy, dx);
      return Math.hypot(dx, dy) < R * (0.78 + 0.2 * Math.sin(an * k1 + ph) + 0.08 * Math.sin(an * 5 + ph * 2)) && !inKeep(x, y); };
    const firstTri = new Map<number, number>(), E: number[] = [], adj: number[][] = Array.from({ length: nT }, () => []);
    for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) {
      const u = T[t * 3 + e], v = T[t * 3 + (e + 1) % 3], key = Math.min(u, v) * 1e6 + Math.max(u, v);
      const t2 = firstTri.get(key);
      if (t2 !== undefined) {
        if (inside(C[t * 2], C[t * 2 + 1]) && inside(C[t2 * 2], C[t2 * 2 + 1]) && rnd() > drop) {
          const ei = E.length / 2; E.push(t, t2); adj[t].push(t2, ei); adj[t2].push(t, ei);
        }
      } else firstTri.set(key, t);
    }
    let s0 = -1, best = 1e18;
    for (let t = 0; t < nT; t++) if (adj[t].length) { const d = (C[t * 2] - entry[0]) ** 2 + (C[t * 2 + 1] - entry[1]) ** 2; if (d < best) { best = d; s0 = t; } }
    if (s0 < 0) return;
    const dist = new Float64Array(nT).fill(Infinity), done = new Uint8Array(nT); dist[s0] = 0;
    for (;;) {
      let u = -1, m = Infinity;
      for (let t = 0; t < nT; t++) if (!done[t] && dist[t] < m) { m = dist[t]; u = t; }
      if (u < 0) break; done[u] = 1;
      for (let k = 0; k < adj[u].length; k += 2) {
        const v = adj[u][k], d = m + Math.hypot(C[u * 2] - C[v * 2], C[u * 2 + 1] - C[v * 2 + 1]);
        if (d < dist[v]) dist[v] = d;
      }
    }
    walk({ x: entry[0], y: entry[1], a: Math.atan2(C[s0 * 2 + 1] - entry[1], C[s0 * 2] - entry[0]), w: 5, b: b0 - 30, rate: 0.6, max: 900,
           targets: [[C[s0 * 2], C[s0 * 2 + 1]]], wobble: 0.4, steer: 0.2, taper: 1, minW: 4, bp: 0, depth: 3, free: true, noBulb: true });
    let far = 0;
    for (let e = 0; e < E.length; e += 2) {
      let u = E[e], v = E[e + 1];
      if (!isFinite(dist[u]) || !isFinite(dist[v])) continue;
      if (dist[u] > dist[v]) { const tmp = u; u = v; v = tmp; }
      if (dist[v] > far) far = dist[v];
      const ux = C[u * 2], uy = C[u * 2 + 1], vx = C[v * 2], vy = C[v * 2 + 1];
      const w = 2.9 + 4.2 * Math.exp(-dist[u] / (R * 0.6)) + rnd() * 2.2;
      const nx = -(vy - uy), ny = vx - ux, nl = Math.hypot(nx, ny) || 1, off = (rnd() - .5) * sp * 0.22;
      const mx = (ux + vx) / 2 + nx / nl * off, my = (uy + vy) / 2 + ny / nl * off;
      const bu = b0 + dist[u] * rate, bv = b0 + dist[v] * rate;
      seg(ux, uy, mx, my, w, (bu + bv) / 2, 0); seg(mx, my, vx, vy, w * (0.85 + rnd() * 0.3), bv, 0);
    }
    for (let t = 0; t < nT; t++) if (isFinite(dist[t]) && adj[t].length >= 6) circ(C[t * 2], C[t * 2 + 1], 2.6 + rnd() * 1.8, b0 + dist[t] * rate, 0);
    for (let k = 0; k < 4; k++) { // fruiting bodies off the outer rim once the mesh has filled
      let t = -1;
      for (let tries = 0; tries < 30; tries++) { const c = Math.floor(rnd() * nT); if (isFinite(dist[c]) && dist[c] > far * 0.7) { t = c; break; } }
      if (t < 0) continue;
      const a = Math.atan2(C[t * 2 + 1] - cy, C[t * 2] - cx);
      fruit(C[t * 2], C[t * 2 + 1], a + (rnd() - .5) * 0.6, 26 + rnd() * 46, b0 + far * rate + 20 + rnd() * 60, 0.5);
    }
  }

  function docRect(node: Element): Rect { const r = node.getBoundingClientRect(); return { l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY, w: r.width, h: r.height }; }
  function inflate(r: Box, p: number): Box { return { l: r.l - p, t: r.t - p, r: r.r + p, b: r.b + p }; }

  // ---------- buckets: indices grouped by layer and width for fast drawing ----------
  const newBucket = (): Bucket => ({ w: [], k: [], hy: [], cw: [], cb: [], cd: [], cl: [] });
  function addSeg(B: Bucket, A: ArrayLike<number>, i: number) {
    const L = A[i + 6], w = A[i + 4];
    if (L === 1) { const c = Math.max(1, Math.min(6, Math.round(w * 2))); (B.hy[c] ??= []).push(i); }
    else { const c = Math.max(1, Math.min(24, Math.round(w))); const arr = L === 2 ? B.k : B.w; (arr[c] ??= []).push(i); }
  }
  function addCirc(B: Bucket, A: ArrayLike<number>, i: number) { const L = A[i + 4]; (L === 0 ? B.cw : L === 2 ? B.cb : L === 3 ? B.cd : B.cl).push(i); }

  function birthAtY(y: number) {
    if (!trunkY.length) return 0;
    let lo = 0, hi = trunkY.length - 1;
    if (y <= trunkY[0]) return trunkB[0];
    if (y >= trunkY[hi]) return Math.max(maxBirth, OUT ? OUT.max : 0) + 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (trunkY[m] < y) lo = m + 1; else hi = m; }
    return trunkB[lo];
  }

  function build() {
    seed = runSeed; OUT = { SG: [], CI: [], max: 0 }; trunkY = []; trunkB = []; reveals = []; hash = new Map(); lineage = 0;
    const W = innerWidth, VHh = innerHeight, mobile = W <= 820;
    const H = docRect(hero!), text = docRect(heroText!);
    const foot = docRect(footer!), fText = docRect(footText!);
    const docH = document.documentElement.scrollHeight;
    const bodies = chapters.map(c => docRect(c.querySelector('.body') ?? c));
    keep = [inflate(text, mobile ? 18 : 40), inflate(fText, 40), ...bodies.map(b => inflate(b, 14))];

    // opening: a dendritic, looping network around a plasmodium, to the right of the credits
    // the opening colony starts somewhere new on every load: anywhere in the open ground around the credits
    const textZone: Box = mobile
      ? { l: text.l - 70, t: text.t - 80, r: text.r + 70, b: text.b + 60 }
      : { l: text.l - 170, t: text.t - 110, r: text.r + 170, b: text.b + 150 };
    const inZone = (x: number, y: number) => x > textZone.l && x < textZone.r && y > textZone.t && y < textZone.b;
    let S: Pt = mobile ? [W * 0.62, H.t + VHh * 0.26] : [W * 0.68, H.t + VHh * 0.40];
    for (let tries = 0; tries < 60; tries++) {
      const p: Pt = mobile
        ? [W * (0.18 + rnd() * 0.64), H.t + VHh * (0.12 + rnd() * 0.3)]
        : [W * (0.1 + rnd() * 0.82), H.t + VHh * (0.16 + rnd() * 0.56)];
      if (!inZone(p[0], p[1])) { S = p; break; }
    }
    mass(S[0], S[1], mobile ? 22 : 36, 0, 0.6, 3);
    mesh(S[0] + (mobile ? 0 : 70), S[1] - 10, mobile ? 95 : 175, 30, 0.55, mobile ? 34 : 44, S, 0.34);
    const prim = mobile ? 7 : 11;
    for (let i = 0; i < prim; i++) {
      const a = (i / prim) * Math.PI * 2 + rnd() * 0.6;
      walk({ x: S[0] + Math.cos(a) * 20, y: S[1] + Math.sin(a) * 14, a, w: mobile ? 6 : 7.5, b: 10 + rnd() * 30, rate: 0.5,
             max: mobile ? 110 + rnd() * 170 : 220 + rnd() * 360, wobble: 0.5, steer: 0, taper: 0.997, minW: 4,
             bp: mobile ? 0.095 : 0.12, depth: 0, layer: 0, fuse: true });
    }
    for (let k = 0; k < (mobile ? 3 : 5); k++) { const a = -Math.PI / 2 + (rnd() - .5) * 2.6; fruit(S[0] + Math.cos(a) * 26, S[1] + Math.sin(a) * 18, a, 40 + rnd() * 60, 140 + rnd() * 120, 0.5); }
    // satellite colonies bleeding in from the frame's edges
    // satellite colonies bleed in from random points along the frame's edges, away from the opening colony
    const sats: [number, number, number][] = [];
    for (let tries = 0; tries < 80 && sats.length < (mobile ? 1 : 3); tries++) {
      const side = Math.floor(rnd() * 4);
      const [fx, fy] = side === 0 ? [0.04 + rnd() * 0.92, 0.04 + rnd() * 0.1]   // top
                     : side === 1 ? [0.93 + rnd() * 0.06, 0.12 + rnd() * 0.8]   // right
                     : side === 2 ? [0.01 + rnd() * 0.07, 0.1 + rnd() * 0.85]   // left
                     :              [0.3 + rnd() * 0.68, 0.82 + rnd() * 0.12];  // bottom
      const x = W * fx, y = H.t + VHh * fy;
      if (inZone(x, y) || Math.hypot(x - S[0], y - S[1]) < (mobile ? 200 : 330)) continue;
      if (sats.some(o => Math.hypot(x - o[0], y - o[1]) < (mobile ? 200 : 320))) continue;
      sats.push([x, y, mobile ? 60 + rnd() * 25 : 90 + rnd() * 70]);
    }
    sats.forEach(([x, y, R], i) => bloom(x, y, R, 90 + i * 70, 0.5, Math.atan2(y - S[1], x - S[0])));
    for (let i = 0; i < (mobile ? 30 : 80); i++) {
      const t = rnd() * 6.28, rr = 60 + rnd() * (mobile ? 140 : 340);
      circ(S[0] + Math.cos(t) * rr * 1.4, S[1] + Math.sin(t) * rr * 0.7, 0.7 + rnd() * 1.8, 40 + rr * 0.8, 3);
    }

    // trunk waypoints through each chapter's open side
    type Lane = { c: HTMLElement; body: Rect; left: boolean; lx: number; corner: Pt; spawnY: number; at: [number, number, number] | null };
    const lanes: Lane[] = [];
    const pts: Pt[] = mobile ? [[W - 12, text.t - 30], [W - 10, H.b - 40]] : [];
    if (!mobile) { // if the colony sits above the credits, the trunk first heads right so it never crosses them
      const clearX = text.r + 140;
      if (S[0] < clearX) pts.push([clearX + rnd() * 120, S[1] + 60]);
      pts.push([Math.max(S[0], clearX) + (rnd() - .5) * 80, H.b - 70]);
    }
    chapters.forEach((c, i) => {
      const body = bodies[i], ch = docRect(c), left = c.classList.contains('left');
      const lx = mobile ? 9 : left ? body.r + (W - body.r) * (0.28 + rnd() * 0.2) : body.l * (0.55 + rnd() * 0.2);
      const corner: Pt = mobile ? [body.l - 12, body.t + 70] : left ? [body.r + 24, body.t - 22] : [body.l - 24, body.t - 22];
      lanes.push({ c, body, left, lx, corner, spawnY: corner[1] - 40, at: null });
      pts.push([lx, ch.t + 50], [lx + (rnd() - .5) * 40, body.b - 30]);
    });
    pts.push([W / 2, foot.t + 30]);

    let maxY = -1e9, trunkEnd = 0, steps = 0;
    const runners: [number, number, number, number][] = [];
    walk({ x: S[0], y: S[1] + 30, a: Math.PI / 2, w: mobile ? 7 : 10, b: 0, rate: 1, max: 60000, targets: pts,
           wobble: 0.5, steer: 0.09, taper: 0.9996, minW: mobile ? 5 : 7, bp: mobile ? 0.045 : 0.07, depth: 0,
           free: true, fuse: false, noBulb: true,
           onStep(x, y, b, a) {
             if (y > maxY) { maxY = y; trunkY.push(y); trunkB.push(b); }
             trunkEnd = b;
             if (++steps % (mobile ? 90 : 56) === 0) runners.push([x, y, b, a]);
             for (const L of lanes) if (!L.at && y >= L.spawnY) L.at = [x, y, b];
           } });
    introTarget = birthAtY(H.b - 60);
    // side runners: secondary veins that peel off the trunk and branch across the open ground
    runners.forEach(([x, y, b, a], i) => {
      const side = i % 2 ? 1 : -1;
      walk({ x, y, a: a + side * (0.9 + rnd() * 0.7), w: mobile ? 4.5 : 5.8, b, rate: 0.55, max: mobile ? 80 + rnd() * 120 : 160 + rnd() * 300,
             wobble: 0.5, steer: 0, taper: 0.996, minW: 3.4, bp: 0.11, depth: 1, fuse: true });
    });

    // per chapter: a branch to the clearing, a bloom where it lands, then a colony in the open side
    const kinds = ['mass', 'mesh', 'mesh', 'bubbles', 'dendrite'];
    lanes.forEach((L, i) => {
      if (!L.at) return;
      const { body, corner, left } = L;
      let arrived: number | null = null;
      walk({ x: L.at[0], y: L.at[1], a: Math.atan2(corner[1] - L.at[1], corner[0] - L.at[0]) + (rnd() - .5) * 0.6,
             w: mobile ? 4.5 : 6, b: L.at[2], rate: 0.45, max: 4000, targets: [corner], wobble: 0.55, steer: 0.1,
             taper: 0.998, minW: 4, bp: 0.07, depth: 1, free: true, noBulb: true,
             onArrive(_ti, _x, _y, b) { arrived = b; } });
      const rb: number = arrived ?? L.at[2] + 60;
      reveals.push({ el: L.c, birth: rb });
      const away = Math.atan2(corner[1] - (body.t + body.b) / 2, corner[0] - (body.l + body.r) / 2);
      bloom(corner[0], corner[1], mobile ? 60 : 125, rb - 10, 0.5, away);
      if (!mobile) // crawl down the near edge of the clearing, budding as it goes
        walk({ x: corner[0], y: corner[1], a: Math.PI / 2, w: 4, b: rb, rate: 0.4, max: 3000,
               targets: [[corner[0] + (left ? 4 : -4), body.t + Math.min(body.h * 0.8, 520)]],
               wobble: 0.3, steer: 0.3, taper: 0.999, minW: 3.4, bp: 0.09, depth: 1, free: true, fuse: true });
      if (mobile) return;
      const gx0 = left ? body.r + 40 : 12, gx1 = left ? W - 12 : body.l - 40;
      const gcx = (gx0 + gx1) / 2, gcy = body.t + body.h * 0.55;
      const R = Math.min((gx1 - gx0) * 0.5, body.h * 0.42, 270);
      if (R < 70) return;
      const kind = kinds[i % kinds.length], b0 = rb + 20;
      if (kind === 'mesh') mesh(gcx, gcy, R, b0, 0.42, i === 1 ? 30 : 38, [L.lx, gcy - R * 0.7]);
      else if (kind === 'mass') {
        mass(gcx, gcy, R * 0.32, b0, 0.4, 4);
        for (let k = 0; k < 7; k++) walk({ x: gcx, y: gcy, a: rnd() * 6.28, w: 5, b: b0, rate: 0.45, max: 120 + rnd() * R, wobble: 0.5, steer: 0, taper: 0.996, minW: 3.2, bp: 0.1, depth: 1, fuse: true });
        for (let k = 0; k < 5; k++) { const a = rnd() * 6.28; fruit(gcx + Math.cos(a) * R * 0.35, gcy + Math.sin(a) * R * 0.25, a, 40 + rnd() * 70, b0 + R * 0.3, 0.45); }
      } else if (kind === 'bubbles') {
        mass(gcx, gcy, R * 0.55, b0, 0.35, 36);
        for (let k = 0; k < 7; k++) { const a = rnd() * 6.28; fruit(gcx + Math.cos(a) * R * 0.62, gcy + Math.sin(a) * R * 0.45, a, 30 + rnd() * 60, b0 + R * 0.4, 0.45); }
      } else for (let k = 0; k < 8; k++) walk({ x: L.lx, y: gcy, a: rnd() * 6.28, w: 5.5, b: b0, rate: 0.45, max: 140 + rnd() * R * 1.2, wobble: 0.5, steer: 0, taper: 0.996, minW: 3.2, bp: 0.11, depth: 1, fuse: true });
    });

    // the end: white floods up from below, black fruiting bodies rise through it
    flood = { top: foot.t - 40, bot: docH + 40, b0: trunkEnd, b1: trunkEnd + 320 };
    reveals.push({ el: footer!, birth: flood.b1 - 40 });
    if (flood.b1 > OUT.max) OUT.max = flood.b1;
    const stalks = mobile ? 5 : 10;
    for (let k = 0; k < stalks; k++) {
      const x = W * (0.04 + 0.92 * (k + rnd() * 0.7) / stalks), ht = (mobile ? 90 : 130) + rnd() * (mobile ? 110 : 200);
      fruit(x, docH + 10, -Math.PI / 2 + (rnd() - .5) * 0.5, ht, flood.b1 + rnd() * 120, 0.7, 2);
    }

    // bucketize for visible-range drawing
    const nb = Math.ceil((docH + 400) / BH) + 2;
    SG = Float32Array.from(OUT.SG); CI = Float32Array.from(OUT.CI); maxBirth = OUT.max;
    BK = Array.from({ length: nb }, newBucket);
    const bkt = (y: number) => Math.max(0, Math.min(nb - 1, Math.floor(y / BH)));
    for (let i = 0; i < SG.length; i += 7) addSeg(BK[bkt(Math.min(SG[i + 1], SG[i + 3]))], SG, i);
    for (let i = 0; i < CI.length; i += 5) {
      const r = CI[i + 2], b0 = bkt(CI[i + 1] - r), b1 = bkt(CI[i + 1] + r);
      for (let b = b0; b <= b1; b++) { addCirc(BK[b], CI, i); if (r < 30) break; }
    }
    OUT = null;
    dirty = true;
  }

  // ---------- live blooms ----------
  const blooms: Live[] = [];
  let lastBloomT = 0;
  function spawnBloom(x: number, y: number, R: number, away?: number) {
    if (reduce || !keep.length) return;
    const saved = seed; seed = (Math.random() * 2 ** 31) | 0;
    OUT = { SG: [], CI: [], max: 0 };
    bloom(x, y, R, 0, 1, away ?? -Math.PI / 2 + (Math.random() - .5) * 1.2);
    const B = newBucket(), A = Float32Array.from(OUT.SG), C = Float32Array.from(OUT.CI);
    for (let i = 0; i < A.length; i += 7) addSeg(B, A, i);
    for (let i = 0; i < C.length; i += 5) addCirc(B, C, i);
    blooms.push({ t0: performance.now(), SG: A, CI: C, B, max: OUT.max, top: y - R * 2, bot: y + R * 2, gl: 0 });
    if (blooms.length > 40) blooms.shift();
    OUT = null; seed = saved; lastBloomT = performance.now(); dirty = true;
    puff(x, y, 40, 1);
  }

  // ---------- press, hold and drag: cordyceps grow along the cursor ----------
  type Drag = {
    pointerId: number; live: Strand; id: number;
    x: number; y: number;      // last pointer position (document coords)
    cx: number; cy: number;    // last pointer position (client coords), to follow scrolling
    wx: number; wy: number;    // last point laid on the vein, with its organic wobble
    tDown: number; lastMove: number; lastHold: number; holds: number;
    moved: number; len: number; nextBranch: number; nextFruit: number; ph: number; dir: number;
  };
  let drag: Drag | null = null;
  const nowBirth = (L: Live) => (performance.now() - L.t0) * BSPEED;

  // run some growth into a live strand, then file the new pieces into its bucket
  function growInto(L: Strand, fn: () => void) {
    const saved = seed; seed = (Math.random() * 2 ** 31) | 0;
    const s0 = L.SG.length, c0 = L.CI.length;
    OUT = { SG: L.SG, CI: L.CI, max: L.max };
    fn();
    L.max = OUT.max; OUT = null; seed = saved;
    for (let i = s0; i < L.SG.length; i += 7) {
      addSeg(L.B, L.SG, i);
      L.top = Math.min(L.top, L.SG[i + 1], L.SG[i + 3]); L.bot = Math.max(L.bot, L.SG[i + 1], L.SG[i + 3]);
    }
    for (let i = c0; i < L.CI.length; i += 5) {
      addCirc(L.B, L.CI, i);
      L.top = Math.min(L.top, L.CI[i + 1] - L.CI[i + 2]); L.bot = Math.max(L.bot, L.CI[i + 1] + L.CI[i + 2]);
    }
    dirty = true;
  }

  function startDrag(e: PointerEvent) {
    const x = e.clientX, y = e.clientY + scrollY, t = performance.now();
    const live: Strand = { t0: t, SG: [], CI: [], B: newBucket(), max: 0, top: y, bot: y, gl: 0 };
    blooms.push(live); if (blooms.length > 40) blooms.shift();
    drag = { pointerId: e.pointerId, live, id: ++lineage, x, y, cx: e.clientX, cy: e.clientY, wx: x, wy: y,
             tDown: t, lastMove: t, lastHold: t, holds: 0, moved: 0, len: 0,
             nextBranch: 26 + Math.random() * 24, nextFruit: 150 + Math.random() * 110, ph: Math.random() * 6.28, dir: -Math.PI / 2 };
    growInto(live, () => circ(x, y, 7, 0, 0)); // the spot where it takes hold
    root.classList.add('growing');
    try { root.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  }

  function dragTo(clientX: number, clientY: number) {
    const d = drag; if (!d) return;
    const L = d.live, nx = clientX, ny = clientY + scrollY;
    d.cx = clientX; d.cy = clientY;
    const dx = nx - d.x, dy = ny - d.y, dist = Math.hypot(dx, dy);
    if (dist < 3) return;
    d.lastMove = performance.now();
    if (dist > 160) { d.x = nx; d.y = ny; d.wx = nx; d.wy = ny; return; } // a jump: start a fresh run rather than a straight line
    d.moved += dist; d.dir = Math.atan2(dy, dx);
    const ux = dx / dist, uy = dy / dist, steps = Math.ceil(dist / 6), b = nowBirth(L);
    growInto(L, () => {
      for (let k = 1; k <= steps; k++) {
        d.len += dist / steps;
        const off = 3.2 * Math.sin(d.len * 0.07 + d.ph) + 1.8 * Math.sin(d.len * 0.19 + d.ph * 2);
        const px = d.x + dx * k / steps - uy * off, py = d.y + dy * k / steps + ux * off;
        if (inKeep(px, py) || inKeep(d.wx, d.wy)) { d.wx = px; d.wy = py; continue; } // never across text
        const w = 6.5 * (1 + 0.3 * Math.sin(d.len * 0.045 + d.ph) + 0.15 * Math.sin(d.len * 0.11));
        seg(d.wx, d.wy, px, py, w, b, 0);
        hput(px, py, d.id);
        d.wx = px; d.wy = py;
        if (d.len >= d.nextBranch) { // side branches bud off and keep growing after the cursor has passed
          d.nextBranch += 30 + rnd() * 40;
          const side = rnd() < .5 ? -1 : 1;
          walk({ x: px, y: py, a: d.dir + side * (0.8 + rnd() * 0.8), w: 4 + rnd() * 1.6, b, rate: 0.6, max: 40 + rnd() * 140,
                 wobble: 0.55, steer: 0, taper: 0.994, minW: 3, bp: 0.09, depth: 1, fuse: true, pid: d.id });
        }
        if (d.len >= d.nextFruit) { // now and then a fruiting body rises off the vein
          d.nextFruit += 170 + rnd() * 170;
          const side = rnd() < .5 ? -1 : 1;
          fruit(px, py, d.dir + side * (1.2 + rnd() * 0.5), 30 + rnd() * 45, b + 15, 0.5);
        }
        if (rnd() < 0.08) circ(px + (rnd() - .5) * 40, py + (rnd() - .5) * 40, 0.7 + rnd() * 1.4, b + 10, 3); // spores shed along the way
      }
    });
    d.x = nx; d.y = ny;
  }

  function holdGrow(t: number) { // holding still: the growth spreads out around the cursor
    const d = drag;
    if (!d || t - d.lastMove < 260 || t - d.lastHold < 130 || d.holds >= 28 || inKeep(d.wx, d.wy)) return;
    d.lastHold = t; d.holds++;
    const b = nowBirth(d.live), n = d.holds;
    growInto(d.live, () => {
      walk({ x: d.wx, y: d.wy, a: rnd() * 6.283, w: 4 + rnd() * 2, b, rate: 0.7, max: 30 + rnd() * 70 + n * 4,
             wobble: 0.55, steer: 0, taper: 0.994, minW: 3, bp: 0.08, depth: 1, fuse: true, pid: d.id });
      if (n % 3 === 0) circ(d.wx + (rnd() - .5) * 18, d.wy + (rnd() - .5) * 18, 5 + Math.min(n, 18) * 0.7, b, 0); // the mass swells
      if (n % 7 === 0) fruit(d.wx, d.wy, -Math.PI / 2 + (rnd() - .5) * 2, 30 + rnd() * 50, b + 20, 0.5);
    });
  }

  function endDrag(cancelled: boolean) {
    const d = drag; if (!d) return;
    drag = null; root.classList.remove('growing');
    try { root.releasePointerCapture(d.pointerId); } catch { /* already released */ }
    const held = performance.now() - d.tDown, L = d.live;
    if (d.moved < 8 && held < 250) { // a quick click: the classic bloom
      const i = blooms.indexOf(L); if (i >= 0) blooms.splice(i, 1);
      if (!cancelled) spawnBloom(d.x, d.y, innerWidth <= 820 ? 105 : 165);
      return;
    }
    if (cancelled || inKeep(d.wx, d.wy)) return;
    const b = nowBirth(L);
    if (d.moved < 8) growInto(L, () => bloom(d.wx, d.wy, Math.min(240, 110 + held / 18), b, 1)); // held in place: a bloom sized by the hold
    else growInto(L, () => bloom(d.wx, d.wy, 90, b, 1, d.dir));                                   // dragged: the vein ends in a bloom
    lastBloomT = performance.now();
    puff(d.wx, d.wy, 34, 1);
  }

  // ---------- canvases ----------
  let dpr = 1, VW = 0, VH = 0;
  function sizeCanvas() {
    dpr = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight;
    el.goo.width = VW; el.goo.height = VH; // blurred anyway: 1x is enough
    for (const c of [el.hyphae, el.spores]) { c.width = VW * dpr; c.height = VH * dpr; }
    dirty = true;
  }

  let growth = 0;
  const swell = (r: number, b: number, life: number, gr: number) => r * Math.min(1, 0.2 + (gr - b) / life);

  function draw() {
    const gx = g!, hx = h!;
    const sy = scrollY, now = performance.now();
    const b0 = Math.max(0, Math.floor((sy - 60) / BH)), b1 = Math.min(BK.length - 1, Math.floor((sy + VH + 60) / BH));
    const src: Source[] = [];
    for (let bi = b0; bi <= b1; bi++) src.push([SG, CI, BK[bi], growth, growth < maxBirth]);
    for (const B of blooms) { B.gl = (now - B.t0) * BSPEED; if (B.bot > sy - 60 && B.top < sy + VH + 60) src.push([B.SG, B.CI, B.B, B.gl, B.gl < B.max]); }

    // goo layer: white structures on black, then black ink
    gx.setTransform(1, 0, 0, 1, 0, 0); gx.fillStyle = '#000'; gx.fillRect(0, 0, VW, VH);
    gx.translate(0, -sy); gx.lineCap = 'round'; gx.lineJoin = 'round';
    const tips: number[] = [];
    gx.strokeStyle = '#fff';
    for (let c = 1; c <= 24; c++) {
      gx.beginPath(); let any = false;
      for (const [A, , B, gr, growing] of src) { const L = B.w[c]; if (!L) continue;
        for (const i of L) { const b = A[i + 5]; if (b > gr) continue; gx.moveTo(A[i], A[i + 1]); gx.lineTo(A[i + 2], A[i + 3]); any = true;
          if (growing && b > gr - 9 && tips.length < 900) tips.push(A[i + 2], A[i + 3], A[i + 4] * 0.72 + 1.6); } }
      if (any) { gx.lineWidth = c; gx.stroke(); }
    }
    gx.fillStyle = '#fff'; gx.beginPath();
    for (const [, C, B, gr] of src) for (const i of B.cw) { const b = C[i + 3]; if (b > gr) continue; const r = swell(C[i + 2], b, 40, gr); gx.moveTo(C[i] + r, C[i + 1]); gx.arc(C[i], C[i + 1], r, 0, 6.2832); }
    for (let i = 0; i < tips.length; i += 3) { gx.moveTo(tips[i] + tips[i + 2], tips[i + 1]); gx.arc(tips[i], tips[i + 1], tips[i + 2], 0, 6.2832); }
    gx.fill();
    if (growth > flood.b0 && sy + VH > flood.top - 80) {
      const p = Math.min(1, (growth - flood.b0) / (flood.b1 - flood.b0)), e = 1 - Math.pow(1 - p, 2);
      const yEdge = flood.bot - e * (flood.bot - flood.top);
      gx.beginPath(); gx.moveTo(-20, flood.bot + 40);
      for (let x = -20; x <= VW + 20; x += 16) gx.lineTo(x, yEdge + 30 * Math.sin(x * 0.007 + 1) + 16 * Math.sin(x * 0.019 + 2) + 9 * Math.sin(x * 0.047));
      gx.lineTo(VW + 20, flood.bot + 40); gx.closePath(); gx.fill();
    }
    gx.strokeStyle = '#000';
    for (let c = 1; c <= 24; c++) {
      gx.beginPath(); let any = false;
      for (const [A, , B, gr] of src) { const L = B.k[c]; if (!L) continue;
        for (const i of L) { if (A[i + 5] > gr) continue; gx.moveTo(A[i], A[i + 1]); gx.lineTo(A[i + 2], A[i + 3]); any = true; } }
      if (any) { gx.lineWidth = c; gx.stroke(); }
    }
    gx.fillStyle = '#000'; gx.beginPath();
    for (const [, C, B, gr] of src) for (const i of B.cb) { const b = C[i + 3]; if (b > gr) continue; const r = swell(C[i + 2], b, 50, gr); gx.moveTo(C[i] + r, C[i + 1]); gx.arc(C[i], C[i + 1], r, 0, 6.2832); }
    gx.fill();

    // hyphae layer: fine threads and specks, unfiltered
    hx.setTransform(dpr, 0, 0, dpr, 0, 0); hx.clearRect(0, 0, VW, VH); hx.translate(0, -sy); hx.lineCap = 'round';
    hx.strokeStyle = col.dim; hx.globalAlpha = 0.85;
    for (let c = 1; c <= 6; c++) {
      hx.beginPath(); let any = false;
      for (const [A, , B, gr] of src) { const L = B.hy[c]; if (!L) continue;
        for (const i of L) { if (A[i + 5] > gr) continue; hx.moveTo(A[i], A[i + 1]); hx.lineTo(A[i + 2], A[i + 3]); any = true; } }
      if (any) { hx.lineWidth = c * 0.5; hx.stroke(); }
    }
    hx.globalAlpha = 0.75;
    for (const [key, color] of [['cd', col.hypha], ['cl', col.voidc]] as const) {
      hx.fillStyle = color; hx.beginPath();
      for (const [, C, B, gr] of src) for (const i of B[key]) { if (C[i + 3] > gr) continue; hx.moveTo(C[i] + C[i + 2], C[i + 1]); hx.arc(C[i], C[i + 1], C[i + 2], 0, 6.2832); }
      hx.fill();
    }
    hx.globalAlpha = 1;
  }

  // ---------- spores, puffs and bokeh ----------
  const spores = Array.from({ length: innerWidth < 820 ? 30 : 64 }, () => ({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.5, v: 0.00006 + Math.random() * 0.00018, p: Math.random() * 6.28, a: 0.15 + Math.random() * 0.55 }));
  const bokeh = Array.from({ length: 6 }, () => ({ x: Math.random(), y: Math.random() * 3, r: 70 + Math.random() * 150, p: Math.random() * 6.28, a: 0.035 + Math.random() * 0.05, z: 0.15 + Math.random() * 0.35 }));
  const puffs: Puff[] = [];
  function puff(x: number, y: number, n: number, spread: number) {
    if (reduce) return;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (0.015 + Math.random() * 0.07) * spread;
      puffs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 0.012, life: 0, max: 1300 + Math.random() * 1500, r: 0.6 + Math.random() * 1.7 }); }
  }
  function puffRect(node: Element | null, n: number) { // spores lifting off a line of type as it blooms in
    if (reduce || !node) return;
    const r = node.getBoundingClientRect();
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.6, v = 0.01 + Math.random() * 0.05;
      puffs.push({ x: r.left + Math.random() * r.width, y: r.top + scrollY + Math.random() * r.height, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1200 + Math.random() * 1600, r: 0.5 + Math.random() * 1.4 }); }
  }
  function drawSpores(t: number, dt: number) {
    const sx = s!;
    sx.setTransform(dpr, 0, 0, dpr, 0, 0); sx.clearRect(0, 0, VW, VH);
    for (const b of bokeh) {
      const x = (b.x + Math.sin(t * 0.00012 + b.p) * 0.04) * VW;
      let y = (b.y * VH - scrollY * b.z) % (VH * 3); if (y < -b.r) y += VH * 3;
      if (y - b.r > VH) continue;
      const gr = sx.createRadialGradient(x, y, 0, x, y, b.r);
      gr.addColorStop(0, `rgba(${col.rgb},${b.a})`); gr.addColorStop(0.6, `rgba(${col.rgb},${b.a * 0.5})`); gr.addColorStop(1, `rgba(${col.rgb},0)`);
      sx.fillStyle = gr; sx.beginPath(); sx.arc(x, y, b.r, 0, 6.2832); sx.fill();
    }
    sx.fillStyle = `rgb(${col.rgb})`;
    for (const p of spores) {
      p.y -= p.v * 16; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      sx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * 0.001 + p.p));
      sx.beginPath(); sx.arc((p.x + Math.sin(t * 0.0004 + p.p) * 0.01) * VW, p.y * VH, p.r, 0, 6.2832); sx.fill();
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.life += dt;
      if (p.life > p.max) { puffs.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy = p.vy * 0.985 - 0.00001 * dt;
      const y = p.y - scrollY; if (y < -10 || y > VH + 10) continue;
      sx.globalAlpha = 0.85 * (1 - p.life / p.max);
      sx.beginPath(); sx.arc(p.x, y, p.r, 0, 6.2832); sx.fill();
    }
    sx.globalAlpha = 1;
  }

  // ---------- reveal ----------
  function awaken(node: HTMLElement) {
    node.querySelectorAll<HTMLElement>('.rv').forEach((r, i) => { r.style.animationDelay = (i * 0.16) + 's'; r.classList.add('go'); });
    node.classList.remove('dormant');
    puffRect(node.querySelector('.credit-name'), 60);
  }

  // ---------- input ----------
  const onPointerDown = (e: PointerEvent) => {
    if (reduce || e.button > 0 || drag) return;
    const target = e.target as Element | null;
    if (target?.closest(CLICK_IGNORE)) return;
    if (e.pointerType === 'touch') { // a finger scrolls the page, so a tap simply blooms
      if (performance.now() - lastBloomT < 300) return;
      spawnBloom(e.clientX, e.clientY + scrollY, innerWidth <= 820 ? 105 : 165);
      return;
    }
    e.preventDefault(); // no text selection while growing
    startDrag(e);
  };
  const onPointerMove = (e: PointerEvent) => { if (drag && e.pointerId === drag.pointerId) dragTo(e.clientX, e.clientY); };
  const onPointerUp = (e: PointerEvent) => { if (drag && e.pointerId === drag.pointerId) endDrag(false); };
  const onPointerCancel = (e: PointerEvent) => { if (drag && e.pointerId === drag.pointerId) endDrag(true); };
  const onScrollWhileDragging = () => { if (drag) dragTo(drag.cx, drag.cy); };
  const onBlur = () => endDrag(true);
  const onBloomEvent = (e: Event) => {
    const d = (e as CustomEvent<BloomDetail>).detail;
    if (d) spawnBloom(d.x, d.y, d.r, d.away);
  };
  let rt = 0, lastW = innerWidth;
  const onResize = () => {
    clearTimeout(rt);
    rt = later(() => { sizeCanvas(); if (innerWidth !== lastW) { lastW = innerWidth; build(); } if (reduce) draw(); }, 180);
  };
  // page height changes (fonts swap in, a form note appears): regrow to fit the new layout
  let lastDocH = document.documentElement.scrollHeight, rb = 0;
  const resizeObserver = new ResizeObserver(() => {
    const hNow = document.documentElement.scrollHeight;
    if (Math.abs(hNow - lastDocH) < 2) return;
    lastDocH = hNow; clearTimeout(rb); rb = later(() => { build(); if (reduce) draw(); }, 150);
  });

  // ambient blooms: every so often something opens up in the open ground on screen
  let nextAmbient = 9000;
  function ambient(t: number) {
    if (t - t0 < nextAmbient || document.hidden || blooms.length >= 30) return;
    nextAmbient = t - t0 + 8000 + Math.random() * 7000;
    for (let tries = 0; tries < 12; tries++) {
      const x = VW * (0.04 + Math.random() * 0.92), y = scrollY + VH * (0.15 + Math.random() * 0.7);
      let ok = true;
      for (const [dx, dy] of [[0, 0], [70, 0], [-70, 0], [0, 70], [0, -70]]) if (inKeep(x + dx, y + dy)) { ok = false; break; }
      if (ok) { spawnBloom(x, y, 80 + Math.random() * 70); break; }
    }
  }

  // ---------- loop ----------
  let lastG = -1, lastS = -1, maxScrolled = 0, lastT = 0, raf = 0;
  const t0 = performance.now();
  function frame(t: number) {
    if (!alive) return;
    const dt = Math.min(100, lastT ? t - lastT : 16.7); lastT = t;
    maxScrolled = Math.max(maxScrolled, scrollY);
    const intro = Math.min(1, (t - t0) / 4500);
    let target = Math.max(birthAtY(maxScrolled + VH * 0.78), introTarget * (1 - Math.pow(1 - intro, 2)));
    target += 40 * intro; // idle creep keeps the tips alive
    if (growth < target) {
      const gap = target - growth, k = 1 - Math.pow(gap > 1200 ? 0.88 : 0.95, dt / 16.7);
      growth = Math.min(target, growth + Math.max(0.054 * dt, gap * k));
    }
    for (const r of reveals) if (r.el.classList.contains('dormant') && growth >= r.birth) awaken(r.el);
    ambient(t);
    holdGrow(t);
    const blooming = blooms.some(B => (t - B.t0) * BSPEED < B.max + 60);
    if (dirty || blooming || growth !== lastG || scrollY !== lastS) {
      draw(); lastG = growth; lastS = scrollY; dirty = false;
      el.substrate.style.backgroundPosition = `0 ${-scrollY * 0.12}px`;
    }
    drawSpores(t, dt);
    raf = requestAnimationFrame(frame);
  }

  // ---------- start ----------
  const onScrollReduced = () => draw();
  readColors(); sizeCanvas(); build();
  addEventListener('resize', onResize);
  addEventListener(BLOOM_EVENT, onBloomEvent);
  resizeObserver.observe(document.body);
  if (reduce) {
    growth = Infinity; draw(); drawSpores(0, 0);
    addEventListener('scroll', onScrollReduced, { passive: true });
  } else {
    addEventListener('pointerdown', onPointerDown);
    addEventListener('pointermove', onPointerMove);
    addEventListener('pointerup', onPointerUp);
    addEventListener('pointercancel', onPointerCancel);
    addEventListener('scroll', onScrollWhileDragging, { passive: true });
    addEventListener('blur', onBlur);
    raf = requestAnimationFrame(frame);
    later(() => puffRect(document.querySelector('.hero .xl'), 90), 1500);
  }
  document.fonts?.ready.then(() => { if (!alive) return; build(); if (reduce) draw(); });

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    timers.forEach(id => clearTimeout(id)); timers.clear();
    themeObserver.disconnect();
    resizeObserver.disconnect();
    removeEventListener('resize', onResize);
    removeEventListener(BLOOM_EVENT, onBloomEvent);
    removeEventListener('pointerdown', onPointerDown);
    removeEventListener('pointermove', onPointerMove);
    removeEventListener('pointerup', onPointerUp);
    removeEventListener('pointercancel', onPointerCancel);
    removeEventListener('scroll', onScrollWhileDragging);
    removeEventListener('blur', onBlur);
    removeEventListener('scroll', onScrollReduced);
    root.classList.remove('growing');
  };
}
