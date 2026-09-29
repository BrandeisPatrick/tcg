/**
 * The Gallery — every card and every piece of chrome the game draws, laid
 * out on one cream sheet so it can be looked at (and, for the effects,
 * fired) outside a match. Printed in the poster idiom like the title sheet,
 * the loadout and the lessons, so it reads as the same object; the last tab
 * is the art credits.
 *
 * This file is the sheet and its masthead. The masthead is one row — back,
 * title, tabs — and it stays on screen, so a tab is never a scroll away.
 * Each tab lives in ./gallery.
 *
 * Reached from the title's Gallery card (?preview=1). ?preview=1&tab=credits
 * opens straight on a tab, and the address follows the tab as it changes.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { HEROES, SPELLS, EQUIPMENT, ULTIMATES } from '@/cards';
import { fonts } from './tokens';
import { poster, sheetStyle, PAPER_MOTTLE } from './poster';
import { PosterBackdrop } from './PosterBackdrop';
import { PosterButton } from './chrome';
import { useViewport } from './hooks/useViewport';
import { ArtCredits } from './system/ArtCredits';
import { STICK } from './gallery/primitives';
import { CardsTab } from './gallery/CardsTab';
import { CombatTab } from './gallery/CombatTab';
import { FoilShowroom } from './gallery/FoilShowroom';
import { BoardTab } from './gallery/BoardTab';
import { StatusesTab } from './gallery/StatusesTab';
import { OverlaysTab } from './gallery/OverlaysTab';
import './gallery/gallery.css';

const BASE = import.meta.env.BASE_URL ?? '/';

type Tab = 'cards' | 'combat' | 'foil' | 'board' | 'statuses' | 'overlays' | 'credits';

const TABS: { id: Tab; label: string }[] = [
  { id: 'cards', label: 'Cards' },
  { id: 'combat', label: 'Combat FX' },
  { id: 'foil', label: 'Foil (WIP)' },
  { id: 'board', label: 'Board' },
  { id: 'statuses', label: 'Statuses' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'credits', label: 'Credits' },
];

function initialTab(): Tab {
  const t = new URLSearchParams(window.location.search).get('tab');
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'cards';
}

/** The palette and faces, handed to gallery.css as custom properties so the
 *  stylesheet never repeats a colour that poster.ts already owns. */
const paletteVars = {
  '--g-ink': poster.ink,
  '--g-ink-soft': poster.inkSoft,
  '--g-ink-dim': poster.inkDim,
  '--g-faint': poster.inkFaint,
  '--g-rule': poster.inkRule,
  '--g-paper': poster.paper,
  '--g-band': poster.paperBand,
  '--g-deep': poster.paperDeep,
  '--g-red': poster.red,
  '--g-ground': poster.ground,
  '--g-cream': poster.cream,
  '--g-cream-faint': poster.creamFaint,
  '--g-mottle': PAPER_MOTTLE,
  '--g-ui': fonts.ui,
  '--g-display': fonts.display,
} as CSSProperties;

export function PreviewGallery() {
  const { isMobile } = useViewport();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const sheet = useRef<HTMLElement>(null);

  const setTab = (t: Tab) => {
    setTabState(t);
    const u = new URL(window.location.href);
    u.searchParams.set('tab', t);
    u.searchParams.delete('show');   // the Cards tab's own view; it does not travel
    window.history.replaceState(null, '', u);
    // A long tab left half-scrolled would open the next one mid-page.
    if ((sheet.current?.getBoundingClientRect().top ?? 0) < 0) window.scrollTo({ top: 0 });
  };

  const tabs = <TabBar tab={tab} setTab={setTab} />;
  const back = (
    <PosterButton
      variant="paper"
      size="sm"
      onClick={() => { window.location.href = BASE; }}
      ariaLabel="Back to the title screen"
      style={{ padding: '7px 12px', fontSize: 11, letterSpacing: '0.14em', flexShrink: 0 }}
    >
      ← Back
    </PosterButton>
  );

  return (
    <div
      className="gal"
      style={{
        ...paletteVars,
        '--g-stick': `${isMobile ? STICK.phone : STICK.desk}px`,
        '--g-pad': isMobile ? '12px' : 'clamp(18px, 2.4vw, 32px)',
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: isMobile ? '6px 6px 18px' : 'clamp(10px, 2vh, 22px) clamp(10px, 2vw, 28px) 28px',
        background: poster.ground,
        color: poster.ink,
        fontFamily: fonts.ui,
      } as CSSProperties}
    >
      <PosterBackdrop />

      {/* The sheet. Only opacity animates: a transform on this ancestor
          would trap the fixed-position overlays the demos fire. */}
      <motion.section
        ref={sheet}
        className="gal-sheet"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        aria-label="Gallery"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 1380,
          borderRadius: isMobile ? 16 : 24,
          padding: `0 var(--g-pad) ${isMobile ? 18 : 28}px`,
          ...sheetStyle,
        }}
      >
        {isMobile ? (
          <>
            <header className="gal-top">
              {back}
              <h1 className="gal-title" style={{ fontSize: 22 }}>Gallery</h1>
            </header>
            <div className="gal-head" style={{ borderTop: `1px solid ${poster.inkRule}` }}>{tabs}</div>
          </>
        ) : (
          <header className="gal-head">
            {back}
            <h1 className="gal-title">Gallery</h1>
            {tabs}
            <span className="gal-count">
              {HEROES.length} heroes · {SPELLS.length} spells · {EQUIPMENT.length} items · {ULTIMATES.length} ultimates
            </span>
          </header>
        )}

        <div className="gal-body">
          {tab === 'cards' && <CardsTab />}
          {tab === 'combat' && <CombatTab />}
          {tab === 'foil' && <FoilShowroom />}
          {tab === 'board' && <BoardTab />}
          {tab === 'statuses' && <StatusesTab />}
          {tab === 'overlays' && <OverlaysTab />}
          {tab === 'credits' && <ArtCredits compact={isMobile} columns={isMobile ? 1 : 2} />}
        </div>
      </motion.section>
    </div>
  );
}

/** The sheet's tabs: stencil words in a row, the open one inked. Where they
 *  do not fit the row scrolls sideways rather than wrapping. */
function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    // Bring the open tab into the strip. Scrolls the strip only: scrollIntoView
    // would also move the page, and the page is the reader's to scroll.
    const strip = nav.current;
    const el = strip?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!strip || !el) return;
    strip.scrollLeft = el.offsetLeft - strip.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
  }, [tab]);
  return (
    <nav ref={nav} className="gal-tabs" aria-label="Gallery sections">
      {TABS.map((it) => (
        <button
          key={it.id}
          type="button"
          className="gal-tab"
          onClick={() => setTab(it.id)}
          aria-pressed={tab === it.id}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}
