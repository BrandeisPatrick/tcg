/**
 * What each seat did in the shop, read off the board rather than off G.log
 * (the log keeps only its last 200 lines). Make one per game and call
 * `observe` after every move: it compares the cards in each hand and the
 * items every hero wears (the Active, the bench, corpses and a merged Rem)
 * with the last read.
 *  - A card instance seen for the first time — in a hand, or worn — was
 *    bought (a Story reward in a hand at the start is in the first read, so
 *    it is no purchase). The hero it was bought for is the one it is first
 *    worn by. It was an upgrade when its play took the place of a component:
 *    the engine keeps that component on the new instance (`replaced`) for the
 *    rest of the turn it was bought on.
 *  - A card that goes from a hand to a hero was played.
 *  - A card that is gone, with no upgrade holding it, was sold. (The
 *    component an upgrade sold back on its own turn returns is no purchase.
 *    A component in the hand that an upgrade bought on an earlier turn
 *    consumes is held by nothing and reads as a sale: the AI never holds a
 *    card, so the sims never see one.)
 *  - An active whose own cooldown rose, or whose charges fell, was used: only
 *    using it does either (a purchase is a new instance; the turn's tick and
 *    Refresher only lower them).
 * The balance sim and the eval framework both keep one.
 */
import type { CardId, CardInstance, GameState, ItemTier, PlayerID, PlayerState } from '@/engine/types';
import { itemCard } from '@/cards';
import { heroesOf, itemCooldown, wornItems } from '@/engine/query';
import { round } from '@/engine/rounds';

const SEATS: readonly PlayerID[] = ['0', '1'];

/** Something that happened to one item. */
export interface ItemEvent {
  seat: PlayerID;
  item: CardId;
  /** The hero wearing it; for a purchase, the hero it was bought for. */
  hero: CardId;
  /** The round it happened in. A shop move or an active is used on the
   *  mover's own turn, whose number is the round's. */
  round: number;
}

export interface Purchase extends ItemEvent {
  tier: ItemTier;
  /** Souls paid: the price, or the difference for an upgrade. */
  paid: number;
  /** The component an upgrade took the place of when it was played. */
  upgradeOf?: CardId;
}

export interface Ledger {
  /** Items bought, in the order bought; an upgrade is one purchase of the
   *  item it became. A card still in its hand has `hero` ''. */
  readonly purchases: Purchase[];
  /** Cards played from a hand onto a hero. */
  readonly plays: ItemEvent[];
  readonly sales: ItemEvent[];
  /** Active items used, one entry per use. */
  readonly uses: ItemEvent[];
  /** Read the board after a move. */
  observe(G: GameState): void;
}

/** One card as a read finds it: in a hand (`hero` ''), or worn. */
interface Seen {
  seat: PlayerID;
  hero: CardId;
  item: CardId;
  cooldown: number;
  charges: number;
  paid: number;
  /** The iids of what its play consumed this turn (a component, and what that
   *  one settled in turn): kept on the upgrade for the rest of its turn. */
  held: string[];
}

/** The iids a card holds through `replaced`, all the way down. */
function heldBy(card: CardInstance): string[] {
  const out: string[] = [];
  for (let c = card.replaced; c; c = c.replaced) out.push(c.iid);
  return out;
}

function cardsNow(G: GameState): Map<string, Seen> {
  const out = new Map<string, Seen>();
  const read = (seat: PlayerID, hero: CardId, it: CardInstance) => {
    out.set(it.iid, { seat, hero, item: it.cardId, cooldown: itemCooldown(it), charges: it.charges ?? 0, paid: it.paid ?? 0, held: heldBy(it) });
  };
  for (const seat of SEATS) {
    for (const card of G.players[seat].hand ?? []) read(seat, '', card);
    for (const hero of heroesOf(G.players[seat])) for (const it of wornItems(hero)) read(seat, hero.cardId, it);
  }
  return out;
}

/** A ledger that starts from `G`: whatever is in a hand or worn there already
 *  (a scripted match's free cards) was not bought. */
export function shopLedger(G: GameState): Ledger {
  let last = cardsNow(G);
  const known = new Set(last.keys());
  /** Purchases whose card is still in its buyer's hand, by iid: the hero is filled in at the play. */
  const unplayed = new Map<string, Purchase>();
  const purchases: Purchase[] = [];
  const plays: ItemEvent[] = [];
  const sales: ItemEvent[] = [];
  const uses: ItemEvent[] = [];
  return {
    purchases,
    plays,
    sales,
    uses,
    observe(next: GameState) {
      const now = cardsNow(next);
      const at = round(next);
      const consumed = new Set<string>();
      for (const it of now.values()) for (const iid of it.held) consumed.add(iid);
      for (const [iid, it] of now) {
        const was = last.get(iid);
        if (!was && !known.has(iid)) {
          known.add(iid);
          const p: Purchase = { seat: it.seat, item: it.item, hero: it.hero, round: at, tier: itemCard(it.item)?.tier ?? 1, paid: it.paid };
          purchases.push(p);
          if (!it.hero) unplayed.set(iid, p);
        }
        if (it.hero && (!was || !was.hero) && (was || unplayed.has(iid))) {
          // From a hand onto a hero: a play. The purchase learns whom it was for, and what it took the place of.
          plays.push({ seat: it.seat, item: it.item, hero: it.hero, round: at });
          const p = unplayed.get(iid);
          if (p) {
            p.hero = it.hero;
            const component = it.held[0] ? last.get(it.held[0]) : undefined;
            if (component) p.upgradeOf = component.item;
            unplayed.delete(iid);
          }
        }
        if (was && was.hero && it.hero && (it.cooldown > was.cooldown || it.charges < was.charges)) {
          uses.push({ seat: it.seat, item: it.item, hero: it.hero, round: at });
        }
      }
      for (const [iid, was] of last) {
        if (!now.has(iid) && !consumed.has(iid)) {
          sales.push({ seat: was.seat, item: was.item, hero: was.hero, round: at });
          unplayed.delete(iid);
        }
      }
      last = now;
    },
  };
}

/** The items every hero of a side wears, all together, in board order. */
export function wornBySide(ps: PlayerState): CardId[] {
  return heroesOf(ps).flatMap((h) => wornItems(h).map((it) => it.cardId));
}
