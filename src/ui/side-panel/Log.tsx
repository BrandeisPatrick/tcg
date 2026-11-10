import { motion } from 'framer-motion';
import type { LogEntry } from '@/engine/types';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';
import { DecoRule, panelStyle, scale } from '../hud';
import { logEntryColor } from '../helpers';
import { LogLine } from './LogLine';

/** The sheet's accessible name: the tutorial gate keeps it open to taps. */
export const LOG_SHEET = 'Match log';

/**
 * The match log: a bottom sheet on Deadlock's dark panel, every entry
 * newest-first under its turn's heading (one heading per turn, not a tag on
 * every line), each line inked by logEntryColor. Slides up from the bottom
 * edge — render inside <AnimatePresence> so the exit slide plays.
 */
export function Log({ entries, onClose }: { entries: LogEntry[]; onClose: () => void }) {
  // Newest first, runs of one turn gathered under one heading.
  const turns: { turn: number; lines: string[] }[] = [];
  for (const e of [...entries].reverse()) {
    // The engine's "--- Turn 5, player 0 ---" markers: the heading says it.
    if (/^---.*---$/.test(e.text.trim())) continue;
    const last = turns[turns.length - 1];
    if (last && last.turn === e.turn) last.lines.push(e.text);
    else turns.push({ turn: e.turn, lines: [e.text] });
  }
  return (
    <motion.div
      role="dialog"
      aria-label={LOG_SHEET}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={spring.snappy}
      style={{
        ...panelStyle,
        position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '60vh',
        borderBottom: 'none',
        borderRadius: '12px 12px 0 0',
        boxShadow: '0 -20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        zIndex: 80,
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        padding: '10px 10px 8px 16px',
      }}>
        <span style={{
          fontFamily: fonts.display, fontSize: scale.title, letterSpacing: '0.16em',
          textTransform: 'uppercase', lineHeight: 1, color: poster.cream,
        }}>Match log</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 36, height: 36, borderRadius: '50%', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(8, 20, 19, 0.92)', color: poster.cream,
            border: '1px solid rgba(232, 224, 204, 0.22)', cursor: 'pointer',
            fontFamily: fonts.ui, fontSize: scale.number, lineHeight: 1,
          }}
        >
          <span aria-hidden>✕</span>
        </button>
      </div>
      <DecoRule color="rgba(232, 224, 204, 0.22)" style={{ padding: '0 16px', boxSizing: 'border-box' }} />
      <div style={{ overflowY: 'auto', padding: '4px 16px 12px' }}>
        {turns.map((t, i) => (
          <section key={`${t.turn}-${i}`} style={{ padding: '6px 0 4px' }}>
            <div style={{
              fontFamily: fonts.display, fontSize: scale.label, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: poster.creamDim, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums', margin: '4px 0 4px',
            }}>
              Turn {t.turn}
            </div>
            {t.lines.map((line, j) => (
              <div key={j} style={{
                padding: '4px 0 4px 10px',
                borderLeft: '2px solid rgba(232, 224, 204, 0.12)',
                fontFamily: fonts.ui, fontSize: scale.body, lineHeight: 1.4,
                color: logEntryColor(line),
              }}>
                <LogLine text={line} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </motion.div>
  );
}
