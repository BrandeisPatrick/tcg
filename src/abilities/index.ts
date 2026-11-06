import type { GameState, CardInstance, DamageType, PlayerID, StatusId } from '@/engine/types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { CC_STATUSES, DEBUFF_IDS, STATUSES_BY_ID } from '@/statuses';
import { damageUnit, healUnit } from '@/engine/damage';
import { awardSouls, resolve } from '@/engine/death';
import { addStatus, cleanseDebuffs, grantExtraAttacks } from '@/engine/statusOps';
import {
  attackPower, findCardOnBoard, heroData, isBoss, isRespawning, isUntargetable, itemCooldown, itemResist, liveBoardCards, otherPlayer,
  effectiveSpirit, resolveSkill, seatOf, slottedHeroes, stepInCandidates, ultimateCard, wornActives, wornItems, type TargetFilter,
} from '@/engine/query';
import { pullToActive, swapIntoActive } from '@/engine/actions/board';
import { pushLog } from '@/engine/log';
import { getAbility, registerAbilities } from '@/engine/registry';
import { fireTriggers } from '@/engine/triggers';
import { withCast, currentCast } from '@/engine/castContext';
import { pushFx } from '@/engine/fx';

export type { TargetFilter };
export { getAbility };

// An EffectFn mutates G. It receives the source card (if any), the target (if any),
// and a params bag from the ability/card definition.
export type EffectFn = (
  G: GameState,
  ctx: { movingPlayer: PlayerID },
  args: { source?: CardInstance; target?: CardInstance; params?: Record<string, any> },
) => void;

export interface AbilityDef {
  id: string;
  trigger:
    | 'onPlay'
    | 'startOfTurn'
    | 'endOfTurn'
    | 'onAttack'
    | 'onDeath'
    | 'activate'
    | 'ongoing'
    // Equipment-only reactive triggers — fired by the engine, not the player.
    // The bearer carries the equipment; the helper passes `source: bearer` and
    // `target: the other unit involved` (the damaged enemy, the CC inflicter, etc.).
    | 'onBearerSkillDamage'    // bearer's skill landed damage on target
    | 'onBearerCCSuffered'     // bearer just gained Stun/Silence/Disarm/Sleep
    | 'onBearerSkillUsed'      // bearer used their skill (after run)
    | 'onBearerUltCast'        // bearer (or any ally hero) cast an ultimate
    | 'onBearerDamagedByBullet' // bearer just took bullet (attack-type) damage
    | 'onBearerDamagedBySpirit' // bearer just took spirit damage
    // bearer just took the Active slot by a move its player chose: a Retreat or
    // a card's swap (Warp Stone, Rescue Beam, Majestic Leap, Traveler) — never
    // a promotion off a fallen Active, nor a drag to the front by the rival.
    | 'onBearerStepIn';
  target: TargetFilter;
  prompt?: string;
  /** A hero skill's or passive's display name ("Frost Grenade"), printed on
   *  the card, the hero sheet and the skill flash. Spells, gear and ultimates
   *  are named by their card. */
  name?: string;
  /** A hero skill's or passive's card text: the mechanical sentence the hero
   *  card prints for it. Spells, gear and ultimates print their own card text. */
  text?: string;
  /** A hero skill only: own turns before it may be used again — 1 is every
   *  turn; absent reads as SKILL_COOLDOWN (1). Counted in
   *  `CardInstance.cooldowns`, ticked at the start of the owner's turn
   *  (docs/stats-model.md §1). An ultimate's is ULT_COOLDOWN. */
  cooldown?: number;
  /** A hero skill only: HP the caster pays to use it. The skill is blocked
   *  unless the caster has MORE than this (`skillBlocked`'s 'hp'), and the
   *  payment comes straight off its HP before the skill runs — through no Shield
   *  or resist, setting off no trigger, and never enough to kill. */
  hpCost?: number;
  /** If true, hero's spiritMod adds to the skill's damage/heal/effect magnitude as spirit-type damage. */
  scalesSpirit?: boolean;
  /** Base magnitude (dmg/heal/shield). Read by the AI heuristic as its
   *  proxy for how much an ability is worth (ai/heuristic.ts), and pinned
   *  by souls.spec / mystic-burst.spec. Not rendered anywhere. */
  base?: number;
  /** The caster is not a target of its own skill, whatever the filter says.
   *  (Rem's Lil Helpers merges her INTO an ally: aimed at herself it would do
   *  nothing and still spend her ability for the turn.) */
  excludeSelf?: boolean;
  run: EffectFn;

  // ----- Pure hooks -----
  // Optional readings the engine takes of a card that carries this ability
  // (see `abilitySources` in engine/query.ts). They only compute a number: no
  // mutation, no events, so a forecast can call them freely.

  /** A conditional bonus to the bearer's basic swing, read by `attackPower`
   *  with the bearer as it stands (Frenzy: +3 below half HP) and, for a swing
   *  at a known hero, the `target` it is aimed at (Fixation reads the stacks
   *  on it). The card face asks with no target. */
  attackBonus?: (self: CardInstance, target?: CardInstance) => { amount: number; label: string } | null;
  /** The bearer's basic attack may be aimed at any living enemy hero, not only
   *  the rival Active. Read by `hasReach`; `attackTargets` (legality.ts) builds
   *  the list of who it may swing at. */
  reach?: true;
  /** What damage the bearer takes after this ability's say, applied before
   *  any status (Vindicta's flight takes 1 off a bullet). */
  incoming?: (self: CardInstance, amount: number, type: DamageType) => number;
  /** How long a status lands for on the bearer (Superior Duration stretches
   *  its buffs). */
  buffDuration?: (self: CardInstance, statusId: StatusId, duration: number) => number;
  /** How long a debuff (a status whose `hvalue` is below 0) lands for on the
   *  bearer (Debuff Reducer shortens them). Read after `buffDuration`. */
  debuffDuration?: (self: CardInstance, statusId: StatusId, duration: number) => number;
  /** Souls off the bearer's Retreat while it stands in the Active slot (Sprint
   *  Boots: 1). Summed over what the hero leaving the slot carries by
   *  `retreatCost` (engine/legality.ts), never below 0. */
  retreatDiscount?: (self: CardInstance) => number;
  /** The bearer cannot be given this status (Enduring Speed: Rooted). Asked by
   *  `addStatus` before anything lands: a status the bearer resists is not
   *  applied, and the log says what turned it away. */
  resists?: (self: CardInstance, statusId: StatusId) => boolean;
  /** Ricochet the bearer's swing carries (the Ricochet item: 2). Summed with a
   *  `ricochet` status by `ricochetPower`, which the swing reads to bounce. */
  ricochet?: (self: CardInstance) => number;
  /** Own turns off the cooldowns the bearer starts: its ultimate's ('ult') or
   *  its active items' ('item') — the Cooldown family. Summed by `cooldownCut`;
   *  a cooldown never goes under 1. */
  cooldownCut?: (self: CardInstance, kind: 'ult' | 'item') => number;
  /** Resist the bearer has to a damage type while it wears this (Bullet and
   *  Spirit Resilience). `damageUnit` takes the larger of it and a resist status. */
  resist?: (self: CardInstance, type: DamageType) => number;
  /** Healing Boost the bearer has while it wears this (Healing Booster and
   *  Tempo). `healUnit` takes the larger of it and a Healing Boost status. */
  healingBoost?: (self: CardInstance) => number;
}

/** A hero's skill or passive: an AbilityDef that carries the `name` and `text`
 *  its hero card prints (`heroAbilities`, engine/query.ts, lists them). */
export type HeroAbilityDef = AbilityDef & { name: string; text: string };


// Helper: total spirit-stat bonus from the source (equipment + Spirit Power buff).
// Used by HERO skills where the source IS the casting hero.
function spi(source?: CardInstance): number {
  return source ? effectiveSpirit(source) : 0;
}

// Helper: spirit scaling sourced from the player's ACTIVE hero. Used by active
// items (spells, where `source` is the item itself, which has no spiritMod):
// "your Active" is the player's Active, whoever wears the item, and its spirit
// boosts the magnitude. Corpse active = no scaling.
export function activeSpi(G: GameState, pid: PlayerID): number {
  const a = G.players[pid].active;
  if (!a || isRespawning(a)) return 0;
  return effectiveSpirit(a);
}

// Helper: spirit scaling for ULTIMATES. An ultimate runs inside
// withCast(hero, 'ult', …), so the hero using it — its own, or Sinclair with a
// borrowed one — is the cast-context source: read its effective Spirit here so
// a spirit-built hero's ultimate scales (e.g. a Spirit Abrams).
function ultSpi(): number {
  const src = currentCast()?.source;
  return src ? effectiveSpirit(src) : 0;
}

// Helper: the hero an ultimate centred on its caster acts through (Dynamo
// channels, Mirage slips away). The hero using it — `source`, its own hero or
// Sinclair with a borrowed copy — when it stands on the mover's side; else the
// ultimate's own hero on that side, if one stands there (a handler run without
// a caster).
function ultCaster(G: GameState, pid: PlayerID, source: CardInstance | undefined, heroId: string): CardInstance | undefined {
  const ps = G.players[pid];
  const standing = (c: CardInstance | null | undefined): c is CardInstance => !!c && !isRespawning(c) && c.hp > 0;
  if (standing(source) && heroData(source) && source.ownerId === pid) return source;
  return [ps.active, ...ps.bench].find((c): c is CardInstance => standing(c) && c.cardId === heroId);
}

// Helper: the player's Active, if it is standing (a corpse on the respawn
// timer takes nothing). The "your Active gains …" spells aim here.
function standingActive(G: GameState, pid: PlayerID): CardInstance | undefined {
  const a = G.players[pid].active;
  return a && !isRespawning(a) && a.hp > 0 ? a : undefined;
}

// Helper: deal damage to all of a player's board cards
function eachBoard(G: GameState, pid: PlayerID, fn: (c: CardInstance) => void) {
  for (const c of liveBoardCards(G.players[pid])) fn(c);
  resolve(G);
}

// ----- Active items (spells) -----

// Tier 1. Heals are flat (Spirit Power scales spirit damage only).
const eff_healing_rite: AbilityDef = {
  id: 'eff_healing_rite', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Healing Rite — heal an ally for 2.',
  base: 2,
  run: (G, _ctx, { target }) => {
    if (target) healUnit(G, target, 2);
  },
};

// Canon Rusted Barrel reduces enemy fire rate → mapped to Weaken (-N Bullet Power).
const eff_rusted_barrel: AbilityDef = {
  id: 'eff_rusted_barrel', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Rusted Barrel — Weaken 2 on enemy Active for 2 turns.',
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'weapon_power_down', 2, 2);
  },
};

// Tier 2 spirit burst. 2 + Spirit since step 6's budget (docs/card-design.md):
// 4 + Spirit every second turn priced at four times its tier.
const eff_cold_front: AbilityDef = {
  id: 'eff_cold_front', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Cold Front — 2 spirit damage to enemy Active.',
  scalesSpirit: true, base: 2,
  run: (G, ctx, { target }) => {
    if (target) damageUnit(G, target, 2 + activeSpi(G, ctx.movingPlayer), 'spirit', 'Cold Front');
  },
};

// Canon Slowing Hex: slows + silences movement. TCG: Silence 1 turn.
const eff_slowing_hex: AbilityDef = {
  id: 'eff_slowing_hex', trigger: 'onPlay', target: 'enemyAny',
  prompt: 'Slowing Hex — Silence any enemy for 1 turn.',
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'silenced', 1, 1);
  },
};


// Canon Spirit Sap: reduces target's spirit resist. TCG: Spirit Vulnerable 2 for 2 turns.
const eff_spirit_sap: AbilityDef = {
  id: 'eff_spirit_sap', trigger: 'onPlay', target: 'enemyAny',
  prompt: 'Spirit Sap — Spirit Vulnerable 2 on any enemy for 2 turns.',
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'spirit_resist_down', 2, 2);
  },
};

// Tier 3 premium DoT.
const eff_decay: AbilityDef = {
  id: 'eff_decay', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Decay — apply Bleed 3 for 2 turns.',
  scalesSpirit: false, base: 3,
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'bleed', 3, 2);
  },
};

const eff_disarming_hex: AbilityDef = {
  id: 'eff_disarming_hex', trigger: 'onPlay', target: 'enemyAny',
  prompt: 'Disarming Hex — Disarm any enemy for 2 turns.',
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'disarm', 1, 2);
  },
};

// Short, sharp hard CC: a clean 1-turn stun (Cursed Relic is the long sister).
const eff_knockdown: AbilityDef = {
  id: 'eff_knockdown', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Knockdown — Stun the enemy Active for 1 turn.',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'stun', 1, 1);
  },
};

// ----- Control spell pack (canon active items → spells) -----

// Silence Wave (canon T3 spirit active, once named Silence Glyph — the card id
// keeps the old name so saved decks still load): damage + Silence the enemy
// Active 2 turns.
const eff_silence_glyph: AbilityDef = {
  id: 'eff_silence_glyph', trigger: 'onPlay', target: 'enemyActive',
  base: 2,
  scalesSpirit: true,
  run: (G, ctx, { target }) => {
    if (!target) return;
    damageUnit(G, target, 2 + activeSpi(G, ctx.movingPlayer), 'spirit');
    addStatus(G, target, 'silenced', 1, 2);
  },
};

// Cursed Relic (canon T4 spirit active, once named Curse — the id keeps the
// old name): long lockdown on one enemy hero, Active or bench —
// Silence (no skill) + Disarm (no attack) for 3 turns. On the Active it is
// dead weight that pressures a retreat (no forced swap); on the bench it shuts
// off a caster.
const eff_curse: AbilityDef = {
  id: 'eff_curse', trigger: 'onPlay', target: 'enemyHero',
  prompt: 'Cursed Relic — one enemy hero cannot use its skill or attack for 3 turns.',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'silenced', 1, 3);
    addStatus(G, target, 'disarm', 1, 3);
  },
};

// Dispel Magic (canon T3 vitality active, once named Debuff Remover — the id
// keeps the old name): purge an ally's debuffs and grant Shield 4; if it purged
// anything, the ally also heals 4 (canon: a heal when a debuff is removed).
const eff_debuff_remover: AbilityDef = {
  id: 'eff_debuff_remover', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Dispel Magic — cleanse an ally and shield it.',
  base: 4,
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (!t) return;
    const hadDebuff = t.statuses.some((st) => DEBUFF_IDS.has(st.id));
    cleanseDebuffs(t);
    addStatus(G, t, 'shield', 4, 999);
    if (hadDebuff) healUnit(G, t, 4, 'Dispel Magic');
  },
};

// Unstoppable (canon T4 vitality active): an ally gains Unstoppable for 1 turn
// (cleanses CC on apply; immune to damage + CC). Strong, so it is a tier 4
// price and a 3-turn cooldown.
const eff_unstoppable_cast: AbilityDef = {
  id: 'eff_unstoppable_cast', trigger: 'onPlay', target: 'allyHero',
  base: 1,
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (t) addStatus(G, t, 'unstoppable', 1, 1);
  },
};

// Echo Shard (canon: recast last ability): the active hero uses their skill
// AGAIN this turn — bypasses the one-ability-a-turn limit and the skill's
// cooldown, and re-fires onBearerSkillUsed so cast-payoff gear (Mystic Burst,
// Surge of Power) triggers a second time. Auto-targets to match the
// skill's filter (enemy Active for offense, the hero itself for buffs). Fizzles
// politely on a skill-less / passive hero. It repeats a skill, never an
// ultimate: after an ultimate it casts the hero's first skill.
const eff_echo_shard: AbilityDef = {
  id: 'eff_echo_shard', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx, _args) => {
    const ps = G.players[ctx.movingPlayer];
    const hero = ps.active;
    if (!hero || isRespawning(hero)) { pushLog(G, 'Echo Shard fizzled — no active hero.'); return; }
    const data = CARDS_BY_ID[hero.cardId];
    if (data?.type !== 'hero' || data.skills.length === 0) { pushLog(G, 'Echo Shard fizzled — hero has no skill.'); return; }
    // The skill it used this turn, again — else its first.
    const last = resolveSkill(hero, hero.lastSkillUsed);
    const skill = (last?.kind === 'skill' ? last : resolveSkill(hero))?.ability;
    if (!skill) { pushLog(G, 'Echo Shard fizzled.'); return; }
    const enemy = G.players[otherPlayer(ctx.movingPlayer)];
    let target: CardInstance | undefined;
    switch (skill.target) {
      case 'enemyActive': case 'enemyAny': case 'enemyHero': case 'anyBoard':
        target = enemy.active ?? undefined; break;
      case 'allyHero': case 'allyAny': case 'self':
        target = hero; break;
      default: target = undefined;
    }
    pushLog(G, `Echo Shard: ${data.name} casts ${skill.name ?? 'their skill'} again.`);
    withCast(hero, 'skill', () => skill.run(G, { movingPlayer: ctx.movingPlayer }, { source: hero, target }));
    fireTriggers(G, hero, 'onBearerSkillUsed', { reaction: true, movingPlayer: ctx.movingPlayer });
  },
};


