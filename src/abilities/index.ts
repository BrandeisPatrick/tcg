import type { GameState, CardInstance, PlayerID, StatusId } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { damageUnit, healUnit, reapDead } from '@/engine/damage';
import { addStatus, cleanseDebuffs } from '@/engine/statusOps';
import { findCardOnBoard, liveBoardCards, otherPlayer, pushLog, effectiveSpirit } from '@/engine/util';
import { setEquipmentDispatcher } from '@/engine/equipmentDispatch';

// An EffectFn mutates G. It receives the source card (if any), the target (if any),
// and a params bag from the ability/card definition.
export type EffectFn = (
  G: GameState,
  ctx: { movingPlayer: PlayerID },
  args: { source?: CardInstance; target?: CardInstance; params?: Record<string, any> },
) => void;

// Filter describing what counts as a valid target for an ability.
export type TargetFilter =
  | 'noTarget'
  | 'self'
  | 'allyAny'           // any ally board card
  | 'allyHero'
  | 'enemyAny'
  | 'enemyHero'
  | 'enemyActive'
  | 'anyBoard';

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
    | 'onBearerDamagedBySpirit'; // bearer just took spirit damage
  target: TargetFilter;
  prompt?: string;
  exhausts?: boolean;
  /** If true, hero's spiritMod adds to the skill's damage/heal/effect magnitude as spirit-type damage. */
  scalesSpirit?: boolean;
  /** Base magnitude (dmg/heal/shield). Used by UI preview to display BASE + scaling totals. */
  base?: number;
  /** Short label for the magnitude in the preview: 'dmg' / 'heal' / 'shield' / 'bleed' etc. */
  baseLabel?: string;
  run: EffectFn;
}


// Helper: total spirit-stat bonus from the source (equipment + Spirit Power buff).
// Used by HERO skills where the source IS the casting hero.
export function spi(source?: CardInstance): number {
  return source ? effectiveSpirit(source) : 0;
}

// Helper: spirit scaling sourced from the player's ACTIVE hero. Used by SPELLS
// (where `source` is the spell card itself, which has no spiritMod) — the
// active hero "channels" the spell, so their spirit boosts the magnitude.
// Corpse active = no scaling.
export function activeSpi(G: GameState, pid: PlayerID): number {
  const a = G.players[pid].active;
  if (!a || (a.respawnTurnsLeft ?? 0) > 0) return 0;
  return effectiveSpirit(a);
}

// Helper: deal damage to all of a player's board cards
function eachBoard(G: GameState, pid: PlayerID, fn: (c: CardInstance) => void) {
  for (const c of liveBoardCards(G.players[pid])) fn(c);
  reapDead(G, G.players[pid]);
}

// ----- Spells (8 cards) -----

// Cost 1 — T1 floor.
const eff_healing_rite: AbilityDef = {
  id: 'eff_healing_rite', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Healing Rite — heal an ally for 2.',
  scalesSpirit: true, base: 2, baseLabel: 'heal',
  run: (G, ctx, { target }) => {
    if (target) healUnit(G, target, 2 + activeSpi(G, ctx.movingPlayer));
  },
};

// Canon Rusted Barrel reduces enemy fire rate → mapped to Weaken (-N ATK).
const eff_rusted_barrel: AbilityDef = {
  id: 'eff_rusted_barrel', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Rusted Barrel — Weaken 2 on enemy Active for 2 turns.',
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'weaken', 2, 2);
  },
};

// Cost 2 — T1 ceiling.
const eff_cold_front: AbilityDef = {
  id: 'eff_cold_front', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Cold Front — Stun enemy Active for 1 turn.',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'stun', 1, 1); },
};

const eff_return_fire: AbilityDef = {
  id: 'eff_return_fire', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Brace ally: +3 Bullet Resist for 1 turn.',
  scalesSpirit: true, base: 3, baseLabel: 'Bullet Resist',
  run: (G, ctx, { target }) => {
    if (target) addStatus(G, target, 'bullet_resist', 3 + activeSpi(G, ctx.movingPlayer), 1);
  },
};

