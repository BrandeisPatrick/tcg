import type { GameState, CardInstance, PlayerID, StatusId } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { damageUnit, healUnit, reapDead } from '@/engine/damage';
import { addStatus, cleanseDebuffs } from '@/engine/statusOps';
import { findCardOnBoard, liveBoardCards, otherPlayer, pushLog, effectiveSpirit } from '@/engine/util';

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
  trigger: 'onPlay' | 'startOfTurn' | 'endOfTurn' | 'onAttack' | 'onDeath' | 'activate' | 'ongoing';
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

// ----- Spells -----
const eff_phantom_strike: AbilityDef = {
  id: 'eff_phantom_strike', trigger: 'onPlay', target: 'enemyAny',
  prompt: 'Phantom Strike — pick an enemy.',
  scalesSpirit: true, base: 6, baseLabel: 'dmg',
  run: (G, ctx, { target }) => {
    if (!target) return;
    damageUnit(G, target, 6 + activeSpi(G, ctx.movingPlayer), 'attack');
  },
};

const eff_cold_front: AbilityDef = {
  id: 'eff_cold_front', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Cold Front — Stun enemy Active.',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'stun', 1, 2); },
};

const eff_decay: AbilityDef = {
  id: 'eff_decay', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Decay — apply Bleed.',
  scalesSpirit: true, base: 3, baseLabel: 'Bleed',
  run: (G, ctx, { target }) => {
    if (target) addStatus(G, target, 'bleed', 3 + activeSpi(G, ctx.movingPlayer), 3);
  },
};

const eff_silence_glyph: AbilityDef = {
  id: 'eff_silence_glyph', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => {
    const enemy = otherPlayer(ctx.movingPlayer);
    eachBoard(G, enemy, (c) => addStatus(G, c, 'silenced', 1, 2));
  },
};

const eff_knockdown: AbilityDef = {
  id: 'eff_knockdown', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Knockdown — Stun 2 + Disarm 3.',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'stun', 1, 2);
    addStatus(G, target, 'disarm', 1, 3);
  },
};

// On-attach: Shield 3 on the bearer (target == hero being equipped).
const eff_enchanter_barrier_attach: AbilityDef = {
  id: 'eff_enchanter_barrier_attach', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'shield', 3, 999); },
};

const eff_ethereal_shift: AbilityDef = {
  id: 'eff_ethereal_shift', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Mythic Invincibility 2 on ally.',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'invincibility', 1, 2); },
};

const eff_return_fire: AbilityDef = {
  id: 'eff_return_fire', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Brace ally: +3 Bullet Resist for 1 turn.',
  scalesSpirit: true, base: 3, baseLabel: 'Bullet Resist',
  run: (G, ctx, { target }) => {
    if (target) addStatus(G, target, 'bullet_resist', 3 + activeSpi(G, ctx.movingPlayer), 1);
  },
};

const eff_echo_shard: AbilityDef = {
  id: 'eff_echo_shard', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => {
    const ps = G.players[ctx.movingPlayer];
    if (!ps.skillUsedThisTurn) {
      pushLog(G, `Echo Shard fizzled (no skill used yet this turn).`);
      return;
    }
    ps.skillUsedThisTurn = false;
    // Per-hero flags also reset so the same hero could cast again if desired.
    for (const c of [ps.active, ...ps.bench]) if (c) c.skillUsedThisTurn = false;
    pushLog(G, `Echo Shard: skill use refreshed — you can cast another skill this turn.`);
  },
};

// ----- On-attach equipment effects (target == bearer) -----
// Suppressor (equipment): when attached, the bearer's silencing field hits the enemy Active.
const eff_suppressor_attach: AbilityDef = {
  id: 'eff_suppressor_attach', trigger: 'onPlay', target: 'self',
  run: (G, ctx) => {
    const enemy = G.players[otherPlayer(ctx.movingPlayer)].active;
    if (enemy) addStatus(G, enemy, 'silenced', 1, 1);
  },
};

// Inhibitor (mythic equipment): on attach, grant bearer Spirit Resist 3 (permanent).
const eff_inhibitor_attach: AbilityDef = {
  id: 'eff_inhibitor_attach', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'spirit_resist', 3, 999); },
};

// New T1 equipment: every turn the bearer's exhaust is cleared. Distinct from
// Sprint Boots (one-shot on attach).
const eff_extra_stamina: AbilityDef = {
  id: 'eff_extra_stamina', trigger: 'startOfTurn', target: 'self',
  run: (G, _ctx, { source }) => {
    if (source) {
      source.exhausted = false;
    }
  },
};

