import { site } from '@/content/site';
import { Chapter } from '../Chapter';

export function Projects() {
  const p = site.projects;
  return (
    <Chapter id="projects" side="right" label={p.label} title={p.title}>
      <div className="projects">
        {p.items.map(item => (
          <article className="proj rv" key={item.index}>
            <p className="meta">{item.index} — {item.status}</p>
            <h3 className="credit-name md">
              {item.href ? <a href={item.href}>{item.name}</a> : item.name}
            </h3>
            <p className="desc">{item.description}</p>
            <p className="meta">{item.tags.join(' / ')}</p>
          </article>
        ))}
      </div>
    </Chapter>
  );
}
