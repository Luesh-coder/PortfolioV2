import type { ReactNode } from 'react';
import { Credit } from './Credit';

/**
 * One chapter of the page. It renders dormant; the growth engine reveals it when its branch lands.
 * Direct children marked `rv` bloom in one after another.
 * `side` is where the text sits; the other side is open ground for that chapter's colony.
 */
export function Chapter({ id, side, label, title, children }: {
  id: string; side: 'left' | 'right'; label: string; title: string; children: ReactNode;
}) {
  return (
    <section className={`chapter ${side} dormant`} id={id} aria-labelledby={`t-${id}`}>
      <div className="body clearing">
        <Credit role={label} name={title} size="lg" as="h2" id={`t-${id}`} className="rv" />
        {children}
      </div>
    </section>
  );
}
