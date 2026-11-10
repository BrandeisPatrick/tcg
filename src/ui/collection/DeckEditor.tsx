/**
 * The deck builder — the Loadout screen's deck (docs/deck-plan.md), laid out
 * like the shop it replaced: the deck on top, then the Weapon · Vitality ·
 * Spirit tabs and the catalogue in tier rows, item icons only.
 *
 *   deck       its items as tiles, a copy count on each, and how many of
 *              DECK_SIZE it holds. Tap a tile to take one copy out. It stays
 *              in view while the catalogue scrolls under it
 *   catalogue  every item by tab, in the shop's tier rows. Tap a tile to put a
 *              copy in (MAX_COPIES of one at most, DECK_SIZE in all); a tap
 *              that cannot add one shakes the tile and says why. A tile the
 *              deck holds carries its count. An upgrade is greyed: it never
 *              starts in a deck, it comes from playing its component (its
 *              name and tooltip say which)
 *
 * A long-press (a right-click, a mouse rest) on any tile opens its tooltip; a
 * second tap opens the full card. Every change is saved at once. A deck short
 * of DECK_SIZE (or none) is not played: a match deals one from the drafted
 * heroes' builds instead. "From builds" fills the deck the way a match would
 * from the squad's builds; "Clear" empties it.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import type { CardId, ItemSlot } from '@/engine/types';
import { ITEMS, cardName, itemCard } from '@/cards';
import { catalogueByTab, copyCounts, deckFromBuilds, isBaseItem } from '@/cards/decks';
import { DECK_SIZE, MAX_COPIES } from '@/engine/constants';
import { getBuild, getDeck, saveDeck } from '@/storage/playerData';
import { ShopTile } from '../shop/ShopTile';
import { ItemTooltip } from '../shop/ItemTooltip';
import { TierRows } from '../shop/TierRows';
import { nextTip, type TipRequest } from '../shop/tips';
import { CATEGORY_WORD, SHOP_TABS } from '../shop/itemFacts';
import { CardPreview } from '../overlays/CardPreview';
import { PosterButton } from '../chrome';
import { fonts, spring, text } from '../tokens';
import { poster, shopInk } from '../poster';
import { useViewport } from '../hooks/useViewport';

/** Every item by tab and tier, in catalogue order. */
const CATALOGUE = catalogueByTab();
/** Catalogue order, for laying the deck's tiles out. */
const ORDER: Record<CardId, number> = Object.fromEntries(ITEMS.map((i, k) => [i.id, k]));

/** The deck builder's sheet name, by which the tutorial and the QA scripts find it. */
export const DECK_EDITOR = 'Deck builder';

/** Where an upgrade comes from: "Comes from playing Extra Spirit" (its
 *  component, `upgradesFrom`), or null for a base item, which a deck may hold. */
export function upgradeSource(id: CardId): string | null {
  if (isBaseItem(id)) return null;
  const from = itemCard(id)?.upgradesFrom;
  return from ? `Comes from playing ${cardName(from)}` : null;
}

/** A catalogue tile's accessible name: what a tap on it does. */
export function addLabel(id: CardId, copies: number, size: number): string {
  const name = cardName(id);
  const source = upgradeSource(id);
  if (source) return `${name}: an upgrade, not in a deck. ${source}`;
  if (copies >= MAX_COPIES) return `${name}: ${MAX_COPIES} in the deck, the most it may hold`;
  if (size >= DECK_SIZE) return `${name}: the deck is full`;
  return `Add ${name} to the deck${copies > 0 ? ` (${copies} in it)` : ''}`;
}

/** Why a copy of `id` cannot go in, or null when it can. */
function addRefusal(id: CardId, copies: number, size: number): string | null {
  const source = upgradeSource(id);
  if (source) return source;
  if (copies >= MAX_COPIES) return `At most ${MAX_COPIES} copies of one item`;
  if (size >= DECK_SIZE) return `A deck holds ${DECK_SIZE} items`;
  return null;
}