// Cost 3 — T2 floor.
const eff_decay: AbilityDef = {
  id: 'eff_decay', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Decay — apply Bleed 2 for 2 turns.',
  scalesSpirit: false, base: 2, baseLabel: 'Bleed',
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'bleed', 2, 2);
  },
};

const eff_slowing_hex: AbilityDef = {
  id: 'eff_slowing_hex', trigger: 'onPlay', target: 'enemyAny',
  prompt: 'Slowing Hex — Disarm + Vulnerable 2 on any enemy for 1 turn.',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'vulnerable', 2, 1);
    addStatus(G, target, 'disarm', 1, 1);
  },
};

// Cost 4 — T2 ceiling.
const eff_knockdown: AbilityDef = {
  id: 'eff_knockdown', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Knockdown — Stun 1 turn + Disarm 2 turns.',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'stun', 1, 1);
    addStatus(G, target, 'disarm', 1, 2);
  },
};

const eff_cast_metal_skin: AbilityDef = {
  id: 'eff_cast_metal_skin', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Metal Skin — Bullet Resist 5 for 1 turn.',
  scalesSpirit: true, base: 5, baseLabel: 'Bullet Resist',
  run: (G, ctx, { target }) => {
    if (target) addStatus(G, target, 'bullet_resist', 5 + activeSpi(G, ctx.movingPlayer), 1);
  },
};

// ----- Equipment passive effects + on-attach -----

// Bullet / Spirit Armor: permanent resist stick.
const eff_bullet_armor: AbilityDef = {
  id: 'eff_bullet_armor', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'bullet_resist', 2, 999); },
};
const eff_spirit_armor: AbilityDef = {
  id: 'eff_spirit_armor', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'spirit_resist', 2, 999); },
};

// Extra Stamina (on-attach): draw 2 cards. Card-advantage equipment at cost 2.
const eff_extra_stamina: AbilityDef = {
  id: 'eff_extra_stamina', trigger: 'onPlay', target: 'self',
  run: (G, ctx) => {
    const ps = G.players[ctx.movingPlayer];
    const MAX_HAND = 7;
    let drawn = 0;
    for (let i = 0; i < 2; i++) {
      if (ps.hand.length >= MAX_HAND) break;
      const c = ps.deck.shift();
      if (!c) break;
      c.zone = 'hand';
      ps.hand.push(c);
      drawn++;
    }
    if (drawn > 0) pushLog(G, `Extra Stamina: drew ${drawn} card${drawn === 1 ? '' : 's'}.`);
  },
};

// ----- Equipment reactive triggers -----

// Bullet Lifesteal: after bearer's basic attack, heal 1.
const eff_bullet_lifesteal_proc: AbilityDef = {
  id: 'eff_bullet_lifesteal_proc', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 1, 'Bullet Lifesteal'); },
};

// Spirit Lifesteal: after bearer's skill / spell / ult damages an enemy, heal 1.
const eff_spirit_lifesteal_proc: AbilityDef = {
  id: 'eff_spirit_lifesteal_proc', trigger: 'onBearerSkillDamage', target: 'self',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 1, 'Spirit Lifesteal'); },
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

// ----- Hero skills (active, "Activate" trigger) -----
// Each skill declares its scaling (spirit / bullet / both / none).
// Base damage stays its original type. Scaling adds a second damage event of the matching type.

const skill_dynamo: AbilityDef = {
  id: 'skill_dynamo', trigger: 'activate', target: 'allyHero', exhausts: true,
  prompt: 'Dynamo Rejuvenating Aurora — heal an ally for 2.',
  base: 2, baseLabel: 'heal',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) healUnit(G, target, 2 + spi(source)); },
};

