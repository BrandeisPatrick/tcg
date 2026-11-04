/**
 * The shop — the turn's shop step, as a sheet laid out like Deadlock's own
 * shop, and printed in icons only: no item's name or text appears on it (a
 * long press, or the info toggle, opens the full card). It opens at the start
 * of your turn and stays until you are done (Done — Skip when nothing on sale
 * is affordable — closes the shop and the turn moves on to its act; Hide only
 * puts the sheet away, and the board's Shop button brings it back).
 *
 *   header     your souls, large, and what next turn's income brings (the
 *              comeback too, while you trail on net worth)
 *   builds     each hero's pre-configured build, six icons in build order:
 *              what it has ticked, the next one you can afford lit, one this
 *              market does not sell greyed with the item that stands in for it
 *   catalogue  the market by tab — Weapon · Vitality · Spirit, in Deadlock's
 *              colours — in tier rows whose header carries the tier's price
 *              (in the warning ink while you cannot pay it)
 *   inventory  each hero's slots, tinted by what fills them, and the hand as
 *              the unassigned row
 *
 * Tap an icon to buy: the card goes to your hand (the board flies it there).
 * Tap a card in the hand, then a hero, to put it on; tap a worn item to sell
 * it or move it to another hero; hold a card in the hand to see it and sell it.
 * Every move asks the engine first (`actionRefusal` over `blocked`): a move it
 * will not make is greyed here, or refused on the board's sticker with the
 * reason — never dispatched to go nowhere.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { CardId, CardInstance, GameState, ItemSlot, ItemTier, PlayerID } from '@/engine/types';
import { cardName, itemCard } from '@/cards';
import { buyBlocked, buyPrice, moveItemBlocked, playBlocked, sellRefund } from '@/engine/legality';
import { comebackBonus, slotCap, slottedHeroes, wornItems } from '@/engine/query';
import { buildOf, marketByTab, marketItems, marketStandIn, onSale } from '@/engine/market';
import type { Action } from '@/engine/engine';
import { LANE_INCOME, PRICE } from '@/engine/constants';
import { HeroBadge } from '@/cards/art/heroArt';
import { ItemIcon, type ItemIconMarks } from '../card/ItemIcon';
import { PosterButton } from '../chrome';
import { fonts, spring, text } from '../tokens';
import { poster, sheetStyle, soulCoin, tabInk } from '../poster';
import { useViewport } from '../hooks/useViewport';

/** The sheet's accessible name: the tutorial's gate finds it by this. */
export const SHOP_SHEET = 'Shop sheet';
/** The button that closes the shop (printed Done, or Skip with nothing to buy). */
export const SHOP_DONE = 'Done shopping';
/** The name a buyable icon announces itself by: "Buy Extended Magazine — 2
 *  souls". The tutorial's gate and the QA scripts find it by its start. */
export const buyLabel = (itemId: CardId) => `Buy ${cardName(itemId)}`;

/** Deadlock's tab order. */
const TABS: readonly ItemSlot[] = ['weapon', 'vitality', 'spirit'];
const TAB_WORD: Record<ItemSlot, string> = { weapon: 'Weapon', vitality: 'Vitality', spirit: 'Spirit' };
const TIERS: readonly ItemTier[] = [1, 2, 3, 4];
/** A press this long opens the card instead of tapping it. */
const LONG_PRESS_MS = 450;
/** Room the sheet leaves at the top of the screen for the System menu's gear
 *  (top 12 + 40px, and a margin). */
const SYSTEM_GEAR_CLEARANCE = 58;

/** "1 soul", "4 souls". */
const souls = (n: number) => `${n} soul${n === 1 ? '' : 's'}`;

type ShopMove = Extract<Action, { type: 'buy' | 'sell' | 'moveItem' | 'playCard' }>;

interface Props {
  G: GameState;
  me: PlayerID;
  /** Make a shop move (the board asks the engine and dispatches it); a buy
   *  passes the icon it came from, for the flight to the hand. */
  onMove: (a: ShopMove, from?: DOMRect) => void;
  /** Close the shop: the turn moves on to its act. */
  onDone: () => void;
  /** Put the sheet away; the shop stays open. */
  onHide: () => void;
  /** Open an item's card at full size: what it costs you now (an icon on
   *  sale), or the card in your hand it is (the board offers its sale). */
  onPreview: (p: { cardId: CardId; cost?: number; iid?: string }) => void;
  /** Px at the bottom of the screen the sheet leaves clear: the hand row, so
   *  a card bought is seen landing in it. */
  bottomInset: number;
  /** Px at the right the sheet leaves clear: the desktop side panel, when it
   *  is open, so the sheet centres on the board. */
  rightInset?: number;
}

