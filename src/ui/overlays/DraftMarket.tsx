/**
 * The market on the draft overlay: what the shop sells this match, fixed
 * before the first pick and set out in the shop's own tile language — the
 * three categories, Weapon · Vitality · Spirit (side by side on a wide
 * screen, tabs on a phone), each in tier rows headed by the tier's diamonds
 * and price, every item its own icon. Nothing is bought here: a tap, a
 * long-press or a mouse resting on a tile opens the item's tooltip, and a
 * second tap there opens the full card.
 *
 * Every hero drafted puts its two signature items and its build on sale
 * (`addHero`), so tiles join the rows as the picks are made: each wears the
 * portrait of the hero it came with in its corner, ringed gold for your picks
 * and red for the rival's, and rises in as it joins.
 */
import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CardId, DraftState, ItemSlot, ItemTier, PlayerID } from '@/engine/types';
import { CARDS_BY_ID, cardName, itemCard } from '@/cards';
import { PRICE } from '@/engine/constants';
import { buildOf, marketByTab, openingMarket } from '@/engine/market';
import { HeroBadge } from '@/cards/art/heroArt';
import { getMatchConfig } from '@/storage/matchConfig';
import { fonts, spring, text } from '../tokens';
import { poster } from '../poster';
import { ShopTile } from '../shop/ShopTile';
import { TierRows } from '../shop/TierRows';
import { CategoryBanner, CategoryTabs } from '../shop/CategoryTabs';
import { ItemTooltip } from '../shop/ItemTooltip';
import { nextTip, type TipRequest } from '../shop/tips';
import { SHOP_TABS, soulsWord } from '../shop/itemFacts';
import { CardPreview } from './CardPreview';

/** How many items the market opens with, before any pick: every tier 1 item
 *  and the random slice. The match seed decides which items, never how many,
 *  so whatever `G.market` holds past this many, a pick put on sale. */
const OPENING_SIZE = openingMarket(0).length;

/** The pick an item came on sale with: the hero, and whose pick it was. */
interface Joined {
  heroId?: CardId;
  pid?: PlayerID;
  /** One of the hero's two signature items (else an item of its build). */
  signature: boolean;
}

/**
 * The items a pick put on sale, each with the pick that brought it. The
 * engine's `addHero` runs pick by pick — the hero's signatures, then its
 * build, each item not on sale yet — so an item joined with the first pick
 * whose signatures or build hold it. The human seat follows its saved build
 * (the match config's, as setup reads it), every other seat its hero's
 * default. An item no pick accounts for (a build changed since) is still
 * marked as joined, with no hero.
 */
function joinedItems(market: CardId[], draft: DraftState): Map<CardId, Joined> {
  const out = new Map<CardId, Joined>();
  const joined = new Set(market.slice(OPENING_SIZE));
  if (joined.size === 0) return out;
  const config = getMatchConfig();
  const human = config.humanSeat === undefined ? '0' : config.humanSeat;
  const seat = { playerBuilds: human === null ? undefined : config.builds, humanSeat: human };
  const taken: Record<PlayerID, number> = { '0': 0, '1': 0 };
  for (let i = 0; i < Math.min(draft.currentIndex, draft.order.length); i++) {
    const pid = draft.order[i];
    const heroId = draft.picks[pid][taken[pid]++];
    const hero = heroId ? CARDS_BY_ID[heroId] : undefined;
    if (!heroId || hero?.type !== 'hero') continue;
    for (const id of hero.signature) {
      if (joined.has(id) && !out.has(id)) out.set(id, { heroId, pid, signature: true });
    }
    for (const id of buildOf(seat, pid, heroId)) {
      if (joined.has(id) && !out.has(id)) out.set(id, { heroId, pid, signature: false });
    }
  }
  for (const id of joined) if (!out.has(id)) out.set(id, { signature: false });
  return out;
}

