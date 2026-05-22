import { motion, AnimatePresence } from 'framer-motion';
import { palette, fonts } from '../tokens';

/**
 * Slide-out drawer for the right-side game panel (Patrol + log + Amber Hand).
 * A thin chevron tab is always visible at the right edge so the panel can
 * be toggled. The main board stays centered to the viewport regardless of
 * open state — the drawer overlays the right side of the board rather than
 * pushing it.
 */
const WIDTH = 320;

export function PanelDrawer({ open, onToggle, children }: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Toggle tab — sits flush against the panel's left edge when open,
          or against the viewport's right edge when closed. CSS-only
          right offset (no framer-motion) so the position is exact. */}
      <button
        onClick={onToggle}
        title={open ? 'Hide panel' : 'Show panel'}
        style={{
          position: 'fixed',
          top: '50%',
          right: open ? WIDTH : 0,
          transform: 'translateY(-50%)',
          width: 22, height: 64,
          background: `linear-gradient(180deg, ${palette.bg1}, ${palette.bg2})`,
          border: `1.5px solid ${palette.accent}`,
          borderRadius: '6px 0 0 6px',
          color: palette.text,
          cursor: 'pointer',
          fontFamily: fonts.ui,
          fontSize: 16, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `-3px 0 12px rgba(40, 20, 0, 0.32)`,
          zIndex: 65,
          padding: 0,
          transition: 'right 280ms cubic-bezier(0.22, 1, 0.36, 1)',
          lineHeight: 1,
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: open ? 'none' : 'rotate(180deg)',
          transition: 'transform 220ms ease',
        }}>‹</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.aside
            key="panel-drawer"
            initial={{ x: WIDTH }}
            animate={{ x: 0 }}
            exit={{ x: WIDTH }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{
              position: 'fixed',
              top: 0, right: 0, bottom: 0,
              width: WIDTH,
              padding: '12px 12px 12px 8px',
              background: palette.bg0,
              boxShadow: `-8px 0 24px rgba(40, 20, 0, 0.32)`,
              zIndex: 64,
              overflow: 'hidden',
            }}
          >
            {children}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
