/**
 * The Gallery's full-size view. The grids print every card at hand size —
 * small enough to see the whole set, too small to read a long rule — so a
 * card opens here at the size the match's long-press preview shows it.
 * Spells and equipment carry the round icon they become on the table.
 *
 * Arrow keys walk the set that was on screen; Escape or the scrim closes.
 */
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CardFrame } from '../card/CardFrame';
import { RoundCardIcon } from '../card/RoundCardIcon';
import { CARDS_BY_ID } from '@/cards';
import { poster, scrimStyle } from '../poster';
import { fonts } from '../tokens';
import { useViewport } from '../hooks/useViewport';
import { FULL } from './primitives';

const TYPE_LABEL = { hero: 'Hero', spell: 'Spell', equipment: 'Equipment', ultimate: 'Ultimate' } as const;

export function CardLightbox({ ids, id, onPick, onClose }: {
  /** The set being walked, in the order it was on screen. */
  ids: string[];
  id: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { width, height, isMobile } = useViewport();
  const at = ids.indexOf(id);
  const data = CARDS_BY_ID[id];
  const box = useRef<HTMLDivElement>(null);

  const step = (d: number) => {
    const next = ids[at + d];
    if (next) onPick(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Take focus on open and hand it back on close, so the keyboard lands
  // where it left off in the grid.
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => back?.focus?.();
  }, []);

  if (!data) return null;

  const onTable = data.type === 'spell' || data.type === 'equipment';
  // Fit the print to a short or narrow window rather than let it run off.
  const room = height - (isMobile ? 190 : 150);
  const scale = Math.min(1, room / FULL.h, (width - 32) / FULL.w);
  const glow = data.type === 'ultimate' || (data.type === 'equipment' && data.tier === 3) ? 'gold' : null;
  const meta = [
    data.type === 'equipment' ? `Equipment · Tier ${data.tier}` : TYPE_LABEL[data.type],
    data.type !== 'hero' && data.cost != null ? `${data.cost} soul${data.cost === 1 ? '' : 's'}` : null,
    data.type === 'hero' ? `${data.atk} BP · ${data.hp} HP` : null,
  ].filter(Boolean).join(' · ');

  const nav = (d: number, label: string, glyph: string) => (
    <button
      type="button"
      className="gal-lb__nav"
      aria-label={label}
      disabled={!ids[at + d]}
      onClick={(e) => { e.stopPropagation(); step(d); }}
    >
      {glyph}
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      onClick={onClose}
      style={{ ...scrimStyle, zIndex: 60, padding: 16, cursor: 'zoom-out' }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={`${data.name}, full size`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, outline: 'none', cursor: 'default' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {!isMobile && nav(-1, 'Previous card', '←')}
          <div style={{ width: FULL.w * scale, height: FULL.h * scale }}>
            <div style={{ width: FULL.w, height: FULL.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <CardFrame key={id} cardId={id} size="full" glow={glow} physical={false} />
            </div>
          </div>
          {!isMobile && nav(1, 'Next card', '→')}
        </div>

        {/* The caption: what it is, and for a spell or a piece of equipment
            the round icon it turns into once it is on the table. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isMobile && nav(-1, 'Previous card', '←')}
          {onTable && (
            <div title="As it appears on the table" style={{ flexShrink: 0 }}>
              <RoundCardIcon cardId={id} size={52} showName={false} />
            </div>
          )}
          <div style={{ minWidth: 0, textAlign: onTable ? 'left' : 'center', color: poster.cream, fontFamily: fonts.ui }}>
            <div style={{ fontFamily: fonts.display, fontSize: 15, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.2 }}>
              {data.name}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: poster.creamDim, fontVariantNumeric: 'tabular-nums' }}>
              {meta} · {at + 1} of {ids.length}
            </div>
          </div>
          {isMobile && nav(1, 'Next card', '→')}
        </div>
      </div>
    </motion.div>
  );
}
