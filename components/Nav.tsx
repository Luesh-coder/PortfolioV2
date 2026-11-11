'use client';

import { useEffect, useState } from 'react';
import { site } from '@/content/site';

const THEME_KEY = 'cordyceps-theme';

export function Nav() {
  const [light, setLight] = useState(false);

  // the boot script in layout.tsx may already have applied a saved theme
  useEffect(() => { setLight(document.documentElement.dataset.theme === 'light'); }, []);

  function toggle() {
    const next = !light;
    const root = document.documentElement;
    if (next) root.dataset.theme = 'light'; else delete root.dataset.theme;
    try { localStorage.setItem(THEME_KEY, next ? 'light' : 'dark'); } catch { /* storage unavailable */ }
    setLight(next);
  }

  return (
    <nav className="site-nav" aria-label="Primary">
      <a className="mark credit-name" href="#top">{site.navMark}</a>
      <ul className="credit-role">
        <li className="navlink"><a href="#prologue">Prologue</a></li>
        <li className="navlink"><a href="#projects">Projects</a></li>
        <li className="navlink"><a href="#stack">Stack</a></li>
        <li className="navlink"><a href="#notes">Field notes</a></li>
        <li className="navlink"><a href="#epilogue">Contact</a></li>
        <li>
          <button className="theme-btn credit-role" type="button" aria-pressed={light} onClick={toggle}>
            {light ? 'Infected' : 'Daylight'}
          </button>
        </li>
      </ul>
    </nav>
  );
}
