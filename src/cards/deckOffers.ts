import type { CardId, DeckOffer } from '@/engine/types';

export type { DeckOffer };
import { CARDS_BY_ID, itemCard } from '@/cards';
import { READY_DECKS, type ReadyDeck } from './readyDecks';
import { deckFromBuilds, isLegalDeck } from './decks';

/**
 * The deck draft (Patrick, 2026-11-17): "We first draft hero, then we
 * transition to drafting deck … the system will recommend three decks based
 * on what we drafted." A deck no longer comes with heroes: the heroes come
 * from the hero draft, and then the side picks one of the decks offered for
 * them (`G.deckDraft`, answered by `chooseDeck`).
 *
 * The three offers: the two ready decks that fit the drafted heroes best
 * (`readyDeckFit`), and the deck made from the heroes' own builds, which
 * always fits. A legal deck the player saved in the Loadout is offered as a
 * fourth. Nothing here is random: the same heroes get the same offers.
 */
/** How many decks the draft recommends (the player's own saved deck comes beside them). */
export const DECK_OFFERS = 3;

type Lean = 'weapon' | 'spirit' | 'vitality';
const LEANS: readonly Lean[] = ['weapon', 'spirit', 'vitality'];
const LEAN_WORD: Record<Lean, string> = { weapon: 'guns', spirit: 'spirit', vitality: 'tanks' };

/** What a team grows into, by its heroes' level growth: Attack is the gun
 *  (Weapon items), Spirit the skills (Spirit items), HP the body (Vitality
 *  items). Shares that sum to 1. */
export function teamLean(heroIds: readonly CardId[]): Record<Lean, number> {
  const sum = { weapon: 0, spirit: 0, vitality: 0 };
  for (const id of heroIds) {
    const d = CARDS_BY_ID[id];
    if (d?.type !== 'hero') continue;
    sum.weapon += d.growth.atk;
    sum.spirit += d.growth.spirit;
    sum.vitality += d.growth.hp;
  }
  const total = sum.weapon + sum.spirit + sum.vitality || 1;
  return { weapon: sum.weapon / total, spirit: sum.spirit / total, vitality: sum.vitality / total };
}

/** A deck's items by shop slot: shares that sum to 1. */
export function deckLean(items: readonly CardId[]): Record<Lean, number> {
  const n = { weapon: 0, spirit: 0, vitality: 0 };
  for (const id of items) {
    const slot = itemCard(id)?.slot;
    if (slot && slot in n) n[slot as Lean] += 1;
  }
  const total = items.length || 1;
  return { weapon: n.weapon / total, spirit: n.spirit / total, vitality: n.vitality / total };
}

/** How well the ready deck `deck` fits the drafted heroes:
 *  - 3 for each drafted hero it was made for;
 *  - 1 for each item of it that a drafted hero's build lists;
 *  - up to 6 for the slot lean: its items' share by slot against what the
 *    heroes grow into (a gun team wants Weapon items). */
export function readyDeckFit(deck: ReadyDeck, heroIds: readonly CardId[], builds: readonly (readonly CardId[])[]): number {
  const madeFor = deck.heroes.filter((h) => heroIds.includes(h)).length;
  const wanted = new Set(builds.flat());
  const overlap = new Set(deck.items.filter((id) => wanted.has(id))).size;
  const team = teamLean(heroIds);
  const lean = deckLean(deck.items);
  const dot = LEANS.reduce((s, k) => s + team[k] * lean[k], 0);
  return 3 * madeFor + overlap + 6 * dot;
}

function names(ids: readonly CardId[]): string {
  const n = ids.map((id) => CARDS_BY_ID[id]?.name ?? id);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

function leanWord(lean: Record<Lean, number>): string {
  return LEAN_WORD[LEANS.reduce((a, b) => (lean[b] > lean[a] ? b : a))];
}

/** The decks offered for the drafted `heroIds` (with `builds`, each hero's
 *  build, in the same order): the two best-fitting ready decks, best first,
 *  then the builds deck; then `own`, the player's saved deck, when it is a
 *  legal one. */
export function deckOffers(heroIds: readonly CardId[], builds: readonly (readonly CardId[])[], own?: readonly CardId[]): DeckOffer[] {
  const ranked = READY_DECKS
    .map((deck, i) => ({ deck, i, fit: readyDeckFit(deck, heroIds, builds) }))
    .sort((a, b) => b.fit - a.fit || a.i - b.i)
    .slice(0, DECK_OFFERS - 1);
  const team = leanWord(teamLean(heroIds));
  const offers: DeckOffer[] = ranked.map(({ deck }) => {
    const madeFor = deck.heroes.filter((h) => heroIds.includes(h));
    const lean = leanWord(deckLean(deck.items));
    return {
      id: deck.id,
      name: deck.name,
      blurb: deck.blurb,
      items: [...deck.items],
      madeFor,
      why: madeFor.length > 0 ? `Made for ${names(madeFor)}` : lean === team ? `Built on ${lean}, like your heroes` : `Built on ${lean}`,
    };
  });
  offers.push({
    id: 'builds',
    name: 'Hero builds',
    blurb: "Each hero's own items, its build, read across: every hero's first item, then every hero's second.",
    items: deckFromBuilds(builds),
    madeFor: [...heroIds],
    why: 'Made from your heroes’ builds',
  });
  if (isLegalDeck(own)) {
    offers.push({
      id: 'own',
      name: 'Your deck',
      blurb: 'The deck you saved in the Loadout.',
      items: [...own],
      madeFor: [],
      why: 'Saved in your Loadout',
    });
  }
  return offers;
}