// Bullet Resist is flat — Spirit Power scales spirit damage only.
const eff_cast_metal_skin: AbilityDef = {
  id: 'eff_cast_metal_skin', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Metal Skin — Bullet Resist 5 for 2 turns.',
  base: 5,
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'bullet_resist', 5, 2);
  },
};

// ----- Movement / protection / draw spells (canon active items) -----

// Guardian Ward (canon T2 vitality active): a barrier on an ally.
const eff_guardian_ward: AbilityDef = {
  id: 'eff_guardian_ward', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Guardian Ward — Shield 3 on an ally.',
  base: 3,
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'shield', 3, 999);
  },
};

// Warp Stone (canon T3 vitality active): a short teleport that leaves you with
// Bullet Resist. TCG: a bench ally swaps into the Active slot, free, and steps
// in with Bullet Resist 3 for 2 turns.
const eff_warp_stone: AbilityDef = {
  id: 'eff_warp_stone', trigger: 'onPlay', target: 'allyBench',
  prompt: 'Warp Stone — swap a bench ally into the Active slot.',
  base: 3,
  run: (G, ctx, { target }) => {
    if (!target) return;
    if (swapIntoActive(G, G.players[ctx.movingPlayer], target)) addStatus(G, target, 'bullet_resist', 3, 2);
  },
};

// Divine Barrier (canon T4 vitality active): purges every debuff but a stun and
// throws a barrier on the ally.
const eff_divine_barrier: AbilityDef = {
  id: 'eff_divine_barrier', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Divine Barrier — cleanse an ally (not Stun) and Shield it 4.',
  base: 4,
  run: (G, _ctx, { target }) => {
    if (!target) return;
    target.statuses = target.statuses.filter((st) => st.id === 'stun' || !DEBUFF_IDS.has(st.id));
    addStatus(G, target, 'shield', 4, 999);
  },
};

// Ethereal Shift (canon T4 spirit active): a moment out of reach, then a
// Spirit Power buff. TCG: Dome for 1 turn (no attack can target it) and
// Spirit Power +1 for 2 turns.
const eff_ethereal_shift: AbilityDef = {
  id: 'eff_ethereal_shift', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Ethereal Shift — an ally cannot be attacked for 1 turn.',
  base: 2,
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'dome', 1, 1);
    addStatus(G, target, 'spirit_power', 1, 2);
  },
};

// Phantom Strike (canon T4 vitality active): teleport onto an enemy, pull it
// down, hit it and disarm it. TCG: drag an enemy bench hero to the front, then
// deal 2 + Spirit spirit damage and Disarm it 1 turn.
const eff_phantom_strike: AbilityDef = {
  id: 'eff_phantom_strike', trigger: 'onPlay', target: 'enemyBench',
  prompt: 'Phantom Strike — drag an enemy bench hero to the front.',
  scalesSpirit: true, base: 2,
  run: (G, ctx, { target }) => {
    if (!target) return;
    const enemy = G.players[otherPlayer(ctx.movingPlayer)];
    if (!pullToActive(G, enemy, target)) return;
    damageUnit(G, target, 2 + activeSpi(G, ctx.movingPlayer), 'spirit', 'Phantom Strike');
    if (!isRespawning(target)) addStatus(G, target, 'disarm', 1, 1);
    resolve(G);
  },
};

// Vortex Web (canon T4 spirit active): a grenade that drags every enemy in and
// slows them. TCG: 2 + Spirit spirit damage to every enemy hero, Rooted 2 turns.
const eff_vortex_web: AbilityDef = {
  id: 'eff_vortex_web', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Vortex Web — hit and root every enemy.',
  scalesSpirit: true, base: 2,
  run: (G, ctx) => {
    const enemy = otherPlayer(ctx.movingPlayer);
    const dmg = 2 + activeSpi(G, ctx.movingPlayer);
    eachBoard(G, enemy, (c) => {
      damageUnit(G, c, dmg, 'spirit', 'Vortex Web');
      if (!isRespawning(c)) addStatus(G, c, 'rooted', 1, 2);
    });
  },
};

// Refresher (canon T4 spirit active): resets every cooldown. TCG: your
// Active's skills, its ultimate and the active items it wears come off
// cooldown (hard crowd control keeps its spent charges). Worn on the bench it
// readies the Active for this very turn; Refresher's own cooldown starts after
// it runs, so it never resets itself.
const eff_refresher: AbilityDef = {
  id: 'eff_refresher', trigger: 'onPlay', target: 'noTarget',
  prompt: "Refresher — your Active's cooldowns are reset.",
  base: 3,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (!mine) return;
    delete mine.cooldowns;
    for (const it of wornItems(mine)) delete it.cooldowns;
    pushLog(G, `${cardName(mine.cardId)}'s cooldowns are reset (Refresher).`);
  },
};

// Colossus (canon T4 vitality ACTIVE): grow huge — big resists, and nearby
// enemies are slowed. TCG: your Active gains Bullet + Spirit Resist 4 for 2
// turns, and the enemy Active is Rooted 1 turn.
const eff_colossus_cast: AbilityDef = {
  id: 'eff_colossus_cast', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Colossus — your Active gains Bullet and Spirit Resist 4.',
  base: 4,
  run: (G, ctx) => {
    const mine = G.players[ctx.movingPlayer].active;
    if (mine && !isRespawning(mine)) {
      addStatus(G, mine, 'bullet_resist', 4, 2);
      addStatus(G, mine, 'spirit_resist', 4, 2);
    }
    const theirs = G.players[otherPlayer(ctx.movingPlayer)].active;
    if (theirs && !isRespawning(theirs)) addStatus(G, theirs, 'rooted', 1, 1);
  },
};

// ----- More canon active items → spells (docs/card-design.md, 2026-10-30) -----

// Golden Goose Egg (canon T1 spirit active): the egg hatches into souls and a
// permanent stat. TCG: gain 2 souls, and your Active gains +1 max HP for good.
const eff_golden_goose_egg: AbilityDef = {
  id: 'eff_golden_goose_egg', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Golden Goose Egg — gain 2 souls; your Active gains +1 max HP.',
  base: 2,
  run: (G, ctx) => {
    awardSouls(G, ctx.movingPlayer, 2, 'Golden Goose Egg');
    const mine = standingActive(G, ctx.movingPlayer);
    if (!mine) return;
    mine.hpMax += 1;
    mine.hp += 1;
    pushLog(G, `${cardName(mine.cardId)} gains +1 max HP (Golden Goose Egg).`);
  },
};

// Grit (canon T1 vitality active): a quick barrier. TCG: your Active gains Shield 2.
const eff_grit: AbilityDef = {
  id: 'eff_grit', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Grit — your Active gains Shield 2.',
  base: 2,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (mine) addStatus(G, mine, 'shield', 2, 999);
  },
};

// Return Fire (canon T2 vitality active): shoots back at whoever hits you.
// TCG: your Active gains Return Fire 2 for 2 turns — an enemy swing that lands
// on it costs the attacker 2 bullet damage (damageUnit, engine/damage.ts).
const eff_return_fire: AbilityDef = {
  id: 'eff_return_fire', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Return Fire — your Active shoots back for 2 turns.',
  base: 2,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (mine) addStatus(G, mine, 'return_fire', 2, 2);
  },
};

// Fleetfoot (canon T2 weapon active): a sprint you can shoot out of. TCG: your
// Active gains Extra Attack 1 this turn and Swift — its Retreat this turn is
// free (before the attack, which ends the turn's play).
const eff_fleetfoot: AbilityDef = {
  id: 'eff_fleetfoot', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Fleetfoot — your Active gains Extra Attack 1 and a free Retreat this turn.',
  base: 1,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (!mine) return;
    grantExtraAttacks(mine, 1);
    pushLog(G, `${cardName(mine.cardId)} gains Extra Attack 1 (Fleetfoot).`);
    addStatus(G, mine, 'swift', 1, 1);
  },
};

// Split Shot (canon T2 weapon active): the shot fans out. TCG: your Active
// gains Ricochet 1 this turn — each of its swings that lands bounces for 1 to
// every other enemy hero, carrying the swing's on-hit debuffs (actions/attack.ts).
// Like Swift, `clearTurnFlags` sweeps it when the turn ends.
const eff_split_shot: AbilityDef = {
  id: 'eff_split_shot', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Split Shot — your Active gains Ricochet 1 this turn.',
  base: 1,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (mine) addStatus(G, mine, 'ricochet', 1, 1);
  },
};

// Blood Tribute (canon T3 weapon active): drains your health for fire rate.
// TCG: the price is paid in blood, so it costs 2 souls — your Active pays 3 HP
// (straight off, no trigger, never below 1) and gains Extra Attack 1 and +1
// Bullet Power this turn.
const eff_blood_tribute: AbilityDef = {
  id: 'eff_blood_tribute', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Blood Tribute — your Active pays 3 HP for Extra Attack 1 and +1 Bullet Power.',
  base: 1,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (!mine) return;
    const paid = Math.min(3, mine.hp - 1);
    if (paid > 0) {
      mine.hp -= paid;
      pushLog(G, `${cardName(mine.cardId)} pays ${paid} HP (Blood Tribute).`);
    }
    grantExtraAttacks(mine, 1);
    addStatus(G, mine, 'weapon_power', 1, 1);
  },
};

// Healing Nova (canon T3 vitality active): a heal pulse for you and nearby
// allies. TCG: heal every ally hero 5 (flat, like every heal).
const eff_healing_nova: AbilityDef = {
  id: 'eff_healing_nova', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Healing Nova — heal all allies 5.',
  base: 5,
  run: (G, ctx) => {
    for (const c of liveBoardCards(G.players[ctx.movingPlayer])) healUnit(G, c, 5, 'Healing Nova');
  },
};

// Rescue Beam (canon T3 vitality active): pulls an ally to safety and heals
// it. TCG: Warp Stone's defensive twin — a bench ally steps into your Active
// slot, and the Active it rescues heals 4 on the bench.
const eff_rescue_beam: AbilityDef = {
  id: 'eff_rescue_beam', trigger: 'onPlay', target: 'allyBench',
  prompt: 'Rescue Beam — swap a bench ally in; the hero it rescues heals 4.',
  base: 4,
  run: (G, ctx, { target }) => {
    if (!target) return;
    const ps = G.players[ctx.movingPlayer];
    const rescued = ps.active;
    if (rescued && swapIntoActive(G, ps, target)) healUnit(G, rescued, 4, 'Rescue Beam');
  },
};

// Fury Trance (canon T3 vitality active): more fire rate and spirit resist,
// but no abilities while it lasts. TCG: your Active gains Extra Attack 1 this
// turn and Spirit Resist 3 for 2 turns, and is Silenced for 2 turns.
const eff_fury_trance: AbilityDef = {
  id: 'eff_fury_trance', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Fury Trance — Extra Attack 1 and Spirit Resist 3, but Silenced.',
  base: 3,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (!mine) return;
    grantExtraAttacks(mine, 1);
    addStatus(G, mine, 'spirit_resist', 3, 2);
    addStatus(G, mine, 'silenced', 1, 2);
  },
};

// Alchemical Fire (canon T3 weapon active): a burning patch that strips
// bullet resist. TCG: 1 + Spirit spirit damage to every enemy hero, and Bullet
// Resist −2 on each for 2 turns — it sets up a gun team.
const eff_alchemical_fire: AbilityDef = {
  id: 'eff_alchemical_fire', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Alchemical Fire — burn every enemy and strip their bullet resist.',
  scalesSpirit: true, base: 1,
  run: (G, ctx) => {
    const dmg = 1 + activeSpi(G, ctx.movingPlayer);
    eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => {
      damageUnit(G, c, dmg, 'spirit', 'Alchemical Fire');
      if (!isRespawning(c)) addStatus(G, c, 'bullet_resist_down', 2, 2);
    });
  },
};

// Heroic Aura (canon T3 weapon active): an aura that speeds up your team's
// guns. TCG: every ally hero gains +2 Bullet Power and Bullet Resist 1 for 2 turns.
const eff_heroic_aura: AbilityDef = {
  id: 'eff_heroic_aura', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Heroic Aura — all allies gain +2 Bullet Power and Bullet Resist 1.',
  base: 1,
  run: (G, ctx) => {
    for (const c of liveBoardCards(G.players[ctx.movingPlayer])) {
      addStatus(G, c, 'weapon_power', 2, 2);
      addStatus(G, c, 'bullet_resist', 1, 2);
    }
  },
};

// Shadow Weave (canon T3 weapon active): stealth, then an ambush bonus — the
// gun twin of Ethereal Shift. TCG: your Active gains Dome for 1 turn (no
// attack can target it) and +2 Bullet Power for 2 turns.
const eff_shadow_weave: AbilityDef = {
  id: 'eff_shadow_weave', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Shadow Weave — your Active cannot be attacked for 1 turn and gains +2 Bullet Power.',
  base: 2,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (!mine) return;
    addStatus(G, mine, 'dome', 1, 1);
    addStatus(G, mine, 'weapon_power', 2, 2);
  },
};

// Infuser (canon T4 vitality active): a burst of spirit power and spirit
// lifesteal. TCG: your Active gains +3 Spirit Power for 2 turns and heals 3.
const eff_infuser: AbilityDef = {
  id: 'eff_infuser', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Infuser — your Active gains +3 Spirit Power and heals 3.',
  base: 3,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (!mine) return;
    addStatus(G, mine, 'spirit_power', 3, 2);
    healUnit(G, mine, 3, 'Infuser');
  },
};

// Arctic Blast (canon T4 spirit active): an ice blast that freezes, then
// slows. TCG: 2 + Spirit spirit damage to every enemy hero, then the enemy
// Active it hit — if it is still standing — is Stunned 1 turn.
const eff_arctic_blast: AbilityDef = {
  id: 'eff_arctic_blast', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Arctic Blast — hit every enemy and stun the enemy Active.',
  scalesSpirit: true, base: 2,
  run: (G, ctx) => {
    const enemy = otherPlayer(ctx.movingPlayer);
    const frozen = G.players[enemy].active;
    const dmg = 2 + activeSpi(G, ctx.movingPlayer);
    eachBoard(G, enemy, (c) => { damageUnit(G, c, dmg, 'spirit', 'Arctic Blast'); });
    if (frozen && !isRespawning(frozen) && frozen.hp > 0) addStatus(G, frozen, 'stun', 1, 1);
  },
};

// ----- Added 2026-11-03: the mobility active (docs/card-design.md) -----

// Majestic Leap (canon T3 vitality active): a launch into the air that lands
// you somewhere else. TCG: Warp Stone without the resist — your Active leaps
// back to the bench, free, and the bench ally you pick steps in.
const eff_majestic_leap: AbilityDef = {
  id: 'eff_majestic_leap', trigger: 'onPlay', target: 'allyBench',
  prompt: 'Majestic Leap — your Active leaps out; a bench ally steps in.',
  run: (G, ctx, { target }) => {
    if (target) swapIntoActive(G, G.players[ctx.movingPlayer], target);
  },
};

// ----- Equipment passive effects + on-attach -----

