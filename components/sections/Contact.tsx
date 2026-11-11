import { site } from '@/content/site';
import { Chapter } from '../Chapter';
import { ArrowIcon } from '../Credit';
import { ContactForm } from './ContactForm';

export function Contact() {
  const c = site.contact;
  return (
    <Chapter id="epilogue" side="left" label={c.label} title={c.title}>
      <p className="rv">{c.intro}</p>
      <ContactForm />
      <div className="direct rv">
        <p className="meta">Or write to <span className="addr">{site.email}</span></p>
        <div className="links">
          <a className="link credit-name sm" href={site.links.github}>GitHub<ArrowIcon /></a>
          <a className="link credit-name sm" href={site.links.linkedin}>LinkedIn<ArrowIcon /></a>
          <a className="link credit-name sm" href={site.links.resume}>Résumé<ArrowIcon /></a>
        </div>
      </div>
    </Chapter>
  );
}
