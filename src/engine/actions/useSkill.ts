/**
 * A hero uses one of its kit abilities: its skill, or its ultimate (the button
 * printed on its card). A hero uses one ability a turn, whichever it is, and
 * may still make the turn's attack after it from the Active slot. It is paid
 * for in souls first (`kitCost`: a skill's 1–3, an ultimate's 4, 8 or 12 by
 * size), one with an HP cost (`hpCost`) takes that off the hero too, and then
 * it goes on its cooldown (SKILL_COOLDOWN unless its data names one; an
 * ultimate ULT_COOLDOWN). `skillBlocked` (legality.ts) has already said it may
 * be done and at whom; this only does it.
 */
import type { AbilityId, CardInstance, GameState, PlayerID } from '../types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { abilityAim, chargedUlt, cooldownCut, findCardOnBoard, kitCost, resolveSkill, ultimateCard } from '../query';
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
  const ult = kind === 'ult';
  // An ultimate is named and drawn by its card; one no card carries goes by its hero.
  const faceId = ult ? ultimateCard(abilityId)?.id ?? hero.cardId : hero.cardId;

  // An ability that takes no target does not look at one.
  let target: CardInstance | undefined;
  const aim = abilityAim(G, pid, hero, ability);
  if (aim && aim.target !== 'noTarget' && targetIid) target = findCardOnBoard(G, targetIid)?.card;
  const souls = kitCost(hero, abilityId);

  // Headline log BEFORE the ability runs — the ability itself will emit
  // damage/status lines under this header, and the player sees who cast what.
  const heroName = data.name;
  const targetName = target ? cardName(target.cardId) : null;
  const on = targetName ? ` on ${targetName}` : '';
  const paid = souls > 0 ? ` (−${souls} soul${souls === 1 ? '' : 's'})` : '';
  pushLog(G, ult
    ? `P${pid} used ultimate: ${cardName(faceId)} (${heroName})${on}${paid}.`
    : `P${pid} used skill: ${heroName}${on}${paid}.`);

  // HP the ability costs comes straight off the caster: through no Shield or
  // resist, setting off no trigger, and `skillBlocked` has seen to it that the
  // hero has more than this, so it cannot be the death of it.
  if (ability.hpCost) {
    hero.hp -= ability.hpCost;
    pushLog(G, `${heroName} pays ${ability.hpCost} HP.`);
  }

  // Spent for the turn before it runs: the hero's one ability, remembered for
  // Echo Shard and the hero sheet; paid for, and on its cooldown.
  hero.skillUsedThisTurn = true;
  hero.lastSkillUsed = abilityId;
  payKit(G, pid, hero, abilityId);

  // Cast context: equipment triggers (Mystic Burst, Mystic Vulnerability,
  // Suppressor, Mystic Reverb) read this to know "bearer's skill damaged X".
  // The FX layer's cast event goes out first so the ability's effects read
  // as its own: flare on the hero, bolt to the target, then the impact.
  pushFx(G, { kind: 'cast', castKind: ult ? 'ult' : 'skill', by: pid, cardId: faceId, iid: hero.iid, targetIid: target?.iid });
  withCast(hero, ult ? 'ult' : 'skill', () => {
    ability.run(G, { movingPlayer: pid }, { source: hero, target });
  });
  // Worn reactions: Diviner's Kevlar after an ultimate, Surge of Power and
  // Mystic Burst after a skill.
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

/**
 * Pay for `hero`'s kit ability `abilityId` as it is used — from its button
 * (`useSkill`) or as an optional trigger (engine/prompts.ts): its souls
 * (`kitCost`) come off `pid`'s, it goes on its cooldown (a skill its own, or
 * SKILL_COOLDOWN; an ultimate ULT_COOLDOWN less what the hero wears takes
 * off, never under 1), and a charged ultimate's count starts over. Returns
 * the souls paid. The one place a kit ability is paid for.
 */
export function payKit(G: GameState, pid: PlayerID, hero: CardInstance, abilityId: AbilityId): number {
  const skill = resolveSkill(hero, abilityId);
  const souls = kitCost(hero, abilityId);
  G.players[pid].souls -= souls;
  (hero.cooldowns ??= {})[abilityId] = skill?.kind === 'ult'
    ? Math.max(1, ULT_COOLDOWN - cooldownCut(hero, 'ult'))
    : skill?.ability.cooldown ?? SKILL_COOLDOWN;
  if (chargedUlt(hero)?.id === abilityId && hero.tally?.[abilityId]) hero.tally[abilityId] = 0;
  return souls;
}
