/**
 * The run at a glance — the story map's HUD. Your roster, your deck, and the
 * three routes out of the Battery with how far along each one you are and
 * the boss waiting at its end. Pressing a route asks the map to show its next
 * stop; pressing a hero or a card shows it full size.
 *
 * Chrome is ink: a dark panel, so it reads over cream land and dark water
 * alike. On desktop it is the full panel; on a phone it folds to a bar that
 * opens the same panel as a bottom sheet. Either way it is a plain box that
 * fills the slot the map screen gives it.
 *
 * The sheets it opens (the deck, the phone run sheet, a card preview) are
 * portalled to the body, so a transform on the screen's docking wrapper can
 * never trap them.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CARDS_BY_ID } from '@/cards';
import type { CardId } from '@/engine/types';
import type { StoryRun, StoryNode } from '@/story/types';
import { effectiveKind, routeProgress, stopState, type RouteProgress } from '@/story/describe';
import { HeroBadge } from '@/cards/art/heroArt';
import { CardFrame } from '../card/CardFrame';
import { CardPreview } from '../overlays/CardPreview';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer, clipBoth, scrimStyle, sheetStyle, tileShadow } from '../poster';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';
import { KIND_LABEL, StopGlyph, FramedPortrait, eyebrow } from './StopGlyph';

const Z = { runSheet: 70, deck: 80 } as const; // CardPreview sits at 90

/** Escape closes the topmost thing this panel opened, and only that: the
 *  listener runs in the capture phase and stops the key there, so the map
 *  screen's own Escape (closing the stop card) does not fire underneath. */
function useEscape(onEscape: (() => void) | null) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  const live = !!onEscape;
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ref.current) return;
      e.stopPropagation();
      ref.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [live]);
}

