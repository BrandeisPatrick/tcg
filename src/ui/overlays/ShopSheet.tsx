/**
 * The shop — the turn's shop step, laid out as Deadlock's own shop and printed
 * in its look (a graphite panel, the three categories in their colours) with
 * the game's type and plaque for the souls. No item's name or text is printed
 * on the sheet: a tile is the item's own icon, and a hold (a mouse rest on a
 * desktop) opens its tooltip; a second tap there opens the full card.
 *
 *   economy    your souls, large — and the souls a held item would leave —
 *              what next turn's income brings (the comeback while you trail),
 *              your net worth against the rival's, the cards in your hand
 *   builds     each drafted hero's pre-configured build, six tiles in order:
 *              what it has ticked, the next one you can afford lit, one this
 *              market does not sell greyed with its stand-in inset
 *   catalogue  the market by category — Weapon · Vitality · Spirit — in tier
 *              rows headed by the tier's price (in the warning ink while you
 *              cannot pay it); tabs on a phone, side by side on a desktop
 *   inventory  each hero's slots, a worn item's tile in its category's
 *              colour, and the hand as the unassigned row
 *
 * Tap a tile to buy: the card goes to your hand (the board flies it there).
 * Tap a card in the hand to sell it or put it on a hero; tap a worn item to
 * sell it or move it. Every move asks the engine first (`actionRefusal` over
 * `blocked`): one it will not make is greyed here, or refused on the board's
 * sticker with the reason — never dispatched to go nowhere. Done closes the
 * shop (Skip when nothing on sale is affordable); Hide puts the sheet away and
 * the board's Shop button brings it back.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { CardId, CardInstance, GameState, ItemSlot, ItemTier, PlayerID } from '@/engine/types';
import { buyBlocked, buyPrice, sellBlocked, sellRefund } from '@/engine/legality';
import { findWornItem, handCard, itemCooldown, slotCap, slottedHeroes, wornItems } from '@/engine/query';
import { marketByTab, marketItems } from '@/engine/market';
import type { Action } from '@/engine/engine';
import { PRICE } from '@/engine/constants';
import { PosterButton } from '../chrome';
import { fonts, spring, text } from '../tokens';
import { poster } from '../poster';
import { useViewport } from '../hooks/useViewport';
import { actionRefusal } from '../board/heroActions';
import { ShopTile } from '../shop/ShopTile';
import { TierRows } from '../shop/TierRows';
import { CategoryBanner, CategoryTabs } from '../shop/CategoryTabs';
import { BuildStrip, buyLabel } from '../shop/BuildStrip';
import { Inventory } from '../shop/Inventory';
import { EconomyHeader } from '../shop/EconomyHeader';
import { ItemTooltip, type TooltipSale } from '../shop/ItemTooltip';
import { SHOP_TABS, soulsWord } from '../shop/itemFacts';
import { nextTip, type TipRequest } from '../shop/tips';

/** The sheet's accessible name: the tutorial's gate finds it by this. */
export const SHOP_SHEET = 'Shop sheet';
/** The button that closes the shop (printed Done, or Skip with nothing to buy). */
export const SHOP_DONE = 'Done shopping';
export { buyLabel };

/** Room the sheet leaves at the top of the screen for the System menu's gear
 *  (top 12 + 40px, and a margin). */
const SYSTEM_GEAR_CLEARANCE = 58;
/** Below this width a desktop sheet keeps the phone's tabs: three columns
 *  side by side would leave a column two tiles wide. */
const SIDE_BY_SIDE_MIN = 1000;

type ShopMove = Extract<Action, { type: 'buy' | 'sell' | 'moveItem' | 'playCard' }>;

interface Props {
  G: GameState;
  me: PlayerID;
  /** Make a shop move (the board asks the engine and dispatches it); a buy
   *  passes the tile it came from, for the flight to the hand. */
  onMove: (a: ShopMove, from?: DOMRect) => void;
  /** Close the shop: the turn moves on to its act. */
  onDone: () => void;
  /** Put the sheet away; the shop stays open. */
  onHide: () => void;
  /** Open an item's card at full size: what it costs you now (a tile on
   *  sale), or the card it is (in your hand, or worn). */
  onPreview: (p: { cardId: CardId; cost?: number; iid?: string }) => void;
  /** Px at the bottom of the screen the sheet leaves clear: the hand row, so
   *  a card bought is seen landing in it. */
  bottomInset: number;
  /** Px at the right the sheet leaves clear: the desktop side panel, when it
   *  is open, so the sheet centres on the board. */
  rightInset?: number;
}

