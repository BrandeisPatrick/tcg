/**
 * A hero uses one of its kit abilities: a skill, its ultimate, or an ultimate
 * it has borrowed (Sinclair's copy). Abilities cost no souls. A hero uses one
 * ability a turn, whichever it is, and may still make the turn's attack after
 * it from the Active slot. A skill goes on its cooldown (SKILL_COOLDOWN unless
 * its data names one), an ultimate on ULT_COOLDOWN, a borrowed ultimate is
 * spent, and one with an HP cost (`hpCost`) takes it off the hero before it
 * runs. `skillBlocked` (legality.ts) has already said it may be done and at
 * whom; this only does it.
 */
import type { AbilityId, CardInstance, GameState, PlayerID } from '../types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { findCardOnBoard, resolveSkill, ultimateCard } from '../query';
import { SKILL_COOLDOWN, ULT_COOLDOWN } from '../constants';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { nextActionId } from '../ids';
import { withCast } from '../castContext';
import { fireTriggers } from '../triggers';
import { resolve } from '../death';

/** `skillId` names the ability; left out, it is the hero's first skill. */
export function useSkill(G: GameState, pid: PlayerID, heroIid: string, targetIid?: string, skillId?: AbilityId) {
  const hero = findCardOnBoard(G, heroIid)!.card;
  const data = CARDS_BY_ID[hero.cardId];
  const skill = resolveSkill(hero, skillId);
  if (data?.type !== 'hero' || !skill) return;
  const { id: abilityId, ability, kind } = skill;
  const ult = kind !== 'skill';
  // An ultimate is named and drawn by its card; one no card carries goes by its hero.
  const faceId = ult ? ultimateCard(abilityId)?.id ?? hero.cardId : hero.cardId;

  // An ability that takes no target does not look at one.
  let target: CardInstance | undefined;
  if (ability.target !== 'noTarget' && targetIid) target = findCardOnBoard(G, targetIid)?.card;

  // Headline log BEFORE the ability runs — the ability itself will emit
  // damage/status lines under this header, and the player sees who cast what.
  const heroName = data.name;
  const targetName = target ? cardName(target.cardId) : null;
  const on = targetName ? ` on ${targetName}` : '';
  pushLog(G, ult
    ? `P${pid} used ultimate: ${cardName(faceId)} (${heroName})${on}.`
    : `P${pid} used skill: ${heroName}${on}.`);

  // HP the ability costs comes straight off the caster: through no Shield or
  // resist, setting off no trigger, and `skillBlocked` has seen to it that the
  // hero has more than this, so it cannot be the death of it.
  if (ability.hpCost) {
    hero.hp -= ability.hpCost;
    pushLog(G, `${heroName} pays ${ability.hpCost} HP.`);
  }

  // Spent for the turn before it runs: the hero's one ability, remembered for
  // Echo Shard and the hero sheet. A skill and an ultimate go on their
  // cooldowns; a borrowed ultimate is used up.
  hero.skillUsedThisTurn = true;
  hero.lastSkillUsed = abilityId;
  if (kind === 'borrowed') hero.borrowedUlt = undefined;
  else (hero.cooldowns ??= {})[abilityId] = kind === 'ult' ? ULT_COOLDOWN : ability.cooldown ?? SKILL_COOLDOWN;

  // Cast context: equipment triggers (Mystic Burst, Mystic Vulnerability,
  // Suppressor, Mystic Reverb) read this to know "bearer's skill damaged X".
  // The FX layer's cast event goes out first so the ability's effects read
  // as its own: flare on the hero, bolt to the target, then the impact.
  pushFx(G, { kind: 'cast', castKind: ult ? 'ult' : 'skill', by: pid, cardId: faceId, iid: hero.iid, targetIid: target?.iid });
  withCast(hero, ult ? 'ult' : 'skill', () => {
    ability.run(G, { movingPlayer: pid }, { source: hero, target });
  });
  // Worn reactions: Diviner's Kevlar after an ultimate, Surge of Power and the
  // Cooldown family after a skill.
  fireTriggers(G, hero, ult ? 'onBearerUltCast' : 'onBearerSkillUsed', { reaction: true, movingPlayer: pid });
  resolve(G);
  G.action = {
    id: nextActionId(G),
    kind: ult ? 'ult' : 'skill',
    by: pid,
    cardId: faceId,
    state: 'begin',
    abilityId,
  };
}