// Bullet / Spirit Resilience (canon T3 vitality): a resist of 2 while worn (the
// `resist` hook) and — as in Deadlock, where the item adds resist below 50%
// health — 2 more off each hit of that type while the bearer is below half HP
// (the `incoming` hook). Read off the item, so it moves and sells with it.
const belowHalf = (self: CardInstance) => self.hp < self.hpMax / 2;
const eff_bullet_resist: AbilityDef = {
  id: 'eff_bullet_resist', trigger: 'ongoing', target: 'self',
  base: 2,
  resist: (_self, type) => (type === 'attack' ? 2 : 0),
  incoming: (self, amount, type) => (type === 'attack' && belowHalf(self) ? Math.max(0, amount - 2) : amount),
  run: () => {},
};
const eff_spirit_resist: AbilityDef = {
  id: 'eff_spirit_resist', trigger: 'ongoing', target: 'self',
  base: 2,
  resist: (_self, type) => (type === 'spirit' ? 2 : 0),
  incoming: (self, amount, type) => (type === 'spirit' && belowHalf(self) ? Math.max(0, amount - 2) : amount),
  run: () => {},
};

// Healing chain: Extra Regen (+1 HP) → Healing Booster → Healing Tempo.
// Booster and Tempo give the bearer Healing Boost at escalating magnitudes
// while worn (the `healingBoost` hook): heals it receives and heals it casts.
const eff_healing_booster: AbilityDef = {
  id: 'eff_healing_booster', trigger: 'ongoing', target: 'self',
  base: 2,
  healingBoost: () => 2,
  run: () => {},
};
const eff_healing_tempo: AbilityDef = {
  id: 'eff_healing_tempo', trigger: 'ongoing', target: 'self',
  base: 4,
  healingBoost: () => 4,
  run: () => {},
};

// ----- Equipment reactive triggers -----

// Bullet Resist Shredder: bearer's attacks apply Bullet Vulnerable 1 for 2 turns
// (stored 2, it covers the target's turn and your next one).
const eff_bullet_resist_shredder_proc: AbilityDef = {
  id: 'eff_bullet_resist_shredder_proc', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'bullet_resist_down', 1, 2); },
};

// Restorative Shot: after bearer's basic attack, heal 1.
const eff_restorative_shot_proc: AbilityDef = {
  id: 'eff_restorative_shot_proc', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { source, target, params }) => {
    if (params?.bounce) return; // a self-heal: once a swing, not once a Ricochet bounce
    if (source) healUnit(G, source, 1, 'Restorative Shot', { tag: 'lifesteal', from: target });
  },
};

// Extra Regen: at the start of the bearer's turn, heal 1 (regen-over-time).
const eff_extra_regen_proc: AbilityDef = {
  id: 'eff_extra_regen_proc', trigger: 'startOfTurn', target: 'self',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 1, 'Extra Regen', { tag: 'regen' }); },
};

// Mystic Regeneration: after bearer's skill / spell / ult damages an enemy, heal 1.
const eff_mystic_regeneration_proc: AbilityDef = {
  id: 'eff_mystic_regeneration_proc', trigger: 'onBearerSkillDamage', target: 'self',
  run: (G, _ctx, { source, target }) => { if (source) healUnit(G, source, 1, 'Mystic Regeneration', { tag: 'lifesteal', from: target }); },
};

// Lifesteal family (canon Bullet/Spirit Lifesteal → Leech): the heal-2 tier-up
// of Restorative Shot (on attack) / Mystic Regeneration (on skill damage). The
// T4 Leech runs BOTH — its real canon build path is Bullet + Spirit Lifesteal.
const eff_bullet_lifesteal: AbilityDef = {
  id: 'eff_bullet_lifesteal', trigger: 'onAttack', target: 'self',
  base: 2,
  run: (G, _ctx, { source, target, params }) => {
    if (params?.bounce) return; // a self-heal (Leech's too): once a swing, not once a Ricochet bounce
    if (source) healUnit(G, source, 2, 'Bullet Lifesteal', { tag: 'lifesteal', from: target });
  },
};
const eff_spirit_lifesteal: AbilityDef = {
  id: 'eff_spirit_lifesteal', trigger: 'onBearerSkillDamage', target: 'self',
  base: 2,
  run: (G, _ctx, { source, target }) => { if (source) healUnit(G, source, 2, 'Spirit Lifesteal', { tag: 'lifesteal', from: target }); },
};

// Bullet Shield: after bearer takes bullet damage, gain Shield 2.
const eff_bullet_shield_proc: AbilityDef = {
  id: 'eff_bullet_shield_proc', trigger: 'onBearerDamagedByBullet', target: 'self',
  run: (G, _ctx, { source }) => { if (source) addStatus(G, source, 'shield', 2, 999); },
};

// Spirit Shield: after bearer takes spirit damage, gain Shield 2.
const eff_spirit_shield_proc: AbilityDef = {
  id: 'eff_spirit_shield_proc', trigger: 'onBearerDamagedBySpirit', target: 'self',
  run: (G, _ctx, { source }) => { if (source) addStatus(G, source, 'shield', 2, 999); },
};

// Cooldown family (canon Compress → Superior → Transcendent Cooldown): the
// bearer's ultimate, and from Superior up its active items, cool down faster
// (the `cooldownCut` hook, read when the cooldown starts; never under 1).
const eff_compress_cooldown: AbilityDef = {
  id: 'eff_compress_cooldown', trigger: 'ongoing', target: 'self',
  base: 2,
  cooldownCut: (_self, kind) => (kind === 'ult' ? 1 : 0),
  run: () => {},
};
const eff_superior_cooldown: AbilityDef = {
  id: 'eff_superior_cooldown', trigger: 'ongoing', target: 'self',
  base: 3,
  cooldownCut: () => 1,
  run: () => {},
};
const eff_transcendent_cooldown: AbilityDef = {
  id: 'eff_transcendent_cooldown', trigger: 'ongoing', target: 'self',
  base: 5,
  cooldownCut: (_self, kind) => (kind === 'ult' ? 2 : 1),
  run: () => {},
};

// Mystic Burst family: each time the bearer uses a skill, hit the enemy active
// with a flat burst of spirit damage (canon Mystic Burst). Runs in the proc
// cast-context so it doesn't re-fire the bearer's own skill-damage triggers,
// but still respects the enemy's resist / reactive spirit shield. Tiers 2 / 3.
function mysticBurst(amount: number, label: string): AbilityDef['run'] {
  return (G, ctx) => {
    const enemy = G.players[otherPlayer(ctx.movingPlayer)].active;
    if (enemy && (enemy.respawnTurnsLeft ?? 0) === 0) damageUnit(G, enemy, amount, 'spirit', label, { tag: 'burst' });
  };
}
const eff_mystic_burst_proc: AbilityDef = {
  id: 'eff_mystic_burst_proc', trigger: 'onBearerSkillUsed', target: 'enemyActive',
  base: 1, run: mysticBurst(1, 'Mystic Burst'),
};
// Tankbuster (canon T3 spirit, once named Improved Burst — the card id keeps the
// old name): a big ability hit deals extra damage that ignores spirit resist.
// TCG: when the bearer's skill / spell / ult deals 2 or more to an enemy, it
// takes 2 more as pure damage.
const eff_improved_burst_proc: AbilityDef = {
  id: 'eff_improved_burst_proc', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  base: 2,
  run: (G, _ctx, { target, params }) => {
    const amount = params?.amount as number | undefined;
    if (!target || isRespawning(target) || !amount || amount < 2) return;
    damageUnit(G, target, 2, 'pure', 'Tankbuster', { tag: 'burst' });
    resolve(G);
  },
};

// ----- Cast-payoff items (functionality tied to skill / ult activation) -----

// Surge of Power: after the bearer uses a skill, gain +2 Bullet Power through
// its next turn (weapon_power, duration 2). The hero who uses its skill gives
// up its attack this turn, so the surge has to outlast the turn to be swung
// with: skill now, the empowered attack next turn. Canon Surge of Power
// empowers you right after a cast.
const eff_surge_of_power: AbilityDef = {
  id: 'eff_surge_of_power', trigger: 'onBearerSkillUsed', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => { if (source) addStatus(G, source, 'weapon_power', 2, 2); },
};

// Diviner's Kevlar: after the bearer casts their ultimate, gain Shield 6 and
// +2 Spirit Power for 2 turns (canon: a barrier and spirit power on ult cast).
// Tied to ult activation (onBearerUltCast), not skill use.
const eff_diviners_kevlar: AbilityDef = {
  id: 'eff_diviners_kevlar', trigger: 'onBearerUltCast', target: 'self',
  base: 6,
  run: (G, _ctx, { source }) => {
    if (!source) return;
    addStatus(G, source, 'shield', 6, 999);
    addStatus(G, source, 'spirit_power', 2, 2);
  },
};


// Ricochet (canon T4 Weapon): bullets ricochet to nearby enemies. TCG: the
// keyword, Ricochet 2 while worn (the `ricochet` hook, read by `ricochetPower`):
// each swing that lands bounces for 2 to every other enemy hero and carries the
// swing's on-hit debuffs with it (actions/attack.ts). Nothing to fire.
const eff_ricochet: AbilityDef = {
  id: 'eff_ricochet', trigger: 'ongoing', target: 'self',
  base: 2,
  ricochet: () => 2,
  run: () => {},
};

// Burst Fire (canon T3 Weapon): a burst of extra shots — grants Extra Attack 1
// each turn. Stacks additively with Active Reload / Fixation.
const eff_burst_fire: AbilityDef = {
  id: 'eff_burst_fire', trigger: 'startOfTurn', target: 'self',
  run: (_G, _ctx, { source }) => { if (source) grantExtraAttacks(source, 1); },
};

// Mystic Reverb: canon delayed AoE echo on the struck enemy. TCG mapping: when
// the bearer's skill damages a target, apply a Reverb that detonates at the
// target's NEXT turn start for 50% of the damage dealt (delayed one turn).
// Needs the dealt amount, plumbed through the onBearerSkillDamage trigger.
const eff_mystic_reverb: AbilityDef = {
  id: 'eff_mystic_reverb', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  run: (G, _ctx, { target, params }) => {
    const amount = params?.amount as number | undefined;
    if (!target || !amount || amount <= 0) return;
    const echo = Math.floor(amount / 2);
    if (echo > 0) addStatus(G, target, 'reverb', echo, 1);
  },
};

// ----- Bullet-weapon offense + defensive tech (canon weapon/spirit items) -----

// Toxic Bullets (canon T3 weapon): attacks apply stacking Bleed, 2 a swing.
const eff_toxic_bullets: AbilityDef = {
  id: 'eff_toxic_bullets', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'bleed', 2, 2); },
};

// Tesla Bullets (canon T3 weapon): the shot "jumps" — chain 2 bullet damage to
// an enemy bench hero. Runs in proc cast-context so it doesn't re-fire onAttack.
// A hero an earlier bounce took down (0 HP, reaped when the attack resolves) is
// no jump.
const eff_tesla_bullets: AbilityDef = {
  id: 'eff_tesla_bullets', trigger: 'onAttack', target: 'self',
  base: 2,
  run: (G, _ctx, { source, params }) => {
    if (!source || params?.bounce) return; // a chain: once a swing, not once a Ricochet bounce
    const enemy = otherPlayer(seatOf(source));
    const jump = G.players[enemy].bench.find((b) => b && !isRespawning(b) && b.hp > 0);
    if (jump) damageUnit(G, jump, 2, 'attack', 'Tesla Bullets', { tag: 'tesla' });
  },
};

// Suppressor (canon T2 spirit): dealing skill damage reduces the target's fire
// rate → Weapon Power −1 for 2 turns (so it survives to their next attack).
const eff_suppressor: AbilityDef = {
  id: 'eff_suppressor', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'weapon_power_down', 1, 2); },
};

// Reactive Barrier (canon T2 vitality): gain a Shield when the bearer is CC'd.
const eff_reactive_barrier: AbilityDef = {
  id: 'eff_reactive_barrier', trigger: 'onBearerCCSuffered', target: 'self',
  base: 4,
  run: (G, _ctx, { source }) => { if (source) addStatus(G, source, 'shield', 4, 999); },
};

// ----- Premium T3/T4 gear -----

// Escalating Exposure (canon T4 spirit): bearer's skill damage stacks a Spirit
// Amp (Spirit Resist −) on the target, cap 3. The min(cap, cur+1) + addStatus
// (which takes the max) increments without a new stacking rule in addStatus.
const eff_escalating_exposure: AbilityDef = {
  id: 'eff_escalating_exposure', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    const cur = target.statuses.find((s) => s.id === 'spirit_resist_down')?.value ?? 0;
    addStatus(G, target, 'spirit_resist_down', Math.min(3, cur + 1), 2);
  },
};

// Inhibitor (T4 weapon): attacks suppress BOTH offense types — Bullet Power −1
// and Spirit Power −1 (refresh, 2 turns so it bites the enemy's next turn).
const eff_inhibitor: AbilityDef = {
  id: 'eff_inhibitor', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'weapon_power_down', 1, 2);
    addStatus(G, target, 'spirit_power_down', 1, 2);
  },
};

// Crippling Headshot (T4 weapon): +1 Bullet Power (on the card), and attacks
// apply Vulnerable — Bullet + Spirit Resist −2 (refresh, 2 turns).
const eff_crippling_headshot: AbilityDef = {
  id: 'eff_crippling_headshot', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'bullet_resist_down', 2, 2);
    addStatus(G, target, 'spirit_resist_down', 2, 2);
  },
};

// Berserker (T3 weapon): take bullet damage → gain +2 Bullet Power, cap +4.
// Stored as a weapon_power status (duration 999) so it clears on death.
const eff_berserker: AbilityDef = {
  id: 'eff_berserker', trigger: 'onBearerDamagedByBullet', target: 'self',
  run: (G, _ctx, { source }) => {
    if (!source) return;
    const cur = source.statuses.find((s) => s.id === 'weapon_power')?.value ?? 0;
    addStatus(G, source, 'weapon_power', Math.min(4, cur + 2), 999);
  },
};

// ----- Passive items moved from spells, and new passives -----

// Healbane (canon T2 vitality PASSIVE): your spirit damage cuts the target's
// healing. TCG: when the bearer's skill / spell / ult damages an enemy, it
// cannot be healed for 2 turns.
const eff_healbane: AbilityDef = {
  id: 'eff_healbane', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  base: 1,
  run: (G, _ctx, { target }) => { if (target && !isRespawning(target)) addStatus(G, target, 'healing_boost_down', 1, 2); },
};

// Active Reload (canon T2 weapon PASSIVE): a well-timed reload grants fire
// rate and bullet lifesteal. TCG: +1 Bullet Power (on the card) and heal 1
// after each attack.
const eff_active_reload: AbilityDef = {
  id: 'eff_active_reload', trigger: 'onAttack', target: 'self',
  base: 1,
  run: (G, _ctx, { source, target, params }) => {
    if (params?.bounce) return; // a self-heal: once a swing, not once a Ricochet bounce
    if (source) healUnit(G, source, 1, 'Active Reload', { tag: 'lifesteal', from: target });
  },
};

// Long Range (canon T2 weapon): bonus damage at range. TCG: the bearer's
// attack may be aimed at any living enemy hero (the `reach` hook).
const eff_long_range: AbilityDef = {
  id: 'eff_long_range', trigger: 'ongoing', target: 'self',
  base: 1,
  reach: true,
  run: () => {},
};

// Fortitude (canon T3 vitality): health and fast regeneration. TCG: +2 HP (on
// the card) and heal 2 at the start of your turn.
const eff_fortitude: AbilityDef = {
  id: 'eff_fortitude', trigger: 'startOfTurn', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 2, 'Fortitude', { tag: 'regen' }); },
};

// Frenzy (T4 weapon): while the bearer is below half HP, +3 Bullet Power (the
// attackBonus hook, read by attackPower) and heal 2 on attack.
const eff_frenzy: AbilityDef = {
  id: 'eff_frenzy', trigger: 'onAttack', target: 'self',
  base: 2,
  attackBonus: (self) => (self.hp < self.hpMax / 2 ? { amount: 3, label: 'Frenzy: +3 <½ HP' } : null),
  run: (G, _ctx, { source, target, params }) => {
    if (params?.bounce) return; // a self-heal: once a swing, not once a Ricochet bounce
    if (source && source.hp < source.hpMax / 2) healUnit(G, source, 2, 'Frenzy', { tag: 'lifesteal', from: target });
  },
};