// Canon Frost Grenade damages enemies + heals allies in the cloud.
const skill_kelvin: AbilityDef = {
  id: 'skill_kelvin', trigger: 'activate', target: 'enemyActive', exhausts: true,
  prompt: 'Kelvin Frost Grenade — 2 spirit dmg to enemy Active + heal ally Active 2.',
  base: 2, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, ctx, { source, target }) => {
    if (target) damageUnit(G, target, 2 + spi(source), 'spirit');
    const ally = G.players[ctx.movingPlayer].active;
    if (ally) healUnit(G, ally, 2);
  },
};

const skill_lady_geist: AbilityDef = {
  id: 'skill_lady_geist', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Lady Geist — 4 spirit dmg.',
  base: 4, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) damageUnit(G, target, 4 + spi(source), 'spirit'); },
};

const skill_lash: AbilityDef = {
  id: 'skill_lash', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Lash Ground Strike — 2 spirit dmg + Stun 1 turn.',
  base: 2, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target) return;
    damageUnit(G, target, 2 + spi(source), 'spirit');
    addStatus(G, target, 'stun', 1, 1);
  },
};

const skill_paige: AbilityDef = {
  id: 'skill_paige', trigger: 'activate', target: 'allyHero', exhausts: true,
  prompt: 'Paige Plot Armor — Shield 4 on ally.',
  base: 4, baseLabel: 'shield',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) addStatus(G, target, 'shield', 4 + spi(source), 999); },
};

// Static Charge: 1 spirit dmg upfront + apply Charged for 2 turns; on expiry
// the tick handler converts it to a 1-turn Stun. Gives Control immediate
// pressure plus a long-fuse stun setup.
const skill_seven_static: AbilityDef = {
  id: 'skill_seven_static', trigger: 'activate', target: 'enemyActive', exhausts: true,
  prompt: 'Seven Static Charge — 1 spirit dmg + Charged 2 turns. Stuns for 1 turn on expiry.',
  base: 1, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target) return;
    damageUnit(G, target, 1 + spi(source), 'spirit');
    addStatus(G, target, 'charged', 1, 2);
  },
};

const skill_sinclair: AbilityDef = {
  id: 'skill_sinclair', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Sinclair Vexing Bolt — 3 spirit dmg to any enemy.',
  base: 3, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (target) damageUnit(G, target, 3 + spi(source), 'spirit');
  },
};

const skill_viscous: AbilityDef = {
  id: 'skill_viscous', trigger: 'activate', target: 'self', exhausts: true,
  prompt: 'Viscous The Cube — Unstoppable 1 + heal 1.',
  base: 1, baseLabel: 'heal',
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (!t) return;
    addStatus(G, t, 'unstoppable', 1, 1);
    healUnit(G, t, 1);
  },
};

const skill_yamato: AbilityDef = {
  id: 'skill_yamato', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Yamato Power Slash — 2 spirit dmg.',
  base: 2, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) damageUnit(G, target, 2 + spi(source), 'spirit'); },
};

// Warden skill: hardens himself with a Shield. Canon Warden hunkers down
// behind his shackle barrier before unleashing Last Stand — TCG abstraction
// is a self-buff Shield that scales with Spirit.
const skill_warden: AbilityDef = {
  id: 'skill_warden', trigger: 'activate', target: 'self', exhausts: true,
  prompt: 'Warden Willpower — Shield 2 on self.',
  base: 2, baseLabel: 'shield',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (t) addStatus(G, t, 'shield', 2 + spi(source), 999);
  },
};

// ----- Hero passives (always-on or trigger-based, no Activate) -----

