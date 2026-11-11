import { site } from '@/content/site';
import { Credit } from './Credit';

export function Hero() {
  const { hero } = site;
  return (
    <header className="hero" id="hero">
      <div className="hero-text" id="heroText">
        <Credit role={hero.role} name={site.name} size="xl" as="h1" className="c1" />
        <Credit role={hero.closing.role} name={hero.closing.name} size="sm" className="c4" />
      </div>
      <div className="cue credit-role">
        <span>Scroll — click or drag across the dark</span>
        <span className="line" />
      </div>
    </header>
  );
}