// Superior Duration (T3 spirit): the bearer's own buffs last 2 turns longer.
// A pure hook, nothing to fire — `base: 0` keeps it worth nothing to the AI's
// equipment valuation, as it was when the card listed no abilities. Permanent
// buffs (duration 99+) are left alone.
const eff_superior_duration: AbilityDef = {
  id: 'eff_superior_duration', trigger: 'ongoing', target: 'self',
  base: 0,
  buffDuration: (_self, statusId, duration) =>
    (STATUSES_BY_ID[statusId]?.hvalue ?? 0) > 0 && duration < 99 ? duration + 2 : duration,
  run: () => {},
};

// Siphon Bullets (T4 weapon): attacks steal 1 max HP from the target to the
// bearer, TEMPORARILY — the siphon_drain / siphon_gain statuses revert the
// maxHP on expiry (tickStartOfTurn) and on death (killInPlace), so it's a
// 2-turn swing, not a permanent transfer. hvalue 0 → not cleansable.
const eff_siphon_bullets: AbilityDef = {
  id: 'eff_siphon_bullets', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { source, target }) => {
    // A corpse is neither robbed nor fed. A Ricochet bounce steals too: the
    // stolen HP is the swing's debuff, and spreads with it.
    if (!source || !target || isRespawning(source) || isRespawning(target)) return;
    const bump = (c: CardInstance, id: StatusId) => {
      let s = c.statuses.find((x) => x.id === id);
      if (!s) { s = { id, value: 0, duration: 2 }; c.statuses.push(s); }
      s.value += 1; s.duration = 2;
    };
    if (target.hpMax > 1) {
      target.hpMax -= 1;
      if (target.hp > target.hpMax) target.hp = target.hpMax;
      bump(target, 'siphon_drain');
      source.hpMax += 1;
      source.hp += 1; // fill the stolen HP
      bump(source, 'siphon_gain');
      const drain = target.statuses.find((x) => x.id === 'siphon_drain')!;
      const gain = source.statuses.find((x) => x.id === 'siphon_gain')!;
      const src = { iid: source.iid, cardId: source.cardId, owner: source.ownerId };
      pushFx(G, { kind: 'status', iid: target.iid, statusId: 'siphon_drain', value: drain.value, duration: 2, debuff: true, tag: 'siphon', source: src });
      pushFx(G, { kind: 'status', iid: source.iid, statusId: 'siphon_gain', value: gain.value, duration: 2, debuff: false, tag: 'siphon', source: src });
    }
  },
};

// ----- More canon passive items → equipment (docs/card-design.md, 2026-10-30) -----

// Headshot Booster (canon T1 weapon): the opening headshot hits harder. TCG:
// the bearer's swing at an enemy at full HP deals +2 (the attackBonus hook).
const eff_headshot_booster: AbilityDef = {
  id: 'eff_headshot_booster', trigger: 'ongoing', target: 'self',
  base: 1,
  attackBonus: (_self, target) => (target && target.hp >= target.hpMax ? { amount: 2, label: 'Headshot Booster: +2 at full HP' } : null),
  run: () => {},
};

// Spirit Strike (canon T1 spirit): bullets that cut spirit resist — the spirit
// twin of Bullet Resist Shredder. TCG: attacks apply Spirit Resist −1 for 2 turns.
const eff_spirit_strike: AbilityDef = {
  id: 'eff_spirit_strike', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { target }) => { if (target && !isRespawning(target)) addStatus(G, target, 'spirit_resist_down', 1, 2); },
};

// Mystic Vulnerability (canon T2 spirit): your spirit damage lowers the
// target's spirit resist — the cheap Escalating Exposure. TCG: when the bearer's
// skill / spell / ult damages an enemy, Spirit Resist −1 for 2 turns.
const eff_mystic_vulnerability: AbilityDef = {
  id: 'eff_mystic_vulnerability', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  run: (G, _ctx, { target }) => { if (target && !isRespawning(target)) addStatus(G, target, 'spirit_resist_down', 1, 2); },
};

// Mystic Slow (canon T2 spirit): spirit damage slows. TCG: when the bearer's
// skill / spell / ult damages an enemy, it is Rooted for 1 turn (no retreat).
const eff_mystic_slow: AbilityDef = {
  id: 'eff_mystic_slow', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  run: (G, _ctx, { target }) => { if (target && !isRespawning(target)) addStatus(G, target, 'rooted', 1, 1); },
};

// Slowing Bullets (canon T2 weapon): bullets slow — the gun version of Mystic
// Slow. TCG: the bearer's attacks Root the target for 1 turn.
const eff_slowing_bullets: AbilityDef = {
  id: 'eff_slowing_bullets', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { target }) => { if (target && !isRespawning(target)) addStatus(G, target, 'rooted', 1, 1); },
};

// Debuff Reducer (canon T2 vitality): shortens every negative effect on you.
// TCG: a debuff on the bearer lands 1 turn shorter, never under 1 (the
// debuffDuration hook). Permanent marks (99+) are left alone, and so are the
// debuffs whose expiry is the payload — a shorter Charged, Djinn's Mark or
// Reverb would only go off sooner.
const GOES_OFF_ON_EXPIRY: ReadonlySet<StatusId> = new Set(['charged', 'djinns_mark', 'reverb']);
const eff_debuff_reducer: AbilityDef = {
  id: 'eff_debuff_reducer', trigger: 'ongoing', target: 'self',
  base: 1,
  debuffDuration: (_self, statusId, duration) =>
    duration < 99 && !GOES_OFF_ON_EXPIRY.has(statusId) ? Math.max(1, duration - 1) : duration,
  run: () => {},
};

// Spirit Snatch (canon T3 spirit): steals spirit power from the hero you hit.
// TCG: when the bearer's skill / spell / ult damages an enemy, it gets Spirit
// Power −1 and the bearer +1 Spirit Power, both for 2 turns.
const eff_spirit_snatch: AbilityDef = {
  id: 'eff_spirit_snatch', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  base: 1,
  run: (G, _ctx, { source, target }) => {
    if (!source || !target || isRespawning(target)) return;
    addStatus(G, target, 'spirit_power_down', 1, 2);
    addStatus(G, source, 'spirit_power', 1, 2);
  },
};

// Spiritual Overflow (canon T4 weapon): shooting heroes charges up spirit
// power — a gun-to-spirit bridge. TCG: after each swing, +1 Spirit Power for 2
// turns (stacking like Berserker, up to +3) and heal 1.
const eff_spiritual_overflow: AbilityDef = {
  id: 'eff_spiritual_overflow', trigger: 'onAttack', target: 'self',
  base: 1,
  run: (G, _ctx, { source, target, params }) => {
    if (params?.bounce) return; // the bearer's own charge and heal: once a swing, not once a Ricochet bounce
    if (!source || isRespawning(source)) return;
    const cur = source.statuses.find((st) => st.id === 'spirit_power')?.value ?? 0;
    addStatus(G, source, 'spirit_power', Math.min(3, cur + 1), 2);
    healUnit(G, source, 1, 'Spiritual Overflow', { tag: 'lifesteal', from: target });
  },
};

// ----- Added 2026-11-03: the mobility passives (docs/card-design.md) -----

// Sprint Boots (canon T1 vitality): faster on your feet. TCG: the bearer's
// Retreat costs 1 soul less (the retreatDiscount hook).
const eff_sprint_boots: AbilityDef = {
  id: 'eff_sprint_boots', trigger: 'ongoing', target: 'self',
  base: 1,
  retreatDiscount: () => 1,
  run: () => {},
};

// Enduring Speed (canon T2 vitality): more speed, and slows do not hold you.
// TCG: the bearer's Retreat costs 1 less, and it cannot be Rooted (the resists
// hook turns the status away before it lands).
const eff_enduring_speed: AbilityDef = {
  id: 'eff_enduring_speed', trigger: 'ongoing', target: 'self',
  base: 2,
  retreatDiscount: () => 1,
  resists: (_self, statusId) => statusId === 'rooted',
  run: () => {},
};

// Kinetic Dash (canon T2 weapon): a dash that loads the gun. TCG: when the
// bearer steps into the Active slot by a Retreat or a swap (onBearerStepIn),
// +3 Bullet Power this turn — the hero who comes in to make the attack hits harder.
const eff_kinetic_dash: AbilityDef = {
  id: 'eff_kinetic_dash', trigger: 'onBearerStepIn', target: 'self',
  base: 3,
  run: (G, _ctx, { source }) => {
    if (source && !isRespawning(source)) addStatus(G, source, 'weapon_power', 3, 1);
  },
};

// ----- Added 2026-11-05: the full shop (docs/card-design.md) -----
// The canon items step 6 brought in, each translated with the families above:
// a swing bonus read off the bearer or its target (attackBonus), a resist or a
// cut to what it takes while worn, an on-hit or on-cast proc, a turn-edge
// trigger, or a cast effect on the existing targets. The numbers come from the
// budget written beside each card in docs/card-design.md.

/** Above half its max HP: the board's one HP line, where Deadlock's items read 65%. */
const aboveHalf = (c: CardInstance) => c.hp > c.hpMax / 2;

/** The hit that just landed found its target at full HP: what is left of the
 *  target's HP plus the damage the hit dealt (`amount`, which the swing hands
 *  the attacker's on-hit gear) comes to its max. */
const wasAtFull = (target: CardInstance, dealt: unknown) =>
  typeof dealt === 'number' && target.hp + dealt >= target.hpMax;

/** 1 spirit damage on the target of each swing (not a Ricochet bounce): a
 *  bullet that carries spirit (Mystic Shot, Mercurial Magnum). */
function spiritShot(label: string): AbilityDef['run'] {
  return (G, _ctx, { target, params }) => {
    if (params?.bounce || !target || isRespawning(target) || target.hp <= 0) return;
    damageUnit(G, target, 1, 'spirit', label, { tag: 'burst' });
  };
}

// Monster Rounds (canon T1 weapon): more damage to NPCs, and regeneration out
// of combat. TCG: the board's one NPC is the Mid-Boss, so the bearer's swing at
// it deals +1; out of combat is the bench, where it heals 1 at the start of
// your turn.
const eff_monster_rounds: AbilityDef = {
  id: 'eff_monster_rounds', trigger: 'startOfTurn', target: 'self',
  base: 1,
  attackBonus: (_self, target) => (target && isBoss(target) ? { amount: 1, label: 'Monster Rounds: +1 vs the Mid-Boss' } : null),
  run: (G, _ctx, { source }) => {
    if (source && source.zone === 'bench') healUnit(G, source, 1, 'Monster Rounds', { tag: 'regen' });
  },
};

// Intensifying Magazine (canon T2 weapon): weapon damage climbs while you keep
// firing. TCG: each swing (not a bounce) adds +1 Bullet Power for 2 turns, up
// to +2, so a hero that keeps shooting keeps the bonus.
const eff_intensifying_magazine: AbilityDef = {
  id: 'eff_intensifying_magazine', trigger: 'onAttack', target: 'self',
  base: 1,
  run: (G, _ctx, { source, params }) => {
    if (!source || params?.bounce || isRespawning(source)) return;
    const cur = source.statuses.find((s) => s.id === 'weapon_power')?.value ?? 0;
    addStatus(G, source, 'weapon_power', Math.min(2, cur + 1), 2);
  },
};

// Mystic Shot (canon T2 weapon): the next bullet carries bonus spirit damage.
// TCG: after each swing, its target takes 1 spirit damage.
const eff_mystic_shot: AbilityDef = {
  id: 'eff_mystic_shot', trigger: 'onAttack', target: 'self',
  base: 1,
  run: spiritShot('Mystic Shot'),
};

// Opening Rounds (canon T2 weapon): more weapon damage against an enemy above
// half health. TCG: +2 on a swing at an enemy above half HP (the attackBonus
// hook reads the target).
const eff_opening_rounds: AbilityDef = {
  id: 'eff_opening_rounds', trigger: 'ongoing', target: 'self',
  base: 2,
  attackBonus: (_self, target) => (target && aboveHalf(target) ? { amount: 2, label: 'Opening Rounds: +2 above half HP' } : null),
  run: () => {},
};

// Spirit Shredder (canon T2 weapon): bullets cut spirit resist and give spirit
// lifesteal against the hero they cut. TCG: attacks apply Spirit Resist −2 for
// 2 turns, and the bearer's skill / spell / ult damage to an enemy so marked
// heals it 1.
const eff_spirit_shredder: AbilityDef = {
  id: 'eff_spirit_shredder', trigger: 'onAttack', target: 'self',
  base: 2,
  run: (G, _ctx, { target }) => { if (target && !isRespawning(target)) addStatus(G, target, 'spirit_resist_down', 2, 2); },
};
const eff_spirit_shredder_drain: AbilityDef = {
  id: 'eff_spirit_shredder_drain', trigger: 'onBearerSkillDamage', target: 'self',
  base: 1,
  run: (G, _ctx, { source, target }) => {
    if (source && target && target.statuses.some((s) => s.id === 'spirit_resist_down')) {
      healUnit(G, source, 1, 'Spirit Shredder', { tag: 'lifesteal', from: target });
    }
  },
};

// Stalker (canon T2 weapon): weapon damage up close opens a wound that deals
// damage over time and lowers bullet resist. TCG: attacks apply Bleed 1
// (stacks, max 3) and Bullet Resist −1, both for 2 turns.
const eff_stalker: AbilityDef = {
  id: 'eff_stalker', trigger: 'onAttack', target: 'self',
  base: 1,
  run: (G, _ctx, { target }) => {
    if (!target || isRespawning(target)) return;
    addStatus(G, target, 'bleed', 1, 2);
    addStatus(G, target, 'bullet_resist_down', 1, 2);
  },
};

// Weakening Headshot (canon T2 weapon): a headshot lowers bullet resist. TCG:
// the headshot is the swing at an enemy at full HP (as on Headshot Booster),
// read after the hit from the damage it dealt: Bullet Resist −2 for 2 turns.
const eff_weakening_headshot: AbilityDef = {
  id: 'eff_weakening_headshot', trigger: 'onAttack', target: 'self',
  base: 2,
  run: (G, _ctx, { target, params }) => {
    if (target && !isRespawning(target) && wasAtFull(target, params?.amount)) addStatus(G, target, 'bullet_resist_down', 2, 2);
  },
};

// Ballistic Enchantment (canon T3 weapon): damage from the imbued ability
// grants weapon damage for each hero it hits. TCG: each enemy the bearer's
// skill / spell / ult damages gives it +2 Bullet Power for 2 turns, up to +4.
const eff_ballistic_enchantment: AbilityDef = {
  id: 'eff_ballistic_enchantment', trigger: 'onBearerSkillDamage', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => {
    if (!source || isRespawning(source)) return;
    const cur = source.statuses.find((s) => s.id === 'weapon_power')?.value ?? 0;
    addStatus(G, source, 'weapon_power', Math.min(4, cur + 2), 2);
  },
};

// Escalating Resilience (canon T3 weapon): bullets that hit a hero grant
// stacking bullet resist. TCG: +2 Bullet Power (on the card), and after each
// swing (not a bounce) Bullet Resist +1 for 2 turns, up to 3.
const eff_escalating_resilience: AbilityDef = {
  id: 'eff_escalating_resilience', trigger: 'onAttack', target: 'self',
  base: 1,
  run: (G, _ctx, { source, params }) => {
    if (!source || params?.bounce || isRespawning(source)) return;
    const cur = source.statuses.find((s) => s.id === 'bullet_resist')?.value ?? 0;
    addStatus(G, source, 'bullet_resist', Math.min(3, cur + 1), 2);
  },
};

