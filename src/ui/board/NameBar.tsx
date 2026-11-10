import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PlayerState, Structure, StructureKind } from '@/engine/types';
import { structureHp } from '@/engine/query';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';
import { PatronSigil, Souls, panelStyle, scale } from '../hud';
import { MapIcon } from './MapIcon';
import { useStatTick } from './useStatTick';
import { RivalHandChip } from './OpponentHand';
import { PATRON_NAMES } from './patrons';

const NAME: Record<StructureKind, string> = { guardian: 'Guardian', walker: 'Walker', patron: 'Patron' };
type Side = 'you' | 'rival';
const ACCENT: Record<Side, string> = { you: poster.you, rival: poster.rival };

/** A side's map track, front first, and the one that takes the next hit. */
const trackOf = (ps: PlayerState) => {
  const track = ps.structures.filter((s) => s.max > 0);
  return { track, front: track.find((s) => s.hp > 0) };
};
/** The side's track in words, for its accessible label. */
const saidOf = (track: Structure[]) =>
  track.map((s) => `${NAME[s.kind]} ${s.hp <= 0 ? 'down' : `${s.hp} of ${s.max}`}`).join(', ');

/**
 * The scoreboard across the top of the match — Deadlock's own: one calm dark
 * strip, the Amber Hand at the left, the turn in the centre, the Sapphire
 * Flame at the right. Each side shows its sigil and its three structures
 * (Guardian, Walker, Patron) as marks, a fallen one struck and dim; only the
 * front standing one — the one that takes the next hit — prints its HP. The
 * Rejuvenator shows while a side holds one. The rival's side also carries
 * its souls and its hand (one small back and the count). A tap opens the
 * full detail in words under the strip; a tap away closes it.
 */
export function Scoreboard({ you, rival, turn, myTurn, style }: {
  you: PlayerState;
  rival: PlayerState;
  turn: number;
  myTurn: boolean;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);
  const lit = myTurn ? poster.you : poster.rival;
  return (
    <div ref={box} data-scoreboard style={style}>
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'stretch',
        height: '100%', boxSizing: 'border-box',
        // Each half a faint wash of its patron's colour over the dark panel.
        background: [
          `linear-gradient(90deg, rgba(217, 182, 74, 0.13) 0%, transparent 42%, transparent 58%, rgba(74, 143, 224, 0.15) 100%)`,
          `linear-gradient(180deg, ${poster.slateLit} 0%, ${poster.slate} 100%)`,
        ].join(', '),
        border: '1px solid rgba(232, 224, 204, 0.16)',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        color: poster.cream,
        fontFamily: fonts.ui,
        whiteSpace: 'nowrap',
      }}>
        <SideBar side="you" ps={you} turn={turn} />
        {/* The turn counter, its edge lit in the colour of whose turn it is. */}
        <span aria-hidden data-turn-counter style={{
          flex: '0 0 auto', width: 44, margin: '-1px 0',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
          background: 'rgba(4, 10, 10, 0.85)',
          border: `1px solid ${lit}`,
          borderRadius: 3,
          boxShadow: `inset 0 -2px 0 ${lit}, 0 0 10px -2px ${lit}`,
          transition: 'border-color 300ms ease, box-shadow 300ms ease',
        }}>
          <span style={{ fontFamily: fonts.display, fontSize: scale.floor, letterSpacing: '0.14em', lineHeight: 1, color: poster.creamDim, marginRight: '-0.14em' }}>TURN</span>
          <span style={{ fontFamily: fonts.display, fontSize: scale.number, lineHeight: 1, color: poster.cream, fontVariantNumeric: 'tabular-nums' }}>{turn}</span>
        </span>
        <SideBar side="rival" ps={rival} />
        {/* The whole strip is one button: the detail under it. */}
        <button
          type="button"
          aria-label={`Turn ${turn}, ${myTurn ? 'your' : "the rival's"} turn. Match details`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            position: 'absolute', inset: 0, zIndex: 2, padding: 0, margin: 0,
            border: 'none', background: 'transparent', cursor: 'pointer',
          }}
        />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            role="region"
            aria-label="Match details"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={spring.snappy}
            onClick={() => setOpen(false)}
            style={{
              ...panelStyle,
              borderRadius: 6,
              position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
              zIndex: 40,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
              padding: '10px 12px 12px',
            }}
          >
            <Detail side="you" ps={you} />
            <Detail side="rival" ps={rival} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One side of the strip: the sigil, the three structure marks, the
 *  Rejuvenator while held; the rival's souls and hand toward the centre.
 *  The rival's side mirrors yours, its sigil at the strip's right end. */
