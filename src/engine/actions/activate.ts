/**
 * A hero uses an active item it wears. It is the hero's one ability this turn
 * (shared with its skills and its ultimate); the item's onPlay abilities run
 * in a cast frame whose source is the bearer — its gear reacts to the damage,
 * and the FX leave from it — with the item's own targeting and effect, as its
 * card prints them ("your Active" is the player's Active). Afterwards the item
 * cools down (`activeCooldown`), or, hard crowd control, spends a charge.
 * `activateBlocked` (legality.ts) has already said it may be used and at whom;
 * this only does it.
 */
import type { CardInstance, GameState, PlayerID, SpellCard } from '../types';
import { cardName, itemCard } from '@/cards';
import { activeCooldown, findCardOnBoard, findWornItem } from '../query';
import { getAbility } from '../registry';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { nextActionId } from '../ids';
import { withCast } from '../castContext';
import { resolve } from '../death';

export function activate(G: GameState, pid: PlayerID, itemIid: string, targetIid?: string) {
  const { bearer, item } = findWornItem(G, itemIid, pid)!;
  const data = itemCard(item.cardId) as SpellCard;

  // What it lands on. An item that takes no target does not look at one.
  let target: CardInstance | undefined;
  const filter = getAbility(data.abilities[0])?.target ?? 'noTarget';
  if (filter !== 'noTarget' && targetIid) target = findCardOnBoard(G, targetIid)?.card;

  pushLog(G, `P${pid} used ${data.name} (${cardName(bearer.cardId)})${target ? ` on ${cardName(target.cardId)}` : ''}.`);

  // Spent for the turn before it runs: the bearer's one ability, which plate
  // the hero sheet marks USED.
  bearer.skillUsedThisTurn = true;
  bearer.lastSkillUsed = item.cardId;

  // The cast event goes out first, so the effects that follow read as this
  // item's: the bolt leaves the bearer, then the hits land.
  pushFx(G, { kind: 'cast', castKind: 'spell', by: pid, cardId: item.cardId, iid: bearer.iid, targetIid: target?.iid });
  withCast(bearer, 'spell', () => {
    for (const id of data.abilities) {
      const ability = getAbility(id);
      if (ability?.trigger === 'onPlay') ability.run(G, { movingPlayer: pid }, { source: item, target });
    }
  });

  // The cooldown starts once the effect is done, so a Refresher never resets
  // its own.
  if (data.hardCC) item.charges = Math.max(0, (item.charges ?? 0) - 1);
  else (item.cooldowns ??= {})[item.cardId] = activeCooldown(bearer, data.tier, data.cooldown);

  resolve(G);
  G.action = {
    id: nextActionId(G),
    kind: 'item',
    by: pid,
    cardId: item.cardId,
    state: 'begin',
  };
}
