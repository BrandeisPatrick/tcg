import { motion, AnimatePresence } from 'framer-motion';
import { palette, spring, text as tx } from './tokens';

interface Props {
  visible: boolean;
  text: string;
  tone?: 'self' | 'opponent';
}

export function TurnBanner({ visible, text, tone = 'self' }: Props) {
  const accent = tone === 'self' ? palette.accent : palette.danger;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={text}
          initial={{ x: '-110%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '110%', opacity: 0 }}
          transition={spring.snappy}
          style={{
            position: 'fixed', top: '38%', left: 0, right: 0,
            display: 'flex', justifyContent: 'center', pointerEvents: 'none',
            zIndex: 60,
          }}
        >
          <div style={{
            padding: '22px 30px',
            background: `linear-gradient(90deg, transparent, ${palette.bg1}f0 25%, ${palette.bg2}f0 50%, ${palette.bg1}f0 75%, transparent)`,
            borderTop: `1px solid ${accent}aa`,
            borderBottom: `1px solid ${accent}aa`,
            width: '100%',
            textAlign: 'center',
            ...tx.label, color: palette.text,
          }}>
            {text}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