export function DraftMarket({ market, draft, me, compact }: {
  /** What the shop sells this match (`G.market`). */
  market: CardId[];
  draft: DraftState;
  me: PlayerID;
  /** The phone's layout: one category at a time, behind tabs. */
  compact: boolean;
}) {
  const byTab = useMemo(() => marketByTab({ market }), [market]);
  const joined = useMemo(() => joinedItems(market, draft), [market, draft]);
  const [tab, setTab] = useState<ItemSlot>('weapon');
  const [tip, setTipState] = useState<TipRequest | null>(null);
  const setTip = useCallback((req: TipRequest | null) => setTipState((cur) => nextTip(cur, req)), []);
  const [card, setCard] = useState<CardId | null>(null);
  const size = compact ? 44 : 40;

  const tile = (id: CardId, tier: ItemTier) => {
    const from = joined.get(id);
    const hero = from?.heroId ? cardName(from.heroId) : undefined;
    const label = `${cardName(id)} — tier ${tier}, ${soulsWord(PRICE[tier])}`
      + (from ? `, on sale with ${hero ?? 'a pick'}` : '');
    const open = (anchor: DOMRect) => setTip({ itemId: id, anchor, source: 'market' });
    return (
      <motion.span
        key={id}
        // A tile a pick put on sale rises in as it joins the row.
        initial={from ? { opacity: 0, scale: 0.5, y: 6 } : false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring.snappy}
        style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}
      >
        <ShopTile
          itemId={id}
          size={size}
          label={label}
          onTap={open}
          onLong={open}
          onHover={(r) => setTip(r ? { itemId: id, anchor: r, source: 'market', passive: true } : null)}
        />
        {from?.heroId && <JoinMark heroId={from.heroId} mine={from.pid === me} size={compact ? 20 : 19} />}
      </motion.span>
    );
  };

  const rows = (slot: ItemSlot) => (
    <TierRows
      slot={slot}
      byTier={byTab[slot]}
      gap={compact ? 10 : 9}
      renderTile={tile}
      empty={<span style={{ ...text.label, fontSize: 10, color: poster.creamFaint }}>—</span>}
    />
  );

  // What a tooltip says beyond the item: where its place on sale came from.
  const tipNote = (id: CardId) => {
    const from = joined.get(id);
    if (from?.heroId) return `On sale with ${cardName(from.heroId)}${from.pid === me ? '' : ' (the rival’s pick)'}: ${from.signature ? 'a signature item' : 'in its build'}.`;
    if (from) return 'Put on sale by a pick.';
    return itemCard(id)?.tier === 1 ? 'Every tier 1 item is always on sale.' : 'Drawn for this match’s market.';
  };

  return (
    <section
      aria-label="Market"
      style={{
        position: 'relative', zIndex: 1,
        borderRadius: 12,
        background: poster.frame,
        border: `1.5px solid ${poster.edge}`,
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
        padding: compact ? '10px 10px 14px' : '12px 18px 18px',
        color: poster.cream,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', marginBottom: compact ? 8 : 12 }}>
        <h2 style={{ margin: 0, fontFamily: fonts.display, fontSize: compact ? 15 : 17, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1, color: poster.cream }}>
          Market
        </h2>
        <span style={{ ...text.label, fontSize: 10, letterSpacing: '0.16em', color: poster.creamDim }}>
          {market.length} on sale
        </span>
        <span aria-hidden style={{ flex: 1, minWidth: 8, height: 1, background: poster.edge }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Legend ring={poster.you} word="Your picks" />
          <Legend ring={poster.rival} word="Rival’s" />
        </span>
      </header>

      {compact ? (
        <>
          <div style={{ margin: '0 -10px' }}>
            <CategoryTabs tab={tab} onTab={setTab} compact idPrefix="draft-market" />
          </div>
          <div id="draft-market-panel" role="tabpanel" aria-labelledby={`draft-market-tab-${tab}`} style={{ paddingTop: 12, minHeight: 4 * 66 }}>
            {rows(tab)}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18, alignItems: 'start' }}>
          {SHOP_TABS.map((slot) => (
            <div key={slot} style={{ minWidth: 0 }}>
              <CategoryBanner slot={slot} />
              {rows(slot)}
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {tip && (
          <ItemTooltip
            key={`${tip.itemId}-${tip.passive ? 'h' : 'p'}`}
            itemId={tip.itemId}
            anchor={tip.anchor}
            note={tipNote(tip.itemId)}
            passive={tip.passive}
            onOpenCard={() => { setCard(tip.itemId); setTipState(null); }}
            onClose={() => setTipState(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {card && <CardPreview key={card} cardId={card} onClose={() => setCard(null)} />}
      </AnimatePresence>
    </section>
  );
}

/** The hero an item came on sale with, in the tile's corner: its portrait,
 *  ringed in its side's colour. */
function JoinMark({ heroId, mine, size }: { heroId: CardId; mine: boolean; size: number }) {
  return (
    <span aria-hidden style={{
      position: 'absolute', top: -5, left: -3, zIndex: 2,
      width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      boxShadow: `0 0 0 2px ${mine ? poster.you : poster.rival}, 0 0 0 3.5px ${poster.frame}`,
      pointerEvents: 'none', lineHeight: 0,
    }}>
      <HeroBadge cardId={heroId} size={size} />
    </span>
  );
}

function Legend({ ring, word }: { ring: string; word: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', boxShadow: `0 0 0 2px ${ring}`, background: poster.panel }} />
      <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.14em', color: poster.creamDim }}>{word}</span>
    </span>
  );
}