export function ShopSheet({ G, me, onMove, onDone, onHide, onPreview, bottomInset, rightInset = 0 }: Props) {
  const { isMobile, width } = useViewport();
  const sideBySide = !isMobile && width - rightInset >= SIDE_BY_SIDE_MIN;
  const ps = G.players[me];
  const heroes = slottedHeroes(ps);
  const [tab, setTab] = useState<ItemSlot>('weapon');
  // The card in the hand picked up to be put on a hero, and the worn item whose sale or move is being chosen.
  const [armed, setArmed] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [tip, setTipState] = useState<TipRequest | null>(null);
  const setTip = useCallback((req: TipRequest | null) => setTipState((cur) => nextTip(cur, req)), []);
  const market = useMemo(() => marketByTab(G), [G]);

  // A card or item that has gone (played, sold, moved) is let go of, and its tooltip with it.
  useEffect(() => { if (armed && !ps.hand.some((c) => c.iid === armed)) setArmed(null); }, [armed, ps.hand]);
  useEffect(() => {
    if (picked && !heroes.some((h) => wornItems(h).some((it) => it.iid === picked))) setPicked(null);
  }, [picked, heroes]);
  useEffect(() => {
    if (tip?.iid && !handCard(G, me, tip.iid) && !findWornItem(G, tip.iid, me)) setTipState(null);
  }, [G, me, tip]);

  const cap = slotCap(G, me);
  const tile = isMobile ? 44 : 42;
  const gap = 6;
  // Two heroes a row on a phone: a fourth (flex) slot shrinks them to fit 390px.
  const slot = isMobile ? (cap > 3 ? 30 : 34) : 34;
  const anyAffordable = marketItems(G).some((id) => buyBlocked(G, me, id) === null);
  /** Copies of an item on your side: in the hand, and worn. */
  const owned = (id: CardId) => ps.hand.some((c) => c.cardId === id) || heroes.some((h) => wornItems(h).some((it) => it.cardId === id));

  const buy = (itemId: CardId, rect: DOMRect) => onMove({ type: 'buy', itemId }, rect);

  /** A tile on sale in the catalogue. */
  const marketTile = (id: CardId, tier: ItemTier) => {
    const price = buyPrice(G, me, id);
    const can = buyBlocked(G, me, id) === null;
    const discount = price < PRICE[tier];
    return (
      <ShopTile
        key={id}
        itemId={id}
        size={tile}
        grey={!can}
        marks={{ owned: owned(id), ...(discount ? { discount: price } : {}) }}
        label={`${buyLabel(id)} — ${soulsWord(price)}${discount ? ' (an upgrade, at the difference)' : ''}${can ? '' : ' — not enough souls'}`}
        onTap={(r) => buy(id, r)}
        onLong={(r) => setTip({ itemId: id, anchor: r, source: 'market' })}
        onHover={(r) => setTip(r ? { itemId: id, anchor: r, source: 'market', passive: true } : null)}
      />
    );
  };
  const catalogue = (slotOf: ItemSlot) => (
    <TierRows
      slot={slotOf}
      byTier={market[slotOf]}
      gap={gap}
      short={(tier) => ps.souls < PRICE[tier]}
      renderTile={marketTile}
      empty={<span style={{ ...text.label, fontSize: 10, color: poster.creamFaint }}>—</span>}
    />
  );

  // ---------------------------------------------------------------- the tooltip
  const tipped = tip ? tooltipFor(G, me, tip, (a) => { onMove(a); setTipState(null); }) : null;
  const heldPrice = tip && tip.source === 'market' ? buyPrice(G, me, tip.itemId) : undefined;
  const openCard = tip ? () => {
    onPreview({ cardId: tip.itemId, cost: heldPrice, iid: tip.iid });
    setTipState(null);
  } : undefined;

  // ---------------------------------------------------------------- controls
  // The sheet's buttons: Hide and Done (Skip with nothing to buy). In the
  // header on a desktop; on a phone in a footer, at the thumb.
  const controls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <PosterButton variant="ghost" size="sm" onClick={onHide} ariaLabel="Hide the shop" style={{ padding: '8px 12px' }}>Hide</PosterButton>
      <PosterButton variant="paper" size="sm" onClick={onDone} ariaLabel={SHOP_DONE} style={{ padding: '8px 16px' }}>
        {anyAffordable ? 'Done' : 'Skip'}
      </PosterButton>
    </div>
  );

  const builds = (
    <Section title="Builds">
      <BuildStrip G={G} me={me} heroes={heroes} size={tile} gap={isMobile ? 4 : 5} onBuy={buy} onTip={setTip} />
    </Section>
  );
  const inventory = (
    <Section title="Inventory" note={`${cap} slots a hero`}>
      <Inventory
        G={G} me={me} heroes={heroes} cap={cap} slot={slot}
        columns={isMobile ? 2 : sideBySide ? 1 : 2}
        armed={armed} picked={picked}
        onArm={setArmed} onPick={setPicked}
        onMove={onMove} onTip={setTip}
      />
    </Section>
  );

  return (
    // A static frame places the sheet — over the board and clear of the hand
    // row, so a card bought is seen landing — and the sheet inside it does
    // the motion, so framer's transform never fights the placement. The frame
    // lets taps through to the board.
    <div style={{
      position: 'fixed', left: 0, right: rightInset, top: 0, bottom: bottomInset, zIndex: 88,
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
      padding: isMobile ? 6 : 16,
      paddingTop: SYSTEM_GEAR_CLEARANCE,
      pointerEvents: 'none',
    }}>
      <motion.div
        role="dialog"
        aria-label={SHOP_SHEET}
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, transition: { duration: 0.16 } }}
        transition={spring.snappy}
        style={{
          pointerEvents: 'auto',
          width: isMobile ? '100%' : sideBySide ? 'min(1100px, 100%)' : 'min(760px, 100%)',
          maxHeight: '100%',
          display: 'flex', flexDirection: 'column',
          borderRadius: 12,
          overflow: 'hidden',
          background: poster.frame,
          border: `1.5px solid ${poster.edge}`,
          boxShadow: '0 40px 90px rgba(0, 0, 0, 0.6), 0 8px 24px rgba(0, 0, 0, 0.4)',
          color: poster.cream,
          fontFamily: fonts.ui,
        }}
      >
        <EconomyHeader G={G} me={me} preview={heldPrice} compact={isMobile} controls={isMobile ? undefined : controls} />
        <div style={{
          flex: '1 1 auto', minHeight: 0,
          overflowY: 'auto', overflowX: 'hidden',
          padding: isMobile ? '10px 12px 14px' : '14px 18px 18px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {sideBySide ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 22, alignItems: 'start' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, alignItems: 'start' }}>
                {SHOP_TABS.map((s) => (
                  <div key={s} style={{ minWidth: 0 }}>
                    <CategoryBanner slot={s} />
                    {catalogue(s)}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {builds}
                {inventory}
              </div>
            </div>
          ) : (
            <>
              {builds}
              <section aria-label="Catalogue" style={{ minWidth: 0 }}>
                {/* The tabs ride the top of the scroll, so a category is a tap away anywhere in it. */}
                <div style={{ position: 'sticky', top: isMobile ? -10 : -14, zIndex: 2, background: poster.frame, margin: isMobile ? '0 -12px' : '0 -18px', padding: isMobile ? '0 4px' : '0 10px' }}>
                  <CategoryTabs tab={tab} onTab={setTab} compact={isMobile} />
                </div>
                <div id="shop-panel" role="tabpanel" aria-labelledby={`shop-tab-${tab}`} style={{ paddingTop: 12 }}>
                  {catalogue(tab)}
                </div>
              </section>
              {inventory}
            </>
          )}
        </div>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderTop: `1px solid ${poster.edge}` }}>
            {controls}
          </div>
        )}
      </motion.div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {tip && tipped && (
            <ItemTooltip
              key={`${tip.source}-${tip.iid ?? tip.itemId}-${tip.passive ? 'h' : 'p'}`}
              itemId={tip.itemId}
              anchor={tip.anchor}
              price={heldPrice}
              souls={tip.source === 'market' ? ps.souls : undefined}
              sale={tipped.sale}
              live={tipped.live}
              note={tipped.note}
              passive={tip.passive}
              onOpenCard={openCard}
              onClose={() => setTipState(null)}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/** What a tooltip says beyond the item itself: on a card you own, its sale
 *  (asked of the engine: greyed with the reason when it cannot be sold now)
 *  and, worn, its cooldown or charges. */
function tooltipFor(G: GameState, me: PlayerID, tip: TipRequest, move: (a: ShopMove) => void): { sale?: TooltipSale; live?: { cooldown?: number; charges?: number }; note?: string } | null {
  if (tip.source === 'market' || tip.source === 'build') return {};
  const card: CardInstance | undefined = tip.source === 'hand' ? handCard(G, me, tip.iid!) : findWornItem(G, tip.iid!, me)?.item;
  if (!card) return null;
  const refund = sellRefund(G, card);
  const blockedReason = sellBlocked(G, me, card.iid) ? actionRefusal(G, me, { type: 'sell', itemIid: card.iid })?.text : undefined;
  const sale: TooltipSale = {
    refund,
    full: card.boughtOnTurn === G.turnNumber,
    onSell: () => move({ type: 'sell', itemIid: card.iid }),
    blockedReason,
  };
  if (tip.source === 'hand') return { sale, note: 'In your hand: tap it, then a hero, to put it on.' };
  return { sale, live: { cooldown: itemCooldown(card) || undefined, charges: card.charges ?? undefined } };
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontFamily: fonts.display, fontSize: 13, fontWeight: 400, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1, color: poster.cream }}>{title}</h3>
        {note && <span style={{ ...text.label, fontSize: 9, letterSpacing: '0.16em', color: poster.creamDim }}>{note}</span>}
        <span aria-hidden style={{ flex: 1, height: 1, background: poster.edge }} />
      </div>
      {children}
    </section>
  );
}
