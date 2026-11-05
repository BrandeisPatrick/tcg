import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PlayerState, Structure, StructureKind } from '@/engine/types';
import { structureHp } from '@/engine/query';
import { text } from '../tokens';
import { poster } from '../poster';
import { FX_INK } from '../effects/fx/fxCatalog';
import { Stamp } from '../effects/fx/primitives';
import { useStatTick } from './useStatTick';
import { MapIcon } from './MapIcon';

/**
 * A side's structures on its vitals rule — Guardian · Walker · Patron, front
 * to back — in place of the old patron HP bar. Each is the game's own icon
 * (MapIcon) in a tile keyed in the owner's ink, then a run of HP pips, one a
 * point, lit in the HP ink while it stands; the slice an open attack's
 * knockout would push off is hatched. A felled structure is struck: its tile
 * greyed like a tile you cannot act on, its pips emptied, a rule through the
 * lot — and the fall itself is slapped on it as a sticker for a moment, the
 * K.O. sticker's own (red, its word charging gold). A structure the match's
 * track does not have (a Story fight's Patron-only track) is not drawn. A
 * desktop prints each one's name beside its icon; a phone, the icon alone.
 */

const NAME: Record<StructureKind, string> = { guardian: 'Guardian', walker: 'Walker', patron: 'Patron' };

/** How long the fall sticker stays up, ms: through a hand-over's End beat and
 *  well into the next turn's Income (turnBeat.ts), so a fall at the End is seen. */
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
        gap: isMobile ? 7 : 16,
        flex: 1, minWidth: 0, height: '100%',
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

  const icon = isMobile ? 18 : 22;
  const pipW = isMobile ? 4.5 : 6;
  const pipH = isMobile ? 9 : 11;
  const gap = isMobile ? 1.5 : 2;
  return (
    <span style={{
      position: 'relative',
      display: 'inline-flex', alignItems: 'center', gap: isMobile ? 4 : 6,
      // As wide as its tile and pips: a structure's run follows its HP, and
      // the three sit together as one track, front first.
      flex: '0 1 auto', minWidth: 0,
    }}>
      <MapIcon kind={s.kind} size={icon} ink={down ? poster.inkFaint : accent} grey={down} />
      {!isMobile && (
        <span style={{
          ...text.label,
          fontSize: 9.5,
          letterSpacing: '0.14em',
          color: down ? poster.inkFaint : accent,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {NAME[s.kind]}
        </span>
      )}
      <motion.span
        animate={tick === 'down' ? { scale: [1, 1.18, 1], x: [0, -2, 2, 0] } : { scale: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: 'inline-flex', alignItems: 'center', gap, minWidth: 0, flex: '0 1 auto' }}
      >
        {Array.from({ length: s.max }, (_, k) => {
          const standing = k < s.hp;
          const doomed = standing && k >= s.hp - pushed;
          return (
            <span
              key={k}
              style={{
                flex: `0 1 ${pipW}px`,
                width: pipW,
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
      {/* Struck: a rule through the fallen structure, tile and pips. */}
      {down && (
        <span aria-hidden data-struck={s.kind} style={{
          position: 'absolute', left: -2, right: -2, top: '50%', height: 1.5, marginTop: -0.75,
          background: poster.inkDim, pointerEvents: 'none',
        }} />
      )}
      {/* The fall: the K.O. sticker's own, slapped on the structure for a moment. */}
      {falling && (
        <span aria-hidden data-fall={s.kind} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
          <Stamp
            text={`${NAME[s.kind]} down`}
            sticker={poster.red}
            ink={poster.paper}
            fill={FX_INK.gold}
            fontSize={isMobile ? 8.5 : 10.5}
            dur={FALL_MS}
            rotate={-4}
          />
        </span>
      )}
    </span>
  );
}
