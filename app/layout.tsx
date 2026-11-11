import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { site } from '@/content/site';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/layers.css';
import '@/styles/sections.css';
import '@/styles/contact.css';

// Fonts are bundled in app/fonts (latin subsets, SIL OFL — see app/fonts/LICENSES.txt).
// Credits use the system's Helvetica Neue where present and Arimo (a Helvetica-metric face) everywhere else.
const arimo = localFont({
  src: [
    { path: './fonts/arimo-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/arimo-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-arimo',
  display: 'swap',
});
const barlow = localFont({
  src: [
    { path: './fonts/barlow-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/barlow-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/barlow-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-barlow',
  display: 'swap',
});
const jetbrains = localFont({
  src: './fonts/jetbrains-mono-latin-400-normal.woff2',
  weight: '400',
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: site.title,
  description: site.description,
};

export const viewport: Viewport = {
  themeColor: '#050505',
  colorScheme: 'dark light',
};

// Runs before first paint: restore the saved theme, and mark the page for the growth reveal
// (skipped with reduced motion, so content simply shows).
const bootScript = `(function(){var d=document.documentElement;try{if(localStorage.getItem('cordyceps-theme')==='light')d.dataset.theme='light'}catch(e){}if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('growth')})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${arimo.variable} ${barlow.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
