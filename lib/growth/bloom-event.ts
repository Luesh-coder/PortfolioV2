// A small bridge so any component can ask the growth engine for a bloom without importing it.

export const BLOOM_EVENT = 'cordyceps:bloom';

/** x/y are document coordinates (clientX/Y plus scroll), r is the bloom's reach in px, away is the fruiting direction in radians. */
export type BloomDetail = { x: number; y: number; r: number; away?: number };

export function requestBloom(detail: BloomDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<BloomDetail>(BLOOM_EVENT, { detail }));
}