// New T1 equipment: on attach the bearer gains the Long Range status permanently
// (can attack from the bench, same as Haze/Vindicta intrinsic flag).
const eff_mystic_expansion: AbilityDef = {
  id: 'eff_mystic_expansion', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (t) addStatus(G, t, 'long_range', 1, 999);
  },
};

// New T1 spell: 1-turn Spirit Power burst on ally. Mini Sinclair skill.
const eff_rusted_barrel: AbilityDef = {
  id: 'eff_rusted_barrel', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Rusted Barrel — +2 Spirit Power on ally for 1 turn.',
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'spirit_power', 2, 1);
  },
};

// New T1 spell: gain 2 souls immediately (net +1 after the cast cost). Cap at 7.
const eff_golden_goose: AbilityDef = {
  id: 'eff_golden_goose', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => {
    const ps = G.players[ctx.movingPlayer];
    const before = ps.souls;
    ps.souls = Math.min(7, ps.souls + 2);
    if (ps.souls > before) pushLog(G, `Golden Goose Egg: +${ps.souls - before} souls.`);
  },
};

const eff_improved_cooldown: AbilityDef = {
  id: 'eff_improved_cooldown', trigger: 'ongoing', target: 'self',
  // Pure marker: engine reads `improved_cooldown` from attached list and bypasses
  // the player-wide 1-skill-per-turn rule for the bearer. No state to apply.
  run: () => {},
};

const eff_diviners_kevlar: AbilityDef = {
  id: 'eff_diviners_kevlar', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'spirit_resist', 4, 999); },
};

const eff_boundless_spirit: AbilityDef = {
  id: 'eff_boundless_spirit', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'spirit_power', 5, 999); },
};

// ----- Mythic spells -----
const eff_curse: AbilityDef = {
  id: 'eff_curse', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Curse — Silence + Disarm + Vulnerable on enemy Active.',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'silenced', 1, 2);
    addStatus(G, target, 'disarm', 1, 2);
    addStatus(G, target, 'vulnerable', 1, 2);
  },
};

const eff_soul_rebirth: AbilityDef = {
  id: 'eff_soul_rebirth', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => {
    const ps = G.players[ctx.movingPlayer];
    if (ps.respawning.length === 0) { pushLog(G, 'Soul Rebirth fizzled (no fallen heroes).'); return; }
    // Bring the earliest-queued hero back immediately.
    const entry = ps.respawning.shift()!;
    const benchIdx = ps.bench.findIndex((b) => b === null);
    if (benchIdx === -1) {
      // No room — put back in queue with 0 to respawn next turn.
      ps.respawning.unshift({ ...entry, turnsLeft: 0 });
      pushLog(G, 'Soul Rebirth: no bench slot, will respawn next turn.');
      return;
    }
    const hero = entry.card;
    hero.zone = 'bench';
    hero.slot = (benchIdx + 1) as 1 | 2 | 3;
    hero.hp = hero.hpMax;
    hero.statuses = [];
    hero.atkMod = 0;
    hero.spiritMod = 0;
    hero.attached = [];
    hero.skillUsedThisTurn = false;
    hero.exhausted = false;
    ps.bench[benchIdx] = hero;
    pushLog(G, `Soul Rebirth: ${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} returned to the bench.`);
  },
};

// ----- Equipment -----
const eff_healing_rite: AbilityDef = {
  id: 'eff_healing_rite', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Healing Rite — heal an ally for 3.',
  scalesSpirit: true, base: 3, baseLabel: 'heal',
  run: (G, ctx, { target }) => {
    if (target) healUnit(G, target, 3 + activeSpi(G, ctx.movingPlayer));
  },
};

const eff_bullet_armor: AbilityDef = {
  id: 'eff_bullet_armor', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'bullet_resist', 2, 999); },
};

// Cast Metal Skin (spell): grant ally Bullet Resist 5 for 2 turns (canon T3 active).
const eff_cast_metal_skin: AbilityDef = {
  id: 'eff_cast_metal_skin', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Metal Skin — fortify an ally.',
  scalesSpirit: true, base: 5, baseLabel: 'Bullet Resist',
  run: (G, ctx, { target }) => {
    if (target) addStatus(G, target, 'bullet_resist', 5 + activeSpi(G, ctx.movingPlayer), 2);
  },
};

const eff_extra_regen: AbilityDef = {
  id: 'eff_extra_regen', trigger: 'startOfTurn', target: 'self',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 1); },
};

const eff_melee_lifesteal: AbilityDef = {
  id: 'eff_melee_lifesteal', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 1); },
};

const eff_berserker: AbilityDef = {
  id: 'eff_berserker', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'weapon_power', 1, 999); },
};

// Debuff Remover (equipment): on attach, cleanse all debuffs from the bearer.
const eff_debuff_remover_attach: AbilityDef = {
  id: 'eff_debuff_remover_attach', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) cleanseDebuffs(t); },
};

