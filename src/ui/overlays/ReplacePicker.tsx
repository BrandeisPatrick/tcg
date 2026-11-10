/**
 * A card played onto a full hero (Patrick, 2026-11-09: "when I click equip it
 * should ask me which equipment to discard"). The play goes ahead: this sheet
 * lists the items the hero wears — art, name and the whole rule, a line each
 * (a miniature card cut the rule off mid-sentence) — under the new one,
 * and asks which goes to the discard pile. Tap one to mark it (again to
 * unmark); the button discards it and puts the new card on, for the card's
 * price (`playCard` with `replaceIid`). Cancel backs out with nothing paid:
 * the card stays in the hand. A riding Rem is no item, so she is not offered
 * (`wornItems`). In the style of DiscardOverlay and UpgradePicker.
 *
 * `useReplacePick` is the board's one hook into it: `open` is asked on a tap
 * that the engine refuses as `full` and opens the sheet when a swap would be
 * taken (`replaceNeeded`, `playBlockedAny`); `element` is the sheet — and,
 * after a pick, the upgrade picker when the card could make several upgrades
 * — to render with the board's other overlays.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CardId, CardInstance, GameState, PlayerID } from '@/engine/types';
import { cardName } from '@/cards';
import { upgradesOf } from '@/cards/decks';
import { findCardOnBoard, handCard, wornItems } from '@/engine/query';
import { playBlockedAny, replaceNeeded } from '@/engine/legality';
import type { Action } from '@/engine/engine';
import { ItemLine } from './ItemLine';
import { PosterButton } from '../chrome';
import { fonts, spring } from '../tokens';
import { poster, scrimStyle, sheetStyle } from '../poster';
import { useViewport } from '../hooks/useViewport';
import { UpgradePicker } from './UpgradePicker';
import { scale as T, bandStyle } from '../hud';

/** The sheet's accessible name, by which the tutorial and the QA scripts find it. */
export const REPLACE_SHEET = 'Choose the item to discard';