export function RunPanel({ run, compact, onFocusStop, onAbandon }: {
  run: StoryRun;
  compact: boolean;
  onFocusStop: (node: StoryNode) => void;
  onAbandon: () => void;
}) {
  const [preview, setPreview] = useState<CardId | null>(null);
  const [deckOpen, setDeckOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEscape(
    preview ? () => setPreview(null)
      : deckOpen ? () => setDeckOpen(false)
      : sheetOpen ? () => setSheetOpen(false)
      : null,
  );

  const body = (inSheet: boolean) => (
    <PanelBody
      run={run}
      header={!inSheet}
      onPreview={setPreview}
      onOpenDeck={() => setDeckOpen(true)}
      onFocusStop={(n) => {
        // From the phone sheet, get out of the way first so the map can
        // show the stop it is about to fly to.
        if (inSheet) setSheetOpen(false);
        onFocusStop(n);
      }}
      onAbandon={onAbandon}
    />
  );

  return (
    <>
      {compact ? (
        <CompactBar run={run} onOpen={() => setSheetOpen(true)} />
      ) : (
        <section
          aria-label="Story run"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            maxHeight: 'calc(100dvh - 96px)',
            display: 'flex',
            flexDirection: 'column',
            background: poster.panel,
            border: `1px solid ${poster.edge}`,
            borderRadius: 12,
            boxShadow: tileShadow,
            color: poster.cream,
            fontFamily: fonts.ui,
            overflow: 'hidden',
          }}
        >
          {body(false)}
        </section>
      )}

      {createPortal(
        <>
          <AnimatePresence>
            {compact && sheetOpen && (
              <RunSheet key="run-sheet" run={run} onClose={() => setSheetOpen(false)}>{body(true)}</RunSheet>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {deckOpen && (
              <DeckSheet key="deck" deck={run.deck} onPreview={setPreview} onClose={() => setDeckOpen(false)} />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {preview && <CardPreview key={preview} cardId={preview} onClose={() => setPreview(null)} />}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </>
  );
}

// ---- the panel ---------------------------------------------------------------

function PanelBody({ run, header = true, onPreview, onOpenDeck, onFocusStop, onAbandon }: {
  run: StoryRun;
  /** The phone sheet pins its own header (with the close), so it drops this one. */
  header?: boolean;
  onPreview: (id: CardId) => void;
  onOpenDeck: () => void;
  onFocusStop: (node: StoryNode) => void;
  onAbandon: () => void;
}) {
  const routes = routeProgress(run);
  const start = run.nodes.find((n) => n.region === 'start');
  const startOpen = !!start && stopState(run, start) !== 'cleared';
  const bossesDown = routes.filter((r) => r.bossDown).length;

  return (
    <>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          padding: '14px 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          scrollbarWidth: 'thin',
          scrollbarColor: `${poster.edge} transparent`,
        }}
      >
        {header && <PanelHead bossesDown={bossesDown} bosses={routes.length} />}

        <Block label="Roster" count={`${run.heroes.length}/4`} first={!header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {[0, 1, 2, 3].map((i) => {
              const id = run.heroes[i];
              return id ? (
                <motion.button
                  key={id}
                  type="button"
                  onClick={() => onPreview(id)}
                  aria-label={`${CARDS_BY_ID[id]?.name ?? id}: show card`}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring.snappy}
                  style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8 }}
                >
                  <FramedPortrait hero={id} w={56} h={72} border={poster.you} />
                </motion.button>
              ) : (
                <span
                  key={`empty-${i}`}
                  aria-hidden
                  style={{
                    width: 56,
                    height: 72,
                    boxSizing: 'border-box',
                    borderRadius: 8,
                    border: `1.5px dashed ${poster.creamFaint}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <StopGlyph kind="recruit" color={poster.creamFaint} size={20} />
                </span>
              );
            })}
          </div>
        </Block>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: `1px solid ${poster.edge}` }}>
          <span style={{ ...eyebrow, color: poster.creamDim }}>Deck</span>
          <span style={{ ...text.label, fontSize: 13, color: poster.cream, fontVariantNumeric: 'tabular-nums' }}>
            {run.deck.length} cards
          </span>
          <PosterButton
            variant="ghost"
            size="sm"
            onClick={onOpenDeck}
            ariaLabel={`View your deck, ${run.deck.length} cards`}
            style={{ marginLeft: 'auto', minHeight: 40, padding: '9px 14px', fontSize: 11, letterSpacing: '0.18em' }}
          >
            View
          </PosterButton>
        </div>

        <Block label="Routes">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {start && startOpen && <StartRow node={start} onPress={() => onFocusStop(start)} />}
            {routes.map((r) => (
              <RouteRow
                key={r.id}
                run={run}
                route={r}
                dim={startOpen}
                onPress={() => onFocusStop(r.next ?? r.boss)}
              />
            ))}
          </div>
        </Block>
      </div>

      <AbandonFooter onAbandon={onAbandon} />
    </>
  );
}

function PanelHead({ bossesDown, bosses, children }: { bossesDown: number; bosses: number; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ ...eyebrow, color: poster.creamDim }}>Story run</span>
      <span style={{ ...eyebrow, color: poster.creamDim, fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
        Bosses {bossesDown}/{bosses}
      </span>
      {children}
    </div>
  );
}

function Block({ label, count, first, children }: { label: string; count?: string; first?: boolean; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: first ? 0 : 12, borderTop: first ? undefined : `1px solid ${poster.edge}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ ...eyebrow, color: poster.creamDim }}>{label}</span>
        {count && (
          <span style={{ ...text.label, fontSize: 12, color: poster.cream, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

const rowBase = {
  width: '100%',
  margin: 0,
  textAlign: 'left' as const,
  cursor: 'pointer',
  color: poster.cream,
  fontFamily: fonts.ui,
  borderRadius: 8,
};

/** Before the first fight: the one stop that opens all three routes. */
function StartRow({ node, onPress }: { node: StoryNode; onPress: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onPress}
      aria-label={`Start at ${node.name ?? 'the Battery'}: show it on the map`}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.99 }}
      transition={spring.snappy}
      style={{
        ...rowBase,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: 'rgba(212, 57, 44, 0.16)',
        border: `1.5px solid ${poster.red}`,
      }}
    >
      <StopGlyph kind="battle" color={poster.red} size={22} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontFamily: fonts.display, fontSize: 14, letterSpacing: '0.02em', textTransform: 'uppercase', lineHeight: 1.1 }}>
          Start · {node.name}
        </span>
        <span style={{ ...text.body, fontSize: 11.5, color: poster.creamDim, lineHeight: 1.3 }}>
          Win here to open all three routes.
        </span>
      </span>
    </motion.button>
  );
}

function RouteRow({ run, route, dim, onPress }: {
  run: StoryRun;
  route: RouteProgress;
  dim: boolean;
  onPress: () => void;
}) {
  const bossName = route.boss.enemy ? CARDS_BY_ID[route.boss.enemy]?.name : undefined;
  const line = !route.next
    ? 'Cleared'
    : route.next.id === route.boss.id
      ? `Boss · ${route.boss.name}`
      : `Next · ${route.next.name} — ${KIND_LABEL[effectiveKind(run, route.next)]}`;
  return (
    <motion.button
      type="button"
      onClick={onPress}
      aria-label={`${route.name}: ${route.cleared} of ${route.stops.length} stops cleared. ${line}. Show it on the map`}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.99 }}
      transition={spring.snappy}
      style={{
        ...rowBase,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 10,
        padding: '9px 9px 9px 11px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: `1px solid ${poster.edge}`,
        opacity: dim ? 0.5 : 1,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span
          style={{
            fontFamily: fonts.display,
            fontSize: 14,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {route.name}
        </span>
        <Pips run={run} route={route} />
        <span
          style={{
            ...text.body,
            fontSize: 11.5,
            lineHeight: 1.25,
            color: route.next ? poster.creamDim : poster.gold,
          }}
        >
          {line}
        </span>
      </span>
      <BossBadge hero={route.boss.enemy} down={route.bossDown} name={bossName} />
    </motion.button>
  );
}

/** One pip per stop: gold when cleared, a red ring on the stop that is open
 *  now, faint when still ahead. The boss is the diamond at the end. */
function Pips({ run, route }: { run: StoryRun; route: RouteProgress }) {
  return (
    <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {route.stops.map((n) => {
        const cleared = run.clearedNodeIds.includes(n.id);
        const now = route.open && route.next?.id === n.id;
        const boss = n.id === route.boss.id;
        return (
          <span
            key={n.id}
            style={{
              width: 8,
              height: 8,
              boxSizing: 'border-box',
              borderRadius: boss ? 1 : '50%',
              transform: boss ? 'rotate(45deg) scale(1.05)' : undefined,
              marginLeft: boss ? 2 : 0,
              background: cleared ? poster.gold : now ? 'transparent' : poster.creamFaint,
              border: now ? `2px solid ${poster.red}` : undefined,
              boxShadow: now ? `0 0 0 2px rgba(212, 57, 44, 0.25)` : undefined,
            }}
          />
        );
      })}
    </span>
  );
}

function BossBadge({ hero, down, name, size = 34 }: { hero?: CardId; down: boolean; name?: string; size?: number }) {
  return (
    <span
      title={name ? `Boss: ${name}` : undefined}
      style={{ position: 'relative', display: 'block', borderRadius: 8, border: `2px solid ${poster.red}`, flexShrink: 0 }}
    >
      {hero ? <HeroBadge cardId={hero} size={size} /> : <span style={{ display: 'block', width: size, height: size }} />}
      {down && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: poster.gold,
            border: `1.5px solid ${poster.panel}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <StopGlyph kind="cleared" color={poster.ink} size={13} />
        </span>
      )}
    </span>
  );
}

const confirmButton = { flex: 1, padding: '12px 6px', fontSize: 12, letterSpacing: '0.14em', whiteSpace: 'nowrap' as const };

/** A quiet way out, behind one confirm: a run is a lot to lose to a slip. */
function AbandonFooter({ onAbandon }: { onAbandon: () => void }) {
  const [asking, setAsking] = useState(false);
  const keep = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Land on the safe answer, so a stray Enter keeps the run.
    if (asking) keep.current?.querySelector('button')?.focus();
  }, [asking]);
  return (
    <div style={{ flexShrink: 0, padding: '10px 16px 12px', borderTop: `1px solid ${poster.edge}` }}>
      {asking ? (
        <div role="group" aria-label="Abandon this run?" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ ...text.body, margin: 0, fontSize: 12.5, color: poster.cream, lineHeight: 1.4 }}>
            Abandon this run? Your roster and deck are lost.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <PosterButton variant="red" size="sm" onClick={onAbandon} ariaLabel="Abandon this run" style={confirmButton}>
              Abandon
            </PosterButton>
            <div ref={keep} style={{ flex: 1, display: 'flex' }}>
              <PosterButton variant="ghost" size="sm" onClick={() => setAsking(false)} ariaLabel="Keep going" style={confirmButton}>
                Keep going
              </PosterButton>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          style={{
            ...text.label,
            fontSize: 10.5,
            letterSpacing: '0.16em',
            color: poster.creamDim,
            background: 'transparent',
            border: 'none',
            padding: '8px 0',
            minHeight: 40,
            cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationColor: poster.creamFaint,
            textUnderlineOffset: 4,
          }}
        >
          Abandon run
        </button>
      )}
    </div>
  );
}

// ---- phone -------------------------------------------------------------------

/** The phone's folded panel: roster, deck, bosses, and the way to open it. */
function CompactBar({ run, onOpen }: { run: StoryRun; onOpen: () => void }) {
  const bosses = routeProgress(run);
  const down = bosses.filter((r) => r.bossDown).length;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      aria-label={`Story run: ${run.heroes.length} of 4 heroes, ${run.deck.length} cards, ${down} of ${bosses.length} bosses. Open the run`}
      whileTap={{ scale: 0.99 }}
      transition={spring.snappy}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 12px',
        margin: 0,
        background: poster.panel,
        border: `1px solid ${poster.edge}`,
        borderRadius: 12,
        boxShadow: tileShadow,
        color: poster.cream,
        fontFamily: fonts.ui,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2, 3].map((i) => {
          const id = run.heroes[i];
          return id ? (
            <span key={id} style={{ display: 'block', borderRadius: 7, border: `2px solid ${poster.you}` }}>
              <HeroBadge cardId={id} size={26} />
            </span>
          ) : (
            <span
              key={`empty-${i}`}
              style={{ width: 30, height: 30, boxSizing: 'border-box', borderRadius: 7, border: `1.5px dashed ${poster.creamFaint}` }}
            />
          );
        })}
      </span>
      <BarStat label="Deck" value={String(run.deck.length)} />
      <BarStat label="Bosses" value={`${down}/${bosses.length}`} />
      <span style={{ ...text.label, marginLeft: 'auto', fontSize: 11, letterSpacing: '0.16em', color: poster.cream, whiteSpace: 'nowrap' }}>
        Run ▴
      </span>
    </motion.button>
  );
}

function BarStat({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span style={{ fontFamily: fonts.display, fontSize: 16, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ ...eyebrow, fontSize: 8.5, letterSpacing: '0.16em', color: poster.creamDim, lineHeight: 1 }}>{label}</span>
    </span>
  );
}

/** The phone's run sheet: the full panel, risen from the bottom edge. */
function RunSheet({ run, onClose, children }: { run: StoryRun; onClose: () => void; children: ReactNode }) {
  const routes = routeProgress(run);
  // Take focus from the bar that opened it, so keys act on the sheet.
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => { sheet.current?.focus({ preventScroll: true }); }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{ ...scrimStyle, zIndex: Z.runSheet, alignItems: 'flex-end' }}
    >
      <motion.section
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Story run"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.2, ease: 'easeIn' } }}
        transition={spring.soft}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          background: poster.panel,
          borderTop: `1px solid ${poster.edge}`,
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -20px 50px rgba(0, 0, 0, 0.5)',
          color: poster.cream,
          fontFamily: fonts.ui,
          paddingBottom: 'env(safe-area-inset-bottom)',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        <span aria-hidden style={{ width: 36, height: 4, borderRadius: 2, background: poster.edge, position: 'absolute', left: '50%', top: 7, marginLeft: -18 }} />
        <div style={{ flexShrink: 0, padding: '10px 4px 2px 16px', borderBottom: `1px solid ${poster.edge}` }}>
          <PanelHead bossesDown={routes.filter((r) => r.bossDown).length} bosses={routes.length}>
            <CloseX onClose={onClose} label="Close the run sheet" color={poster.cream} />
          </PanelHead>
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}

function CloseX({ onClose, label, color }: { onClose: () => void; label: string; color: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      style={{
        width: 44,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        border: 'none',
        background: 'transparent',
        color,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// ---- the deck ----------------------------------------------------------------

const TYPE_ORDER: Record<string, number> = { spell: 0, equipment: 1, ultimate: 2, hero: 3 };

/** The run's deck as the cards themselves: one print per card, a count on
 *  the copies, spells before items, cheapest first. */
function deckRows(deck: CardId[]): { id: CardId; n: number }[] {
  const counts = new Map<CardId, number>();
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  const cost = (id: CardId) => {
    const d = CARDS_BY_ID[id];
    return d && 'cost' in d ? d.cost ?? 0 : 0;
  };
  return [...counts.entries()]
    .map(([id, n]) => ({ id, n }))
    .sort((a, b) => {
      const da = CARDS_BY_ID[a.id], db = CARDS_BY_ID[b.id];
      return (TYPE_ORDER[da?.type ?? ''] ?? 9) - (TYPE_ORDER[db?.type ?? ''] ?? 9)
        || cost(a.id) - cost(b.id)
        || (da?.name ?? a.id).localeCompare(db?.name ?? b.id);
    });
}

function DeckSheet({ deck, onPreview, onClose }: {
  deck: CardId[];
  onPreview: (id: CardId) => void;
  onClose: () => void;
}) {
  const { isMobile, width } = useViewport();
  const rows = deckRows(deck);
  // Desktop: as many hand prints as fit, up to five, and the sheet sized to
  // them. Phones fit three across, the print scaled to the sheet's width.
  const gap = isMobile ? 10 : 14;
  const pad = isMobile ? 14 : 28;
  const room = width - (isMobile ? 24 : 64) - pad * 2;
  const cols = isMobile ? 3 : Math.max(1, Math.min(5, Math.floor((room + gap) / (134 + gap))));
  const scale = isMobile ? Math.min(1, (room - gap * (cols - 1)) / cols / 134) : 1;
  const sheetW = isMobile ? undefined : cols * 134 + (cols - 1) * gap + pad * 2;
  const close = useRef<HTMLDivElement>(null);
  useEffect(() => { close.current?.querySelector('button')?.focus(); }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        ...scrimStyle,
        zIndex: Z.deck,
        alignItems: 'flex-start',
        overflowY: 'auto',
        padding: isMobile ? '64px 12px 16px' : '56px 32px 32px',
      }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label={`Your deck, ${deck.length} cards`}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0, transition: { duration: 0.15 } }}
        transition={spring.soft}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...sheetStyle,
          margin: '0 auto',
          width: sheetW ?? '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          borderRadius: isMobile ? 14 : 18,
          padding: `${isMobile ? 16 : 24}px ${pad}px ${isMobile ? 18 : 28}px`,
          color: poster.ink,
          fontFamily: fonts.ui,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            paddingBottom: 12,
            marginBottom: 16,
            borderBottom: `1.5px solid ${poster.ink}`,
          }}
        >
          <h2 style={{ margin: 0, fontFamily: fonts.display, fontWeight: 400, fontSize: isMobile ? 22 : 28, letterSpacing: '0.02em', textTransform: 'uppercase', lineHeight: 1 }}>
            Your deck
          </h2>
          <span style={{ ...eyebrow, color: poster.inkDim, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {deck.length} cards
          </span>
          <div ref={close} style={{ marginLeft: 'auto' }}>
            <PosterButton variant="paper" size="sm" onClick={onClose} ariaLabel="Close your deck" style={{ minHeight: 40 }}>
              Close
            </PosterButton>
          </div>
        </header>

        <p style={{ ...text.body, margin: '0 0 16px', color: poster.inkSoft }}>
          Every card you will draw from in the next fight. Supply stops add one more.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${134 * scale}px)`,
            justifyContent: isMobile ? 'space-between' : 'start',
            gap: `${gap + 6}px ${gap}px`,
          }}
        >
          {rows.map(({ id, n }, i) => (
            <motion.button
              key={id}
              type="button"
              onClick={() => onPreview(id)}
              aria-label={`${CARDS_BY_ID[id]?.name ?? id}${n > 1 ? `, ${n} copies` : ''}: show card`}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ ...spring.default, delay: Math.min(i, 12) * 0.03 }}
              style={{
                position: 'relative',
                width: 134 * scale,
                height: 188 * scale,
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'block', width: 134, height: 188, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: '0 0' }}>
                <CardFrame cardId={id} size="hand" />
              </span>
              {n > 1 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -7,
                    right: -7,
                    padding: '5px 7px 5px',
                    background: poster.ink,
                    color: poster.paper,
                    fontFamily: fonts.display,
                    fontSize: 12,
                    letterSpacing: '0.06em',
                    lineHeight: 1,
                    ...clipBoth(chamfer(4)),
                  }}
                >
                  ×{n}
                </span>
              )}
            </motion.button>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}
