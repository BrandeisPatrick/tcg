import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { fonts } from '../tokens';
import { poster } from '../poster';
import type { ExplainContent } from './content';
import {
  canHover, explainStore, pressOutside, subscribeCanHover, triggerHandlers, type ExplainMode,
} from './store';

/**
 * Hover or tap a coloured number or a status, and it explains itself — one
 * behaviour for both (rules in ./store.ts): a small tooltip where the device
 * hovers, a popup card where it does not.
 *
 * The trigger is a plain inline span around whatever is being explained, so
 * it can sit in running card text or around a status chip. The card is drawn
 * into <body> (a hero tile clips and transforms what it holds) and placed
 * beside the trigger, kept inside the screen at 390 px.
 */

interface Props {
  content: ExplainContent;
  children: ReactNode;
  /** Underline the trigger with a dotted rule — the cue that a word in running
   *  text can be asked. A chip needs none. */
  underline?: boolean;
  /** A tap goes through to whatever is underneath instead of opening the popup:
   *  the board has a card or skill armed and every tap on a tile picks its
   *  target. (Hovering still shows the tooltip.) */
  passTaps?: boolean;
  style?: CSSProperties;
}

/** The device's way of pointing, live. */
function useMode(): ExplainMode {
  return useSyncExternalStore(subscribeCanHover, () => canHover(), () => canHover()) ? 'hover' : 'touch';
}

// The server renderer (a test) warns about layout effects; there is nothing to lay out.
const useLayoutEffectSafe = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const Z = 500;
const MARGIN = 8;
const GAP = 10;

export function Explain({ content, children, underline = false, passTaps = false, style }: Props) {
  const id = useId();
  const mode = useMode();
  const open = useSyncExternalStore(
    explainStore.subscribe,
    () => explainStore.get()?.id === id,
    () => explainStore.get()?.id === id,
  );
  const trigger = useRef<HTMLSpanElement>(null);

  // A press anywhere but the trigger closes a touch popup.
  useEffect(() => {
    if (!open || mode !== 'touch') return;
    const onPress = (e: PointerEvent) => {
      pressOutside(explainStore, id, !!trigger.current && e.target instanceof Node && trigger.current.contains(e.target));
    };
    document.addEventListener('pointerdown', onPress, true);
    return () => document.removeEventListener('pointerdown', onPress, true);
  }, [open, mode, id]);

  // Gone from the screen while open (the status ended, the sheet closed): close it.
  useEffect(() => () => explainStore.close(id), [id]);

  const cardId = `${id}-card`;
  const handlers = useMemo(() => triggerHandlers(explainStore, id, mode, { passTaps }), [id, mode, passTaps]);
  // The hover and focus listeners are native (see TriggerHandlers).
  useEffect(() => {
    const el = trigger.current;
    if (!el) return;
    const on = Object.entries(handlers.native);
    for (const [type, fn] of on) el.addEventListener(type, fn as EventListener);
    return () => { for (const [type, fn] of on) el.removeEventListener(type, fn as EventListener); };
  }, [handlers]);

  return (
    <>
      <span
        ref={trigger}
        data-explain={id}
        data-explain-open={open ? mode : undefined}
        aria-describedby={open ? cardId : undefined}
        tabIndex={mode === 'hover' ? 0 : undefined}
        onClick={handlers.onClick as ((e: React.MouseEvent) => void) | undefined}
        style={{
          cursor: mode === 'hover' ? 'help' : undefined,
          WebkitTapHighlightColor: 'transparent',
          ...(underline ? { textDecoration: 'underline dotted', textDecorationThickness: 1.5, textUnderlineOffset: 2 } : null),
          ...style,
        }}
      >
        {children}
      </span>
      {open && <ExplainCard id={cardId} content={content} mode={mode} anchor={trigger} />}
    </>
  );
}