// Express Shot (canon T3 weapon): the next attack fires twice. TCG: +1 Bullet
// Power (on the card), and a swing that leaves its target above half HP fires
// again. The Extra Attack it grants on the turn's first swing rides on that
// attack (actions/attack.ts counts them after the first swing; what a later
// swing grants is swept with the rest), so it is once an attack. Not on a
// bounce, nor in an ultimate's volley: no turn's attack is under way then.
const eff_express_shot: AbilityDef = {
  id: 'eff_express_shot', trigger: 'onAttack', target: 'self',
  base: 2,
  run: (G, _ctx, { source, target, params }) => {
    if (!source || !target || params?.bounce || !G.attackUsed || isRespawning(source)) return;
    if (isRespawning(target) || !aboveHalf(target)) return;
    grantExtraAttacks(source, 1);
  },
};

// Headhunter (canon T3 weapon): the next headshot on a hero deals bonus damage
// and heals you. TCG: the headshot is the swing at an enemy at full HP: +3 on
// it (the attackBonus hook), and that swing heals the bearer 2 (read after the
// hit from the damage it dealt).
const eff_headhunter: AbilityDef = {
  id: 'eff_headhunter', trigger: 'onAttack', target: 'self',
  base: 3,
  attackBonus: (_self, target) => (target && target.hp >= target.hpMax ? { amount: 3, label: 'Headhunter: +3 at full HP' } : null),
  run: (G, _ctx, { source, target, params }) => {
    if (!source || !target || params?.bounce) return;
    if (wasAtFull(target, params?.amount)) healUnit(G, source, 2, 'Headhunter', { tag: 'lifesteal', from: target });
  },
};

// Hollow Point (canon T3 weapon): above 65% health, more weapon damage and
// bullets that cut bullet resist. TCG: while the bearer is above half HP, +2 on
// its swing (the attackBonus hook), and its attacks apply Bullet Resist −1 for
// 2 turns.
const eff_hollow_point: AbilityDef = {
  id: 'eff_hollow_point', trigger: 'onAttack', target: 'self',
  base: 2,
  attackBonus: (self) => (aboveHalf(self) ? { amount: 2, label: 'Hollow Point: +2 above half HP' } : null),
  run: (G, _ctx, { source, target }) => {
    if (source && target && !isRespawning(target) && aboveHalf(source)) addStatus(G, target, 'bullet_resist_down', 1, 2);
  },
};

// Hunter's Aura (canon T3 weapon): nearby enemies lose bullet resist and fire
// rate. TCG: at the start of your turn every enemy hero gets Bullet Resist −1
// and Bullet Power −1 for 2 turns, renewed each turn the bearer stands.
const eff_hunters_aura: AbilityDef = {
  id: 'eff_hunters_aura', trigger: 'startOfTurn', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => {
    if (!source || isRespawning(source)) return;
    for (const c of liveBoardCards(G.players[otherPlayer(seatOf(source))])) {
      if (!heroData(c)) continue;
      addStatus(G, c, 'bullet_resist_down', 1, 2);
      addStatus(G, c, 'weapon_power_down', 1, 2);
    }
  },
};

// Sharpshooter (canon T3 weapon): more weapon damage beyond a minimum distance,
// and more range. TCG: Long Range's reach (the bearer's attack may aim at any
// enemy hero), and +3 on a swing at a bench hero, the far target.
const eff_sharpshooter: AbilityDef = {
  id: 'eff_sharpshooter', trigger: 'ongoing', target: 'self',
  base: 2,
  reach: true,
  attackBonus: (_self, target) => (target && target.zone === 'bench' ? { amount: 3, label: 'Sharpshooter: +3 at range' } : null),
  run: () => {},
};

// Spirit Rend (canon T3 weapon): Spirit Shredder's cut, deeper with each hit,
// and spirit lifesteal against the hero it marks. TCG: attacks apply Spirit
// Resist −1 (stacks, max 3) for 2 turns, and the bearer's skill / spell / ult
// damage to an enemy so marked heals it 2.
const eff_spirit_rend: AbilityDef = {
  id: 'eff_spirit_rend', trigger: 'onAttack', target: 'self',
  base: 1,
  run: (G, _ctx, { target }) => {
    if (!target || isRespawning(target)) return;
    const cur = target.statuses.find((s) => s.id === 'spirit_resist_down')?.value ?? 0;
    addStatus(G, target, 'spirit_resist_down', Math.min(3, cur + 1), 2);
  },
};
const eff_spirit_rend_drain: AbilityDef = {
  id: 'eff_spirit_rend_drain', trigger: 'onBearerSkillDamage', target: 'self',
  base: 2,
  run: (G, _ctx, { source, target }) => {
    if (source && target && target.statuses.some((s) => s.id === 'spirit_resist_down')) {
      healUnit(G, source, 2, 'Spirit Rend', { tag: 'lifesteal', from: target });
    }
  },
};

/** A piercing swing's lift (the attackBonus hook, labelled for the item): what
 *  the hero it is aimed at would take off it with its Bullet Resist and its
 *  Shield, so it lands whole. Nothing against the Mid-Boss. */
function throughArmour(label: string): NonNullable<AbilityDef['attackBonus']> {
  return (_self, target) => {
    if (!target || isBoss(target)) return null;
    const resist = Math.max(target.statuses.find((s) => s.id === 'bullet_resist')?.value ?? 0, itemResist(target, 'attack'));
    const shred = target.statuses.find((s) => s.id === 'bullet_resist_down')?.value ?? 0;
    const shield = target.statuses.find((s) => s.id === 'shield')?.value ?? 0;
    const through = Math.max(0, resist - shred) + shield;
    return through > 0 ? { amount: through, label } : null;
  };
}

/** A piercing swing's follow-through: the first enemy bench hero behind the
 *  target takes the swing too, dealt in the proc's frame (the item's `label`),
 *  so no gear fires on it and it does not bounce. Not on a bounce, nor in an
 *  ultimate's volley, which reaches every hero already. */
function pierceBehind(label: string): AbilityDef['run'] {
  return (G, _ctx, { source, target, params }) => {
    if (!source || !target || params?.bounce || !G.attackUsed || isRespawning(source)) return;
    const behind = G.players[otherPlayer(seatOf(source))].bench
      .find((b) => !!b && b !== target && !isRespawning(b) && b.hp > 0 && !isUntargetable(b, 'attack'));
    if (!behind) return;
    const power = attackPower(source, behind).total;
    if (power > 0) damageUnit(G, behind, power, 'attack', label, { tag: 'ricochet' });
  };
}

// Armor Piercer (canon T4 weapon): bullets that pierce through enemies and
// ignore bullet resist. TCG: +2 Bullet Power (on the card). A swing at a hero
// is raised by what its Bullet Resist and Shield would take off (the
// attackBonus hook), so it lands whole, and the first enemy bench hero behind
// the target takes the swing too (`throughArmour`, `pierceBehind`).
const eff_armor_piercer: AbilityDef = {
  id: 'eff_armor_piercer', trigger: 'onAttack', target: 'self',
  base: 3,
  attackBonus: throughArmour('Armor Piercer: through armour'),
  run: pierceBehind('Armor Piercer'),
};

// Silencer (canon T4 weapon): bullets build up to a Silence. TCG: +5 Bullet
// Power (on the card), Spirit Resist 2 while worn (the resist hook), and each
// swing Silences its target for 2 turns.
const eff_silencer: AbilityDef = {
  id: 'eff_silencer', trigger: 'onAttack', target: 'self',
  base: 2,
  resist: (_self, type) => (type === 'spirit' ? 2 : 0),
  run: (G, _ctx, { target }) => { if (target && !isRespawning(target)) addStatus(G, target, 'silenced', 1, 2); },
};

// Spellslinger (canon T4 weapon): each ability or item cast stacks up fire
// rate. TCG: +3 Bullet Power (on the card), and after the bearer uses its skill
// or its ultimate it gains Extra Attack 1 this turn, so a hero that casts and
// then attacks swings twice.
function spellslinger(G: GameState, source: CardInstance | undefined) {
  if (!source || isRespawning(source)) return;
  grantExtraAttacks(source, 1);
  pushLog(G, `${cardName(source.cardId)} gains Extra Attack 1 (Spellslinger).`);
}
const eff_spellslinger: AbilityDef = {
  id: 'eff_spellslinger', trigger: 'onBearerSkillUsed', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => spellslinger(G, source),
};
const eff_spellslinger_ult: AbilityDef = {
  id: 'eff_spellslinger_ult', trigger: 'onBearerUltCast', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => spellslinger(G, source),
};

// Capacitor (canon T4 weapon active): a charge that shocks, chains to nearby
// enemies, slows hard and silences their movement. TCG: {sp:2} spirit damage
// to the enemy Active, 2 to each enemy bench hero, and all of them Rooted for
// 1 turn (no Retreat, no swap): hard crowd control, two charges a match.
const eff_capacitor: AbilityDef = {
  id: 'eff_capacitor', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Capacitor — shock the enemy Active, chain to their bench and root them all.',
  scalesSpirit: true, base: 2,
  run: (G, ctx, { target }) => {
    if (!target) return;
    const enemy = G.players[otherPlayer(ctx.movingPlayer)];
    damageUnit(G, target, 2 + activeSpi(G, ctx.movingPlayer), 'spirit', 'Capacitor');
    for (const b of enemy.bench) {
      if (b && !isRespawning(b) && b.hp > 0) damageUnit(G, b, 2, 'spirit', 'Capacitor', { tag: 'tesla' });
    }
    for (const c of liveBoardCards(enemy)) if (c.hp > 0) addStatus(G, c, 'rooted', 1, 1);
    resolve(G);
  },
};

// Battle Vest (canon T2 vitality): bullet resist, and above 65% health more
// weapon damage and fire rate. TCG: Bullet Resist 1 while worn (the resist
// hook), and +1 on the swing while the bearer is above half HP.
const eff_battle_vest: AbilityDef = {
  id: 'eff_battle_vest', trigger: 'ongoing', target: 'self',
  base: 1,
  resist: (_self, type) => (type === 'attack' ? 1 : 0),
  attackBonus: (self) => (aboveHalf(self) ? { amount: 1, label: 'Battle Vest: +1 above half HP' } : null),
  run: () => {},
};

// Enchanter's Emblem (canon T2 vitality): spirit resist, and above 65% health
// more spirit power. TCG: Spirit Resist 1 while worn, and at the start of your
// turn, if the bearer is above half HP, +1 Spirit Power for 1 turn. Spirit
// Power is read off statuses, so the trigger puts it on.
const eff_enchanters_emblem: AbilityDef = {
  id: 'eff_enchanters_emblem', trigger: 'startOfTurn', target: 'self',
  base: 1,
  resist: (_self, type) => (type === 'spirit' ? 1 : 0),
  run: (G, _ctx, { source }) => { if (source && aboveHalf(source)) addStatus(G, source, 'spirit_power', 1, 1); },
};

// Restorative Locket (canon T2 vitality active): every ability an enemy uses
// nearby stores a stack, and the locket spends them on a heal and stamina.
// TCG: an enemy hero with an ability cooling down is a stack it stored, so the
// locket heals an ally 1, plus 1 for each. The stamina is a free Retreat this
// turn (Swift).
const eff_restorative_locket: AbilityDef = {
  id: 'eff_restorative_locket', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Restorative Locket — heal an ally 1, plus 1 per enemy hero with an ability on cooldown.',
  base: 1,
  run: (G, ctx, { target }) => {
    if (!target) return;
    const stacks = slottedHeroes(G.players[otherPlayer(ctx.movingPlayer)]).filter((h) => !!heroData(h)
      && (Object.keys(h.cooldowns ?? {}).length > 0 || wornActives(h).some((it) => itemCooldown(it) > 0))).length;
    healUnit(G, target, 1 + stacks, 'Restorative Locket');
    addStatus(G, target, 'swift', 1, 1);
  },
};

// Veil Walker (canon T3 vitality): walking through a veil grants stealth, a
// heal and speed. TCG: the veil is the step into the Active slot (a Retreat or
// a swap): the bearer heals 2 and gains Dome (stealth: no attack can target it)
// for 1 turn.
const eff_veil_walker: AbilityDef = {
  id: 'eff_veil_walker', trigger: 'onBearerStepIn', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => {
    if (!source || isRespawning(source)) return;
    healUnit(G, source, 2, 'Veil Walker', { tag: 'regen' });
    addStatus(G, source, 'dome', 1, 1);
  },
};

// Cheat Death (canon T4 vitality): lethal damage leaves you briefly immune to
// death instead. TCG: Bullet Resist 2 while worn, and a hit that would fell
// the bearer from 2 HP or more leaves it at 1 HP (the incoming hook, read
// before any status). At 1 HP it can fall.
const eff_cheat_death: AbilityDef = {
  id: 'eff_cheat_death', trigger: 'ongoing', target: 'self',
  base: 3,
  resist: (_self, type) => (type === 'attack' ? 2 : 0),
  incoming: (self, amount) => (self.hp >= 2 && amount >= self.hp ? self.hp - 1 : amount),
  run: () => {},
};

// Indomitable (canon T4 vitality): the next stun, silence, sleep or immobilise
// is cleansed at once and leaves a barrier. TCG: Bullet and Spirit Resist 2
// while worn, and when hard CC lands on the bearer it is cleansed of it and
// gains Shield 4.
const eff_indomitable: AbilityDef = {
  id: 'eff_indomitable', trigger: 'onBearerCCSuffered', target: 'self',
  base: 4,
  resist: (_self, type) => (type === 'attack' || type === 'spirit' ? 2 : 0),
  run: (G, _ctx, { source }) => {
    if (!source || isRespawning(source)) return;
    const before = source.statuses.length;
    source.statuses = source.statuses.filter((s) => !CC_STATUSES.has(s.id));
    if (source.statuses.length < before) pushLog(G, `${cardName(source.cardId)} shrugs it off (Indomitable).`);
    addStatus(G, source, 'shield', 4, 999);
  },
};

// Juggernaut (canon T4 vitality): slow resistance, speed and regeneration, and
// enemies that shoot you lose fire rate. TCG: Enduring Speed's lines (its
// component: Retreat costs 1 less, cannot be Rooted), heal 2 at the start of
// your turn, and when the bearer takes bullet damage the enemy Active gets
// Bullet Power −2 for 2 turns.
const eff_juggernaut_regen: AbilityDef = {
  id: 'eff_juggernaut_regen', trigger: 'startOfTurn', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 2, 'Juggernaut', { tag: 'regen' }); },
};
const eff_juggernaut: AbilityDef = {
  id: 'eff_juggernaut', trigger: 'onBearerDamagedByBullet', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => {
    if (!source) return;
    const shooter = G.players[otherPlayer(seatOf(source))].active;
    if (shooter && !isRespawning(shooter) && shooter.hp > 0) addStatus(G, shooter, 'weapon_power_down', 2, 2);
  },
};

// Plated Armor (canon T4 vitality): a chance to deflect bullets whole. TCG: the
// deflection is heavy Bullet Resist, 3 while worn.
const eff_plated_armor: AbilityDef = {
  id: 'eff_plated_armor', trigger: 'ongoing', target: 'self',
  base: 3,
  resist: (_self, type) => (type === 'attack' ? 3 : 0),
  run: () => {},
};

// Spellbreaker (canon T4 vitality): the next heavy spirit hit is cut hard.
// TCG: Debuff Reducer's line (its component: debuffs last 1 turn less), Spirit
// Resist 2 while worn, and a spirit hit of 3 or more on the bearer is halved,
// rounded up (the incoming hook, before the resist).
const eff_spellbreaker: AbilityDef = {
  id: 'eff_spellbreaker', trigger: 'ongoing', target: 'self',
  base: 2,
  resist: (_self, type) => (type === 'spirit' ? 2 : 0),
  incoming: (_self, amount, type) => (type === 'spirit' && amount >= 3 ? Math.ceil(amount / 2) : amount),
  run: () => {},
};

// Vampiric Burst (canon T4 vitality active): a burst of lifesteal, fire rate
// and ammo. TCG: your Active heals 4, gains Extra Attack 2 this turn and +3
// Bullet Power for 2 turns.
const eff_vampiric_burst: AbilityDef = {
  id: 'eff_vampiric_burst', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Vampiric Burst — your Active heals 4, gains Extra Attack 2 and +3 Bullet Power.',
  base: 4,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (!mine) return;
    healUnit(G, mine, 4, 'Vampiric Burst');
    grantExtraAttacks(mine, 2);
    pushLog(G, `${cardName(mine.cardId)} gains Extra Attack 2 (Vampiric Burst).`);
    addStatus(G, mine, 'weapon_power', 3, 2);
  },
};

