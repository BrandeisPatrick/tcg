import { motion } from 'framer-motion';
import type { LogEntry } from '@/engine/types';
import { palette, spring, text } from '../tokens';
import { LogLine } from './LogLine';

export function Log({ entries, onClose }: { entries: LogEntry[]; onClose: () => void }) {
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={spring.snappy}
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '60vh',
        background: palette.bg1,
        borderTop: `2px solid #5a3f1c`,
        boxShadow: '0 -8px 24px rgba(40, 20, 0, 0.3)',
        zIndex: 80,
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)',
        color: palette.text,
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: `1px solid ${palette.border}`,
      }}>
        <span style={{ ...text.label, color: palette.textDim }}>Battle Log</span>
        <button
          onClick={onClose}
          style={{
            padding: '6px 14px', background: palette.bg2,
            border: `1px solid #5a3f1c`, borderRadius: 6, cursor: 'pointer',
            ...text.label, color: palette.text,
          }}
        >Close</button>
      </div>
      <div style={{ overflowY: 'auto', padding: '8px 14px' }}>
        {[...entries].reverse().map((e, i) => (
          <div key={i} style={{
            padding: '5px 0', borderBottom: `1px dashed ${palette.border}`,
            ...text.body, color: palette.text,
          }}>
            <span style={{ color: palette.accentWarm, marginRight: 8, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              T{e.turn}
            </span>
            <LogLine text={e.text} />
          </div>
        ))}
      </div>
    </motion.div>
  );
}
