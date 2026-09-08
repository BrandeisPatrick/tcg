import { motion, AnimatePresence } from 'framer-motion';
import { poster, clipBoth } from '../poster';
import { useViewport } from '../hooks/useViewport';

/**
 * Right-side game panel (Patrol + log + Amber Hand) with an always-visible
 * chevron tab to toggle it. Dark chrome: the drawer is a poster.panel column
 * with a single edge rule down its left side, floating over the blurred
 * scene; the tab is a small ink plate that rides the panel's edge.
 *
 * Desktop: the panel participates in the Board's flex row — opening it
 * narrows the main column, and the stage's fit-scale reflows to the space
 * that's actually left. (It used to be a fixed overlay that sat on top of
 * the board's right edge, hiding slots and the End Turn shelf.)
 *
 * Mobile: stays a fixed overlay — there's no room to give up, and the
 * panel is closed by default there anyway.
 */
export const PANEL_WIDTH = 320;

/** The chevron tab's silhouette: chamfered on the left only — its right
 *  edge is always flush against the panel or the viewport edge. */
const TAB_CLIP = 'polygon(4px 0, 100% 0, 100% 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)';
const WIDTH = PANEL_WIDTH;

const PANEL_SHADOW = '-16px 0 40px rgba(0, 0, 0, 0.5)';

export function PanelDrawer({ open, onToggle, children }: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { isMobile } = useViewport();

  const tab = (
    <button
      onClick={onToggle}
      title={open ? 'Hide panel' : 'Show panel'}
      style={{
        position: 'fixed',
        top: '50%',
        right: open ? WIDTH : 0,
        transform: 'translateY(-50%)',
        width: 22, height: 64,
        background: poster.panel,
        border: `1px solid ${poster.edge}`,
        // Left-only chamfer: the tab's right edge is always flush (against the
        // panel when open, the viewport edge when closed), so notching it there
        // would just expose the scene.
        ...clipBoth(TAB_CLIP),
        color: poster.cream,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 65,
        padding: 0,
        transition: 'right 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        lineHeight: 1,
      }}
    >
      <span aria-hidden style={{
        display: 'inline-flex',
        transform: open ? 'none' : 'rotate(180deg)',
        transition: 'transform 220ms ease',
      }}>
        <svg viewBox="0 0 10 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="8,1 2,7 8,13" />
        </svg>
      </span>
    </button>
  );

  if (isMobile) {
    return (
      <>
        {tab}
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
                // Top padding clears the persistent system gear pinned to the
                // viewport corner so the panel header never sits under it.
                padding: '56px 12px 12px 8px',
                background: poster.panel,
                borderLeft: `1px solid ${poster.edge}`,
                boxShadow: PANEL_SHADOW,
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

  // Desktop: in-flow flex child. Stays mounted so the width can animate;
  // the inner box keeps a constant width so text doesn't reflow mid-slide.
  // The shadow lives on this outer element — its overflow: hidden would clip
  // one placed on the inner box.
  return (
    <>
      {tab}
      <motion.aside
        key="panel-drawer"
        initial={false}
        animate={{ width: open ? WIDTH : 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        style={{
          flex: '0 0 auto',
          alignSelf: 'stretch',
          overflow: 'hidden',
          background: poster.panel,
          boxShadow: open ? PANEL_SHADOW : 'none',
          zIndex: 64,
          position: 'relative',
        }}
      >
        <div style={{
          width: WIDTH,
          height: '100%',
          // Top padding clears the persistent system gear pinned to the
          // viewport corner so the panel header never sits under it.
          padding: '56px 12px 12px 8px',
          boxSizing: 'border-box',
          position: 'absolute',
          right: 0, top: 0,
          background: poster.panel,
          borderLeft: `1px solid ${poster.edge}`,
        }}>
          {children}
        </div>
      </motion.aside>
    </>
  );
}
