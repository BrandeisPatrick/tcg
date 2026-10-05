/**
 * A hero uses its skill. Costs SKILL_COST souls, once a turn per hero, and
 * gives up that hero's attack. `skillBlocked` (legality.ts) has already said it
 * may be done and at whom; this only does it.
 */
import type { CardInstance, GameState, PlayerID } from '../types';
import { CARDS_BY_ID } from '@/cards';
import { getAbility } from '../registry';
import { findCardOnBoard } from '../query';
import { SKILL_COST } from '../constants';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { nextActionId } from '../ids';
import { withCast } from '../castContext';
import { fireTriggers } from '../triggers';
import { resolve } from '../death';

export function useSkill(G: GameState, pid: PlayerID, heroIid: string, targetIid?: string) {
  const ps = G.players[pid];
  const hero = findCardOnBoard(G, heroIid)!.card;
  const data = CARDS_BY_ID[hero.cardId];
  if (data?.type !== 'hero' || !data.skill) return;
  const ability = getAbility(data.skill)!;

  // A skill that takes no target does not look at one.
  let target: CardInstance | undefined;
  if (ability.target !== 'noTarget' && targetIid) target = findCardOnBoard(G, targetIid)?.card;

  ps.souls -= SKILL_COST;

  // Headline log BEFORE the ability runs — the ability itself will emit
  // damage/status lines under this header, and the player sees who cast what.
  // Format mirrors playCard so CardPlayFlash can show the hero card the
  // same way it shows the spell/equipment card on play.
  const heroName = data.name;
  const targetName = target ? (CARDS_BY_ID[target.cardId]?.name ?? target.cardId) : null;
  pushLog(G, `P${pid} used skill: ${heroName}${targetName ? ` on ${targetName}` : ''}.`);

  // Cast context: equipment triggers (Mystic Burst, Mystic Vulnerability,
  // Suppressor, Mystic Reverb) read this to know "bearer's skill damaged X".
  // The FX layer's cast event goes out first so the skill's effects read
  // as its own: flare on the hero, bolt to the target, then the impact.
  pushFx(G, { kind: 'cast', castKind: 'skill', by: pid, cardId: hero.cardId, iid: hero.iid, targetIid: target?.iid });
  withCast(hero, 'skill', () => {
    ability.run(G, { movingPlayer: pid }, { source: hero, target });
  });
  // Spent for the turn: no second cast, and no attack from this hero.
  hero.skillUsedThisTurn = true;
  // Equipment reactive: Surge of Power fires after bearer used their skill.
  fireTriggers(G, hero, 'onBearerSkillUsed', { reaction: true, movingPlayer: pid });
  resolve(G);
  G.action = {
    id: nextActionId(G),
    kind: 'skill',
    by: pid,
    cardId: hero.cardId,
    state: 'begin',
  };
}
