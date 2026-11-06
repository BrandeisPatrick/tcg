import { createContext } from 'react';
import type { CardData, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { activeSpi } from '@/abilities';
import { effectiveSpirit, isRespawning } from '@/engine/query';
import type { Scale } from './scaling';

/**
 * What a card's face says about its scaling numbers. An active item (a spell)
 * is scaled by your Active (`activeSpi`), an ultimate by its linked hero, a
 * hero card by the hero itself — so a printed "4" explains itself as "4 + your
 * Active's Spirit Power", and in a match, with "(2 now)" behind it.
 *
 * The board provides the live figure through this context; everywhere else
 * (the draft, the gallery, the Cards tab) there is none, and the explanation
 * is the formula alone. A hero in play never comes through here: the sheet
 * reads the hero itself (HeroDetailSheet).
 */
type LiveSpirit = (card: CardData) => number | undefined;

export const LiveScaleContext = createContext<LiveSpirit>(() => undefined);

/** Whose Spirit Power a card's numbers add, in the explanation's words. */
function whoScales(card: CardData): string {
  if (card.type === 'hero') return card.name;
  if (card.type === 'ultimate') return CARDS_BY_ID[card.linkedHero]?.name ?? 'its hero';
  return 'your Active';
}

/** The figures for the card face: the printed number stays, the explanation
 *  names whose power is added, and what it comes to now when the board knows. */
export function faceScale(card: CardData | undefined, live: LiveSpirit): Scale | undefined {
  if (!card) return undefined;
  return { who: whoScales(card), spirit: live(card), printed: true };
}

/** The live Spirit behind a card's numbers for this player, from the match
 *  state: their Active's for an active item, the linked hero's (if it stands
 *  on their board) for an ultimate. */
export function boardLiveSpirit(G: GameState, me: PlayerID): LiveSpirit {
  return (card) => {
    if (card.type === 'spell') return activeSpi(G, me);
    if (card.type === 'ultimate') {
      const ps = G.players[me];
      const hero = [ps.active, ...ps.bench].find((c) => c && c.cardId === card.linkedHero && !isRespawning(c));
      return hero ? effectiveSpirit(hero) : undefined;
    }
    return undefined;
  };
}
