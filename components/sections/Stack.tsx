import { Fragment } from 'react';
import { site } from '@/content/site';
import { Chapter } from '../Chapter';
import { Credit } from '../Credit';

export function Stack() {
  const s = site.stack;
  return (
    <Chapter id="stack" side="left" label={s.label} title={s.title}>
      <div className="credit-grid">
        {s.groups.map(group => (
          <Credit
            key={group.role}
            role={group.role}
            size="sm"
            className="rv"
            name={group.items.map((item, i) => <Fragment key={item}>{i > 0 && <br />}{item}</Fragment>)}
          />
        ))}
      </div>
    </Chapter>
  );
}