const eff_slowing_hex: AbilityDef = {
  id: 'eff_slowing_hex', trigger: 'onPlay', target: 'enemyAny',
  prompt: 'Slowing Hex — pick an enemy.',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'vulnerable', 1, 2);
    addStatus(G, target, 'disarm', 1, 2);
  },
};

const eff_spirit_armor: AbilityDef = {
  id: 'eff_spirit_armor', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'spirit_resist', 2, 999); },
};

// Sprint Boots (equipment): on attach, refresh bearer (clears exhaust this turn).
const eff_sprint_boots_attach: AbilityDef = {
  id: 'eff_sprint_boots_attach', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) { t.exhausted = false; pushLog(G, `${t.cardId} refreshed (Sprint Boots).`); } },
};

// Disarming Hex (spell): disarm a target enemy for 2 turns.
const eff_disarming_hex: AbilityDef = {
  id: 'eff_disarming_hex', trigger: 'onPlay', target: 'enemyAny',
  prompt: 'Disarming Hex — Disarm 3 turns.',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'disarm', 1, 3); },
};

const eff_frenzy: AbilityDef = {
  id: 'eff_frenzy', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'weapon_power', 1, 999); },
};

const eff_mystic_reverb: AbilityDef = {
  id: 'eff_mystic_reverb', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'spirit_power', 3, 999); },
};

// Cast Divine Barrier (spell): cast a heavy shield (5) on the ally Active.
const eff_cast_divine_barrier: AbilityDef = {
  id: 'eff_cast_divine_barrier', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Divine Barrier — Shield 5 on ally.',
  scalesSpirit: true, base: 5, baseLabel: 'Shield',
  run: (G, ctx, { target }) => {
    if (target) addStatus(G, target, 'shield', 5 + activeSpi(G, ctx.movingPlayer), 999);
  },
};

// ----- Hero skills (active, "Activate" trigger) -----
// Each skill declares its scaling (spirit / bullet / both / none).
// Base damage stays its original type. Scaling adds a second damage event of the matching type.

const skill_dynamo: AbilityDef = {
  id: 'skill_dynamo', trigger: 'activate', target: 'allyHero', exhausts: true,
  prompt: 'Dynamo skill — heal an ally for 3.',
  base: 3, baseLabel: 'heal',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) healUnit(G, target, 3 + spi(source)); },
};

const skill_kelvin: AbilityDef = {
  id: 'skill_kelvin', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Kelvin Arctic Beam — 2 spirit dmg.',
  base: 2, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target) return;
    damageUnit(G, target, 2 + spi(source), 'spirit');
  },
};

const skill_lady_geist: AbilityDef = {
  id: 'skill_lady_geist', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Lady Geist — 3 spirit dmg.',
  base: 3, baseLabel: 'dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) damageUnit(G, target, 3 + spi(source), 'spirit'); },
};

const skill_lash: AbilityDef = {
  id: 'skill_lash', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Lash Ground Strike — 3 spirit dmg + Stun 1 turn.',
  base: 3, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target) return;
    damageUnit(G, target, 3 + spi(source), 'spirit');
    addStatus(G, target, 'stun', 1, 1);
  },
};

const skill_paige: AbilityDef = {
  id: 'skill_paige', trigger: 'activate', target: 'allyHero', exhausts: true,
  prompt: 'Paige Plot Armor — Shield 5 on ally.',
  base: 5, baseLabel: 'shield',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) addStatus(G, target, 'shield', 5 + spi(source), 999); },
};

// Static Charge: long-fuse delayed stun. Applies Charged for 2 turns; on
// expiry the tick handler in statusOps converts it to a 2-turn Stun — the
// payoff for the long wait. Costs the player a soul slot to plan around.
const skill_seven_static: AbilityDef = {
  id: 'skill_seven_static', trigger: 'activate', target: 'enemyActive', exhausts: true,
  prompt: 'Seven Static Charge — apply Charged 2 turns to enemy Active. Stuns for 2 turns on expiry.',
  base: 2, baseLabel: 'turn fuse',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'charged', 1, 2); },
};

const skill_sinclair: AbilityDef = {
  id: 'skill_sinclair', trigger: 'activate', target: 'allyHero', exhausts: true,
  prompt: 'Sinclair — +2 Spirit Power 2 turns.',
  // pure utility buff — no scaling
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'spirit_power', 2, 2); },
};

const skill_viscous: AbilityDef = {
  id: 'skill_viscous', trigger: 'activate', target: 'self', exhausts: true,
  prompt: 'Viscous Cube Form — Invincible 1.',
  // pure defensive — no scaling
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'invincibility', 1, 1); },
};

