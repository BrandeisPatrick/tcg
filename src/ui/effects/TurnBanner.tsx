import { motion, AnimatePresence } from 'framer-motion';
import { palette, fonts } from '../tokens';

interface Props {
  visible: boolean;
  text: string;
  tone?: 'self' | 'opponent';
}

/**
 * Start-of-turn banner. A full-width strip slides in from the left across the
 * vertical centre of the battlefield, holds while `visible=true`, then exits
 * to the right. The strip's text block sits in the middle so the eye lands on
 * "Your Move" / "Rival's Move" as the bar settles.
 */
export function TurnBanner({ visible, text, tone = 'self' }: Props) {
  const accent = tone === 'self' ? palette.accent : palette.danger;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={text}
          // Outer wrapper handles vertical positioning + clipping window.
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            top: '50%',
            left: 0, right: 0,
            transform: 'translateY(-50%)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 60,
          }}
        >
          {/* The sliding strip itself — enters from left, settles centered,
              then exits to the right when AnimatePresence sees visible=false. */}
          <motion.div
            initial={{ x: '-100vw' }}
            animate={{ x: 0 }}
            exit={{ x: '100vw' }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            style={{
              width: '100%',
              padding: '20px 0',
              background: `linear-gradient(90deg, transparent 0%, ${palette.bg1}f5 12%, ${palette.bg2}f5 50%, ${palette.bg1}f5 88%, transparent 100%)`,
              borderTop: `2px solid ${accent}`,
              borderBottom: `2px solid ${accent}`,
              textAlign: 'center',
              fontFamily: fonts.ui,
              fontSize: 26, fontWeight: 700,
              color: palette.text,
              boxShadow: `0 0 36px ${accent}66, 0 8px 24px rgba(40,20,0,0.45)`,
            }}
          >
            {text}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
