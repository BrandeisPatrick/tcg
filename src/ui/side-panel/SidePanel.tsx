import type { GameState, PlayerID } from '@/engine/types';
import { palette, radius, text } from '../tokens';
import { LogLine } from './LogLine';
import { PlayerCard } from './PlayerCard';
import { logEntryColor } from '../helpers';

/**
 * Right-rail orchestrator. Renders (top → bottom):
 *   - "Patrol" header + current turn pip
 *   - Opponent patron card (Sapphire Flame)
 *   - Recent log (grouped by turn, semantic colour from logEntryColor)
 *   - Your patron card (Amber Hand)
 *   - Hint footer
 */
export function SidePanel({
  G, me, isMyTurn, turn, onLogToggle,
  projectedFaceDamageMe, projectedFaceDamageOpp,
}: {
  G: GameState; me: PlayerID; isMyTurn: boolean; turn: number; onLogToggle: () => void;
  projectedFaceDamageMe?: number; projectedFaceDamageOpp?: number;
}) {
  const opp: PlayerID = me === '0' ? '1' : '0';
  // Group log entries by turn (newest first). Each group shows one "Turn N"
  // header followed by its lines — saves the T-prefix per line and makes
  // turn boundaries scannable.
  const grouped = (() => {
    const last40 = [...G.log].slice(-40).reverse();
    const out: { turn: number; entries: typeof last40 }[] = [];
    for (const e of last40) {
      const head = out[out.length - 1];
      if (head && head.turn === e.turn) head.entries.push(e);
      else out.push({ turn: e.turn, entries: [e] });
    }
    return out;
  })();
  return (
    <aside style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: '14px 14px 14px',
      background: palette.bg1,
      border: `1px solid #5a3f1c`,
      borderRadius: radius.lg,
      boxShadow: '0 4px 12px rgba(40, 20, 0, 0.22)',
      minHeight: 0,
      height: '100%',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 8, borderBottom: `1px solid ${palette.border}`,
      }}>
        <span style={{ ...text.label, color: palette.textDim }}>Patrol</span>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...text.label, color: palette.textDim }}>Turn</span>
          <span style={{ ...text.numeric, fontSize: 16, color: palette.text }}>{turn}</span>
        </span>
      </div>

      <PlayerCard label="Sapphire Flame" ps={G.players[opp]} hostile order={opp === '0' ? '1st' : '2nd'} projectedFaceDamage={projectedFaceDamageOpp} />

      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        background: 'rgba(120, 80, 30, 0.06)',
        border: `1px solid ${palette.border}`,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px', borderBottom: `1px solid ${palette.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ ...text.label, color: palette.textDim }}>Recent</span>
          <button onClick={onLogToggle} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            ...text.label, color: palette.accent,
          }}>Full Log →</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 12px 12px' }}>
          {grouped.length === 0 ? (
            <div style={{ ...text.body, color: palette.textDim }}>No actions yet.</div>
          ) : grouped.map((g) => (
            <div key={g.turn} style={{ marginTop: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                paddingBottom: 3, borderBottom: `1px dashed ${palette.border}`,
              }}>
                <span style={{ ...text.label, color: palette.textDim }}>Turn</span>
                <span style={{ ...text.numeric, fontSize: 16, color: palette.text }}>{g.turn}</span>
              </div>
              {g.entries.map((e, i) => {
                const c = logEntryColor(e.text);
                return (
                  <div key={i} style={{
                    ...text.body, color: c, padding: '1px 0',
                    paddingLeft: 6, borderLeft: `2px solid ${c}44`,
                    marginLeft: 2,
                  }}>
                    <LogLine text={e.text} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <PlayerCard label="Amber Hand" ps={G.players[me]} active={isMyTurn} order={me === '0' ? '1st' : '2nd'} projectedFaceDamage={projectedFaceDamageMe} />

      <div style={{
        paddingTop: 8, borderTop: `1px solid ${palette.border}`,
        ...text.body, color: palette.textDim,
      }}>
        Drop a card on a hero · Hover for the lore · Hold for full preview
      </div>
    </aside>
  );
}
