import { useEffect, useState } from 'react';
import { animate, motion } from 'framer-motion';
import type { GameState, PlayerID } from '@/engine/types';
import { spring, text } from '../tokens';
import { poster } from '../poster';
import { Souls, scale } from '../hud';
import { useLaneBox } from './TurnBanner';

/** What `pid` collected at the start of the turn in play — the engine's own
 *  income line in the log ("P0 +5 Souls (income)."): the total and its
 *  second-mover part — and the cards it drew ("P0 drew 1 card."). Null when
 *  this turn paid no income (a scripted fight that opens on a later turn). */
export function turnIncome(G: GameState, pid: PlayerID): { total: number; seat: number; drew: number } | null {
  let drew = 0;
  for (let i = G.log.length - 1; i >= 0; i--) {
    const entry = G.log[i];
    if (entry.turn !== G.turnNumber) break;
    const d = entry.text.match(new RegExp(`^P${pid} drew (\\d+) cards?\\.$`));
    if (d) { drew = Math.max(drew, Number(d[1])); continue; }
    const m = entry.text.match(new RegExp(`^P${pid} \\+(\\d+) Souls \\(income(.*)\\)\\.$`));
    if (!m) continue;
    const seat = Number(m[2].match(/\+(\d+) second mover/)?.[1] ?? 0);
    // The draw is logged after the income: scan on for it.
    for (let j = i + 1; j < G.log.length; j++) {
      const e = G.log[j];
      if (e.turn !== G.turnNumber) break;
      const dd = e.text.match(new RegExp(`^P${pid} drew (\\d+) cards?\\.$`));
      if (dd) { drew = Number(dd[1]); break; }
    }
    return { total: Number(m[1]), seat, drew };
  }
  return null;
}

/**
 * The Income beat of your turn: your souls count up on a small paper tag at
 * the foot of the lane's middle column (under the turn stamp, over the dial:
 * no card, number or control is under it), with what the turn paid and the
 * cards it drew on one line beneath.
 */
export function IncomeTick({ G, me }: { G: GameState; me: PlayerID }) {
  const paid = turnIncome(G, me);
  const lane = useLaneBox();
  const end = G.players[me].souls;
  const start = Math.max(0, end - (paid?.total ?? 0));
  const [shown, setShown] = useState(start);
  useEffect(() => {
    const run = animate(start, end, { duration: 0.55, delay: 0.25, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) });
    return () => run.stop();
  }, [start, end]);
  if (!paid) return null;
  const cards = paid.drew > 0 ? `${paid.drew} card${paid.drew === 1 ? '' : 's'}` : '';
  return (
    <div style={{
      position: 'fixed', left: lane.left, width: lane.width, top: lane.top, height: lane.height,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      paddingBottom: 2, boxSizing: 'border-box', zIndex: 87, pointerEvents: 'none',
    }}>
      <motion.div
        role="status"
        aria-label={`Income: +${paid.total} souls${cards ? `, ${cards} drawn` : ''}`}
        initial={{ opacity: 0, y: 8, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }}
        transition={spring.snappy}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          maxWidth: '100%', boxSizing: 'border-box', padding: '5px 9px 6px',
          background: poster.paper, color: poster.ink, borderRadius: 6,
          boxShadow: `inset 0 0 0 1.5px ${poster.ink}, 0 2px 0 rgba(0, 0, 0, 0.3)`,
        }}
      >
        <Souls n={shown} size={scale.title} tone="paper" />
        <span style={{ ...text.label, fontSize: scale.floor, letterSpacing: '0.06em', lineHeight: 1, color: poster.inkDim, whiteSpace: 'nowrap' }}>
          {`+${paid.total}${cards ? ` · +${cards}` : ''}`}
        </span>
      </motion.div>
    </div>
  );
}
