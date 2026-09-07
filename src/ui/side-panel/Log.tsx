import { motion } from 'framer-motion';
import type { LogEntry } from '@/engine/types';
import { fonts, spring, text } from '../tokens';
import { poster } from '../poster';
import { PosterButton } from '../chrome';
import { logEntryColor } from '../helpers';
import { LogLine } from './LogLine';

/**
 * Full "Battle Log" bottom sheet on dark chrome: every entry newest-first,
 * each tagged with its turn and inked by logEntryColor. Slides up from the
 * bottom edge — render inside <AnimatePresence> so the exit slide plays.
 */
export function Log({ entries, onClose }: { entries: LogEntry[]; onClose: () => void }) {
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={spring.snappy}
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '60vh',
        background: poster.panel,
        border: `1px solid ${poster.edge}`,
        borderBottom: 'none',
        borderRadius: '14px 14px 0 0',
        boxShadow: '0 -20px 50px rgba(0, 0, 0, 0.5)',
        zIndex: 80,
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)',
        color: poster.cream,
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: `1px solid ${poster.edge}`,
      }}>
        <span style={{
          fontFamily: fonts.display, fontSize: 18, letterSpacing: '0.22em',
          textTransform: 'uppercase', lineHeight: 1, color: poster.cream,
        }}>Battle Log</span>
        <PosterButton variant="ghost" size="sm" onClick={onClose}>Close</PosterButton>
      </div>
      <div style={{ overflowY: 'auto', padding: '8px 14px' }}>
        {[...entries].reverse().map((e, i) => (
          <div key={i} style={{
            padding: '5px 0', borderBottom: `1px dashed ${poster.edge}`,
            ...text.body, color: logEntryColor(e.text),
          }}>
            <span style={{
              fontFamily: fonts.display, fontSize: 11, letterSpacing: '0.1em',
              color: poster.creamDim, marginRight: 8, fontVariantNumeric: 'tabular-nums',
            }}>
              T{e.turn}
            </span>
            <LogLine text={e.text} />
          </div>
        ))}
      </div>
    </motion.div>
  );
}
