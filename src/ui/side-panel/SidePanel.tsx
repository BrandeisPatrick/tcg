import type { GameState } from '@/engine/types';
import { fonts, text } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';
import { LogLine } from './LogLine';
import { logEntryColor } from '../helpers';

/**
 * Right-rail orchestrator, drawn on the drawer's dark chrome (PanelDrawer
 * owns the surface; this column is transparent). Both patrons' vitals now
 * live on the board itself, so the panel is only the match log: a heading
 * with the turn numeral over a recessed well, grouped by turn with each
 * line inked by logEntryColor.
 */

// Stencil headings in cream, and the dimmer eyebrow that labels a numeral.
const heading = {
  fontFamily: fonts.display,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  lineHeight: 1,
  color: poster.cream,
} as const;
const eyebrow = { ...heading, fontSize: 10, color: poster.creamDim } as const;

export function SidePanel({
  G, turn, onLogToggle,
}: {
  G: GameState; turn: number; onLogToggle: () => void;
}) {
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
      position: 'relative',
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: '14px 14px 14px',
      background: 'transparent',
      minHeight: 0,
      height: '100%',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 8, borderBottom: `1px solid ${poster.edge}`,
      }}>
        <span style={{ ...heading, fontSize: 18 }}>Log</span>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
          <span style={eyebrow}>Turn</span>
          <span style={{ ...heading, fontSize: 18 }}>{turn}</span>
        </span>
      </div>

      {/* Recent log — a recessed well cut into the panel. */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        background: poster.ground,
        border: `1px solid ${poster.edge}`,
        ...clipBoth(chamfer(6)),
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px', borderBottom: `1px solid ${poster.edge}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ ...heading, fontSize: 11 }}>Recent</span>
          <button onClick={onLogToggle} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            ...heading, fontSize: 11,
          }}>Full Log →</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 12px 12px' }}>
          {grouped.length === 0 ? (
            <div style={{ ...text.body, color: poster.creamDim }}>No actions yet.</div>
          ) : grouped.map((g) => (
            <div key={g.turn} style={{ marginTop: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                paddingBottom: 3, borderBottom: `1px dashed ${poster.edge}`,
              }}>
                <span style={eyebrow}>Turn</span>
                <span style={{ ...heading, fontSize: 14 }}>{g.turn}</span>
              </div>
              {g.entries.map((e, i) => {
                const c = logEntryColor(e.text);
                return (
                  <div key={i} style={{
                    ...text.body, color: c, padding: '1px 0',
                    paddingLeft: 6, marginLeft: 2,
                    // Faint rule in the line's own ink; falls back to the full
                    // colour (currentColor) where color-mix is unsupported.
                    borderLeft: '2px solid',
                    borderLeftColor: `color-mix(in srgb, ${c} 40%, transparent)`,
                  }}>
                    <LogLine text={e.text} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

    </aside>
  );
}
