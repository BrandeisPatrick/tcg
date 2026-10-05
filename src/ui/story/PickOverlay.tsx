/**
 * The story mode's 1-of-3 pick — a starting hero, a recruit, or a card from
 * a cache. The options are the game's real cards, dealt onto the scrim; a
 * press selects one and the button under them names what you are about to
 * take, so a pick is never one stray tap.
 *
 * Wide screens lay the three full-size cards in a row (scaled down as a
 * group when the window is short of room). Phones show the three as a strip
 * and the chosen one large beneath it, the first already chosen.
 *
 * Keys: 1–3 choose, Enter takes, Escape backs out. A click on the scrim
 * does nothing — too easy to lose a pick to.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CardId } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { CardFrame } from '../card/CardFrame';
import { fonts, spring, text } from '../tokens';
import { poster, scrimStyle } from '../poster';
import { CREDIT_CLEAR } from './MapControls';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';

interface PickOverlayProps {
  kind: 'hero' | 'card';
  title: string;
  subtitle?: string;
  options: CardId[];
  /** Verb on the confirm button: 'Start with' | 'Recruit' | 'Take'. */
  confirmVerb: string;
  onPick: (id: CardId) => void;
  onCancel?: () => void;
}

const FULL = { w: 300, h: 420 };
const HAND = { w: 134, h: 188 };
/** Below this width the row of full cards gives way to strip + large card. */
const NARROW = 700;

export function PickOverlay({ kind, title, subtitle, options, confirmVerb, onPick, onCancel }: PickOverlayProps) {
  const { width, height } = useViewport();
  const narrow = width < NARROW;
  const [selected, setSelected] = useState<number | null>(() => (narrow ? 0 : null));
  const chosen = selected != null ? options[selected] : undefined;
  const name = chosen ? CARDS_BY_ID[chosen]?.name ?? chosen : '';

  const confirm = () => { if (chosen) onPick(chosen); };

  // The overlay takes focus as it opens, so a key never lands on the button
  // that opened it (the stop card's Go, still mounted underneath).
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);

  // Keys run in the capture phase and stop there, so nothing under the
  // overlay (the map's own Escape) reacts to the same press.
  const live = useRef({ selected, confirm, onCancel, n: options.length });
  live.current = { selected, confirm, onCancel, n: options.length };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = live.current;
      const k = Number(e.key);
      if (Number.isInteger(k) && k >= 1 && k <= s.n) {
        e.stopPropagation();
        setSelected(k - 1);
      } else if (e.key === 'Escape' && s.onCancel) {
        e.stopPropagation();
        s.onCancel();
      } else if (e.key === 'Enter') {
        const el = e.target as HTMLElement | null;
        const inside = !!el && !!root.current?.contains(el);
        const option = inside ? el.closest('[data-pick]') : null;
        // Enter on a card not yet chosen chooses it, and on the overlay's own
        // buttons does what they say (both by the button's own click). On the
        // chosen card or anywhere else it takes the pick — and never reaches
        // a button under the overlay.
        if (option && Number(option.getAttribute('data-pick')) !== s.selected) return;
        if (inside && !option && el.closest('button')) return;
        e.preventDefault();
        e.stopPropagation();
        if (s.selected != null) s.confirm();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const what = kind === 'hero' ? 'hero' : 'card';

  return (
    <motion.div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        ...scrimStyle,
        zIndex: 60,
        flexDirection: 'column',
        justifyContent: narrow ? 'flex-start' : 'center',
        gap: 0,
        // Phones: the foot is the map credit's (it shows through the scrim).
        padding: narrow ? `14px 16px ${CREDIT_CLEAR}px` : '28px 32px',
        fontFamily: fonts.ui,
        color: poster.cream,
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      <motion.header
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring.soft}
        style={{
          flexShrink: 0,
          textAlign: 'center',
          // Phones: keep the heading clear of the System gear at top right.
          padding: narrow ? '6px 48px 0' : 0,
          marginBottom: narrow ? 14 : 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontWeight: 400,
            fontSize: narrow ? 22 : 30,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            lineHeight: 1.05,
            color: poster.cream,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p style={{ ...text.body, margin: 0, fontSize: narrow ? 12.5 : 14, color: poster.creamDim, lineHeight: 1.35 }}>{subtitle}</p>
        )}
      </motion.header>

      {narrow ? (
        <NarrowDeal options={options} selected={selected} onSelect={setSelected} width={width} what={what} />
      ) : (
        <WideDeal options={options} selected={selected} onSelect={setSelected} width={width} height={height} what={what} />
      )}

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...spring.snappy, delay: 0.2 }}
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: narrow ? 'column' : 'row-reverse',
          alignItems: narrow ? 'stretch' : 'center',
          justifyContent: 'center',
          gap: narrow ? 8 : 14,
          marginTop: narrow ? 14 : 26,
          width: narrow ? '100%' : undefined,
        }}
      >
        <PosterButton
          variant="paper"
          onClick={confirm}
          disabled={!chosen}
          ariaLabel={chosen ? `${confirmVerb} ${name}` : `Pick one ${what}`}
          style={{
            minWidth: narrow ? undefined : 260,
            whiteSpace: 'nowrap',
            // The outline a disabled plate prints is ink; on the dark scrim
            // it has to be cream to be seen at all.
            ...(!chosen ? { color: poster.creamDim, border: `2px solid ${poster.creamFaint}` } : {}),
          }}
        >
          {chosen ? `${confirmVerb} ${name} ›` : 'Pick one'}
        </PosterButton>
        {onCancel && (
          <PosterButton variant="ghost" size={narrow ? 'sm' : 'md'} onClick={onCancel} ariaLabel="Back" style={{ minHeight: 40 }}>
            ← Back
          </PosterButton>
        )}
      </motion.div>
    </motion.div>
  );
}