// Arcane Surge (canon T2 spirit): after a dash-jump, the next ability has more
// spirit power. TCG: the dash is the step into the Active slot (as on Kinetic
// Dash): Sprint Boots' line (Retreat costs 1 less), and on stepping in +3
// Spirit Power for 1 turn.
const eff_arcane_surge: AbilityDef = {
  id: 'eff_arcane_surge', trigger: 'onBearerStepIn', target: 'self',
  base: 3,
  run: (G, _ctx, { source }) => { if (source && !isRespawning(source)) addStatus(G, source, 'spirit_power', 3, 1); },
};

// Duration Extender (canon T2 spirit): the imbued ability lasts longer. TCG:
// the bearer's own buffs of 2 turns or more last 1 turn longer (Superior
// Duration, its upgrade, stretches every buff by 2). Shields and permanent
// marks (99+) are left alone.
const eff_duration_extender: AbilityDef = {
  id: 'eff_duration_extender', trigger: 'ongoing', target: 'self',
  base: 1,
  buffDuration: (_self, statusId, duration) =>
    (STATUSES_BY_ID[statusId]?.hvalue ?? 0) > 0 && duration >= 2 && duration < 99 ? duration + 1 : duration,
  run: () => {},
};

// Quicksilver Reload (canon T2 spirit): the imbued ability charges up bonus
// spirit damage and fire rate. TCG: after the bearer uses a skill, the enemy
// Active takes 1 spirit damage, and the bearer gains +1 Bullet Power for 1 turn.
const eff_quicksilver_reload: AbilityDef = {
  id: 'eff_quicksilver_reload', trigger: 'onBearerSkillUsed', target: 'enemyActive',
  base: 1,
  run: (G, ctx, args) => {
    mysticBurst(1, 'Quicksilver Reload')(G, ctx, args);
    if (args.source && !isRespawning(args.source)) addStatus(G, args.source, 'weapon_power', 1, 1);
  },
};

// Radiant Regeneration (canon T3 spirit): casting an ability heals you. TCG:
// after the bearer uses its skill or its ultimate, it heals 2.
const eff_radiant_regeneration: AbilityDef = {
  id: 'eff_radiant_regeneration', trigger: 'onBearerSkillUsed', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 2, 'Radiant Regeneration', { tag: 'regen' }); },
};
const eff_radiant_regeneration_ult: AbilityDef = {
  id: 'eff_radiant_regeneration_ult', trigger: 'onBearerUltCast', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 2, 'Radiant Regeneration', { tag: 'regen' }); },
};

// Torment Pulse (canon T3 spirit): pulses spirit damage at the two nearest
// enemies. TCG: at the end of your turn the enemy Active and the first enemy
// bench hero each take 1 spirit damage, in the bearer's proc frame.
const eff_torment_pulse: AbilityDef = {
  id: 'eff_torment_pulse', trigger: 'endOfTurn', target: 'self',
  base: 2,
  run: (G, _ctx, { source }) => {
    if (!source || isRespawning(source) || source.hp <= 0) return;
    const foe = G.players[otherPlayer(seatOf(source))];
    const standing = (c: CardInstance | null | undefined): c is CardInstance => !!c && !isRespawning(c) && c.hp > 0;
    const hit = [foe.active, foe.bench.find(standing)].filter(standing);
    withCast(source, 'proc', () => {
      for (const c of hit) damageUnit(G, c, 1, 'spirit', 'Torment Pulse', { tag: 'burst' });
    });
  },
};

// Focus Lens (canon T4 spirit active): Silence a target; part of the damage it
// takes during the Silence lands again when it ends. TCG: Silence any enemy for
// 2 turns, Spirit Resist −2 on it for 2 turns, and a Reverb of 2 that goes off
// at its next turn start: hard crowd control, two charges a match.
const eff_focus_lens: AbilityDef = {
  id: 'eff_focus_lens', trigger: 'onPlay', target: 'enemyAny',
  prompt: 'Focus Lens — Silence any enemy for 2 turns and leave it a Reverb.',
  base: 2,
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'silenced', 1, 2);
    addStatus(G, target, 'spirit_resist_down', 2, 2);
    addStatus(G, target, 'reverb', 2, 1);
  },
};

// Lightning Scroll (canon T4 spirit): damage from your ultimate stuns and
// deals bonus spirit damage after a delay. TCG: after the bearer casts its
// ultimate, every enemy takes 3 spirit damage and the enemy Active is Stunned
// for 1 turn.
const eff_lightning_scroll: AbilityDef = {
  id: 'eff_lightning_scroll', trigger: 'onBearerUltCast', target: 'self',
  base: 3,
  run: (G, _ctx, { source }) => {
    if (!source) return;
    const enemy = G.players[otherPlayer(seatOf(source))];
    const struck = enemy.active;
    // A hero the ultimate itself dropped to 0 is not reaped yet: it is no target.
    for (const c of liveBoardCards(enemy)) if (c.hp > 0) damageUnit(G, c, 3, 'spirit', 'Lightning Scroll', { tag: 'burst' });
    if (struck && !isRespawning(struck) && struck.hp > 0) addStatus(G, struck, 'stun', 1, 1);
  },
};

// Mercurial Magnum (canon T4 spirit): Quicksilver Reload's charge, and bullets
// that deal spirit damage. TCG: +3 Spirit Power (on the card), after a skill 2
// spirit damage to the enemy Active, and after each swing 1 spirit damage to
// its target.
const eff_mercurial_magnum: AbilityDef = {
  id: 'eff_mercurial_magnum', trigger: 'onBearerSkillUsed', target: 'enemyActive',
  base: 2,
  run: mysticBurst(2, 'Mercurial Magnum'),
};
const eff_mercurial_magnum_shot: AbilityDef = {
  id: 'eff_mercurial_magnum_shot', trigger: 'onAttack', target: 'self',
  base: 1,
  run: spiritShot('Mercurial Magnum'),
};

// Scourge (canon T4 spirit active): spirit resist, debuff resist and an aura
// that burns enemies, on an ally. TCG: an ally is cleansed of its debuffs and
// gains Spirit Resist 3 for 2 turns, and every enemy takes {sp:2} spirit damage.
const eff_scourge: AbilityDef = {
  id: 'eff_scourge', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Scourge — cleanse an ally, shield it from spirit and burn every enemy.',
  scalesSpirit: true, base: 2,
  run: (G, ctx, { target }) => {
    if (target) {
      cleanseDebuffs(target);
      addStatus(G, target, 'spirit_resist', 3, 2);
    }
    const dmg = 2 + activeSpi(G, ctx.movingPlayer);
    eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => { damageUnit(G, c, dmg, 'spirit', 'Scourge'); });
  },
};

// Spirit Burn (canon T4 spirit): a heavy spirit hit sets off an explosion and
// a burn that cuts healing. TCG: +3 Spirit Power (on the card); when the
// bearer's skill / spell / ult deals 3 or more to an enemy, it takes 3 more
// spirit damage, then Bleed 2 and no healing for 2 turns.
const eff_spirit_burn: AbilityDef = {
  id: 'eff_spirit_burn', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  base: 3,
  run: (G, _ctx, { target, params }) => {
    const amount = params?.amount as number | undefined;
    if (!target || isRespawning(target) || !amount || amount < 3) return;
    damageUnit(G, target, 3, 'spirit', 'Spirit Burn', { tag: 'burst' });
    if (target.hp > 0) {
      addStatus(G, target, 'bleed', 2, 2);
      addStatus(G, target, 'healing_boost_down', 1, 2);
    }
    resolve(G);
  },
};

// ----- Added 2026-11-05: tier 5, Deadlock's 9,999-soul items (docs/card-design.md) -----
// Worn about two own turns, a tier-5 card earns its 24 souls with an effect
// that can decide a late match — a second attack and more, a stun or a wipe of
// buffs on the whole enemy side, a hit on every enemy at once — not with
// stats. The numbers come from the budget written beside each card.

// Haunting Shot (canon T5 weapon): the next bullet haunts — it cuts the
// enemy's damage, healing and speed, deals bonus spirit damage by its current
// health, and is big enough to pass through everyone in line. TCG: after each
// swing of the turn's attack (not a bounce, nor an ultimate's volley) every
// standing enemy hero takes spirit damage of a third of its HP, rounded up,
// then Bullet Power −2, Spirit Power −2 and no healing for 2 turns, and Rooted
// for 1 turn (slowed: no Retreat). Dealt in the bearer's proc frame, so no gear
// of its own fires on it.
const eff_haunting_shot: AbilityDef = {
  id: 'eff_haunting_shot', trigger: 'onAttack', target: 'self',
  base: 3,
  run: (G, _ctx, { source, params }) => {
    if (!source || params?.bounce || !G.attackUsed || isRespawning(source)) return;
    for (const c of liveBoardCards(G.players[otherPlayer(seatOf(source))])) {
      if (!heroData(c) || c.hp <= 0) continue;
      damageUnit(G, c, Math.ceil(c.hp / 3), 'spirit', 'Haunting Shot', { tag: 'burst' });
      if (c.hp <= 0) continue;
      addStatus(G, c, 'weapon_power_down', 2, 2);
      addStatus(G, c, 'spirit_power_down', 2, 2);
      addStatus(G, c, 'healing_boost_down', 1, 2);
      addStatus(G, c, 'rooted', 1, 1);
    }
  },
};

// Infinite Rounds (canon T5 weapon): fire rate, and ammo that never runs out;
// its bullets often turn unavoidable, piercing through enemies and ignoring
// their bullet resist. TCG: the bearer gains Extra Attack 3 each turn (as
// Burst Fire grants one), and its swings pierce as Armor Piercer's do. Worn
// beside Armor Piercer it leaves the piercing to that card: a swing pierces once.
const eff_infinite_rounds: AbilityDef = {
  id: 'eff_infinite_rounds', trigger: 'startOfTurn', target: 'self',
  base: 3,
  run: (_G, _ctx, { source }) => { if (source) grantExtraAttacks(source, 3); },
};
const wearsArmorPiercer = (c: CardInstance | undefined) => !!c && wornItems(c).some((it) => it.cardId === 'armor_piercer');
const infiniteThrough = throughArmour('Infinite Rounds: through armour');
const infinitePierce = pierceBehind('Infinite Rounds');
const eff_infinite_rounds_pierce: AbilityDef = {
  id: 'eff_infinite_rounds_pierce', trigger: 'onAttack', target: 'self',
  base: 3,
  attackBonus: (self, target) => (wearsArmorPiercer(self) ? null : infiniteThrough(self, target)),
  run: (G, ctx, args) => { if (!wearsArmorPiercer(args.source)) infinitePierce(G, ctx, args); },
};

// Frostbite Charm (canon T5 spirit): the imbued ability gains spirit power,
// and what it damages is frozen and takes bonus damage. TCG: +4 Spirit Power
// (on the card); when the bearer's skill / spell / ult damages an enemy, it
// takes 7 more spirit damage and, still standing, is Stunned for 1 turn.
const eff_frostbite_charm: AbilityDef = {
  id: 'eff_frostbite_charm', trigger: 'onBearerSkillDamage', target: 'enemyActive',
  base: 7,
  run: (G, _ctx, { target }) => {
    if (!target || isRespawning(target) || target.hp <= 0) return;
    damageUnit(G, target, 7, 'spirit', 'Frostbite Charm', { tag: 'burst' });
    if (target.hp > 0) addStatus(G, target, 'stun', 1, 1);
    resolve(G);
  },
};

// Mystical Piano (canon T5 spirit active): after a short delay every enemy in
// a wide area is stunned and its stamina drained, then dazed. TCG: every enemy
// hero is Stunned for 2 turns and Rooted for 2 turns (no stamina, no Retreat):
// hard crowd control, two charges a match.
const eff_mystical_piano: AbilityDef = {
  id: 'eff_mystical_piano', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Mystical Piano — stun and root every enemy hero for 2 turns.',
  base: 2,
  run: (G, ctx) => {
    for (const c of liveBoardCards(G.players[otherPlayer(ctx.movingPlayer)])) {
      if (!heroData(c) || c.hp <= 0) continue;
      addStatus(G, c, 'stun', 1, 2);
      addStatus(G, c, 'rooted', 1, 2);
    }
  },
};

// Nullification Burst (canon T5 vitality active): a wave that strips every
// positive effect off the enemies it reaches and stops their stamina and their
// healing. TCG: every enemy hero loses its buffs (a Shield, Unstoppable, a
// Dome, a channel: every status that helps it), takes {sp:1} spirit damage,
// cannot be healed for 2 turns and is Rooted for 2 turns (no stamina, no
// Retreat): hard crowd control, two charges a match.
const eff_nullification_burst: AbilityDef = {
  id: 'eff_nullification_burst', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Nullification Burst — strip every enemy hero of its buffs, burn it, and stop its healing and its Retreat.',
  scalesSpirit: true, base: 1,
  run: (G, ctx) => {
    const dmg = 1 + activeSpi(G, ctx.movingPlayer);
    eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => {
      if (!heroData(c) || c.hp <= 0) return;
      const before = c.statuses.length;
      c.statuses = c.statuses.filter((s) => (STATUSES_BY_ID[s.id]?.hvalue ?? 0) <= 0);
      if (c.statuses.length < before) pushLog(G, `${cardName(c.cardId)} loses its buffs (Nullification Burst).`);
      damageUnit(G, c, dmg, 'spirit', 'Nullification Burst');
      if (c.hp <= 0) return;
      addStatus(G, c, 'healing_boost_down', 1, 2);
      addStatus(G, c, 'rooted', 1, 2);
    });
  },
};

// Prism Blast (canon T5 spirit active): a void state, untargetable and
// invincible, while lasers turn round you and burn everything near. TCG: your
// Active gains Unstoppable for 1 turn (no damage, no crowd control lands), and
// every enemy takes {sp:7} spirit damage.
const eff_prism_blast: AbilityDef = {
  id: 'eff_prism_blast', trigger: 'onPlay', target: 'noTarget',
  prompt: 'Prism Blast — your Active turns untouchable and every enemy takes 7 spirit damage.',
  scalesSpirit: true, base: 7,
  run: (G, ctx) => {
    const mine = standingActive(G, ctx.movingPlayer);
    if (mine) addStatus(G, mine, 'unstoppable', 1, 1);
    const dmg = 7 + activeSpi(G, ctx.movingPlayer);
    eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => { damageUnit(G, c, dmg, 'spirit', 'Prism Blast'); });
  },
};

// ----- Hero skills (active, "Activate" trigger) -----
// Each skill declares its scaling (spirit / bullet / both / none).
// Base damage stays its original type. Scaling adds a second damage event of the matching type.

// Heals are flat — Spirit Power scales spirit damage only.
const skill_dynamo: HeroAbilityDef = {
  id: 'skill_dynamo', trigger: 'activate', target: 'allyHero', cooldown: 1,
  name: 'Rejuvenating Aurora',
  text: 'Heal an ally 2 and grant +{sp:1/2} Bullet Power for 2 turns.',
  prompt: 'Dynamo Rejuvenating Aurora — heal an ally 2 + grant Bullet Power (1 + ½ Spirit) for 2 turns.',
  base: 2,
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target) return;
    healUnit(G, target, 2);
    addStatus(G, target, 'weapon_power', 1 + Math.floor(spi(source) / 2), 2);
  },
};

// Canon Frost Grenade damages enemies + heals allies in the cloud. Here it
// damages the enemy Active and heals OUR Active — so when Kelvin is fronting he
// hits and heals himself (a hit-and-heal frontline caster).
const skill_kelvin: HeroAbilityDef = {
  id: 'skill_kelvin', trigger: 'activate', target: 'enemyActive', cooldown: 1,
  name: 'Frost Grenade',
  text: '{sp:1} spirit dmg to enemy Active + heal your Active 2.',
  prompt: 'Kelvin Frost Grenade — 1 spirit dmg to enemy Active + heal ally Active 2.',
  base: 1,
  scalesSpirit: true,
  run: (G, ctx, { source, target }) => {
    if (target) damageUnit(G, target, 1 + spi(source), 'spirit');
    const ally = G.players[ctx.movingPlayer].active;
    if (ally) healUnit(G, ally, 2);
  },
};