// Mirage Djinn's Mark: stacks (max 4) on every attack. Auto-detonates when
// stacks hit 4 (immediately) OR when the 3-turn timer expires — whichever
// comes first. Detonation deals 2 spirit damage per stack and resets the mark.
// The on-expire half lives in statusOps.tickStartOfTurn; this passive owns
// the on-attack stack application + the at-cap detonation.
const passive_mirage_djinns_mark: AbilityDef = {
  id: 'passive_mirage_djinns_mark', trigger: 'onAttack', target: 'self',
  prompt: "Djinn's Mark — attacks apply 1 stack (max 4) for 3 turns. Detonates at 4 stacks or on expiry for 2 spirit dmg per stack.",
  run: (G, _ctx, { source, target }) => {
    if (!source || !target) return;
    addStatus(G, target, 'djinns_mark', 1, 3);
    const mark = target.statuses.find((s) => s.id === 'djinns_mark');
    if (mark && mark.value >= 4) {
      pushLog(G, `${CARDS_BY_ID[target.cardId]?.name ?? target.cardId} — Djinn's Mark detonates.`);
      damageUnit(G, target, 2 * mark.value, 'spirit');
      target.statuses = target.statuses.filter((s) => s.id !== 'djinns_mark');
    }
  },
};

const passive_abrams_heal: AbilityDef = {
  id: 'passive_abrams_heal', trigger: 'startOfTurn', target: 'self',
  prompt: 'Infernal Resilience — start of own turn while Active: heal 2.',
  run: (G, _ctx, { source }) => {
    if (!source) return;
    const found = findCardOnBoard(G, source.iid);
    if (found && found.card === source && source.zone === 'active') {
      healUnit(G, source, 2, 'Infernal Resilience');
    }
  },
};

// Fixation: +2 ATK vs Stunned targets. The damage hook lives in
// `combat.ts:effectiveAttackDamage` — this is a marker so the registry
// owns the definition and the UI can show a trigger label.
const passive_haze_stunbonus: AbilityDef = {
  id: 'passive_haze_stunbonus', trigger: 'ongoing', target: 'self',
  prompt: 'Fixation — +2 ATK vs Stunned targets.',
  run: () => { /* combat hook reads this directly */ },
};

// Burrow: cleanses all debuffs from self at the start of own turn (only while Active).
const passive_mo_krill_burrow: AbilityDef = {
  id: 'passive_mo_krill_burrow', trigger: 'startOfTurn', target: 'self',
  prompt: 'Burrow — start of own turn: cleanse all debuffs from self.',
  run: (G, _ctx, { source }) => {
    if (source && source.zone === 'active') cleanseDebuffs(source);
  },
};

const passive_rem_benchheal: AbilityDef = {
  id: 'passive_rem_benchheal', trigger: 'startOfTurn', target: 'self',
  prompt: "Lil Helpers — start of own turn: heal ally Active 2 while on the bench.",
  run: (G, ctx, { source }) => {
    if (!source || source.zone !== 'bench') return;
    const ally = G.players[ctx.movingPlayer].active;
    if (ally) healUnit(G, ally, 2);
  },
};

// On every attack Shiv lands, apply Bleed 1 (2 turns) to the target.
const passive_shiv_bleed: AbilityDef = {
  id: 'passive_shiv_bleed', trigger: 'onAttack', target: 'self',
  prompt: "Serrated Knives — attacks apply Bleed 1 for 2 turns.",
  run: (G, _ctx, { source, target }) => {
    if (source && target) addStatus(G, target, 'bleed', 1, 2);
  },
};

// Flight: marker passive. The actual mitigation lives in `damageUnit` (skills
// + spells) and the planner in `combat.ts` (basic attacks).
const passive_vindicta_flight: AbilityDef = {
  id: 'passive_vindicta_flight', trigger: 'ongoing', target: 'self',
  prompt: 'Flight — takes 1 less bullet damage from all sources.',
  run: () => {},
};

// Mixed damage: marker passive. Combat resolver splits Wraith's attack into
// half bullet / half spirit, each subject to its own resist.
const passive_wraith_mixed: AbilityDef = {
  id: 'passive_wraith_mixed', trigger: 'ongoing', target: 'self',
  prompt: 'Mixed Bullets — attacks split half bullet, half spirit.',
  run: () => { /* combat hook reads this directly */ },
};