export function DeckEditor({ squad }: {
  /** The squad's heroes in pick order: "From builds" reads their builds. */
  squad: CardId[];
}) {
  const { isMobile, width } = useViewport();
  const [deck, setDeck] = useState<CardId[]>(() => getDeck());
  const [tab, setTab] = useState<ItemSlot>('weapon');
  const [tip, setTip] = useState<TipRequest | null>(null);
  const [card, setCard] = useState<CardId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endingPress = useRef(false);

  const counts = useMemo(() => copyCounts(deck), [deck]);
  const distinct = useMemo(() => Object.keys(counts).sort((a, b) => (ORDER[a] ?? 0) - (ORDER[b] ?? 0)), [counts]);
  const full = deck.length >= DECK_SIZE;

  const say = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2000);
  };
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const commit = (next: CardId[]) => {
    saveDeck(next);
    setDeck(getDeck());
    setTip((t) => (t?.passive ? null : t));
  };

  /** A catalogue tap: one more copy in, or false (the tile shakes). */
  const add = (id: CardId): boolean => {
    const no = addRefusal(id, counts[id] ?? 0, deck.length);
    if (no) { say(no); return false; }
    commit([...deck, id]);
    return true;
  };
  /** A deck tap: one copy out. */
  const remove = (id: CardId) => {
    const at = deck.lastIndexOf(id);
    if (at < 0) return;
    commit(deck.filter((_, k) => k !== at));
  };
  const fromBuilds = () => {
    if (squad.length === 0) { say('Pick your squad first: its builds make the deck'); return; }
    commit(deckFromBuilds(squad.map((h) => getBuild(h))));
  };
  const clear = () => commit([]);

  const openTip = (req: TipRequest) => {
    if (!req.passive) endingPress.current = true;
    setTip((t) => nextTip(t, req));
  };
  const peek = (id: CardId, rect: DOMRect | null, source: TipRequest['source']) =>
    setTip((t) => nextTip(t, rect ? { itemId: id, anchor: rect, source, passive: true } : null));

  // The click that ends a long press is no tap (see BuildEditor).
  useEffect(() => {
    const reset = () => { endingPress.current = false; };
    const onClick = (e: MouseEvent) => {
      if (!endingPress.current) return;
      endingPress.current = false;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('pointerdown', reset, true);
    window.addEventListener('keydown', reset, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerdown', reset, true);
      window.removeEventListener('keydown', reset, true);
      window.removeEventListener('click', onClick, true);
    };
  }, []);
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [tip]);
  useEffect(() => {
    if (!card && !tip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (card) setCard(null);
      else setTip(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [card, tip]);

  const panel = useRef<HTMLDivElement>(null);
  const tabScroll = useRef(false);
  const switchTab = (slot: ItemSlot) => {
    if (slot === tab) return;
    tabScroll.current = true;
    setTab(slot);
    setTip(null);
  };
  useLayoutEffect(() => {
    if (!tabScroll.current) return;
    tabScroll.current = false;
    const top = panel.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) window.scrollTo(0, window.scrollY + top);
  }, [tab]);

  // The catalogue's handlers are stable, reading the latest state through a ref.
  const latest = useRef({ add, openTip, peek });
  latest.current = { add, openTip, peek };
  const onAdd = useCallback((id: CardId) => latest.current.add(id), []);
  const onLong = useCallback((id: CardId, rect: DOMRect) => latest.current.openTip({ itemId: id, anchor: rect, source: 'catalogue' }), []);
  const onPeek = useCallback((id: CardId, rect: DOMRect | null) => latest.current.peek(id, rect, 'catalogue'), []);

  const narrow = width < 360;
  const tile = isMobile ? 40 : 44;
  const status = deck.length === 0
    ? `No deck saved: each match deals one from your drafted heroes' builds.`
    : full
      ? `${DECK_SIZE} items: your deck. Your four drafted heroes are shuffled in.`
      : `${deck.length} of ${DECK_SIZE}: until it is full, a match deals a deck from your heroes' builds.`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 14 }}>
      <div
        ref={panel}
        role="region"
        aria-label={DECK_EDITOR}
        style={{
          position: 'relative',
          background: poster.frame,
          border: `1.5px solid ${poster.ink}`,
          borderRadius: 12,
          boxShadow: '0 12px 26px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.22)',
          color: poster.cream,
        }}
      >
        {/* The deck and the tabs, held at the top while the catalogue scrolls. */}
        <div style={{
          position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 3,
          background: poster.frame, borderRadius: '11px 11px 0 0',
          boxShadow: '0 10px 14px -12px rgba(0, 0, 0, 0.9)',
        }}>
          <div style={{ padding: isMobile ? '10px 10px 14px' : '14px 14px 18px', borderBottom: `1px solid ${poster.edge}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32, flexWrap: 'wrap' }}>
              <h3 style={{
                margin: 0, fontFamily: fonts.display, fontWeight: 400, fontSize: isMobile ? 20 : 24,
                letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1, color: poster.cream,
              }}>Deck</h3>
              <span aria-label={`${deck.length} of ${DECK_SIZE} items`} style={{
                fontFamily: fonts.display, fontSize: 16, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                color: full ? poster.gold : poster.creamDim,
              }}>{deck.length}/{DECK_SIZE}</span>
              <span style={{ flex: 1 }} />
              <PosterButton variant="paper" size="sm" onClick={fromBuilds} ariaLabel="Fill the deck from the squad's builds">From builds</PosterButton>
              <PosterButton variant="ink" size="sm" onClick={clear} disabled={deck.length === 0} ariaLabel="Clear the deck">Clear</PosterButton>
            </div>
            <p style={{ ...text.body, margin: '8px 0 10px', fontSize: 12.5, color: poster.creamDim }}>{status}</p>
            <div role="group" aria-label="The deck" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, minHeight: tile + 6 }}>
              <AnimatePresence initial={false}>
                {distinct.map((id) => (
                  <motion.span
                    key={id}
                    layout
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.12 } }}
                    transition={spring.snappy}
                    style={{ display: 'inline-block', lineHeight: 0, paddingBottom: 6 }}
                  >
                    <ShopTile
                      itemId={id}
                      size={tile}
                      label={`${cardName(id)}, ${counts[id]} in the deck: take one out`}
                      marks={{ copies: counts[id] }}
                      onTap={() => remove(id)}
                      onLong={(rect) => openTip({ itemId: id, anchor: rect, source: 'deck' })}
                      onHover={(rect) => peek(id, rect, 'deck')}
                    />
                  </motion.span>
                ))}
              </AnimatePresence>
              {deck.length === 0 && (
                <span style={{ ...text.label, fontSize: 10, letterSpacing: '0.16em', color: poster.creamFaint, alignSelf: 'center' }}>
                  Tap an item below to add it
                </span>
              )}
            </div>
          </div>

          <div role="tablist" aria-label="Item categories" style={{ display: 'flex', borderBottom: `1px solid ${poster.edge}` }}>
            {SHOP_TABS.map((slot) => {
              const on = slot === tab;
              const { ink, wash } = shopInk(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  role="tab"
                  id={`deck-tab-${slot}`}
                  aria-selected={on}
                  aria-controls="deck-catalogue"
                  onClick={() => switchTab(slot)}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: isMobile ? '12px 4px 10px' : '13px 6px 11px',
                    border: 'none', borderBottom: `3px solid ${on ? ink : 'transparent'}`, marginBottom: -1,
                    background: on ? wash : 'transparent', color: on ? poster.cream : poster.creamDim,
                    fontFamily: fonts.display, fontSize: narrow ? 12.5 : isMobile ? 14 : 15,
                    letterSpacing: narrow ? '0.06em' : '0.12em', textTransform: 'uppercase', lineHeight: 1, cursor: 'pointer',
                  }}
                >
                  {!narrow && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: ink, opacity: on ? 1 : 0.55, flexShrink: 0 }} />}
                  {CATEGORY_WORD[slot]}
                </button>
              );
            })}
          </div>
        </div>

        <div id="deck-catalogue" role="tabpanel" aria-labelledby={`deck-tab-${tab}`} style={{ padding: isMobile ? '12px 10px 14px' : '16px 14px 18px' }}>
          <Catalogue tab={tab} size={tile} counts={counts} size2={deck.length} onAdd={onAdd} onLong={onLong} onPeek={onPeek} />
        </div>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice}
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 24, display: 'flex', justifyContent: 'center',
              pointerEvents: 'none', zIndex: 95,
            }}
          >
            <span style={{
              padding: '8px 16px', background: poster.red, color: poster.paper, borderRadius: 3,
              fontFamily: fonts.display, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>{notice}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {tip && (
          <ItemTooltip
            key={`${tip.itemId}-${tip.source}-${tip.passive ? 'peek' : 'held'}`}
            itemId={tip.itemId}
            anchor={tip.anchor}
            passive={tip.passive}
            note={upgradeSource(tip.itemId) ?? `${counts[tip.itemId] ?? 0} of ${MAX_COPIES} in the deck`}
            onClose={() => setTip(null)}
            onOpenCard={() => { setCard(tip.itemId); setTip(null); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {card && <CardPreview key={card} cardId={card} onClose={() => setCard(null)} />}
      </AnimatePresence>
    </div>
  );
}

/** One tab of the catalogue in the shop's tier rows. Memoised: a tooltip's
 *  peek leaves it alone. */
const Catalogue = memo(function Catalogue({ tab, size, counts, size2, onAdd, onLong, onPeek }: {
  tab: ItemSlot;
  size: number;
  counts: Record<CardId, number>;
  /** How many items the deck holds. */
  size2: number;
  onAdd: (id: CardId) => boolean;
  onLong: (id: CardId, rect: DOMRect) => void;
  onPeek: (id: CardId, rect: DOMRect | null) => void;
}) {
  return (
    <TierRows
      slot={tab}
      byTier={CATALOGUE[tab]}
      gap={10}
      renderTile={(id) => (
        <CatalogueTile
          key={id}
          itemId={id}
          size={size}
          copies={counts[id] ?? 0}
          label={addLabel(id, counts[id] ?? 0, size2)}
          onAdd={onAdd}
          onLong={onLong}
          onPeek={onPeek}
        />
      )}
    />
  );
});

/** One catalogue tile; a tap that cannot add a copy shakes it. */
const CatalogueTile = memo(function CatalogueTile({ itemId, size, copies, label, onAdd, onLong, onPeek }: {
  itemId: CardId;
  size: number;
  copies: number;
  label: string;
  onAdd: (id: CardId) => boolean;
  onLong: (id: CardId, rect: DOMRect) => void;
  onPeek: (id: CardId, rect: DOMRect | null) => void;
}) {
  const shake = useAnimationControls();
  return (
    <motion.span animate={shake} style={{ display: 'inline-block', lineHeight: 0, paddingBottom: 6 }}>
      <ShopTile
        itemId={itemId}
        size={size}
        label={label}
        grey={copies >= MAX_COPIES || !isBaseItem(itemId)}
        marks={copies > 0 ? { copies } : undefined}
        onTap={() => {
          if (!itemCard(itemId)) return;
          if (!onAdd(itemId)) void shake.start({ x: [0, -6, 6, -4, 4, -2, 0], transition: { duration: 0.36 } });
        }}
        onLong={(rect) => onLong(itemId, rect)}
        onHover={(rect) => onPeek(itemId, rect)}
      />
    </motion.span>
  );
});
