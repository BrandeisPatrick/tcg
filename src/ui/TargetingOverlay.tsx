import { motion } from 'framer-motion';
import type { TargetFilter } from '@/abilities';
import { palette, spring, text } from './tokens';

interface Props {
  title: string;
  desc: string;
  filter: TargetFilter;
  onCancel: () => void;
}

const TARGET_LABELS: Record<TargetFilter, string> = {
  noTarget: 'No Target',
  self: 'Self',
  allyAny: 'Any Ally',
  allyHero: 'Ally Hero',
  enemyAny: 'Any Enemy',
  enemyHero: 'Enemy Hero',
  enemyActive: 'Enemy Active',
  anyBoard: 'Any Hero',
};

export function TargetingOverlay({ title, desc, filter, onCancel }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={spring.snappy}
      style={{
        position: 'fixed',
        left: 16, right: 16,
        bottom: 'calc(220px + env(safe-area-inset-bottom))',
        maxWidth: 520,
        margin: '0 auto',
        background: palette.bg1,
        border: `2px solid ${palette.success}`,
        borderRadius: 12,
        padding: '12px 14px',
        boxShadow: `0 10px 26px rgba(40, 20, 0, 0.32), 0 0 22px ${palette.success}55`,
        zIndex: 50,
      }}
    >
      {/* Row 1: target-type pill + cancel */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '4px 10px',
          background: `${palette.success}22`,
          border: `1px solid ${palette.success}66`,
          borderRadius: 999,
          ...text.label, color: palette.success,
        }}>
          <span aria-hidden>◎</span>
          <span>{TARGET_LABELS[filter]}</span>
        </span>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          onClick={onCancel}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px',
            background: `${palette.danger}18`,
            border: `1px solid ${palette.danger}88`,
            borderRadius: 6,
            cursor: 'pointer',
            ...text.label, color: palette.danger,
          }}
        >
          <span aria-hidden>✕</span>
          <span>Cancel</span>
        </motion.button>
      </div>

      {/* Row 2: title + description */}
      <div style={{ ...text.label, color: palette.text }}>{title}</div>
      <div style={{ marginTop: 3, ...text.body, color: palette.textDim }}>{desc}</div>

      {/* Row 3: drag hint */}
      <div style={{
        marginTop: 8, paddingTop: 8,
        borderTop: `1px dashed ${palette.border}`,
        ...text.body, color: palette.textFaint, fontStyle: 'italic',
      }}>
        Tap a glowing target — or drag onto it.
      </div>
    </motion.div>
  );
}