// Bloodscent: canon Drifter literally feeds off weakened prey. Two effects
// in one passive:
//   1) Lifesteal — on every basic attack, Drifter heals 1 (onAttack trigger).
//   2) +3 bullet dmg vs targets at <=4 HP (combat hook in
//      `combat.ts:effectiveAttackDamage`).
// The first effect uses the ability's onAttack trigger; the second is read
// directly from the attacker cardId in the combat hook.
const passive_drifter_bloodscent: AbilityDef = {
  id: 'passive_drifter_bloodscent', trigger: 'onAttack', target: 'self',
  prompt: 'Bloodscent — heal 1 on attack + 3 bullet dmg vs targets at 4 HP or below.',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 1, 'Bloodscent'); },
};

// ----- Ultimates -----
// base/baseLabel are display tags only — they let HeroDetailSheet render the
// same ScalingPreview block under "Ultimate" that the Skill section uses, so
// the player sees consistent format for both. Ult source is the ult card
// (no stat scaling), so the preview shows "+0" / "Flat effect" by default.
const eff_ult_abrams: AbilityDef = {
  id: 'eff_ult_abrams', trigger: 'onPlay', target: 'noTarget',
  base: 4, baseLabel: 'spirit AOE',
  run: (G, ctx) => {
    const enemy = otherPlayer(ctx.movingPlayer);
    eachBoard(G, enemy, (c) => damageUnit(G, c, 4, 'spirit'));
  },
};
const eff_ult_dynamo: AbilityDef = {
  id: 'eff_ult_dynamo', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => {
    for (const b of G.players[otherPlayer(ctx.movingPlayer)].bench) if (b) addStatus(G, b, 'stun', 1, 2);
  },
};
const eff_ult_haze: AbilityDef = {
  id: 'eff_ult_haze', trigger: 'onPlay', target: 'noTarget',
  base: 2, baseLabel: 'bullet dmg per enemy',
  run: (G, ctx) => { eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => damageUnit(G, c, 2, 'attack')); },
};
const eff_ult_kelvin: AbilityDef = {
  id: 'eff_ult_kelvin', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => { for (const c of liveBoardCards(G.players[ctx.movingPlayer])) addStatus(G, c, 'unstoppable', 1, 1); },
};
const eff_ult_lady_geist: AbilityDef = {
  id: 'eff_ult_lady_geist', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => {
    const ally = G.players[ctx.movingPlayer].active;
    const enemy = G.players[otherPlayer(ctx.movingPlayer)].active;
    if (ally && enemy) { const t = ally.hp; ally.hp = enemy.hp; enemy.hp = t; pushLog(G, 'Souls swapped.'); }
  },
};
const eff_ult_lash: AbilityDef = {
  id: 'eff_ult_lash', trigger: 'onPlay', target: 'enemyActive',
  base: 6, baseLabel: 'bullet dmg',
  run: (G, _ctx, { target }) => { if (target) damageUnit(G, target, 6, 'attack'); },
};
const eff_ult_mo_krill: AbilityDef = {
  id: 'eff_ult_mo_krill', trigger: 'onPlay', target: 'enemyActive',
  base: 2, baseLabel: 'bleed (3t)',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'bleed', 2, 3); },
};
const eff_ult_paige: AbilityDef = {
  id: 'eff_ult_paige', trigger: 'onPlay', target: 'noTarget',
  base: 2, baseLabel: '+ATK to team',
  run: (G, ctx) => { for (const c of liveBoardCards(G.players[ctx.movingPlayer])) addStatus(G, c, 'weapon_power', 2, 2); },
};
const eff_ult_rem: AbilityDef = {
  id: 'eff_ult_rem', trigger: 'onPlay', target: 'noTarget',
  base: 4, baseLabel: 'heal team',
  run: (G, ctx) => { for (const c of liveBoardCards(G.players[ctx.movingPlayer])) healUnit(G, c, 4); },
};
const eff_ult_seven: AbilityDef = {
  id: 'eff_ult_seven', trigger: 'onPlay', target: 'noTarget',
  base: 3, baseLabel: 'spirit AOE',
  run: (G, ctx) => { eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => damageUnit(G, c, 3, 'spirit')); },
};
const eff_ult_shiv: AbilityDef = {
  id: 'eff_ult_shiv', trigger: 'onPlay', target: 'enemyActive',
  base: 3, baseLabel: 'bleed (3t)',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'bleed', 3, 3); },
};
const eff_ult_sinclair: AbilityDef = {
  id: 'eff_ult_sinclair', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => { for (const c of liveBoardCards(G.players[ctx.movingPlayer])) c.skillUsedThisTurn = false; },
};
const eff_ult_vindicta: AbilityDef = {
  id: 'eff_ult_vindicta', trigger: 'onPlay', target: 'enemyAny',
  base: 5, baseLabel: 'bullet dmg',
  run: (G, _ctx, { target }) => { if (target) damageUnit(G, target, 5, 'attack'); },
};
const eff_ult_viscous: AbilityDef = {
  id: 'eff_ult_viscous', trigger: 'onPlay', target: 'enemyActive',
  base: 3, baseLabel: 'bullet dmg + Unstoppable 2',
  run: (G, ctx, { source, target }) => {
    const ally = G.players[ctx.movingPlayer].active;
    if (ally) addStatus(G, ally, 'unstoppable', 1, 2);
    if (target) damageUnit(G, target, 3, 'attack');
  },
};
const eff_ult_yamato: AbilityDef = {
  id: 'eff_ult_yamato', trigger: 'onPlay', target: 'self',
  base: 3, baseLabel: '+ATK + Unstoppable',
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (t) { addStatus(G, t, 'weapon_power', 3, 999); addStatus(G, t, 'unstoppable', 1, 2); }
  },
};

