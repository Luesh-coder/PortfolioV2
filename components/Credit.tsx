import type { ReactNode } from 'react';

type Size = 'xl' | 'lg' | 'md' | 'sm';
type Tag = 'h1' | 'h2' | 'h3' | 'p';

/** A title credit: small role over a bold uppercase name, as in the opening titles. */
export function Credit({ role, name, size = 'md', as: Name = 'p', id, className }: {
  role: string; name: ReactNode; size?: Size; as?: Tag; id?: string; className?: string;
}) {
  return (
    <div className={className ? `credit ${className}` : 'credit'}>
      <p className="credit-role">{role}</p>
      <Name className={`credit-name ${size}`} id={id}>{name}</Name>
    </div>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 10 10 2M4 2h6v6" />
    </svg>
  );
}