// Lady Geist — Life Drain (her in-game #2): deal spirit damage and heal herself
// for HALF the damage dealt (spirit lifesteal). Scales: more Spirit = bigger
// drain, and Healing Boost items add flat N to the heal.
const skill_lady_geist: HeroAbilityDef = {
  id: 'skill_lady_geist', trigger: 'activate', target: 'enemyAny', cooldown: 1,
  name: 'Life Drain',
  text: 'Deal {sp:3} spirit to any enemy and heal for half the damage dealt.',
  prompt: 'Lady Geist Life Drain — deal 3 spirit and heal for half the damage dealt.',
  base: 3,
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target || !source) return;
    const dealt = damageUnit(G, target, 3 + spi(source), 'spirit', 'Life Drain', { tag: 'life_drain' });
    const heal = Math.floor(dealt / 2);
    if (heal > 0) healUnit(G, source, heal, 'Life Drain', { tag: 'lifesteal', from: target });
  },
};

const skill_lash: HeroAbilityDef = {
  id: 'skill_lash', trigger: 'activate', target: 'enemyAny', cooldown: 1,
  name: 'Ground Strike',
  text: '{sp:1} spirit dmg + Vulnerable (take +1 dmg) for 1 turn.',
  prompt: 'Lash Ground Strike — 1 spirit dmg + Vulnerable (take +1 dmg) for 1 turn.',
  base: 1,
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target) return;
    damageUnit(G, target, 1 + spi(source), 'spirit');
    // Vulnerable: amplify all incoming damage (bullet + spirit). Helps the team
    // secure a kill (the only win-route) rather than denying a turn like Stun did.
    addStatus(G, target, 'bullet_resist_down', 1, 1);
    addStatus(G, target, 'spirit_resist_down', 1, 1);
  },
};

// Shields are flat — Spirit Power scales spirit damage only.
const skill_paige: HeroAbilityDef = {
  id: 'skill_paige', trigger: 'activate', target: 'allyHero', cooldown: 1,
  name: 'Plot Armor',
  text: 'Shield 2 on an ally and grant +{sp:1/2} Bullet Resist for 2 turns.',
  prompt: 'Paige Plot Armor — Shield 2 + grant Bullet Resist (1 + ½ Spirit) for 2 turns.',
  base: 2,
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target) return;
    addStatus(G, target, 'shield', 2, 999);
    // Defensive buff (distinct from Dynamo's offensive +Bullet Power) so the two
    // support lanes don't overlap.
    addStatus(G, target, 'bullet_resist', 1 + Math.floor(spi(source) / 2), 2);
  },
};

// Static Charge: 1 spirit dmg upfront + apply Charged for 2 turns; on expiry
// the tick handler converts it to a 1-turn Stun. Gives Control immediate
// pressure plus a long-fuse stun setup.
const skill_seven_static: HeroAbilityDef = {
  id: 'skill_seven_static', trigger: 'activate', target: 'enemyActive', cooldown: 1,
  name: 'Static Charge',
  text: '{sp:1} spirit dmg + Charged 2 — Stun 1 turn on expiry.',
  prompt: 'Seven Static Charge — 1 spirit dmg + Charged 2 turns. Stuns for 1 turn on expiry.',
  base: 1,
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target) return;
    damageUnit(G, target, 1 + spi(source), 'spirit');
    addStatus(G, target, 'charged', 1, 2);
  },
};

const skill_sinclair: HeroAbilityDef = {
  id: 'skill_sinclair', trigger: 'activate', target: 'enemyAny', cooldown: 1,
  name: 'Vexing Bolt',
  text: '{sp:2} spirit dmg to any enemy.',
  prompt: 'Sinclair Vexing Bolt — 2 spirit dmg to any enemy.',
  base: 2,
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (target) damageUnit(G, target, 2 + spi(source), 'spirit');
  },
};

// The Cube waits two of Viscous's turns: Unstoppable lasts through the rival's
// turn, so a free Cube every turn would be immunity to every hit for good.
const skill_viscous: HeroAbilityDef = {
  id: 'skill_viscous', trigger: 'activate', target: 'self', cooldown: 2,
  name: 'The Cube',
  text: 'Gain Unstoppable 1 + heal 1.',
  prompt: 'Viscous The Cube — Unstoppable 1 + heal 1.',
  base: 1,
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (!t) return;
    addStatus(G, t, 'unstoppable', 1, 1);
    healUnit(G, t, 1);
  },
};

const skill_yamato: HeroAbilityDef = {
  id: 'skill_yamato', trigger: 'activate', target: 'enemyAny', cooldown: 1,
  name: 'Power Slash',
  text: '{sp:1} spirit dmg to any enemy.',
  prompt: 'Yamato Power Slash — 1 spirit dmg.',
  base: 1,
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) damageUnit(G, target, 1 + spi(source), 'spirit'); },
};

// Warden skill: hardens himself with a Shield. Canon Warden hunkers down
// behind his shackle barrier before unleashing Last Stand — TCG abstraction
// is a flat self-buff Shield.
const skill_warden: HeroAbilityDef = {
  id: 'skill_warden', trigger: 'activate', target: 'self', cooldown: 1,
  name: 'Willpower',
  text: 'Shield 3 on self.',
  prompt: 'Warden Willpower — Shield 3 on self.',
  base: 3,
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (t) addStatus(G, t, 'shield', 3, 999);
  },
};

// ----- Hero passives (always-on or trigger-based, no Activate) -----

// Mirage Djinn's Mark: stacks (max 4) on every attack. Auto-detonates when
// stacks hit 4 (immediately) OR when the 3-turn timer expires — whichever
// comes first. Detonation deals 2 spirit damage per stack and resets the mark.
// The on-expire half lives in statusOps.tickStartOfTurn; this passive owns
// the on-attack stack application + the at-cap detonation.
const passive_mirage_djinns_mark: HeroAbilityDef = {
  id: 'passive_mirage_djinns_mark', trigger: 'onAttack', target: 'self',
  name: "Djinn's Mark",
  text: "Attacks apply 1 stack of Djinn's Mark (max 4) for 3 turns. Mark detonates at max stacks or on expiry for 3 spirit dmg per stack.",
  prompt: "Djinn's Mark — attacks apply 1 stack (max 4) for 3 turns. Detonates at 4 stacks or on expiry for 3 spirit dmg per stack.",
  run: (G, _ctx, { source, target }) => {
    if (!source || !target) return;
    // A swing that drops its target, or Mirage himself (Return Fire), marks
    // nothing: no stack, and no detonation — the fallen hero's statuses go
    // with the kill when the attack resolves.
    if (target.hp <= 0 || source.hp <= 0 || isRespawning(target)) return;
    addStatus(G, target, 'djinns_mark', 1, 3);
    const mark = target.statuses.find((s) => s.id === 'djinns_mark');
    if (mark && mark.value >= 4) {
      pushLog(G, `${cardName(target.cardId)} — Djinn's Mark detonates.`);
      damageUnit(G, target, 3 * mark.value, 'spirit', "Djinn's Mark", { tag: 'djinns_mark', stacks: mark.value, source, cast: 'proc' });
      target.statuses = target.statuses.filter((s) => s.id !== 'djinns_mark');
    }
  },
};

const passive_abrams_heal: HeroAbilityDef = {
  id: 'passive_abrams_heal', trigger: 'startOfTurn', target: 'self',
  name: 'Infernal Resilience',
  text: 'Heals 1 at start of own turn while Active.',
  prompt: 'Infernal Resilience — start of own turn while Active: heal 1.',
  run: (G, _ctx, { source }) => {
    if (!source) return;
    const found = findCardOnBoard(G, source.iid);
    if (found && found.card === source && source.zone === 'active') {
      healUnit(G, source, 1, 'Infernal Resilience', { tag: 'regen' });
    }
  },
};

// Fixation: canon Haze ramps with sustained fire. TCG: from Level 3, after Haze
// makes her attack she gains Extra Attack 1 (a follow-up swing the same turn).
// Fires only on her primary swing (`params.primary`) so the follow-up doesn't
// re-trigger it into an endless chain — nor does a Ricochet bounce, which never
// carries `primary`. Stacks with Burst Fire / Active Reload.
const HAZE_FIXATION_LEVEL = 3;
const passive_haze_fixation: HeroAbilityDef = {
  id: 'passive_haze_fixation', trigger: 'onAttack', target: 'self',
  name: 'Fixation',
  text: 'From Level 3: after Haze attacks, she gains Extra Attack 1 this turn.',
  prompt: 'Fixation — from Level 3, after Haze attacks, she gains Extra Attack 1 this turn.',
  run: (_G, _ctx, { source, params }) => {
    if (source && params?.primary && (source.level ?? 1) >= HAZE_FIXATION_LEVEL) grantExtraAttacks(source, 1);
  },
};

// Burrow: cleanses all debuffs from self at the start of own turn (only while Active).
const passive_mo_krill_burrow: HeroAbilityDef = {
  id: 'passive_mo_krill_burrow', trigger: 'startOfTurn', target: 'self',
  name: 'Burrow',
  text: 'Cleanses all debuffs from self at start of own turn.',
  prompt: 'Burrow — start of own turn: cleanse all debuffs from self.',
  run: (G, _ctx, { source }) => {
    if (source && source.zone === 'active') cleanseDebuffs(source);
  },
};

// Rem — Lil Helpers: she merges into a chosen ally as a temporary equipment.
// On cast: heal the bearer (3 + Rem's Spirit), grant +(1 + Rem's Spirit) max HP,
// and move Rem from her bench slot into the bearer's attached list for 3 turns.
// The countdown + return-to-bench live in tickRemMerges; bearer-death rescue in
// killInPlace. Scaling snapshots Rem's Spirit at cast time.
const skill_rem: HeroAbilityDef = {
  id: 'skill_rem', trigger: 'activate', target: 'allyHero', excludeSelf: true, cooldown: 1,
  name: 'Lil Helpers',
  text: 'Merge into an ally as a buff: heal {sp:3} and grant +{sp:1} max HP for 3 turns, then return to the bench.',
  prompt: "Rem Lil Helpers — merge into an ally: heal (3 + Spirit) and grant +(1 + Spirit) max HP for 3 turns.",
  base: 3,
  scalesSpirit: true,
  run: (G, ctx, { source, target }) => {
    if (!source || !target || target === source) return;
    if (isRespawning(target)) return; // can't merge into a corpse
    const s = effectiveSpirit(source);
    const hpBuff = 1 + s;
    target.hpMax += hpBuff;
    target.hp += hpBuff;
    healUnit(G, target, 3 + s, 'Lil Helpers');
    // Move Rem out of her bench slot and attach her to the bearer.
    const ps = G.players[ctx.movingPlayer];
    const idx = ps.bench.findIndex((b) => b === source);
    if (idx >= 0) ps.bench[idx] = null;
    source.zone = 'equipment';
    source.attachedTo = target.iid;
    source.remMergeTurnsLeft = 3;
    source.remMergeHpBuff = hpBuff;
    (target.attached ??= []).push(source);
    pushLog(G, `Rem merges into ${cardName(target.cardId)}.`);
  },
};

// On every attack Shiv lands, apply Bleed 1 (2 turns) to the target.
const passive_shiv_bleed: HeroAbilityDef = {
  id: 'passive_shiv_bleed', trigger: 'onAttack', target: 'self',
  name: 'Serrated Knives',
  text: 'Attacks apply Bleed 2 for 2 turns.',
  prompt: "Serrated Knives — attacks apply Bleed 2 for 2 turns.",
  run: (G, _ctx, { source, target }) => {
    if (source && target) addStatus(G, target, 'bleed', 2, 2);
  },
};

// Flight: takes 1 less bullet damage from every source. A pure hook —
// damageUnit asks it (`incomingDamage`) before anything else touches the hit.
const passive_vindicta_flight: HeroAbilityDef = {
  id: 'passive_vindicta_flight', trigger: 'ongoing', target: 'self',
  name: 'Flight',
  text: 'Takes 1 less bullet damage from all sources.',
  prompt: 'Flight — takes 1 less bullet damage from all sources.',
  incoming: (_self, amount, type) => (type === 'attack' ? Math.max(0, amount - 1) : amount),
  run: () => {},
};

// Mixed Bullets: Wraith's basic attack deals Bullet Power as bullet damage
// (the normal swing) PLUS her full Spirit Power as a second spirit-damage hit —
// so Weapon AND Spirit items both scale her, and she pierces either single
// resist. Fires on every swing (Extra Attacks too) like Shiv's bleed.
const passive_wraith_mixed: HeroAbilityDef = {
  id: 'passive_wraith_mixed', trigger: 'onAttack', target: 'self',
  name: 'Mixed Bullets',
  text: 'Attacks deal Bullet Power (bullet) + {sp:0} (spirit).',
  prompt: 'Mixed Bullets — attacks also deal Spirit Power as spirit damage.',
  run: (G, _ctx, { source, target, params }) => {
    if (!source || !target || params?.bounce) return; // her spirit half rides the swing, not a Ricochet bounce
    const sp = effectiveSpirit(source);
    if (sp > 0) damageUnit(G, target, sp, 'spirit', 'Mixed Bullets', { tag: 'mixed_bullets', source, cast: 'proc' });
  },
};

// Bloodscent: bullet lifesteal — Drifter heals for HALF the damage his attacks
// deal (the dealt amount is plumbed in via params.dealt from the attack action).
// Scales with weapon power, Extra Attack swings, and Healing Boost items.
const passive_drifter_bloodscent: HeroAbilityDef = {
  id: 'passive_drifter_bloodscent', trigger: 'onAttack', target: 'self',
  name: 'Bloodscent',
  text: 'Heals for half the damage his attacks deal (bullet lifesteal).',
  prompt: 'Bloodscent — Drifter heals for half the damage his attacks deal.',
  run: (G, _ctx, { source, target, params }) => {
    if (params?.bounce) return; // a self-heal: off the swing, not off a Ricochet bounce
    const dealt = (params?.dealt as number | undefined) ?? 0;
    const heal = Math.floor(dealt / 2);
    if (source && heal > 0) healUnit(G, source, heal, 'Bloodscent', { tag: 'lifesteal', from: target });
  },
};

