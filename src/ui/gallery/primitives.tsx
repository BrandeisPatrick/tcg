/**
 * The Gallery sheet's layout voice: stencil eyebrows over a hairline, prose
 * in the body register, the poster button for anything pressed. Shared by
 * the gallery tabs and the FX showroom.
 */
import type { ReactNode } from 'react';
import { fonts, text } from '../tokens';
import { poster } from '../poster';
import { PosterButton } from '../chrome';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ margin: '0 0 34px' }}>
      <h2
        style={{
          margin: '0 0 14px',
          paddingBottom: 6,
          borderBottom: `1px solid ${poster.inkRule}`,
          fontFamily: fonts.display,
          fontSize: 11,
          fontWeight: 400,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: poster.inkDim,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Grid({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
      gap: 14,
    }}>
      {children}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>;
}

export function Caption({ children }: { children: ReactNode }) {
  return <p style={{ ...text.body, color: poster.inkDim, margin: '0 0 12px', maxWidth: 760 }}>{children}</p>;
}

export function Button({ children, onClick, disabled }: {
  children: ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <PosterButton variant="paper" size="sm" onClick={onClick} disabled={disabled}>
      {children}
    </PosterButton>
  );
}