// Wraith ultimate: Telekinesis. Lifts the enemy Active for big spirit damage + Stun 2.
const eff_ult_wraith: AbilityDef = {
  id: 'eff_ult_wraith', trigger: 'onPlay', target: 'enemyActive',
  base: 4, baseLabel: 'spirit + Stun 2',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    damageUnit(G, target, 4, 'spirit');
    addStatus(G, target, 'stun', 1, 2);
  },
};

// Warden ultimate Last Stand: canon is a big AoE spirit pulse. TCG mapping:
// 3 spirit damage to every enemy board card + lifesteal (heal Warden for
// total damage dealt / 2). Lets Warden tank up AND drain back HP on the
// big swing — pairs with his shield skill for sustain identity.
const eff_ult_warden: AbilityDef = {
  id: 'eff_ult_warden', trigger: 'onPlay', target: 'noTarget',
  base: 3, baseLabel: 'spirit AoE + lifesteal',
  run: (G, ctx) => {
    const enemy = otherPlayer(ctx.movingPlayer);
    let totalDealt = 0;
    eachBoard(G, enemy, (c) => {
      totalDealt += damageUnit(G, c, 3, 'spirit', 'Warden');
    });
    // Lifesteal back to Warden wherever he is on the caster's board.
    const ps = G.players[ctx.movingPlayer];
    const warden = [ps.active, ...ps.bench].find(
      (c) => c && c.cardId === 'hero_warden' && (c.respawnTurnsLeft ?? 0) === 0,
    );
    if (warden && totalDealt > 0) {
      const heal = Math.ceil(totalDealt / 2);
      healUnit(G, warden, heal);
      pushLog(G, `Last Stand: Warden drained ${heal} HP from the AoE.`);
    }
  },
};

