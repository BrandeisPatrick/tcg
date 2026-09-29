/**
 * The Gallery sheet's layout voice: a stencil heading over a hairline, prose
 * held to a readable measure, the poster button for an action and a plain
 * chip for a demo trigger. Shared by every Gallery tab.
 *
 * Classes live in gallery.css; this file is the markup that wears them.
 */
import {
  Children, createContext, useContext, useLayoutEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';

/** Height of the sticky masthead. Second-level bars park under it. */
export const STICK = { desk: 54, phone: 44 } as const;

/** CardFrame's hand size — the grid fits cards to this. */
export const HAND = { w: 134, h: 188 } as const;
export const FULL = { w: 300, h: 420 } as const;

export function Section({ title, count, aside, id, children }: {
  title: string;
  /** Printed beside the title in the dim register: "19", "3 of 19". */
  count?: number | string;
  /** A short note set against the right margin. */
  aside?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="gal-sec" aria-label={title}>
      <div className="gal-sec__head">
        <h2 className="gal-sec__title">{title}</h2>
        {count != null && <span className="gal-sec__count">{count}</span>}
        {aside != null && <span className="gal-sec__aside">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** A slim label inside a section. */
export function Sub({ title, note }: { title: string; note?: ReactNode }) {
  return <div className="gal-sub">{title}{note != null && <span>{note}</span>}</div>;
}

export function Caption({ children }: { children: ReactNode }) {
  return <p className="gal-cap">{children}</p>;
}

/** Long explanation, folded away. Pass paragraphs as children. */
export function Notes({ label = 'Notes', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="gal-notes">
      <summary>{label}</summary>
      <div className="gal-notes__body">{children}</div>
    </details>
  );
}

export function Row({ children, gap }: { children: ReactNode; gap?: number }) {
  return <div className="gal-row" style={gap != null ? { gap } : undefined}>{children}</div>;
}

/** The poster button at the Gallery's size: the same plate, less air. */
export function Button({ children, onClick, disabled, title }: {
  children: ReactNode; onClick: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <PosterButton
      variant="paper"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ padding: '7px 12px', fontSize: 11, letterSpacing: '0.14em', borderWidth: 1.5 }}
    >
      {children}
    </PosterButton>
  );
}

/** A demo trigger. `on` inks it while its effect is playing. */
export function Chip({ children, onClick, disabled, on }: {
  children: ReactNode; onClick: () => void; disabled?: boolean; on?: boolean;
}) {
  return (
    <button type="button" className="gal-chip" onClick={onClick} disabled={disabled} data-on={on ? 'true' : undefined}>
      {children}
    </button>
  );
}

export interface Option<T extends string> {
  id: T;
  label: string;
  /** A count printed after the label. */
  n?: number;
  disabled?: boolean;
}

/** One-of-many, as joined stencil plates. */
export function Segmented<T extends string>({ label, name, value, onChange, options, scroll }: {
  label?: string;
  /** What the group is called when it prints no label of its own. */
  name?: string;
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  /** Keep to one line and scroll sideways instead of wrapping. */
  scroll?: boolean;
}) {
  const set = useRef<HTMLDivElement>(null);
  // In a strip that scrolls, bring the chosen plate into it: a view opened
  // from its address would otherwise start with its own plate off screen.
  // Moves the strip only, never the page.
  useLayoutEffect(() => {
    const strip = set.current;
    const el = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!scroll || !strip || !el) return;
    const left = el.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    strip.scrollLeft = left - (strip.clientWidth - el.offsetWidth) / 2;
  }, [scroll, value]);
  return (
    <div className={scroll ? 'gal-seg gal-seg--scroll' : 'gal-seg'} role="group" aria-label={label ?? name}>
      {label && <span className="gal-seg__label" aria-hidden>{label}</span>}
      <div ref={set} className="gal-seg__set">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="gal-seg__opt"
            aria-pressed={value === o.id}
            disabled={o.disabled}
            onClick={() => onChange(o.id)}
          >
            {o.label}
            {o.n != null && <span className="gal-seg__n">{o.n}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A plain on/off plate, in the segmented control's voice. */
export function Toggle({ label, on, onChange, children }: {
  label?: string; on: boolean; onChange: (v: boolean) => void; children: ReactNode;
}) {
  return (
    <div className="gal-seg">
      {label && <span className="gal-seg__label" aria-hidden>{label}</span>}
      <div className="gal-seg__set">
        <button type="button" className="gal-seg__opt" aria-pressed={on} onClick={() => onChange(!on)}>
          {children}
        </button>
      </div>
    </div>
  );
}

/** Track an element's width. Measured before paint, so nothing jumps. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const FitContext = createContext(1);

/**
 * A grid of CardFrames. A CardFrame is a fixed 134 × 188 print, so the grid
 * decides how many fit and, where even the smallest sensible tile will not
 * (a phone), scales them down rather than dropping to two wide columns.
 *
 * `pack="spread"` fills the row and lets the gutters take the slack.
 * `pack="start"` is a comparison strip: a fixed gutter, the cards flush
 * left, and always one row — where the row does not fit it scrolls
 * sideways, because four finishes are compared side by side or not at all.
 */
export function CardGrid({ children, gap = 10, pack = 'spread', phoneMin = 104 }: {
  children: ReactNode;
  gap?: number;
  pack?: 'spread' | 'start';
  /** The narrowest a card may be drawn on a phone before a column is dropped. */
  phoneMin?: number;
}) {
  const { isMobile } = useViewport();
  const [ref, w] = useWidth<HTMLDivElement>();
  const min = isMobile ? phoneMin : HAND.w;
  const n = Children.count(children);
  const fit = Math.max(1, Math.floor((w + gap) / (min + gap)));
  const cell = (w - gap * (fit - 1)) / fit;
  const scale = w > 0 ? Math.min(1, cell / HAND.w) : 1;
  const tile = HAND.w * scale;
  const strip = pack === 'start';
  return (
    <FitContext.Provider value={scale}>
      {/* Until it is measured there is nothing to lay out against. */}
      <div ref={ref} style={{ visibility: w > 0 ? 'visible' : 'hidden' }}>
        {strip && n > fit ? (
          <div className="gal-scroller gal-scroller--bleed" style={{ gap }}>{children}</div>
        ) : (
          <div
            style={{
              display: 'grid',
              // A strip never opens more columns than it has cards, or four
              // cards would be spread across nine.
              gridTemplateColumns: `repeat(${strip ? Math.min(fit, Math.max(1, n)) : fit}, ${tile}px)`,
              justifyContent: strip ? 'start' : 'space-between',
              columnGap: strip ? gap : undefined,
              rowGap: gap + 2,
            }}
          >
            {children}
          </div>
        )}
      </div>
    </FitContext.Provider>
  );
}

/**
 * One cell of a CardGrid: holds a CardFrame at the grid's scale, with an
 * optional label beneath. The box is sized to the scaled card so the grid
 * lays out against what is actually drawn.
 */
export function Fit({ label, children, size = HAND }: {
  label?: ReactNode;
  children: ReactNode;
  size?: { w: number; h: number };
}) {
  const scale = useContext(FitContext);
  return (
    <figure style={{ margin: 0, width: size.w * scale }}>
      <div style={{ width: size.w * scale, height: size.h * scale }}>
        {scale === 1 ? children : (
          <div style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
            {children}
          </div>
        )}
      </div>
      {label != null && <figcaption className="gal-figcap">{label}</figcaption>}
    </figure>
  );
}

/** A fluid grid for tiles that size themselves (HeroSlot, panels). */
export function Grid({ children, min = 150, gap = 10 }: { children: ReactNode; min?: number; gap?: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
      gap,
    }}>
      {children}
    </div>
  );
}