// ----- Ultimates -----
// Kit abilities: `source` is the hero using it (its own, or Sinclair with a
// borrowed copy), and the cast frame's source too, so `ultSpi` scales it.
// `base` here is the AI heuristic's magnitude proxy, same as everywhere else.
const eff_ult_abrams: AbilityDef = {
  id: 'eff_ult_abrams', trigger: 'onPlay', target: 'noTarget',
  base: 4,
  run: (G, ctx) => {
    const enemy = otherPlayer(ctx.movingPlayer);
    const s = ultSpi();
    eachBoard(G, enemy, (c) => damageUnit(G, c, 4 + s, 'spirit'));
    const act = G.players[enemy].active;
    if (act && (act.respawnTurnsLeft ?? 0) === 0) addStatus(G, act, 'stun', 1, 1);
  },
};
// Singularity — canon vortex channel. Dynamo locks into the channel (no attack,
// no skill) and tears the enemy board apart with a 3-spirit AoE pulse at the end
// of each of his next 3 turns (9 per enemy total; scales with Spirit). Pulses
// resolve in tickCastingPulses; the lockout is the `casting` status.
const eff_ult_dynamo: AbilityDef = {
  id: 'eff_ult_dynamo', trigger: 'onPlay', target: 'noTarget',
  base: 3,
  run: (G, ctx, { source }) => {
    const dynamo = ultCaster(G, ctx.movingPlayer, source, 'hero_dynamo');
    if (!dynamo) { pushLog(G, 'Singularity fizzled — no caster on the board.'); return; }
    addStatus(G, dynamo, 'casting', 3, 3);
    pushLog(G, `${cardName(dynamo.cardId)} channels Singularity.`);
  },
};
const eff_ult_haze: AbilityDef = {
  id: 'eff_ult_haze', trigger: 'onPlay', target: 'noTarget',
  base: 3,
  run: (G, ctx) => { const s = ultSpi(); eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => damageUnit(G, c, 3 + s, 'attack')); },
};
const eff_ult_kelvin: AbilityDef = {
  id: 'eff_ult_kelvin', trigger: 'onPlay', target: 'noTarget',
  base: 7,
  run: (G, ctx) => { for (const c of liveBoardCards(G.players[ctx.movingPlayer])) healUnit(G, c, 7, 'Frozen Shelter'); },
};
// Soul Exchange: the two Actives trade current HP. Only two living Actives can
// trade (a corpse has no HP to give or take), and each hero takes no more than
// its own max HP can hold, so the swap can never push a hero over its max or
// knock one out.
const eff_ult_lady_geist: AbilityDef = {
  id: 'eff_ult_lady_geist', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => {
    const ally = G.players[ctx.movingPlayer].active;
    const enemy = G.players[otherPlayer(ctx.movingPlayer)].active;
    if (!ally || !enemy || isRespawning(ally) || isRespawning(enemy)) {
      pushLog(G, 'Soul Exchange fizzled — both Actives must be standing.');
      return;
    }
    const allyHp = ally.hp;
    ally.hp = Math.min(enemy.hp, ally.hpMax);
    enemy.hp = Math.min(allyHp, enemy.hpMax);
    pushLog(G, 'Souls swapped.');
  },
};
const eff_ult_lash: AbilityDef = {
  id: 'eff_ult_lash', trigger: 'onPlay', target: 'noTarget',
  base: 5,
  run: (G, ctx) => {
    const enemy = otherPlayer(ctx.movingPlayer);
    const s = ultSpi();
    eachBoard(G, enemy, (c) => damageUnit(G, c, 5 + s, 'spirit'));
    const act = G.players[enemy].active;
    if (act && (act.respawnTurnsLeft ?? 0) === 0) addStatus(G, act, 'stun', 1, 1);
  },
};
const eff_ult_mo_krill: AbilityDef = {
  id: 'eff_ult_mo_krill', trigger: 'onPlay', target: 'enemyActive',
  base: 6,
  run: (G, ctx, { source, target }) => {
    if (!target) return;
    addStatus(G, target, 'stun', 1, 1);
    const dealt = damageUnit(G, target, 6 + ultSpi(), 'spirit', 'Combo', { tag: 'combo' });
    const mk = ultCaster(G, ctx.movingPlayer, source, 'hero_mo_krill');
    if (mk && dealt > 0) healUnit(G, mk, dealt, 'Combo', { tag: 'lifesteal', from: target });
  },
};
const eff_ult_paige: AbilityDef = {
  id: 'eff_ult_paige', trigger: 'onPlay', target: 'noTarget',
  base: 4,
  run: (G, ctx) => {
    for (const c of liveBoardCards(G.players[ctx.movingPlayer])) healUnit(G, c, 4, 'Rallying Charge');
    const s = ultSpi();
    eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => damageUnit(G, c, 4 + s, 'spirit'));
  },
};
const eff_ult_rem: AbilityDef = {
  id: 'eff_ult_rem', trigger: 'onPlay', target: 'enemyActive',
  base: 6,
  // Naptime: sleep the enemy Active; the stored value (6) is the wake-up burst,
  // dealt when it wakes (any damage) or when the sleep expires (statusOps).
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'sleep', 6 + ultSpi(), 2); },
};
// Storm Cloud — canon escalating lightning channel. Seven lifts into the storm
// (locked out, `casting`) and rains an AoE that RAMPS each turn: 2 → 3 → 4
// spirit (+Spirit) over 3 turns (9 per enemy, back-loaded). The channel carries
// `ramp: 1`, and tickCastingPulses adds it to the value after each pulse.
const eff_ult_seven: AbilityDef = {
  id: 'eff_ult_seven', trigger: 'onPlay', target: 'noTarget',
  base: 2,
  run: (G, ctx, { source }) => {
    const seven = ultCaster(G, ctx.movingPlayer, source, 'hero_seven');
    if (!seven) { pushLog(G, 'Storm Cloud fizzled — no caster on the board.'); return; }
    addStatus(G, seven, 'casting', 2, 3, { ramp: 1 });
    pushLog(G, `${cardName(seven.cardId)} channels Storm Cloud.`);
  },
};
const eff_ult_shiv: AbilityDef = {
  id: 'eff_ult_shiv', trigger: 'onPlay', target: 'enemyActive',
  base: 5,
  run: (G, _ctx, { target }) => {
    if (!target) return;
    // Killing Blow: execute a target already below half HP, else a 5 spirit hit.
    if (target.hp <= target.hpMax / 2) damageUnit(G, target, 999, 'pure', 'Killing Blow', { tag: 'execute' });
    else damageUnit(G, target, 5 + ultSpi(), 'spirit', 'Killing Blow');
  },
};
const eff_ult_sinclair: AbilityDef = {
  id: 'eff_ult_sinclair', trigger: 'onPlay', target: 'noTarget',
  // Audience Participation: borrow the enemy Active hero's ultimate. The hero
  // using it (Sinclair) gains it as a one-shot kit ability (`borrowedUlt`):
  // free, no level or cooldown, gone once used. One borrowed at a time — a new
  // copy replaces an unused one — and never Sinclair's own.
  run: (G, ctx, { source }) => {
    const pid = ctx.movingPlayer;
    const caster = source && heroData(source) && !isRespawning(source) ? source : undefined;
    const enemyActive = G.players[otherPlayer(pid)].active;
    if (!caster || !enemyActive || isRespawning(enemyActive)) {
      pushLog(G, 'Audience Participation: no enemy ultimate to copy.');
      return;
    }
    const ult = heroData(enemyActive)?.ult;
    if (!ult || ult === heroData(caster)?.ult) { pushLog(G, 'Audience Participation: nothing to copy.'); return; }
    caster.borrowedUlt = ult;
    pushLog(G, `Audience Participation: ${cardName(caster.cardId)} borrows ${cardName(ultimateCard(ult)?.id ?? ult)} (free, once).`);
  },
};
const eff_ult_vindicta: AbilityDef = {
  id: 'eff_ult_vindicta', trigger: 'onPlay', target: 'enemyAny',
  base: 5,
  run: (G, _ctx, { target }) => {
    if (!target) return;
    // Assassinate: 9 spirit to a target already below half HP, else 5.
    const dmg = (target.hp <= target.hpMax / 2 ? 9 : 5) + ultSpi();
    damageUnit(G, target, dmg, 'spirit', 'Assassinate');
  },
};
const eff_ult_viscous: AbilityDef = {
  id: 'eff_ult_viscous', trigger: 'onPlay', target: 'noTarget',
  base: 3,
  run: (G, ctx, { source }) => {
    const vis = ultCaster(G, ctx.movingPlayer, source, 'hero_viscous');
    if (vis) addStatus(G, vis, 'unstoppable', 1, 1);
    const enemy = otherPlayer(ctx.movingPlayer);
    const s = ultSpi();
    eachBoard(G, enemy, (c) => damageUnit(G, c, 3 + s, 'spirit'));
    const act = G.players[enemy].active;
    if (act && (act.respawnTurnsLeft ?? 0) === 0) addStatus(G, act, 'stun', 1, 1);
  },
};
const eff_ult_yamato: AbilityDef = {
  id: 'eff_ult_yamato', trigger: 'onPlay', target: 'self',
  base: 3,
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (!t) return;
    addStatus(G, t, 'weapon_power', 3, 2);
    addStatus(G, t, 'unstoppable', 1, 1);
    healUnit(G, t, 5, 'Shadow Transformation');
  },
};

// Wraith ultimate: Telekinesis. Lifts the enemy Active for spirit damage + Stun 1.
const eff_ult_wraith: AbilityDef = {
  id: 'eff_ult_wraith', trigger: 'onPlay', target: 'enemyActive',
  base: 4,
  run: (G, _ctx, { target }) => {
    if (!target) return;
    damageUnit(G, target, 4 + ultSpi(), 'spirit');
    addStatus(G, target, 'stun', 1, 1);
  },
};

// Last Stand — canon drain channel. The LIGHT channel variant: Warden keeps
// attacking and using Willpower while a 2-spirit (+Spirit) AoE pulse drains the
// whole enemy board at the end of each of his next 3 turns, healing him for the
// total. A grindy drain-tank wincon rather than a burst wipe. Pulse + lifesteal
// resolve in tickCastingPulses; `casting_light` does NOT lock him out.
const eff_ult_warden: AbilityDef = {
  id: 'eff_ult_warden', trigger: 'onPlay', target: 'noTarget',
  base: 2,
  run: (G, ctx, { source }) => {
    const warden = ultCaster(G, ctx.movingPlayer, source, 'hero_warden');
    if (!warden) { pushLog(G, 'Last Stand fizzled — no caster on the board.'); return; }
    addStatus(G, warden, 'casting_light', 2, 3);
    pushLog(G, `${cardName(warden.cardId)} braces — Last Stand begins draining.`);
  },
};

// Mirage ultimate Traveler: canon Mirage teleports himself to safety. TCG
// mapping: a free reposition — if Mirage is Active, swap him to the bench with
// an available ally (no Retreat cost), then grant Shield 3 ("barrier on
// arrival"). A cheap escape/tempo tool, not a finisher.
const eff_ult_mirage: AbilityDef = {
  id: 'eff_ult_mirage', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx, { source }) => {
    const ps = G.players[ctx.movingPlayer];
    const mirage = ultCaster(G, ctx.movingPlayer, source, 'hero_mirage');
    if (!mirage) { pushLog(G, 'Traveler fizzled.'); return; }
    if (ps.active === mirage) {
      // The first ally who can take the front steps in; the line below tells the story.
      const benchAlly = stepInCandidates(ps)[0];
      if (benchAlly) swapIntoActive(G, ps, benchAlly, { quiet: true });
    }
    addStatus(G, mirage, 'shield', 3, 999);
    pushLog(G, `Traveler: ${cardName(mirage.cardId)} slips to safety (Shield 3).`);
  },
};

// Drifter ultimate Eternal Night: canon wraps up to 2 enemies in isolating
// darkness. TCG mapping: Silence the enemy Active + one bench hero for 2 turns
// (they can't cast skills/ults). Stops the opponent from answering with skill
// counter-plays.
const eff_ult_drifter: AbilityDef = {
  id: 'eff_ult_drifter', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => {
    const enemy = G.players[otherPlayer(ctx.movingPlayer)];
    if (enemy.active && (enemy.active.respawnTurnsLeft ?? 0) === 0) addStatus(G, enemy.active, 'silenced', 1, 2);
    const benchHero = enemy.bench.find((b) => b && (b.respawnTurnsLeft ?? 0) === 0);
    if (benchHero) addStatus(G, benchHero, 'silenced', 1, 2);
  },
};

const ABILITIES_LIST: AbilityDef[] = [
  // ----- Active items (spells) -----
  eff_healing_rite, eff_rusted_barrel,
  eff_cold_front, eff_slowing_hex, eff_spirit_sap,
  eff_decay, eff_disarming_hex,
  eff_knockdown, eff_cast_metal_skin,
  eff_silence_glyph, eff_curse, eff_debuff_remover, eff_unstoppable_cast, eff_echo_shard,
  eff_guardian_ward, eff_warp_stone, eff_divine_barrier, eff_ethereal_shift,
  eff_phantom_strike, eff_vortex_web, eff_refresher, eff_colossus_cast,
  eff_golden_goose_egg, eff_grit, eff_return_fire, eff_fleetfoot, eff_split_shot,
  eff_blood_tribute, eff_healing_nova, eff_rescue_beam, eff_fury_trance,
  eff_alchemical_fire, eff_heroic_aura, eff_shadow_weave, eff_infuser, eff_arctic_blast,
  eff_majestic_leap,
  // ----- Passive items: resists and healing boost while worn -----
  eff_bullet_resist, eff_spirit_resist, eff_healing_booster, eff_healing_tempo,
  // ----- Passive items: procs and hooks -----
  eff_bullet_resist_shredder_proc,
  eff_restorative_shot_proc, eff_extra_regen_proc, eff_mystic_regeneration_proc,
  eff_bullet_shield_proc, eff_spirit_shield_proc,
  eff_compress_cooldown, eff_superior_cooldown, eff_transcendent_cooldown,
  eff_mystic_burst_proc, eff_improved_burst_proc,
  eff_bullet_lifesteal, eff_spirit_lifesteal,
  eff_surge_of_power, eff_diviners_kevlar, eff_mystic_reverb,
  eff_ricochet, eff_burst_fire,
  eff_toxic_bullets, eff_tesla_bullets, eff_suppressor, eff_reactive_barrier,
  eff_escalating_exposure, eff_inhibitor, eff_crippling_headshot, eff_berserker,
  eff_healbane, eff_active_reload, eff_long_range, eff_fortitude,
  eff_frenzy, eff_siphon_bullets, eff_superior_duration,
  eff_headshot_booster, eff_spirit_strike, eff_mystic_vulnerability, eff_mystic_slow,
  eff_slowing_bullets, eff_debuff_reducer, eff_spirit_snatch, eff_spiritual_overflow,
  eff_sprint_boots, eff_enduring_speed, eff_kinetic_dash,
  // ----- Added 2026-11-05: the full shop -----
  eff_monster_rounds, eff_intensifying_magazine, eff_mystic_shot, eff_opening_rounds,
  eff_spirit_shredder, eff_spirit_shredder_drain, eff_stalker, eff_weakening_headshot,
  eff_ballistic_enchantment, eff_escalating_resilience, eff_express_shot, eff_headhunter,
  eff_hollow_point, eff_hunters_aura, eff_sharpshooter, eff_spirit_rend, eff_spirit_rend_drain,
  eff_armor_piercer, eff_silencer, eff_spellslinger, eff_spellslinger_ult, eff_capacitor,
  eff_battle_vest, eff_enchanters_emblem, eff_restorative_locket, eff_veil_walker,
  eff_cheat_death, eff_indomitable, eff_juggernaut_regen, eff_juggernaut, eff_plated_armor,
  eff_spellbreaker, eff_vampiric_burst,
  eff_arcane_surge, eff_duration_extender, eff_quicksilver_reload,
  eff_radiant_regeneration, eff_radiant_regeneration_ult, eff_torment_pulse,
  eff_focus_lens, eff_lightning_scroll, eff_mercurial_magnum, eff_mercurial_magnum_shot,
  eff_scourge, eff_spirit_burn,
  // ----- Added 2026-11-05: tier 5 -----
  eff_haunting_shot, eff_infinite_rounds, eff_infinite_rounds_pierce, eff_frostbite_charm,
  eff_mystical_piano, eff_nullification_burst, eff_prism_blast,
  // ----- Hero skills -----
  skill_dynamo, skill_kelvin, skill_lady_geist, skill_lash, skill_paige, skill_rem,
  skill_seven_static, skill_sinclair, skill_viscous, skill_yamato, skill_warden,
  // ----- Hero passives -----
  passive_abrams_heal, passive_haze_fixation, passive_mo_krill_burrow,
  passive_shiv_bleed, passive_vindicta_flight, passive_wraith_mixed, passive_drifter_bloodscent,
  passive_mirage_djinns_mark,
  // ----- Ultimates -----
  eff_ult_abrams, eff_ult_dynamo, eff_ult_haze, eff_ult_kelvin, eff_ult_lady_geist,
  eff_ult_lash, eff_ult_mo_krill, eff_ult_paige, eff_ult_rem, eff_ult_seven,
  eff_ult_shiv, eff_ult_sinclair, eff_ult_vindicta, eff_ult_viscous, eff_ult_yamato,
  eff_ult_wraith, eff_ult_warden, eff_ult_mirage, eff_ult_drifter,
];

export const ABILITIES_BY_ID: Record<string, AbilityDef> = Object.fromEntries(
  ABILITIES_LIST.map((a) => [a.id, a]),
);

// The engine looks card behaviour up in its registry (engine/registry.ts);
// loading this module is what fills it.
registerAbilities(ABILITIES_LIST);
