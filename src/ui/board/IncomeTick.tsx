import { useEffect, useState } from 'react';
import { animate, motion } from 'framer-motion';
import type { GameState, PlayerID } from '@/engine/types';
import { LANE_INCOME } from '@/engine/constants';
import { fonts, spring, text } from '../tokens';
import { chamfer, clipBoth, poster, soulCoin } from '../poster';

/** What `pid` collected at the start of the turn in play — the engine's own
 *  income line in the log ("P0 +5 Souls (income, +1 comeback)."): the total,
 *  and the comeback and second-mover parts of it. Null when this turn paid no
 *  income (a scripted fight that opens on a later turn). */
export function turnIncome(G: GameState, pid: PlayerID): { total: number; comeback: number; seat: number } | null {
  for (let i = G.log.length - 1; i >= 0; i--) {
    const entry = G.log[i];
    if (entry.turn !== G.turnNumber) break;
    const m = entry.text.match(new RegExp(`^P${pid} \\+(\\d+) Souls \\(income(.*)\\)\\.$`));
    if (!m) continue;
    const comeback = Number(m[2].match(/\+(\d+) comeback/)?.[1] ?? 0);
    const seat = Number(m[2].match(/\+(\d+) second mover/)?.[1] ?? 0);
    return { total: Number(m[1]), comeback, seat };
  }
  return null;
}

/**
 * The Income beat of your turn: before the shop opens, the souls the lane
 * paid count up on the souls plaque — the comeback named when you trail on
 * net worth — so the turn's money is seen arriving before it is spent.
 */
export function IncomeTick({ G, me, rightInset = 0 }: {
  G: GameState;
  me: PlayerID;
  /** Px at the right the desktop side panel takes, so the plate centres on the board. */
  rightInset?: number;
}) {
  const paid = turnIncome(G, me);
  const end = G.players[me].souls;
  const start = Math.max(0, end - (paid?.total ?? 0));
  const [shown, setShown] = useState(start);
  useEffect(() => {
    const run = animate(start, end, { duration: 0.55, delay: 0.25, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) });
    return () => run.stop();
  }, [start, end]);
  if (!paid) return null;
  return (
    <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: rightInset, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 87, pointerEvents: 'none' }}>
      <motion.div
        role="status"
        aria-label={`Income: +${paid.total} souls${paid.comeback ? `, ${paid.comeback} of them comeback` : ''}`}
        initial={{ opacity: 0, y: 14, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, transition: { duration: 0.18 } }}
        transition={spring.snappy}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '12px 18px 13px',
          background: poster.frame, border: `1.5px solid ${poster.edge}`, borderRadius: 10,
          boxShadow: '0 22px 50px rgba(0, 0, 0, 0.55)',
          color: poster.cream,
        }}
      >
        <span style={{ ...text.label, fontSize: 10, letterSpacing: '0.3em', color: poster.creamDim }}>Income</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 9,
          padding: '6px 14px 6px 10px', background: poster.paperBand, color: poster.ink,
          ...clipBoth(chamfer(7)),
        }}>
          <span style={soulCoin(20)} />
          <span style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 1, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'center' }}>{shown}</span>
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <Part>+{paid.total - paid.comeback - paid.seat || LANE_INCOME} lane</Part>
          {paid.comeback > 0 && <Part ink={poster.green}>+{paid.comeback} comeback</Part>}
          {paid.seat > 0 && <Part>+{paid.seat} second mover</Part>}
        </span>
      </motion.div>
    </div>
  );
}

function Part({ children, ink = poster.creamDim }: { children: React.ReactNode; ink?: string }) {
  return (
    <span style={{
      ...text.label, fontSize: 9.5, letterSpacing: '0.12em', padding: '3px 7px', borderRadius: 999,
      border: `1.5px solid ${ink}`, color: ink, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}