function SideBar({ side, ps, turn }: { side: Side; ps: PlayerState; turn?: number }) {
  const label = PATRON_NAMES[side];
  const accent = ACCENT[side];
  const { track, front } = trackOf(ps);
  const dir = side === 'rival' ? 'row-reverse' : 'row';
  return (
    <div style={{
      flex: '1 1 0', minWidth: 0,
      display: 'flex', flexDirection: dir, alignItems: 'center', gap: 6,
      padding: '0 6px',
    }}>
      <span
        role="img"
        aria-label={`${label}: ${structureHp(ps)} structure HP — ${saidOf(track)}${turn ? `. Turn ${turn}` : ''}`}
        data-name-bar={side}
        style={{ display: 'inline-flex', flexDirection: dir, alignItems: 'center', gap: 6, flexShrink: 0 }}
      >
        {/* The sigil, with the Rejuvenator pinned to its corner while held. */}
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <PatronSigil side={side} size={18} />
          {ps.reviveCredits > 0 && <Rejuvenator ps={ps} side={side} />}
        </span>
        <span data-name-pill style={{ display: 'inline-flex', flexDirection: dir, alignItems: 'center', gap: 3, flexShrink: 0 }}>
          {track.map((s) => <Mark key={s.kind} s={s} accent={accent} front={s === front} dir={dir} />)}
        </span>
      </span>
      {side === 'rival' && (
        <span style={{
          marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
          // A hairline between the rival's purse and its track.
          paddingRight: 6, borderRight: '1px solid rgba(232, 224, 204, 0.18)',
        }}>
          <span role="img" aria-label={`Rival's souls: ${ps.souls}`} style={{ display: 'inline-flex' }}>
            <Souls n={ps.souls} size={scale.body} />
          </span>
          <RivalHandChip cards={ps.hand} />
        </span>
      )}
    </div>
  );
}

/** One structure as a mark: its icon in the side's keyline; the front one
 *  (the next to be hit) prints its HP beside it, and the number jolts as a
 *  push lands; a fallen one is struck through and dim. */
function Mark({ s, accent, front, dir }: { s: Structure; accent: string; front: boolean; dir: 'row' | 'row-reverse' }) {
  const down = s.hp <= 0;
  const tick = useStatTick(s.hp);
  return (
    <span title={`${NAME[s.kind]}: ${down ? 'down' : `${s.hp} of ${s.max}`}`} style={{
      position: 'relative', display: 'inline-flex', flexDirection: dir, alignItems: 'center', gap: 3, flexShrink: 0,
      opacity: down ? 0.45 : front ? 1 : 0.82,
    }}>
      <MapIcon kind={s.kind} size={down ? 13 : 16} ink={down ? poster.creamFaint : accent} grey={down} ground={poster.slate}
        style={front ? { boxShadow: `0 0 0 1.5px ${accent}` } : undefined} />
      {front && (
        <motion.span
          data-front-hp
          animate={tick === 'down' ? { scale: [1, 1.25, 1], x: [0, -1, 1, 0] } : { scale: 1, x: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'inline-block', minWidth: 9, textAlign: 'center',
            fontWeight: 800, fontSize: scale.number, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', color: '#ffffff',
          }}
        >
          {s.hp}
        </motion.span>
      )}
      {down && (
        <span aria-hidden data-struck={s.kind} style={{
          position: 'absolute', left: -2, right: -2, top: '50%', height: 2, marginTop: -1,
          background: poster.cream, transform: 'rotate(-35deg)', pointerEvents: 'none',
        }} />
      )}
    </span>
  );
}

/** The Rejuvenator, while a side holds one: its own icon on a small disc
 *  pinned to the sigil's lower corner (the panel says how many revives). */
function Rejuvenator({ ps, side }: { ps: PlayerState; side: Side }) {
  const n = ps.reviveCredits;
  const said = `Rejuvenator: ${n} revive${n === 1 ? '' : 's'}, through round ${ps.reviveUntilRound}`;
  return (
    <motion.span
      key={`${n}-${ps.reviveUntilRound}`}
      role="img"
      aria-label={said}
      title={said}
      initial={{ scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 20 }}
      style={{ position: 'absolute', bottom: -5, [side === 'you' ? 'right' : 'left']: -6, display: 'inline-flex', zIndex: 1 }}
    >
      <MapIcon kind="rejuvenator" size={13} round ground={poster.ink} ink={poster.green} zoom={0.86}
        style={{ boxShadow: `0 0 0 1.5px ${poster.green}` }} />
    </motion.span>
  );
}

/** One side's column in the detail panel: everything in words. */
function Detail({ side, ps }: { side: Side; ps: PlayerState }) {
  const accent = ACCENT[side];
  const { track } = trackOf(ps);
  const row = (k: string, v: React.ReactNode, dim = false) => (
    <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, opacity: dim ? 0.55 : 1 }}>
      <span style={{ color: poster.creamDim }}>{k}</span>
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, fontSize: scale.body, lineHeight: 1.35 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, paddingBottom: 5, borderBottom: `1px solid ${accent}66` }}>
        <PatronSigil side={side} size={16} />
        <span style={{ fontFamily: fonts.display, fontSize: scale.label, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent }}>
          {PATRON_NAMES[side]}
        </span>
      </div>
      {track.map((s) => row(NAME[s.kind], s.hp <= 0 ? 'Down' : `${s.hp} / ${s.max}`, s.hp <= 0))}
      {ps.reviveCredits > 0 && row('Rejuvenator', `${ps.reviveCredits} revive${ps.reviveCredits === 1 ? '' : 's'}`)}
      {ps.reviveCredits > 0 && row('Revives last', `to round ${ps.reviveUntilRound}`)}
      {row('Souls', <Souls n={ps.souls} size={scale.body} />)}
      {row('Hand', ps.hand.length)}
      {row('Deck', ps.deck.length)}
    </div>
  );
}
