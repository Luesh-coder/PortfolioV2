import { site } from '@/content/site';
import { Chapter } from '../Chapter';
import { Credit } from '../Credit';

export function FieldNotes() {
  const f = site.fieldNotes;
  return (
    <Chapter id="notes" side="right" label={f.label} title={f.title}>
      <div>
        {f.entries.map(e => (
          <div className="entry rv" key={e.title}>
            <p className="meta">{e.when}</p>
            <Credit role={e.role} name={e.title} size="md" as="h3" />
            <p>{e.body}</p>
          </div>
        ))}
      </div>
    </Chapter>
  );
}
