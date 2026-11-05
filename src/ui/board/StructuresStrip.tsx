import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PlayerState, Structure, StructureKind } from '@/engine/types';
import { structureHp } from '@/engine/query';
import { fonts, text } from '../tokens';
import { poster } from '../poster';
import { useStatTick } from './useStatTick';

/**
 * A side's structures as one row of pips — Guardian · Walker · Patron, front
 * to back — in place of the old patron HP bar on its vitals rule. Each
 * structure is a run of pips, one a point of HP, lit while it stands; the
 * slice an open attack's knockout would push off is hatched; a felled
 * structure goes flat with a strike through its letter, and the fall itself
 * gets a sticker for a moment. A structure the match's track does not have
 * (a Story fight's Patron-only track) is not drawn. On a phone a structure is
 * its initial; on a desktop, its name.
 */

const NAME: Record<StructureKind, string> = { guardian: 'Guardian', walker: 'Walker', patron: 'Patron' };

/** How long the fall sticker stays up, ms. */
const FALL_MS = 1600;

/** The structure HP each structure of `track` would lose to a push of
 *  `amount`, front first — what the hatching marks. */
function pushedOff(track: Structure[], amount: number): number[] {
  let left = Math.max(0, amount);
  return track.map((s) => {
    const n = Math.min(Math.max(0, s.hp), left);
    left -= n;
    return n;
  });
}

export function StructuresStrip({ ps, label, accent, projected = 0, isMobile }: {
  ps: PlayerState;
  /** The side's name, for the accessible label. */
  label: string;
  /** The owner's ink (your gold, the rival's red). */
  accent: string;
  /** Structure HP the other side's open attack would push off. */
  projected?: number;
  isMobile: boolean;
}) {
  const track = ps.structures.filter((s) => s.max > 0);
  const off = pushedOff(track, projected);
  const total = track.reduce((n, s) => n + s.max, 0);
  const said = track.map((s) => `${NAME[s.kind]} ${s.hp <= 0 ? 'down' : `${s.hp} of ${s.max}`}`).join(', ');
  return (
    <span
      role="img"
      aria-label={`${label} structures: ${structureHp(ps)} of ${total} HP — ${said}`}
      style={{
        display: 'inline-flex', alignItems: 'center',
        gap: isMobile ? 5 : 10,
        flex: 1, minWidth: 0,
      }}
    >
      {track.map((s, i) => (
        <Segment key={s.kind} s={s} pushed={off[i]} accent={accent} isMobile={isMobile} />
      ))}
    </span>
  );
}

function Segment({ s, pushed, accent, isMobile }: { s: Structure; pushed: number; accent: string; isMobile: boolean }) {
  const down = s.hp <= 0;
  // The fall: a sticker while the structure goes from standing to down.
  const [falling, setFalling] = useState(false);
  const was = useRef(s.hp);
  useEffect(() => {
    const before = was.current;
    was.current = s.hp;
    if (before > 0 && s.hp <= 0) {
      setFalling(true);
      const t = setTimeout(() => setFalling(false), FALL_MS);
      return () => clearTimeout(t);
    }
  }, [s.hp]);
  // A push lands: the structure's pips jolt, as a hero's number does.
  const tick = useStatTick(s.hp);

  const pipW = isMobile ? 4 : 6;
  const pipH = isMobile ? 7 : 9;
  const gap = isMobile ? 1.5 : 2;
  return (
    <span style={{
      position: 'relative',
      display: 'inline-flex', alignItems: 'center', gap: isMobile ? 3 : 5,
      // A structure's width follows its HP, so the three read as one track.
      flex: `${s.max} 1 0px`, minWidth: 0,
    }}>
      <span style={{
        ...text.label,
        fontSize: isMobile ? 8.5 : 9.5,
        letterSpacing: isMobile ? '0.06em' : '0.14em',
        color: down ? poster.inkFaint : accent,
        textDecoration: down ? 'line-through' : undefined,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        {isMobile ? NAME[s.kind][0] : NAME[s.kind]}
      </span>
      <motion.span
        animate={tick === 'down' ? { scale: [1, 1.18, 1], x: [0, -2, 2, 0] } : { scale: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: 'inline-flex', alignItems: 'center', gap, minWidth: 0, flex: 1 }}
      >
        {Array.from({ length: s.max }, (_, k) => {
          const standing = k < s.hp;
          const doomed = standing && k >= s.hp - pushed;
          return (
            <span
              key={k}
              style={{
                flex: `0 1 ${pipW}px`,
                minWidth: 2,
                height: pipH,
                borderRadius: 1,
                boxSizing: 'border-box',
                background: doomed
                  ? `repeating-linear-gradient(115deg, ${poster.paperBand} 0 2px, ${poster.stat.hp} 2px 4px)`
                  : standing ? poster.stat.hp : 'transparent',
                border: `1px solid ${standing ? poster.stat.hp : poster.inkRule}`,
              }}
            />
          );
        })}
      </motion.span>
      {/* The fall: a sticker over the structure's pips, for a moment. */}
      <AnimatePresence>
        {falling && (
          <motion.span
            key="fall"
            data-fall={s.kind}
            initial={{ opacity: 0, scale: 1.6, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: -4 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            aria-hidden
            style={{
              // Over the structure, lifted clear of the rule so it covers no name.
              position: 'absolute', left: '50%', bottom: '100%',
              translateX: '-50%', translateY: isMobile ? 1 : 2,
              padding: isMobile ? '1px 4px' : '2px 6px',
              background: poster.red,
              color: poster.paper,
              borderRadius: 2,
              fontFamily: fonts.display,
              fontSize: isMobile ? 8 : 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              lineHeight: 1.1,
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              zIndex: 2,
            }}
          >
            {NAME[s.kind]} down
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
