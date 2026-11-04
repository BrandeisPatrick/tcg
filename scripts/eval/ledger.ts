/**
 * What each seat did in the shop, read off the board rather than off G.log
 * (the log keeps only its last 200 lines). Make one per game and call
 * `observe` after every move: it compares the items every hero wears (the
 * Active, the bench, corpses and a merged Rem) with the last read.
 *  - An item instance seen for the first time was bought. It was an upgrade
 *    when it took the place of a worn component: the engine keeps that
 *    component on the new instance (`replaced`) for the rest of the turn.
 *  - An item that is gone, with no upgrade in its place, was sold. (The
 *    component an upgrade sold back on its own turn returns is no purchase.)
 *  - An active whose own cooldown rose, or whose charges fell, was used: only
 *    using it does either (a purchase is a new instance; the turn's tick and
 *    Refresher only lower them).
 * The balance sim and the eval framework both keep one.
 */
import type { CardId, GameState, ItemTier, PlayerID, PlayerState } from '@/engine/types';
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
  /** The worn component an upgrade took the place of. */
  upgradeOf?: CardId;
}

export interface Ledger {
  /** Items bought, in the order bought; an upgrade is one purchase of the
   *  item it became. */
  readonly purchases: Purchase[];
  readonly sales: ItemEvent[];
  /** Active items used, one entry per use. */
  readonly uses: ItemEvent[];
  /** Read the board after a move. */
  observe(G: GameState): void;
}

/** One worn item as a read finds it. */
interface Worn {
  seat: PlayerID;
  hero: CardId;
  item: CardId;
  cooldown: number;
  charges: number;
  paid: number;
  /** The iid of the component an upgrade replaced this turn. */
  replaced?: string;
}

function wornNow(G: GameState): Map<string, Worn> {
  const out = new Map<string, Worn>();
  for (const seat of SEATS) {
    for (const hero of heroesOf(G.players[seat])) {
      for (const it of wornItems(hero)) {
        out.set(it.iid, {
          seat,
          hero: hero.cardId,
          item: it.cardId,
          cooldown: itemCooldown(it),
          charges: it.charges ?? 0,
          paid: it.paid ?? 0,
          replaced: it.replaced?.iid,
        });
      }
    }
  }
  return out;
}

/** A ledger that starts from `G`: whatever is worn there already (a scripted
 *  match's free items) was not bought. */
export function shopLedger(G: GameState): Ledger {
  let last = wornNow(G);
  const known = new Set(last.keys());
  const purchases: Purchase[] = [];
  const sales: ItemEvent[] = [];
  const uses: ItemEvent[] = [];
  return {
    purchases,
    sales,
    uses,
    observe(next: GameState) {
      const now = wornNow(next);
      const at = round(next);
      const upgraded = new Set<string>();
      for (const [iid, it] of now) {
        const was = last.get(iid);
        if (was) {
          if (it.cooldown > was.cooldown || it.charges < was.charges) uses.push({ seat: it.seat, item: it.item, hero: it.hero, round: at });
          continue;
        }
        if (known.has(iid)) continue;
        known.add(iid);
        const component = it.replaced ? last.get(it.replaced) : undefined;
        if (it.replaced) upgraded.add(it.replaced);
        purchases.push({
          seat: it.seat,
          item: it.item,
          hero: it.hero,
          round: at,
          tier: itemCard(it.item)?.tier ?? 1,
          paid: it.paid,
          ...(component ? { upgradeOf: component.item } : {}),
        });
      }
      for (const [iid, was] of last) {
        if (!now.has(iid) && !upgraded.has(iid)) sales.push({ seat: was.seat, item: was.item, hero: was.hero, round: at });
      }
      last = now;
    },
  };
}

/** The items every hero of a side wears, all together, in board order. */
export function wornBySide(ps: PlayerState): CardId[] {
  return heroesOf(ps).flatMap((h) => wornItems(h).map((it) => it.cardId));
}
