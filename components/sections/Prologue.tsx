import { site } from '@/content/site';
import { Chapter } from '../Chapter';
import { Credit } from '../Credit';

export function Prologue() {
  const p = site.prologue;
  return (
    <Chapter id="prologue" side="left" label={p.label} title={p.title}>
      <div className="prose rv">
        {p.paragraphs.map((text, i) => <p key={i}>{text}</p>)}
      </div>
      <div className="credit-grid">
        {p.credits.map(c => <Credit key={c.role} role={c.role} name={c.name} size="sm" className="rv" />)}
      </div>
    </Chapter>
  );
}