// Mirage ultimate Traveler: canon Mirage teleports across the map. TCG
// abstraction: instant respawn of a fallen ally — Mirage ferries their soul
// back through the sands. Super-cheap ult cost so it's an emergency tempo
// recovery, not a finisher. If no corpses, fizzles.
const eff_ult_mirage: AbilityDef = {
  id: 'eff_ult_mirage', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => {
    const ps = G.players[ctx.movingPlayer];
    const corpses = [ps.active, ...ps.bench]
      .filter((c): c is CardInstance => c !== null && (c.respawnTurnsLeft ?? 0) > 0);
    if (corpses.length === 0) {
      pushLog(G, 'Traveler fizzled (no fallen heroes).');
      return;
    }
    // Revive whichever corpse is closest to natural respawn (lowest timer).
    corpses.sort((a, b) => (a.respawnTurnsLeft ?? 99) - (b.respawnTurnsLeft ?? 99));
    const c = corpses[0];
    c.respawnTurnsLeft = undefined;
    c.hp = c.hpMax;
    c.statuses = [];
    c.atkMod = 0;
    c.spiritMod = 0;
    c.skillUsedThisTurn = false;
    c.exhausted = false;
    pushLog(G, `Traveler: ${CARDS_BY_ID[c.cardId]?.name ?? c.cardId} returns to the field.`);
  },
};

// Drifter ultimate Eternal Night: canon wraps the field in darkness +
// isolation. TCG mapping: Silence every enemy bench card for 2 turns —
// reinforcements can't cast skills, can't promote into a Silenced active
// (silence carries with them). Sustains the lifesteal-into-execute loop
// by stopping the opponent from responding with skill counter-plays.
const eff_ult_drifter: AbilityDef = {
  id: 'eff_ult_drifter', trigger: 'onPlay', target: 'noTarget',
  base: 2, baseLabel: 'AoE bench Silence',
  run: (G, ctx) => {
    const enemy = G.players[otherPlayer(ctx.movingPlayer)];
    for (const b of enemy.bench) {
      if (b && (b.respawnTurnsLeft ?? 0) === 0) addStatus(G, b, 'silenced', 1, 2);
    }
  },
};

const ABILITIES_LIST: AbilityDef[] = [
  // ----- Spells (8 cards) -----
  eff_healing_rite, eff_rusted_barrel,
  eff_cold_front, eff_return_fire,
  eff_decay, eff_slowing_hex,
  eff_knockdown, eff_cast_metal_skin,
  // ----- Equipment passives + on-attach (3 cards) -----
  eff_bullet_armor, eff_spirit_armor, eff_extra_stamina,
  // ----- Equipment reactive procs (4 cards) -----
  eff_bullet_lifesteal_proc, eff_spirit_lifesteal_proc,
  eff_bullet_shield_proc, eff_spirit_shield_proc,
  // ----- Hero skills -----
  skill_dynamo, skill_kelvin, skill_lady_geist, skill_lash, skill_paige,
  skill_seven_static, skill_sinclair, skill_viscous, skill_yamato, skill_warden,
  // ----- Hero passives -----
  passive_abrams_heal, passive_haze_stunbonus, passive_mo_krill_burrow, passive_rem_benchheal,
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

export function getAbility(id: string): AbilityDef | undefined {
  return ABILITIES_BY_ID[id];
}

// Procs run inside withCast(..., 'proc') so nested damageUnit calls don't
// re-fire equipment triggers (would recurse on Mystic Burst, Mystic Reverb, etc.).
import { withCast as _withCast } from '@/engine/castContext';
setEquipmentDispatcher((G, bearer, kind, ctx, target) => {
  if (!bearer.attached) return;
  for (const eq of bearer.attached) {
    const data = CARDS_BY_ID[eq.cardId];
    if (!data || data.type !== 'equipment' || !data.abilities) continue;
    for (const aid of data.abilities) {
      const ability = ABILITIES_BY_ID[aid];
      if (ability && ability.trigger === kind) {
        _withCast(bearer, 'proc', () => ability.run(G, ctx, { source: bearer, target }));
      }
    }
  }
});
