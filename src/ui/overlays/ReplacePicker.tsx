/**
 * A card played onto a full hero (Patrick, 2026-11-09: "when I click equip it
 * should ask me which equipment to discard"). The play goes ahead: this sheet
 * lists the items the hero wears — its art and its text — beside the new one,
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
import { CardFrame } from '../card/CardFrame';
import { PosterButton } from '../chrome';
import { fonts, spring } from '../tokens';
import { poster, scrimStyle, sheetStyle } from '../poster';
import { useViewport } from '../hooks/useViewport';
import { UpgradePicker } from './UpgradePicker';

/** The sheet's accessible name, by which the tutorial and the QA scripts find it. */
export const REPLACE_SHEET = 'Choose the item to discard';

/** The hand card's natural size (CardFrame 'hand'). */
const CARD_W = 134;
const CARD_H = 188;

function Card({ cardId, scale, glow }: { cardId: CardId; scale: number; glow?: 'danger' | 'accent' | null }) {
  return (
    <div style={{ width: CARD_W * scale, height: CARD_H * scale }}>
      <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CardFrame cardId={cardId} size="hand" glow={glow ?? null} tapExplains={false} />
      </div>
    </div>
  );
}

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
  const scale = isMobile ? 0.7 : 0.9;
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
          padding: isMobile ? '16px 12px' : '24px 28px',
          borderRadius: isMobile ? 16 : 18,
          maxWidth: 860,
          color: poster.ink,
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: fonts.display, fontSize: isMobile ? 18 : 22, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>
            {heroName} wears {worn.length} items
          </span>
          <span style={{ fontFamily: fonts.display, fontSize: isMobile ? 11.5 : 13, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1.2 }}>
            Discard one to put on {cardName(itemId)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: isMobile ? 10 : 18 }}>
          {/* The new card, then what it takes the place of. */}
          <div role="group" aria-label={`New: ${cardName(itemId)}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: fonts.display, fontSize: 10.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: poster.inkDim }}>New</span>
            <Card cardId={itemId} scale={scale} glow="accent" />
          </div>
          <span aria-hidden style={{ fontFamily: fonts.display, fontSize: isMobile ? 18 : 26, color: poster.inkDim, transform: isMobile ? 'rotate(90deg)' : undefined }}>⇄</span>
          <div role="group" aria-label={`What ${heroName} wears`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: fonts.display, fontSize: 10.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: poster.inkDim }}>Worn — tap the one to discard</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: isMobile ? 6 : 12 }}>
              {worn.map((it) => {
                const on = it.iid === marked;
                return (
                  <motion.button
                    key={it.iid}
                    type="button"
                    aria-label={`${cardName(it.cardId)}${on ? ', marked to discard' : ''}`}
                    aria-pressed={on}
                    onClick={() => setMarked(on ? null : it.iid)}
                    whileTap={{ scale: 0.96 }}
                    animate={{ y: on ? -8 : 0, opacity: on ? 0.8 : 1 }}
                    transition={spring.snappy}
                    style={{ position: 'relative', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 0 }}
                  >
                    <Card cardId={it.cardId} scale={scale} glow={on ? 'danger' : null} />
                    {on && (
                      <span aria-hidden style={{
                        position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                        background: poster.red, color: poster.paper, fontSize: 12, lineHeight: '20px', textAlign: 'center',
                        fontFamily: fonts.display, boxShadow: `0 0 0 2px ${poster.paper}`,
                      }}>✕</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
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
