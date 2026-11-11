import { site } from '@/content/site';
import { Credit } from './Credit';

/** The end: the growth floods the ground white here and fruiting bodies rise through it. */
export function Footer() {
  return (
    <footer className="site-footer dormant" id="footer">
      <div className="foot-text rv" id="footText">
        <Credit role={site.footer.role} name={site.name} size="md" />
        <p className="meta">{site.footer.year}</p>
      </div>
    </footer>
  );
}