const skill_yamato: AbilityDef = {
  id: 'skill_yamato', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Yamato Power Slash — 5 spirit dmg.',
  base: 5, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) damageUnit(G, target, 5 + spi(source), 'spirit'); },
};

// ----- Hero passives (always-on or trigger-based, no Activate) -----

const passive_abrams_heal: AbilityDef = {
  id: 'passive_abrams_heal', trigger: 'startOfTurn', target: 'self',
  run: (G, _ctx, { source }) => {
    if (!source) return;
    const found = findCardOnBoard(G, source.iid);
    if (found && found.card === source && source.zone === 'active') healUnit(G, source, 2);
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
  prompt: 'Flight — takes 1 less attack (bullet) damage from all sources.',
  run: () => { /* damage hook reads this directly */ },
};

// Mixed damage: marker passive. Combat resolver splits Wraith's attack into
// half bullet / half spirit, each subject to its own resist.
const passive_wraith_mixed: AbilityDef = {
  id: 'passive_wraith_mixed', trigger: 'ongoing', target: 'self',
  prompt: 'Mixed Bullets — attacks split half bullet, half spirit.',
  run: () => { /* combat hook reads this directly */ },
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
  base: 2, baseLabel: 'dmg per enemy',
  run: (G, ctx) => { eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => damageUnit(G, c, 2, 'attack')); },
};
const eff_ult_kelvin: AbilityDef = {
  id: 'eff_ult_kelvin', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx) => { for (const c of liveBoardCards(G.players[ctx.movingPlayer])) addStatus(G, c, 'invincibility', 1, 1); },
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
  base: 6, baseLabel: 'dmg',
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
  base: 5, baseLabel: 'dmg',
  run: (G, _ctx, { target }) => { if (target) damageUnit(G, target, 5, 'attack'); },
};
const eff_ult_viscous: AbilityDef = {
  id: 'eff_ult_viscous', trigger: 'onPlay', target: 'enemyActive',
  base: 3, baseLabel: 'dmg + self Invinc 2',
  run: (G, ctx, { source, target }) => {
    const ally = G.players[ctx.movingPlayer].active;
    if (ally) addStatus(G, ally, 'invincibility', 1, 2);
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

const ABILITIES_LIST: AbilityDef[] = [
  // ----- Spells (active items + healing_rite + TCG-original soul_rebirth) -----
  eff_healing_rite, eff_rusted_barrel, eff_golden_goose,
  eff_cold_front, eff_decay, eff_ethereal_shift, eff_phantom_strike,
  eff_return_fire, eff_echo_shard, eff_knockdown, eff_silence_glyph, eff_disarming_hex,
  eff_cast_metal_skin, eff_slowing_hex,
  eff_curse, eff_cast_divine_barrier, eff_soul_rebirth,
  // ----- Equipment (passive items + on-attach procs) -----
  eff_bullet_armor, eff_extra_regen, eff_melee_lifesteal, eff_berserker, eff_spirit_armor,
  eff_frenzy, eff_mystic_reverb, eff_improved_cooldown, eff_diviners_kevlar, eff_boundless_spirit,
  eff_extra_stamina, eff_mystic_expansion,
  // On-attach equipment (formerly spells, repurposed for is_active_item=false canon)
  eff_sprint_boots_attach, eff_enchanter_barrier_attach, eff_debuff_remover_attach,
  eff_suppressor_attach, eff_inhibitor_attach,
  // ----- Hero skills (9 skill-only heroes) -----
  skill_dynamo, skill_kelvin, skill_lady_geist, skill_lash, skill_paige,
  skill_seven_static, skill_sinclair, skill_viscous, skill_yamato,
  // ----- Hero passives (7 passive-only heroes incl. Wraith) -----
  passive_abrams_heal, passive_haze_stunbonus, passive_mo_krill_burrow, passive_rem_benchheal,
  passive_shiv_bleed, passive_vindicta_flight, passive_wraith_mixed,
  // ----- Ultimates (one per hero, +Wraith) -----
  eff_ult_abrams, eff_ult_dynamo, eff_ult_haze, eff_ult_kelvin, eff_ult_lady_geist,
  eff_ult_lash, eff_ult_mo_krill, eff_ult_paige, eff_ult_rem, eff_ult_seven,
  eff_ult_shiv, eff_ult_sinclair, eff_ult_vindicta, eff_ult_viscous, eff_ult_yamato,
  eff_ult_wraith,
];

export const ABILITIES_BY_ID: Record<string, AbilityDef> = Object.fromEntries(
  ABILITIES_LIST.map((a) => [a.id, a]),
);

export function getAbility(id: string): AbilityDef | undefined {
  return ABILITIES_BY_ID[id];
}
