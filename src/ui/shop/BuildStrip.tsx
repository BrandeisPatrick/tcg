import type { CardId, CardInstance, GameState, PlayerID } from '@/engine/types';
import { cardName, itemCard } from '@/cards';
import { buyBlocked, buyPrice } from '@/engine/legality';
import { wornItems } from '@/engine/query';
import { buildOf, marketStandIn, onSale } from '@/engine/market';
import { PRICE } from '@/engine/constants';
import { HeroBadge } from '@/cards/art/heroArt';
import type { ItemIconMarks } from '../card/ItemIcon';
import { ShopTile } from './ShopTile';
import { soulsWord } from './itemFacts';
import type { TipRequest } from './tips';

/** The name a buyable tile announces itself by: "Buy Extended Magazine". The
 *  tutorial's gate and the QA scripts find a tile by this start. */
export const buyLabel = (itemId: CardId) => `Buy ${cardName(itemId)}`;

/** True when `hero` wears `itemId`, or an item built from it (Improved Spirit
 *  covers the Extra Spirit a build lists first). */
function hasOrPast(hero: CardInstance, itemId: CardId): boolean {
  return wornItems(hero).some((it) => {
    for (let id: CardId | undefined = it.cardId; id; id = itemCard(id)?.upgradesFrom) if (id === itemId) return true;
    return false;
  });
}

/**
 * Each drafted hero's pre-configured build, as Deadlock's build panel lists
 * it: the hero's portrait, then its six items in buying order — what it has
 * (or a copy in your hand) ticked, the next one you can afford lit, one this
 * market does not sell greyed with the item that stands in for it inset. A
 * tap buys (the stand-in, for an item off the market); a hold opens the
 * tooltip.
 */
export function BuildStrip({ G, me, heroes, size, gap, onBuy, onTip }: {
  G: GameState;
  me: PlayerID;
  heroes: CardInstance[];
  size: number;
  gap: number;
  onBuy: (itemId: CardId, rect: DOMRect) => void;
  onTip: (t: TipRequest | null) => void;
}) {
  return (
    <div role="group" aria-label="Builds" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {heroes.map((h) => <BuildRow key={h.iid} G={G} me={me} hero={h} size={size} gap={gap} onBuy={onBuy} onTip={onTip} />)}
    </div>
  );
}

function BuildRow({ G, me, hero, size, gap, onBuy, onTip }: {
  G: GameState; me: PlayerID; hero: CardInstance; size: number; gap: number;
  onBuy: (itemId: CardId, rect: DOMRect) => void;
  onTip: (t: TipRequest | null) => void;
}) {
  const ps = G.players[me];
  const taken = wornItems(hero).map((it) => it.cardId);
  const name = cardName(hero.cardId);
  let lit = false;
  return (
    <div role="group" aria-label={`${name}'s build`} style={{ display: 'flex', alignItems: 'center', gap: gap + 2 }}>
      <HeroBadge cardId={hero.cardId} size={Math.round(size * 0.78)} />
      <div style={{ display: 'flex', gap }}>
        {buildOf(G, me, hero.cardId).map((id) => {
          const owned = hasOrPast(hero, id);
          const sale = onSale(G, id);
          const stand = sale ? id : marketStandIn(G, id, taken);
          const inHand = ps.hand.some((c) => c.cardId === (stand ?? id));
          const can = !!stand && buyBlocked(G, me, stand) === null;
          const next = !owned && !inHand && can && !lit;
          if (next) lit = true;
          const price = stand ? buyPrice(G, me, stand) : 0;
          const tier = itemCard(stand ?? id)?.tier ?? 1;
          const marks: ItemIconMarks = {
            owned: owned || inHand,
            ...(stand && stand !== id ? { standIn: stand } : {}),
            ...(stand && !owned && !inHand && price < PRICE[tier] ? { discount: price } : {}),
          };
          const label = owned ? `${cardName(id)} — ${name} has it`
            : inHand ? `${cardName(stand ?? id)} — a copy waits in your hand`
            : !stand ? `${cardName(id)} — not on sale this match`
            : `${buyLabel(stand)} for ${name}'s build — ${soulsWord(price)}${stand !== id ? ` (it stands in for ${cardName(id)})` : ''}${can ? '' : ' — not enough souls'}`;
          const tip = (rect: DOMRect | null, passive = false) =>
            onTip(rect ? { itemId: stand ?? id, anchor: rect, source: stand && !owned ? 'market' : 'build', passive } : null);
          return (
            <ShopTile
              key={id}
              itemId={id}
              size={size}
              lit={next}
              grey={!owned && !inHand && (!sale || !can)}
              marks={marks}
              label={label}
              onTap={(r) => { if (owned || inHand || !stand) tip(r); else onBuy(stand, r); }}
              onLong={(r) => tip(r)}
              onHover={(r) => tip(r, true)}
            />
          );
        })}
      </div>
    </div>
  );
}