function ExplainCard({ id, content, mode, anchor }: {
  id: string; content: ExplainContent; mode: ExplainMode; anchor: React.RefObject<HTMLElement>;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number; arrow: number; below: boolean } | null>(null);
  const titleId = `${id}-title`;

  // Beside the trigger — above it, or below when there is no room — and
  // inside the screen, whatever its width.
  useLayoutEffectSafe(() => {
    const place = () => {
      const a = anchor.current, c = card.current;
      if (!a || !c) return;
      const r = a.getClientRects()[0] ?? a.getBoundingClientRect();
      const w = c.offsetWidth, h = c.offsetHeight;
      const vw = window.innerWidth, vh = window.innerHeight;
      const mid = r.left + r.width / 2;
      const left = Math.min(Math.max(mid - w / 2, MARGIN), Math.max(MARGIN, vw - MARGIN - w));
      const below = r.top - h - GAP < MARGIN;
      const top = below ? Math.min(r.bottom + GAP, Math.max(MARGIN, vh - MARGIN - h)) : r.top - h - GAP;
      const arrow = Math.min(Math.max(mid - left, 16), Math.max(16, w - 16));
      setAt((prev) => (prev && prev.left === left && prev.top === top && prev.arrow === arrow && prev.below === below ? prev : { left, top, arrow, below }));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, content]);

  const body = (
    <div
      ref={card}
      id={id}
      role={mode === 'hover' ? 'tooltip' : 'dialog'}
      aria-labelledby={mode === 'touch' ? titleId : undefined}
      data-explain-card={mode}
      // The card sits in the React tree under its trigger, so a tap on it
      // would bubble to whatever the trigger sits inside (a skill plate that
      // uses the skill on a click). It is the popup's, and goes no further.
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: at?.left ?? 0, top: at?.top ?? 0,
        visibility: at ? 'visible' : 'hidden',
        zIndex: Z,
        boxSizing: 'border-box',
        width: 'max-content',
        maxWidth: `min(272px, calc(100vw - ${MARGIN * 2}px))`,
        padding: '9px 12px 10px 11px',
        background: poster.paper,
        color: poster.ink,
        border: `2px solid ${poster.ink}`,
        borderLeftWidth: 6,
        borderLeftColor: content.accent,
        borderRadius: 4,
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.3)',
        fontFamily: fonts.ui,
        textAlign: 'left',
        whiteSpace: 'normal',
        // A tooltip must not catch the pointer it is explaining.
        pointerEvents: mode === 'hover' ? 'none' : 'auto',
        textDecoration: 'none',
        fontStyle: 'normal',
        textTransform: 'none',
        letterSpacing: 0,
      }}
    >
      {/* The pointer back to the trigger. */}
      {at && (
        <span aria-hidden style={{
          position: 'absolute', left: at.arrow - 6, [at.below ? 'top' : 'bottom']: -8,
          width: 10, height: 10, background: poster.paper,
          borderStyle: 'solid', borderColor: poster.ink, borderWidth: at.below ? '2px 0 0 2px' : '0 2px 2px 0',
          transform: 'rotate(45deg)',
        }} />
      )}
      <div id={titleId} style={{
        fontFamily: fonts.display, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.15,
      }}>{content.title}</div>
      {content.lead && (
        <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>{content.lead}</div>
      )}
      {content.lines.map((line, i) => (
        <div key={i} style={{ marginTop: i === 0 && !content.lead ? 4 : 3, fontSize: 12.5, lineHeight: 1.35, color: poster.inkSoft }}>{line}</div>
      ))}
      {mode === 'touch' && (
        <div style={{
          marginTop: 7, fontFamily: fonts.display, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: poster.inkDim,
        }}>Tap anywhere to close</div>
      )}
    </div>
  );
  // Drawn into <body> in the browser; the server renderer (a test) has no
  // portals, so there it stays where it is.
  return typeof document === 'undefined' ? body : createPortal(body, document.body);
}