/** True when `hero` wears `itemId`, or an item built from it (Improved Spirit
 *  covers the Extra Spirit a build lists first). */
function hasOrPast(hero: CardInstance, itemId: CardId): boolean {
  return wornItems(hero).some((it) => {
    for (let id: CardId | undefined = it.cardId; id; id = itemCard(id)?.upgradesFrom) if (id === itemId) return true;
    return false;
  });
}

/** Tap and long-press on one control: a press held LONG_PRESS_MS fires
 *  `onLong` and swallows the click that ends it. */
function usePress(onTap: () => void, onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fired = useRef(false);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = undefined; } };
  useEffect(() => clear, []);
  return {
    onPointerDown: () => {
      fired.current = false;
      clear();
      timer.current = setTimeout(() => { fired.current = true; onLong(); }, LONG_PRESS_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: () => {
      clear();
      if (fired.current) { fired.current = false; return; }
      onTap();
    },
    // A held press on a phone opens the browser's own menu otherwise.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

/** One item icon as a control: tap, long press, and its name for a screen
 *  reader (the sheet prints none). */
function IconButton({ itemId, size, label, grey, lit, selected, marks, onTap, onLong }: {
  itemId: CardId; size: number; label: string; grey?: boolean; lit?: boolean; selected?: boolean; marks?: ItemIconMarks;
  onTap: (rect: DOMRect) => void; onLong: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const press = usePress(() => onTap(ref.current!.getBoundingClientRect()), onLong);
  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={label}
      aria-disabled={grey || undefined}
      whileTap={{ scale: 0.92 }}
      transition={spring.snappy}
      {...press}
      style={{
        padding: 0, border: 'none', background: 'none', cursor: 'pointer', lineHeight: 0,
        touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
      } as CSSProperties}
    >
      <ItemIcon itemId={itemId} size={size} grey={grey} lit={lit} selected={selected} marks={marks} />
    </motion.button>
  );
}

export function ShopSheet({ G, me, onMove, onDone, onHide, onPreview, bottomInset, rightInset = 0 }: Props) {
  const { isMobile } = useViewport();
  const ps = G.players[me];
  const heroes = slottedHeroes(ps);
  const [tab, setTab] = useState<ItemSlot>('weapon');
  // Info: a tap opens the card instead of buying it.
  const [info, setInfo] = useState(false);
  // The card in the hand picked up to be put on a hero, and the worn item whose sale or move is being chosen.
  const [armed, setArmed] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const market = useMemo(() => marketByTab(G), [G]);
  // A card or item that has gone (played, sold, moved) is let go of.
  useEffect(() => { if (armed && !ps.hand.some((c) => c.iid === armed)) setArmed(null); }, [armed, ps.hand]);
  useEffect(() => {
    if (picked && !heroes.some((h) => wornItems(h).some((it) => it.iid === picked))) setPicked(null);
  }, [picked, heroes]);

  const cap = slotCap(G, me);
  const icon = isMobile ? 44 : 46;
  // Two heroes a row on a phone: a fourth (flex) slot shrinks them to fit 390px.
  const slot = isMobile ? (cap > 3 ? 28 : 34) : 38;
  const comeback = comebackBonus(G, me);
  const anyAffordable = marketItems(G).some((id) => buyBlocked(G, me, id) === null);
  /** Copies of an item on your side: in the hand, and worn. */
  const held = (id: CardId) => ps.hand.some((c) => c.cardId === id);
  const worn = (id: CardId) => heroes.some((h) => wornItems(h).some((it) => it.cardId === id));

  const buy = (itemId: CardId, rect: DOMRect) => {
    if (info) { onPreview({ cardId: itemId, cost: buyPrice(G, me, itemId) }); return; }
    onMove({ type: 'buy', itemId }, rect);
  };
  const preview = (itemId: CardId) => onPreview({ cardId: itemId, cost: buyPrice(G, me, itemId) });

  // ---------------------------------------------------------------- header
  // The sheet's controls: the info toggle, Hide and Done (Skip with nothing
  // to buy). In the header on a desktop; on a phone in a footer, at the thumb.
  const controls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        aria-pressed={info}
        aria-label="Info: a tap opens the card"
        onClick={() => setInfo((v) => !v)}
        style={{
          width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
          border: `2px solid ${poster.ink}`,
          background: info ? poster.ink : 'transparent',
          color: info ? poster.paper : poster.ink,
          fontFamily: fonts.display, fontSize: 16, lineHeight: 1,
        }}
      >i</button>
      <PosterButton variant="paper" size="sm" onClick={onHide} ariaLabel="Hide the shop" style={{ padding: '7px 11px' }}>Hide</PosterButton>
      <PosterButton variant="ink" size="sm" onClick={onDone} ariaLabel={SHOP_DONE} style={{ padding: '7px 13px' }}>
        {anyAffordable ? 'Done' : 'Skip'}
      </PosterButton>
    </div>
  );
  const header = (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: isMobile ? '10px 12px 9px' : '12px 18px 10px',
      borderBottom: `1.5px solid ${poster.ink}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontFamily: fonts.display, fontSize: 22, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>Shop</h2>
        <span style={{ flex: 1 }} />
        {!isMobile && controls}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span aria-label={`Souls: ${ps.souls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden style={soulCoin(22)} />
          <span style={{ ...text.numeric, fontFamily: fonts.display, fontSize: 30, lineHeight: 1 }}>{ps.souls}</span>
        </span>
        <span aria-label={`Next turn: ${LANE_INCOME} souls${comeback ? `, and ${comeback} comeback` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Pill>+{LANE_INCOME} next turn</Pill>
          {comeback > 0 && <Pill ink={poster.status.buff}>+{comeback} comeback</Pill>}
        </span>
      </div>
    </div>
  );

  // ---------------------------------------------------------------- builds
  const builds = (
    <Section title="Builds" note="next affordable lit">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {heroes.map((h) => <BuildRow key={h.iid} G={G} me={me} hero={h} size={icon} onBuy={buy} onPreview={preview} />)}
      </div>
    </Section>
  );

  // ---------------------------------------------------------------- catalogue
  const catalogue = (
    <Section title="Catalogue">
      <div role="tablist" aria-label="Shop tabs" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {TABS.map((t) => {
          const { tint, deep } = tabInk(t);
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '8px 4px', cursor: 'pointer',
                fontFamily: fonts.display, fontSize: 12.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                border: `2px solid ${deep}`,
                borderRadius: 6,
                background: on ? tint : 'transparent',
                color: deep,
                boxShadow: on ? `inset 0 -3px 0 ${deep}` : undefined,
              }}
            >
              {TAB_WORD[t]}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" aria-label={`${TAB_WORD[tab]} items`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {TIERS.map((tier) => {
          const ids = market[tab][tier];
          if (ids.length === 0) return null;
          const short = ps.souls < PRICE[tier];
          return (
            <div key={tier}>
              <div aria-label={`Tier ${tier}: ${souls(PRICE[tier])}`} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ ...text.label, fontSize: 10, letterSpacing: '0.18em', color: poster.inkDim }}>Tier {tier}</span>
                <span aria-hidden style={soulCoin(11)} />
                <span style={{ ...text.numeric, fontFamily: fonts.display, fontSize: 14, lineHeight: 1, color: short ? poster.redDeep : poster.ink }}>{PRICE[tier]}</span>
                <span aria-hidden style={{ flex: 1, height: 1, background: poster.inkRule }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ids.map((id) => {
                  const price = buyPrice(G, me, id);
                  const can = buyBlocked(G, me, id) === null;
                  const discount = price < PRICE[tier];
                  return (
                    <IconButton
                      key={id}
                      itemId={id}
                      size={icon}
                      grey={!can}
                      marks={{ held: held(id), worn: worn(id), discount }}
                      label={`${buyLabel(id)} — ${souls(price)}${discount ? ' (an upgrade, at the difference)' : ''}${can ? '' : ' — not enough souls'}`}
                      onTap={(r) => buy(id, r)}
                      onLong={() => preview(id)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );

  // ---------------------------------------------------------------- inventory
  const armedCard = armed ? ps.hand.find((c) => c.iid === armed) : undefined;
  const pickedWorn = picked ? heroes.flatMap((h) => wornItems(h).map((it) => ({ it, bearer: h }))).find((x) => x.it.iid === picked) : undefined;
  const inventory = (
    <Section title="Inventory" note={armedCard ? 'tap a hero to put it on' : `${cap} slots a hero`}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {heroes.map((h) => {
          const items = wornItems(h);
          const canTake = !!armedCard && playBlocked(G, me, armedCard.iid, h.iid) === null;
          return (
            <div
              key={h.iid}
              role={armedCard ? 'button' : undefined}
              aria-label={armedCard ? `Put ${cardName(armedCard.cardId)} on ${cardName(h.cardId)}` : `${cardName(h.cardId)}'s slots`}
              onClick={armedCard ? () => { onMove({ type: 'playCard', cardIid: armedCard.iid, heroIid: h.iid }); setArmed(null); } : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: 4, minWidth: 0,
                borderRadius: 8,
                border: `1.5px ${canTake ? 'solid' : 'dashed'} ${canTake ? poster.target : poster.inkRule}`,
                background: canTake ? 'rgba(98, 196, 98, 0.14)' : 'transparent',
                cursor: armedCard ? (canTake ? 'pointer' : 'not-allowed') : 'default',
              }}
            >
              <HeroBadge cardId={h.cardId} size={isMobile ? 26 : 30} />
              <div style={{ display: 'flex', gap: 3, minWidth: 0 }}>
                {Array.from({ length: cap }, (_, i) => {
                  const it = items[i];
                  if (!it) return <EmptySlot key={i} size={slot} />;
                  return (
                    <IconButton
                      key={it.iid}
                      itemId={it.cardId}
                      size={slot}
                      selected={picked === it.iid}
                      label={`${cardName(it.cardId)}, worn by ${cardName(h.cardId)} — sell or move it`}
                      onTap={() => { if (!armedCard) setPicked(picked === it.iid ? null : it.iid); }}
                      onLong={() => onPreview({ cardId: it.cardId })}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {pickedWorn && (
        <div role="group" aria-label="Sell or move the item" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8, padding: 6, borderRadius: 8, background: 'rgba(23, 20, 16, 0.06)' }}>
          <ItemIcon itemId={pickedWorn.it.cardId} size={30} />
          <PosterButton variant="red" size="sm" onClick={() => { onMove({ type: 'sell', itemIid: pickedWorn.it.iid }); setPicked(null); }}
            ariaLabel={`Sell ${cardName(pickedWorn.it.cardId)} for ${souls(sellRefund(G, pickedWorn.it))}`} style={{ padding: '7px 11px' }}>
            Sell +{sellRefund(G, pickedWorn.it)}
          </PosterButton>
          {heroes.length > 1 && <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.16em', color: poster.inkDim }}>Move to</span>}
          {heroes.filter((h) => h.iid !== pickedWorn.bearer.iid).map((to) => {
            const no = moveItemBlocked(G, me, pickedWorn.it.iid, to.iid);
            return (
              <button key={to.iid} type="button" disabled={!!no}
                aria-label={`Move ${cardName(pickedWorn.it.cardId)} to ${cardName(to.cardId)}`}
                onClick={() => { onMove({ type: 'moveItem', itemIid: pickedWorn.it.iid, toHeroIid: to.iid }); setPicked(null); }}
                style={{ padding: 0, border: 'none', background: 'none', cursor: no ? 'not-allowed' : 'pointer', opacity: no ? 0.35 : 1, lineHeight: 0 }}>
                <HeroBadge cardId={to.cardId} size={30} />
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          <button type="button" aria-label="Keep it" onClick={() => setPicked(null)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: fonts.display, fontSize: 16, color: poster.inkDim }}>×</button>
        </div>
      )}

      {/* The hand: what is bought and not yet on a hero — the unassigned row. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, minHeight: slot + 6 }}>
        <span style={{ ...text.label, fontSize: 10, letterSpacing: '0.18em', color: poster.inkDim, width: isMobile ? 34 : 40, flexShrink: 0 }}>Hand</span>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', minWidth: 0 }}>
          {ps.hand.length === 0 && (
            <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.14em', color: poster.inkFaint }}>Bought cards land here</span>
          )}
          {ps.hand.map((c) => (
            <IconButton
              key={c.iid}
              itemId={c.cardId}
              size={slot}
              selected={armed === c.iid}
              label={`${cardName(c.cardId)}, in your hand — tap, then a hero, to put it on; hold to see it or sell it`}
              onTap={() => { setPicked(null); setArmed(armed === c.iid ? null : c.iid); }}
              onLong={() => onPreview({ cardId: c.cardId, iid: c.iid })}
            />
          ))}
        </div>
      </div>
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
      // Clear of the System menu's gear (top 12 + 40px) in the top corner.
      paddingTop: SYSTEM_GEAR_CLEARANCE,
      pointerEvents: 'none',
    }}>
    <motion.div
      role="dialog"
      aria-label={SHOP_SHEET}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={spring.snappy}
      style={{
        pointerEvents: 'auto',
        width: isMobile ? '100%' : 'min(940px, 100%)',
        maxHeight: '100%',
        display: 'flex', flexDirection: 'column',
        borderRadius: 14,
        overflow: 'hidden',
        color: poster.ink,
        fontFamily: fonts.ui,
        ...sheetStyle,
      }}
    >
      {header}
      <div style={{
        flex: '1 1 auto', minHeight: 0,
        overflowY: 'auto', overflowX: 'hidden',
        padding: isMobile ? '10px 12px 14px' : '14px 18px 18px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {isMobile ? (
          <>
            {builds}
            {catalogue}
            {inventory}
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 22, alignItems: 'start' }}>
              {catalogue}
              {builds}
            </div>
            {inventory}
          </>
        )}
      </div>
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderTop: `1.5px solid ${poster.ink}` }}>
          {controls}
        </div>
      )}
    </motion.div>
    </div>
  );
}

/**
 * One hero's build in order, six icons: what it wears (or has built past)
 * ticked; a copy waiting in your hand marked; the next one you can afford lit
 * (tap: buy it); one this market does not sell greyed, with the item that
 * stands in for it inset (tap buys the stand-in).
 */
function BuildRow({ G, me, hero, size, onBuy, onPreview }: {
  G: GameState; me: PlayerID; hero: CardInstance; size: number;
  onBuy: (id: CardId, rect: DOMRect) => void; onPreview: (id: CardId) => void;
}) {
  const ps = G.players[me];
  const taken = wornItems(hero).map((it) => it.cardId);
  const name = cardName(hero.cardId);
  let lit = false;
  return (
    <div role="group" aria-label={`${name}'s build`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <HeroBadge cardId={hero.cardId} size={Math.round(size * 0.78)} />
      <div style={{ display: 'flex', gap: 4 }}>
        {buildOf(G, me, hero.cardId).map((id) => {
          const owned = hasOrPast(hero, id);
          const sale = onSale(G, id);
          const stand = sale ? id : marketStandIn(G, id, taken);
          const inHand = ps.hand.some((c) => c.cardId === (stand ?? id));
          const can = !!stand && buyBlocked(G, me, stand) === null;
          const next = !owned && !inHand && can && !lit;
          if (next) lit = true;
          const marks: ItemIconMarks = { worn: owned, held: !owned && inHand, ...(stand && stand !== id ? { standIn: stand } : {}) };
          const price = stand ? buyPrice(G, me, stand) : 0;
          const label = owned ? `${cardName(id)} — ${name} has it`
            : !stand ? `${cardName(id)} — not on sale this match`
            : `${buyLabel(stand)} for ${name}'s build — ${souls(price)}${stand !== id ? ` (it stands in for ${cardName(id)})` : ''}${can ? '' : ' — not enough souls'}`;
          return (
            <IconButton
              key={id}
              itemId={id}
              size={size}
              lit={next}
              grey={!owned && (!sale || !can)}
              marks={marks}
              label={label}
              onTap={(r) => { if (owned || !stand) onPreview(id); else onBuy(stand, r); }}
              onLong={() => onPreview(stand ?? id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function EmptySlot({ size }: { size: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, flexShrink: 0, boxSizing: 'border-box',
      borderRadius: Math.round(size * 0.22),
      border: `1.5px dashed ${poster.inkFaint}`,
      background: 'rgba(23, 20, 16, 0.04)',
    }} />
  );
}

function Pill({ children, ink = poster.ink }: { children: ReactNode; ink?: string }) {
  return (
    <span style={{
      ...text.label, fontSize: 10, letterSpacing: '0.14em',
      padding: '4px 8px', borderRadius: 999,
      border: `1.5px solid ${ink}`, color: ink, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontFamily: fonts.display, fontSize: 14, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1 }}>{title}</h3>
        {note && <span style={{ ...text.label, fontSize: 9, letterSpacing: '0.16em', color: poster.inkDim }}>{note}</span>}
        <span aria-hidden style={{ flex: 1, height: 1, background: poster.inkRule }} />
      </div>
      {children}
    </section>
  );
}
