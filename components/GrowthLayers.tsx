'use client';

import { useEffect, useRef } from 'react';
import { startGrowth } from '@/lib/growth/engine';

/** The fixed background: growth canvases, and camera texture. */
export function GrowthLayers() {
  const goo = useRef<HTMLCanvasElement>(null);
  const hyphae = useRef<HTMLCanvasElement>(null);
  const spores = useRef<HTMLCanvasElement>(null);
  const substrate = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!goo.current || !hyphae.current || !spores.current || !substrate.current) return;
    return startGrowth({
      goo: goo.current,
      hyphae: hyphae.current,
      spores: spores.current,
      substrate: substrate.current,
    });
  }, []);

  return (
    <>
      <canvas ref={goo} id="goo" className="layer" aria-hidden="true" />
      <div ref={substrate} className="substrate" aria-hidden="true" />
      <canvas ref={hyphae} id="hyphae" className="layer" aria-hidden="true" />
      <canvas ref={spores} id="spores" className="layer" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
    </>
  );
}