export function ReplacePicker({ hero, itemId, worn, onPick, onCancel }: {
  /** The full hero the card goes on. */
  hero: CardInstance;
  /** The card being played. */
  itemId: CardId;
  /** What the hero wears: the items it may let go. */
  worn: CardInstance[];
  onPick: (replaceIid: string) => void;
  onCancel: () => void;
}) {
  const { isMobile } = useViewport();
  const [marked, setMarked] = useState<string | null>(null);
  const heroName = cardName(hero.cardId);
  const going = worn.find((it) => it.iid === marked);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onCancel}
      style={{ ...scrimStyle, zIndex: 100, padding: isMobile ? 12 : 32, overflowY: 'auto' }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={spring.snappy}
        role="dialog"
        aria-label={REPLACE_SHEET}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...sheetStyle,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 12 : 18,
          padding: isMobile ? '0 12px 16px' : '0 28px 24px',
          borderRadius: isMobile ? 14 : 16,
          overflow: 'hidden',
          width: 'min(100%, 460px)',
          boxSizing: 'border-box',
          color: poster.ink,
        }}
      >
        {/* The header band in your amber: whose items, and the one ask. */}
        <div style={{
          ...bandStyle(poster.you),
          alignSelf: 'stretch', margin: isMobile ? '0 -12px' : '0 -28px',
          padding: isMobile ? '14px 12px 12px' : '18px 28px 14px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, textAlign: 'center',
        }}>
          <span style={{ fontSize: T.title, letterSpacing: '0.06em', lineHeight: 1 }}>
            {heroName} wears {worn.length} items
          </span>
          <span style={{ fontSize: isMobile ? T.label : T.body, letterSpacing: '0.14em', lineHeight: 1.2, opacity: 0.85 }}>
            Discard one to put on {cardName(itemId)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10, width: '100%' }}>
          {/* The new card, then what it takes the place of. */}
          <div role="group" aria-label={`New: ${cardName(itemId)}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: fonts.display, fontSize: T.label, letterSpacing: '0.16em', textTransform: 'uppercase', color: poster.inkDim, textAlign: 'center' }}>New</span>
            <ItemLine cardId={itemId} tone="new" />
          </div>
          <div role="group" aria-label={`What ${heroName} wears`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontFamily: fonts.display, fontSize: T.label, letterSpacing: '0.16em', textTransform: 'uppercase', color: poster.inkDim, textAlign: 'center', marginTop: 4 }}>Worn — tap the one to discard</span>
            {worn.map((it) => {
              const on = it.iid === marked;
              return (
                <motion.button
                  key={it.iid}
                  type="button"
                  aria-label={`${cardName(it.cardId)}${on ? ', marked to discard' : ''}`}
                  aria-pressed={on}
                  onClick={() => setMarked(on ? null : it.iid)}
                  whileTap={{ scale: 0.98 }}
                  animate={{ opacity: on ? 0.82 : 1 }}
                  transition={spring.snappy}
                  style={{ position: 'relative', display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
                >
                  <ItemLine cardId={it.cardId} tone={on ? 'going' : null} />
                  {on && (
                    <span aria-hidden style={{
                      position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                      background: poster.red, color: poster.paper, fontSize: T.label, lineHeight: '20px', textAlign: 'center',
                      fontFamily: fonts.display, boxShadow: `0 0 0 2px ${poster.paper}`,
                    }}>✕</span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <PosterButton variant="ink" size="sm" onClick={onCancel}>Cancel</PosterButton>
          <PosterButton variant="red" size="sm" disabled={!going} onClick={() => going && onPick(going.iid)}>
            {going ? `Discard ${cardName(going.cardId)}` : 'Mark one to discard'}
          </PosterButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** A play waiting on the sheet: the card, the hero, and once an item is
 *  picked, that item — then the upgrade, when the card could make several. */
interface Pending {
  cardIid: string;
  heroIid: string;
  replaceIid?: string;
}

/**
 * The board's hook into the sheet. `open(cardIid, heroIid)` opens it when the
 * card goes on that hero only in place of a worn item and the engine would
 * take the swap (souls and all), and says whether it did; `element` renders
 * the sheet (and the upgrade picker after it, when the card could make
 * several upgrades); `active` is true while either is up. The play is made
 * through `play` (the board's dispatch: its own refusal check, then
 * `moves.playCard(card, hero, upgrade?, replace)`). Escape and Cancel back
 * out with nothing paid.
 */
export function useReplacePick(G: GameState, me: PlayerID, play: (a: Extract<Action, { type: 'playCard' }>) => void): {
  open: (cardIid: string, heroIid: string) => boolean;
  element: ReactNode;
  active: boolean;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const latest = useRef({ G, me, play });
  latest.current = { G, me, play };

  const open = useCallback((cardIid: string, heroIid: string): boolean => {
    const { G: g, me: pid } = latest.current;
    const card = handCard(g, pid, cardIid);
    const hero = findCardOnBoard(g, heroIid);
    if (!card || !hero || hero.owner !== pid) return false;
    if (!replaceNeeded(g, pid, hero.card, card.cardId) || playBlockedAny(g, pid, cardIid, heroIid) !== null) return false;
    setPending({ cardIid, heroIid });
    return true;
  }, []);

  const finish = (p: Pending, upgradeId?: CardId) => {
    setPending(null);
    latest.current.play({
      type: 'playCard', cardIid: p.cardIid, heroIid: p.heroIid,
      ...(upgradeId === undefined ? {} : { upgradeId }),
      ...(p.replaceIid === undefined ? {} : { replaceIid: p.replaceIid }),
    });
  };

  // What the sheet shows, read off the board now; a card or hero gone (or a
  // hero no longer full) closes it.
  const card = pending ? handCard(G, me, pending.cardIid) : undefined;
  const found = pending ? findCardOnBoard(G, pending.heroIid) : null;
  const hero = found && found.owner === me ? found.card : undefined;
  const live = !!pending && !!card && !!hero && replaceNeeded(G, me, hero, card.cardId);
  useEffect(() => {
    if (pending && !live) setPending(null);
  }, [pending, live]);

  // Escape backs out, before the key reaches the board or the pause menu.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setPending(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [pending]);

  const options = card ? upgradesOf(card.cardId) : [];
  const element = (
    <AnimatePresence>
      {live && pending && card && hero && pending.replaceIid === undefined && (
        <ReplacePicker
          key="replace"
          hero={hero}
          itemId={card.cardId}
          worn={wornItems(hero)}
          onPick={(replaceIid) => {
            const next = { ...pending, replaceIid };
            if (options.length > 1) setPending(next);
            else finish(next);
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {live && pending && card && pending.replaceIid !== undefined && (
        <UpgradePicker
          key="replace-upgrade"
          itemId={card.cardId}
          options={options}
          onPick={(upgradeId) => finish(pending, upgradeId)}
          onCancel={() => setPending(null)}
        />
      )}
    </AnimatePresence>
  );
  return { open, element, active: !!pending };
}
