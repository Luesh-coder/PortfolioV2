# Portfolio V2 — Cordyceps

Lucio Villena's portfolio. A black-and-white homage to the opening titles of *The Last of Us*: slime-mold veins, meshes and blooms grow across the page as you scroll, each branch uncovers a chapter, and the page ends in a white flood with black fruiting bodies rising through it.

Built with **Next.js 16 (App Router)**, **React 19** and **TypeScript**. No UI or animation libraries: the growth is a hand-written canvas engine.

## Run it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

`npm run typecheck` runs the TypeScript compiler on its own.

## Make the contact form send

The Epilogue form sends through [Web3Forms](https://web3forms.com) (free).

1. Go to web3forms.com, enter `luciovillena7@gmail.com`, and they email you an access key.
2. Copy `.env.example` to `.env.local` and paste the key:
   ```
   NEXT_PUBLIC_WEB3FORMS_KEY=your-key-here
   ```
3. Restart `npm run dev`. On your host (Vercel, Netlify…), add the same variable in the project's environment settings.

Without a key, or if the service can't be reached, the form says the message was **not** sent and offers your address, a pre-filled email link and Copy buttons. It only shows "Message received" when Web3Forms confirms the send. Visitors' unsent drafts are kept in their browser.

## Edit the content

Everything the site says is in **`content/site.ts`**: hero credits, prologue text, projects, stack, field notes, contact intro, and links (GitHub, LinkedIn, résumé are still `#` placeholders). Add `href` to a project to link its title.

## How it's put together

```
app/
  layout.tsx          fonts (next/font/local), metadata, the pre-paint boot script (theme + reveal)
  page.tsx            the page: growth layers, nav, hero, five chapters, footer
  fonts/              bundled woff2 files (Arimo, Barlow, JetBrains Mono; SIL OFL, see LICENSES.txt)
components/
  GrowthLayers.tsx    the fixed canvases + texture; starts the engine
  Nav.tsx             nav and the Daylight/Infected theme toggle (remembered)
  Hero.tsx, Footer.tsx, Chapter.tsx, Credit.tsx
  sections/           Prologue, Projects, Stack, FieldNotes, Contact (+ ContactForm client component)
content/site.ts       all copy and data
lib/growth/
  engine.ts           the growth engine (see the header comment)
  bloom-event.ts      requestBloom() — lets any component ask for a bloom
styles/               tokens, base type, layers, sections, contact form
```

**The growth engine** draws on three fixed canvases. The `goo` canvas holds the thick white growth on black, and a CSS `blur() contrast()` filter merges overlapping strokes into slime-mold shapes (inverted for Daylight). A trunk steers through each chapter's open side. When it passes a chapter, a branch grows to the corner of that chapter's text "clearing". Where it lands, a bloom opens and the chapter's credits bloom in one after another. Growth follows scroll and never recedes. Clicking empty ground, a slow timer, and a sent message all spawn live blooms. Pressing and dragging the mouse across empty ground grows a vein along the cursor that buds branches and fruiting bodies; holding still makes it spread around the cursor, and letting go opens a bloom (on touch screens a tap blooms, since dragging scrolls). Growth stays out of the text areas. Every page load picks a new random seed, so the opening colony, the smaller colonies around the edges and the network's route all start somewhere different each time (the seed holds for the whole visit, so resizing doesn't reshuffle it).

**Chapters** render with a `dormant` class, and the engine removes it when their branch arrives. A tiny script in `layout.tsx` adds `growth` to `<html>` before first paint, so the hiding only happens when JavaScript runs. With `prefers-reduced-motion`, everything is drawn fully grown and shown at once.

**Type** is Helvetica Neue Bold (Arimo, a Helvetica-metric face, wherever Helvetica isn't installed, e.g. Windows) for credits, Barlow for prose, and JetBrains Mono for meta. The full design language is documented in the Cordyceps design system artifact.

## Deploy

Any Next.js host works. On Vercel: import the repo, add `NEXT_PUBLIC_WEB3FORMS_KEY`, deploy. The page is fully static (`○ /` in the build output).

## Notes

- `LastOfUsOpening.mp4` (the reference video) is git-ignored, so it stays on your machine.
- The original design was prototyped as a single HTML page. This repo is the same site split into components.