interface DealProps {
  options: CardId[];
  selected: number | null;
  onSelect: (i: number) => void;
  width: number;
  what: string;
}

/** The deal: each card drops in a beat after the last. */
const deal = {
  hidden: { y: 36, opacity: 0, scale: 0.94 },
  show: { y: 0, opacity: 1, scale: 1, transition: spring.default },
};
const dealt = { show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } } };

function OptionButton({ id, i, selected, onSelect, what, size, children }: {
  id: CardId;
  i: number;
  selected: number | null;
  onSelect: (i: number) => void;
  what: string;
  size: { w: number; h: number };
  children: ReactNode;
}) {
  const on = selected === i;
  const dim = selected != null && !on;
  return (
    <motion.div variants={deal} style={{ width: size.w, height: size.h }}>
      <motion.button
        type="button"
        data-pick={i}
        onClick={() => onSelect(i)}
        aria-pressed={on}
        aria-label={`${CARDS_BY_ID[id]?.name ?? id} (${i + 1})${on ? ', chosen' : ''}`}
        aria-keyshortcuts={String(i + 1)}
        // The cards not chosen step back by darkening, never by fading: a
        // printed card stays opaque, so nothing behind the scrim shows through.
        animate={{ y: on ? -10 : 0, filter: dim ? 'brightness(0.62) saturate(0.8)' : 'brightness(1) saturate(1)' }}
        whileHover={on ? undefined : { y: -6 }}
        whileTap={{ scale: 0.98 }}
        transition={spring.snappy}
        title={`Choose this ${what} (${i + 1})`}
        style={{
          display: 'block',
          width: size.w,
          height: size.h,
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        {children}
      </motion.button>
    </motion.div>
  );
}

/** Wide: three full cards in a row, the group scaled to the room there is. */
function WideDeal({ options, selected, onSelect, width, height, what }: DealProps & { height: number }) {
  const gap = 28;
  const lift = 12; // headroom for the chosen card's rise
  const W = options.length * FULL.w + (options.length - 1) * gap;
  const H = FULL.h + lift;
  // Heading, buttons and the scrim's padding take ~250px of the height.
  const s = Math.max(0.45, Math.min(1, (width - 64) / W, (height - 250) / H));
  return (
    <div style={{ flexShrink: 0, width: W * s, height: H * s }}>
      <motion.div
        initial="hidden"
        animate="show"
        variants={dealt}
        style={{
          width: W,
          height: H,
          paddingTop: lift,
          boxSizing: 'border-box',
          display: 'flex',
          gap,
          transform: s === 1 ? undefined : `scale(${s})`,
          transformOrigin: '0 0',
        }}
      >
        {options.map((id, i) => (
          <OptionButton key={id + i} id={id} i={i} selected={selected} onSelect={onSelect} what={what} size={FULL}>
            <CardFrame cardId={id} size="full" glow={selected === i ? 'gold' : null} />
          </OptionButton>
        ))}
      </motion.div>
    </div>
  );
}

/** Phones: the three as a strip to choose from, the chosen one large below,
 *  scaled to whatever height is left. */
function NarrowDeal({ options, selected, onSelect, width, what }: DealProps) {
  const gap = 10;
  const lift = 10;
  const stripW = options.length * HAND.w + (options.length - 1) * gap;
  const s = Math.min(1, (width - 32) / stripW);
  const chosen = selected != null ? options[selected] : undefined;

  // Measure the slot the large card gets, then fit the full print into it.
  const slot = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = slot.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const big = box.h > 0 ? Math.min(1, box.w / FULL.w, box.h / FULL.h) : 0;

  return (
    <>
      <div style={{ flexShrink: 0, alignSelf: 'center', width: stripW * s, height: (HAND.h + lift) * s }}>
        <motion.div
          initial="hidden"
          animate="show"
          variants={dealt}
          style={{
            width: stripW,
            height: HAND.h + lift,
            paddingTop: lift,
            boxSizing: 'border-box',
            display: 'flex',
            gap,
            transform: s === 1 ? undefined : `scale(${s})`,
            transformOrigin: '0 0',
          }}
        >
          {options.map((id, i) => (
            <OptionButton key={id + i} id={id} i={i} selected={selected} onSelect={onSelect} what={what} size={HAND}>
              <CardFrame cardId={id} size="hand" glow={selected === i ? 'gold' : null} />
            </OptionButton>
          ))}
        </motion.div>
      </div>

      <div
        ref={slot}
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          width: '100%',
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {chosen && big > 0 && (
            <motion.div
              key={chosen}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ width: FULL.w * big, height: FULL.h * big }}
            >
              <div style={{ width: FULL.w, height: FULL.h, transform: big === 1 ? undefined : `scale(${big})`, transformOrigin: '0 0' }}>
                <CardFrame cardId={chosen} size="full" physical={false} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
