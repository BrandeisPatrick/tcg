import type { GameState, CardInstance, PlayerID, StatusId } from '@/engine/types';
import { CARDS_BY_ID, ULTIMATES } from '@/cards';
import { damageUnit, healUnit, reapDead } from '@/engine/damage';
import { addStatus, cleanseDebuffs } from '@/engine/statusOps';
import { drawCards, consumeEquipment } from '@/engine/deckOps';
import { findCardOnBoard, liveBoardCards, otherPlayer, pushLog, effectiveSpirit, nextIid } from '@/engine/util';
import { setEquipmentDispatcher, fireEquipmentTriggers } from '@/engine/equipmentDispatch';

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

// Helper: spirit scaling for ULTIMATES. The handler's `source` is the ult card
// (no spirit), but ults run inside withCast(linkedHero, 'ult', …), so the
// linked hero is the cast-context source — read its effective Spirit here so a
// spirit-built hero's ultimate scales (e.g. a Spirit Abrams). 0 if no linked
// hero on board (e.g. a Sinclair-copied ult).
export function ultSpi(): number {
  const src = currentCast()?.source;
  return src ? effectiveSpirit(src) : 0;
}

// Helper: deal damage to all of a player's board cards
function eachBoard(G: GameState, pid: PlayerID, fn: (c: CardInstance) => void) {
  for (const c of liveBoardCards(G.players[pid])) fn(c);
  reapDead(G, G.players[pid]);
}

// ----- Spells (7 cards) -----

// Cost 1 — T1 floor. Heals are flat (Spirit Power scales spirit damage only).
const eff_healing_rite: AbilityDef = {
  id: 'eff_healing_rite', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Healing Rite — heal an ally for 2.',
  base: 2, baseLabel: 'heal',
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

// Cost 3 — T2 spirit burst.
const eff_cold_front: AbilityDef = {
  id: 'eff_cold_front', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Cold Front — 4 spirit damage to enemy Active.',
  scalesSpirit: true, base: 4, baseLabel: 'spirit dmg',
  run: (G, ctx, { target }) => {
    if (target) damageUnit(G, target, 4 + activeSpi(G, ctx.movingPlayer), 'spirit', 'Cold Front');
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

// Canon Healbane: reduces healing on target. TCG: block healing for 2 turns.
const eff_healbane: AbilityDef = {
  id: 'eff_healbane', trigger: 'onPlay', target: 'enemyAny',
  prompt: 'Healbane — block healing on any enemy for 2 turns.',
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'healing_boost_down', 1, 2);
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

// Cost 5 — T3 premium DoT.
const eff_decay: AbilityDef = {
  id: 'eff_decay', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Decay — apply Bleed 3 for 2 turns.',
  scalesSpirit: false, base: 3, baseLabel: 'Bleed',
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

// Cost 6 — short, sharp hard CC: a clean 1-turn stun (Curse is the long sister).
const eff_knockdown: AbilityDef = {
  id: 'eff_knockdown', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Knockdown — Stun the enemy Active for 1 turn.',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'stun', 1, 1);
  },
};

// ----- Control spell pack (canon active items → spells) -----

// Silence Glyph (canon T3 spirit): damage + Silence the enemy Active 2 turns.
const eff_silence_glyph: AbilityDef = {
  id: 'eff_silence_glyph', trigger: 'onPlay', target: 'enemyActive',
  base: 2, baseLabel: 'spirit dmg + Silence',
  scalesSpirit: true,
  run: (G, ctx, { target }) => {
    if (!target) return;
    damageUnit(G, target, 2 + activeSpi(G, ctx.movingPlayer), 'spirit');
    addStatus(G, target, 'silenced', 1, 2);
  },
};

// Curse (canon T4 spirit): long lockdown — Silence + Disarm for 3 turns. The
// dead-weight active pressures a retreat (no forced swap).
const eff_curse: AbilityDef = {
  id: 'eff_curse', trigger: 'onPlay', target: 'enemyActive',
  prompt: 'Curse — Silence + Disarm the enemy Active for 3 turns.',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'silenced', 1, 3);
    addStatus(G, target, 'disarm', 1, 3);
  },
};

// Debuff Remover (canon vitality): cleanse a hero's debuffs + grant Shield 2.
const eff_debuff_remover: AbilityDef = {
  id: 'eff_debuff_remover', trigger: 'onPlay', target: 'allyHero',
  base: 2, baseLabel: 'cleanse + Shield',
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (!t) return;
    cleanseDebuffs(t);
    addStatus(G, t, 'shield', 2, 999);
  },
};

// Unstoppable (canon T4 vitality, as a spell): the active hero gains
// Unstoppable for 1 turn (cleanses CC on apply; immune to damage + CC). Strong,
// but it's a one-shot card so the cost is the balance lever.
const eff_unstoppable_cast: AbilityDef = {
  id: 'eff_unstoppable_cast', trigger: 'onPlay', target: 'allyHero',
  base: 1, baseLabel: 'Unstoppable',
  run: (G, _ctx, { source, target }) => {
    const t = target ?? source;
    if (t) addStatus(G, t, 'unstoppable', 1, 1);
  },
};

// Echo Shard (canon: recast last ability): the active hero uses their skill
// AGAIN this turn — bypasses the one-skill-per-turn cap and pays no skill cost,
// and re-fires onBearerSkillUsed so cast-payoff gear (Cooldown draw, Mystic
// Burst, Surge, Quicksilver) triggers a second time. Auto-targets to match the
// skill's filter (enemy Active for offense, the hero itself for buffs). Fizzles
// politely on a skill-less / passive hero.
const eff_echo_shard: AbilityDef = {
  id: 'eff_echo_shard', trigger: 'onPlay', target: 'noTarget',
  run: (G, ctx, _args) => {
    const ps = G.players[ctx.movingPlayer];
    const hero = ps.active;
    if (!hero || (hero.respawnTurnsLeft ?? 0) > 0) { pushLog(G, 'Echo Shard fizzled — no active hero.'); return; }
    const data = CARDS_BY_ID[hero.cardId];
    if (data?.type !== 'hero' || !data.skill) { pushLog(G, 'Echo Shard fizzled — hero has no skill.'); return; }
    const skill = getAbility(data.skill);
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
    pushLog(G, `Echo Shard: ${data.name} casts ${data.abilityName ?? 'their skill'} again.`);
    _withCast(hero, 'skill', () => skill.run(G, { movingPlayer: ctx.movingPlayer }, { source: hero, target }));
    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: ctx.movingPlayer });
  },
};

// Bullet Resist is flat — Spirit Power scales spirit damage only.
const eff_cast_metal_skin: AbilityDef = {
  id: 'eff_cast_metal_skin', trigger: 'onPlay', target: 'allyHero',
  prompt: 'Metal Skin — Bullet Resist 5 for 2 turns.',
  base: 5, baseLabel: 'Bullet Resist',
  run: (G, _ctx, { target }) => {
    if (target) addStatus(G, target, 'bullet_resist', 5, 2);
  },
};

// ----- Equipment passive effects + on-attach -----

// Bullet / Spirit Resilience: permanent resist stick (T3, cost 5).
const eff_bullet_resist: AbilityDef = {
  id: 'eff_bullet_resist', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'bullet_resist', 3, 999); },
};
const eff_spirit_resist: AbilityDef = {
  id: 'eff_spirit_resist', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'spirit_resist', 3, 999); },
};

// Healing chain: Extra Regen (+1 HP) → Healing Booster → Healing Tempo.
// Booster and Tempo grant the Healing Boost keyword at escalating magnitudes.
const eff_healing_booster: AbilityDef = {
  id: 'eff_healing_booster', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'healing_boost', 2, 999); },
};
const eff_healing_tempo: AbilityDef = {
  id: 'eff_healing_tempo', trigger: 'onPlay', target: 'self',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'healing_boost', 4, 999); },
};

// ----- Equipment reactive triggers -----

// Bullet Resist Shredder: bearer's attacks apply Bullet Vulnerable 1 for 1 turn.
const eff_bullet_resist_shredder_proc: AbilityDef = {
  id: 'eff_bullet_resist_shredder_proc', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { source, target }) => { if (target) addStatus(G, target, 'bullet_resist_down', 1, 1); },
};

// Restorative Shot: after bearer's basic attack, heal 1.
const eff_restorative_shot_proc: AbilityDef = {
  id: 'eff_restorative_shot_proc', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 1, 'Restorative Shot'); },
};

// Extra Regen: at the start of the bearer's turn, heal 1 (regen-over-time).
const eff_extra_regen_proc: AbilityDef = {
  id: 'eff_extra_regen_proc', trigger: 'startOfTurn', target: 'self',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 1, 'Extra Regen'); },
};

// Mystic Regeneration: after bearer's skill / spell / ult damages an enemy, heal 1.
const eff_mystic_regeneration_proc: AbilityDef = {
  id: 'eff_mystic_regeneration_proc', trigger: 'onBearerSkillDamage', target: 'self',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 1, 'Mystic Regeneration'); },
};

// Lifesteal family (canon Bullet/Spirit Lifesteal → Leech): the heal-2 tier-up
// of Restorative Shot (on attack) / Mystic Regeneration (on skill damage). The
// T4 Leech runs BOTH — its real canon build path is Bullet + Spirit Lifesteal.
const eff_bullet_lifesteal: AbilityDef = {
  id: 'eff_bullet_lifesteal', trigger: 'onAttack', target: 'self',
  base: 2, baseLabel: 'heal',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 2, 'Bullet Lifesteal'); },
};
const eff_spirit_lifesteal: AbilityDef = {
  id: 'eff_spirit_lifesteal', trigger: 'onBearerSkillDamage', target: 'self',
  base: 2, baseLabel: 'heal',
  run: (G, _ctx, { source }) => { if (source) healUnit(G, source, 2, 'Spirit Lifesteal'); },
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

// Cooldown family (Improved / Superior Cooldown, Refresher): each time the
// bearer uses a skill, draw a card and spend one of the item's charges. When
// the charges run out the item breaks (goes to discard, freeing the slot).
// Shared by all three — the charge count lives on the equipment instance.
// If the draw fizzles (hand full / deck empty) no charge is spent, so the
// value is held rather than wasted.
const eff_cooldown_draw: AbilityDef = {
  id: 'eff_cooldown_draw', trigger: 'onBearerSkillUsed', target: 'self',
  run: (G, _ctx, { source, params }) => {
    const eq = params?.equip as CardInstance | undefined;
    if (!source || !eq || (eq.charges ?? 0) <= 0) return;
    const drew = drawCards(G, source.ownerId, 1);
    if (drew > 0) {
      eq.charges = (eq.charges ?? 0) - 1;
      if (eq.charges <= 0) consumeEquipment(G, source, eq);
    }
  },
};

// Mystic Burst family: each time the bearer uses a skill, hit the enemy active
// with a flat burst of spirit damage (canon Mystic Burst). Runs in the proc
// cast-context so it doesn't re-fire the bearer's own skill-damage triggers,
// but still respects the enemy's resist / reactive spirit shield. Tiers 2 / 3.
function mysticBurst(amount: number, label: string): AbilityDef['run'] {
  return (G, ctx) => {
    const enemy = G.players[otherPlayer(ctx.movingPlayer)].active;
    if (enemy && (enemy.respawnTurnsLeft ?? 0) === 0) damageUnit(G, enemy, amount, 'spirit', label);
  };
}
const eff_mystic_burst_proc: AbilityDef = {
  id: 'eff_mystic_burst_proc', trigger: 'onBearerSkillUsed', target: 'enemyActive',
  base: 2, baseLabel: 'spirit dmg', run: mysticBurst(2, 'Mystic Burst'),
};
const eff_improved_burst_proc: AbilityDef = {
  id: 'eff_improved_burst_proc', trigger: 'onBearerSkillUsed', target: 'enemyActive',
  base: 3, baseLabel: 'spirit dmg', run: mysticBurst(3, 'Improved Burst'),
};

// ----- Cast-payoff items (functionality tied to skill / ult activation) -----

// Surge of Power: after the bearer uses a skill, gain +2 Bullet Power this turn
// (weapon_power, duration 1 — present for the end-of-turn attack phase, gone by
// the bearer's next turn). Canon Surge of Power empowers you right after a cast.
const eff_surge_of_power: AbilityDef = {
  id: 'eff_surge_of_power', trigger: 'onBearerSkillUsed', target: 'self',
  base: 2, baseLabel: 'Bullet Power',
  run: (G, _ctx, { source }) => { if (source) addStatus(G, source, 'weapon_power', 2, 1); },
};

// Diviner's Kevlar: after the bearer casts their ultimate, gain Shield 4.
// Tied to ult activation (onBearerUltCast), not skill use.
const eff_diviners_kevlar: AbilityDef = {
  id: 'eff_diviners_kevlar', trigger: 'onBearerUltCast', target: 'self',
  base: 4, baseLabel: 'shield',
  run: (G, _ctx, { source }) => { if (source) addStatus(G, source, 'shield', 4, 999); },
};

// Quicksilver Reload: canon "casting reloads your weapon" — after the bearer
// uses a skill they get an extra basic attack this turn at half power. The
// flag is consumed in resolveAttackPhase (end of turn).
const eff_quicksilver_reload: AbilityDef = {
  id: 'eff_quicksilver_reload', trigger: 'onBearerSkillUsed', target: 'self',
  run: (_G, _ctx, { source }) => { if (source) source.extraHalfAttack = true; },
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

// Toxic Bullets (canon T3 weapon): attacks apply stacking Bleed.
const eff_toxic_bullets: AbilityDef = {
  id: 'eff_toxic_bullets', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'bleed', 1, 2); },
};

// Tesla Bullets (canon T3 weapon): the shot "jumps" — chain 1 bullet damage to
// an enemy bench hero. Runs in proc cast-context so it doesn't re-fire onAttack.
const eff_tesla_bullets: AbilityDef = {
  id: 'eff_tesla_bullets', trigger: 'onAttack', target: 'self',
  base: 1, baseLabel: 'chain dmg',
  run: (G, _ctx, { source }) => {
    if (!source) return;
    const enemy = otherPlayer(source.ownerId);
    const jump = G.players[enemy].bench.find((b) => b && (b.respawnTurnsLeft ?? 0) === 0);
    if (jump) damageUnit(G, jump, 1, 'attack', 'Tesla Bullets');
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
  base: 3, baseLabel: 'shield',
  run: (G, _ctx, { source }) => { if (source) addStatus(G, source, 'shield', 3, 999); },
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

// Crippling Headshot (T3 weapon): attacks apply Vulnerable — Bullet + Spirit
// Resist −1 (refresh, 2 turns).
const eff_crippling_headshot: AbilityDef = {
  id: 'eff_crippling_headshot', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'bullet_resist_down', 1, 2);
    addStatus(G, target, 'spirit_resist_down', 1, 2);
  },
};

// Berserker (T3 weapon): take bullet damage → gain +1 Bullet Power, cap +4.
// Stored as a weapon_power status (duration 999) so it clears on death.
const eff_berserker: AbilityDef = {
  id: 'eff_berserker', trigger: 'onBearerDamagedByBullet', target: 'self',
  run: (G, _ctx, { source }) => {
    if (!source) return;
    const cur = source.statuses.find((s) => s.id === 'weapon_power')?.value ?? 0;
    addStatus(G, source, 'weapon_power', Math.min(4, cur + 1), 999);
  },
};

// Colossus (T3 vitality): big HP (bonus on the card) + permanent Bullet Resist 2.
const eff_colossus: AbilityDef = {
  id: 'eff_colossus', trigger: 'onPlay', target: 'self',
  base: 2, baseLabel: 'Bullet Resist',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'bullet_resist', 2, 999); },
};

// Improved Bullet / Spirit Armor (T3 vitality): tier-up resists (4).
const eff_improved_bullet_armor: AbilityDef = {
  id: 'eff_improved_bullet_armor', trigger: 'onPlay', target: 'self',
  base: 4, baseLabel: 'Bullet Resist',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'bullet_resist', 4, 999); },
};
const eff_improved_spirit_armor: AbilityDef = {
  id: 'eff_improved_spirit_armor', trigger: 'onPlay', target: 'self',
  base: 4, baseLabel: 'Spirit Resist',
  run: (G, _ctx, { source, target }) => { const t = target ?? source; if (t) addStatus(G, t, 'spirit_resist', 4, 999); },
};

// Frenzy (T4 weapon): while the bearer is below half HP, heal 2 on attack.
// (The +3 Bullet Power half of Frenzy is applied in combat's effectiveAttackDamage.)
const eff_frenzy: AbilityDef = {
  id: 'eff_frenzy', trigger: 'onAttack', target: 'self',
  base: 2, baseLabel: 'heal while <½ HP',
  run: (G, _ctx, { source }) => {
    if (source && source.hp < source.hpMax / 2) healUnit(G, source, 2, 'Frenzy');
  },
};

// Siphon Bullets (T4 weapon): attacks steal 1 max HP from the target to the
// bearer, TEMPORARILY — the siphon_drain / siphon_gain statuses revert the
// maxHP on expiry (tickStartOfTurn) and on death (killInPlace), so it's a
// 2-turn swing, not a permanent transfer. hvalue 0 → not cleansable.
const eff_siphon_bullets: AbilityDef = {
  id: 'eff_siphon_bullets', trigger: 'onAttack', target: 'self',
  run: (G, _ctx, { source, target }) => {
    if (!source || !target) return;
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
    }
  },
};

// ----- Hero skills (active, "Activate" trigger) -----
// Each skill declares its scaling (spirit / bullet / both / none).
// Base damage stays its original type. Scaling adds a second damage event of the matching type.

// Heals are flat — Spirit Power scales spirit damage only.
const skill_dynamo: AbilityDef = {
  id: 'skill_dynamo', trigger: 'activate', target: 'allyHero', exhausts: true,
  prompt: 'Dynamo Rejuvenating Aurora — heal an ally 2 + grant Bullet Power (1 + ½ Spirit) for 2 turns.',
  base: 2, baseLabel: 'heal',
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
const skill_kelvin: AbilityDef = {
  id: 'skill_kelvin', trigger: 'activate', target: 'enemyActive', exhausts: true,
  prompt: 'Kelvin Frost Grenade — 1 spirit dmg to enemy Active + heal ally Active 2.',
  base: 1, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, ctx, { source, target }) => {
    if (target) damageUnit(G, target, 1 + spi(source), 'spirit');
    const ally = G.players[ctx.movingPlayer].active;
    if (ally) healUnit(G, ally, 2);
  },
};

const skill_lady_geist: AbilityDef = {
  id: 'skill_lady_geist', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Lady Geist — 2 spirit dmg.',
  base: 2, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) damageUnit(G, target, 2 + spi(source), 'spirit'); },
};

const skill_lash: AbilityDef = {
  id: 'skill_lash', trigger: 'activate', target: 'enemyAny', exhausts: true,
  prompt: 'Lash Ground Strike — 1 spirit dmg + Vulnerable (take +1 dmg) for 1 turn.',
  base: 1, baseLabel: 'spirit dmg',
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
const skill_paige: AbilityDef = {
  id: 'skill_paige', trigger: 'activate', target: 'allyHero', exhausts: true,
  prompt: 'Paige Plot Armor — Shield 2 + grant Bullet Power (1 + ½ Spirit) for 2 turns.',
  base: 2, baseLabel: 'shield',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (!target) return;
    addStatus(G, target, 'shield', 2, 999);
    addStatus(G, target, 'weapon_power', 1 + Math.floor(spi(source) / 2), 2);
  },
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
  prompt: 'Sinclair Vexing Bolt — 2 spirit dmg to any enemy.',
  base: 2, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => {
    if (target) damageUnit(G, target, 2 + spi(source), 'spirit');
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
  prompt: 'Yamato Power Slash — 1 spirit dmg.',
  base: 1, baseLabel: 'spirit dmg',
  scalesSpirit: true,
  run: (G, _ctx, { source, target }) => { if (target) damageUnit(G, target, 1 + spi(source), 'spirit'); },
};

// Warden skill: hardens himself with a Shield. Canon Warden hunkers down
// behind his shackle barrier before unleashing Last Stand — TCG abstraction
// is a flat self-buff Shield.
const skill_warden: AbilityDef = {
  id: 'skill_warden', trigger: 'activate', target: 'self', exhausts: true,
  prompt: 'Warden Willpower — Shield 3 on self.',
  base: 3, baseLabel: 'shield',
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
const passive_mirage_djinns_mark: AbilityDef = {
  id: 'passive_mirage_djinns_mark', trigger: 'onAttack', target: 'self',
  prompt: "Djinn's Mark — attacks apply 1 stack (max 4) for 3 turns. Detonates at 4 stacks or on expiry for 3 spirit dmg per stack.",
  run: (G, _ctx, { source, target }) => {
    if (!source || !target) return;
    addStatus(G, target, 'djinns_mark', 1, 3);
    const mark = target.statuses.find((s) => s.id === 'djinns_mark');
    if (mark && mark.value >= 4) {
      pushLog(G, `${CARDS_BY_ID[target.cardId]?.name ?? target.cardId} — Djinn's Mark detonates.`);
      damageUnit(G, target, 3 * mark.value, 'spirit');
      target.statuses = target.statuses.filter((s) => s.id !== 'djinns_mark');
    }
  },
};

const passive_abrams_heal: AbilityDef = {
  id: 'passive_abrams_heal', trigger: 'startOfTurn', target: 'self',
  prompt: 'Infernal Resilience — start of own turn while Active: heal 1.',
  run: (G, _ctx, { source }) => {
    if (!source) return;
    const found = findCardOnBoard(G, source.iid);
    if (found && found.card === source && source.zone === 'active') {
      healUnit(G, source, 1, 'Infernal Resilience');
    }
  },
};

// Fixation: +2 Bullet Power vs Stunned targets. The damage hook lives in
// `combat.ts:effectiveAttackDamage` — this is a marker so the registry
// owns the definition and the UI can show a trigger label.
const passive_haze_stunbonus: AbilityDef = {
  id: 'passive_haze_stunbonus', trigger: 'ongoing', target: 'self',
  prompt: 'Fixation — +2 Bullet Power vs Stunned targets.',
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
  prompt: "Lil Helpers — start of own turn: heal ally Active 3 while on the bench.",
  run: (G, ctx, { source }) => {
    if (!source || source.zone !== 'bench') return;
    const ally = G.players[ctx.movingPlayer].active;
    if (ally) healUnit(G, ally, 3);
  },
};

// On every attack Shiv lands, apply Bleed 1 (2 turns) to the target.
const passive_shiv_bleed: AbilityDef = {
  id: 'passive_shiv_bleed', trigger: 'onAttack', target: 'self',
  prompt: "Serrated Knives — attacks apply Bleed 2 for 2 turns.",
  run: (G, _ctx, { source, target }) => {
    if (source && target) addStatus(G, target, 'bleed', 2, 2);
  },
};

// Flight: marker passive. The actual mitigation lives in `damageUnit` (skills
// + spells) and the planner in `combat.ts` (basic attacks).
const passive_vindicta_flight: AbilityDef = {
  id: 'passive_vindicta_flight', trigger: 'ongoing', target: 'self',
  prompt: 'Flight — takes 1 less bullet damage from all sources.',
  run: () => {},
};

// Mixed Bullets: Wraith's basic attack deals Bullet Power as bullet damage
// (the normal swing) PLUS her full Spirit Power as a second spirit-damage hit —
// so Weapon AND Spirit items both scale her, and she pierces either single
// resist. Fires on every attack (and retaliation) like Shiv's bleed.
const passive_wraith_mixed: AbilityDef = {
  id: 'passive_wraith_mixed', trigger: 'onAttack', target: 'self',
  prompt: 'Mixed Bullets — attacks also deal Spirit Power as spirit damage.',
  run: (G, _ctx, { source, target }) => {
    if (!source || !target) return;
    const sp = effectiveSpirit(source);
    if (sp > 0) damageUnit(G, target, sp, 'spirit', 'Mixed Bullets');
  },
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
  base: 4, baseLabel: 'spirit AOE + Stun',
  run: (G, ctx) => {
    const enemy = otherPlayer(ctx.movingPlayer);
    const s = ultSpi();
    eachBoard(G, enemy, (c) => damageUnit(G, c, 4 + s, 'spirit'));
    const act = G.players[enemy].active;
    if (act && (act.respawnTurnsLeft ?? 0) === 0) addStatus(G, act, 'stun', 1, 1);
  },
};
const eff_ult_dynamo: AbilityDef = {
  id: 'eff_ult_dynamo', trigger: 'onPlay', target: 'noTarget',
  baseLabel: 'AoE Stun',
  run: (G, ctx) => { eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => addStatus(G, c, 'stun', 1, 1)); },
};
const eff_ult_haze: AbilityDef = {
  id: 'eff_ult_haze', trigger: 'onPlay', target: 'noTarget',
  base: 3, baseLabel: 'bullet dmg per enemy',
  run: (G, ctx) => { const s = ultSpi(); eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => damageUnit(G, c, 3 + s, 'attack')); },
};
const eff_ult_kelvin: AbilityDef = {
  id: 'eff_ult_kelvin', trigger: 'onPlay', target: 'noTarget',
  base: 7, baseLabel: 'heal team',
  run: (G, ctx) => { for (const c of liveBoardCards(G.players[ctx.movingPlayer])) healUnit(G, c, 7, 'Frozen Shelter'); },
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
  id: 'eff_ult_lash', trigger: 'onPlay', target: 'noTarget',
  base: 5, baseLabel: 'spirit AOE + Stun',
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
  base: 6, baseLabel: 'drain + Stun',
  run: (G, ctx, { target }) => {
    if (!target) return;
    addStatus(G, target, 'stun', 1, 1);
    const dealt = damageUnit(G, target, 6 + ultSpi(), 'spirit', 'Combo');
    const ps = G.players[ctx.movingPlayer];
    const mk = [ps.active, ...ps.bench].find((c) => c && c.cardId === 'hero_mo_krill' && (c.respawnTurnsLeft ?? 0) === 0);
    if (mk && dealt > 0) healUnit(G, mk, dealt, 'Combo');
  },
};
const eff_ult_paige: AbilityDef = {
  id: 'eff_ult_paige', trigger: 'onPlay', target: 'noTarget',
  base: 4, baseLabel: 'team heal + spirit AOE',
  run: (G, ctx) => {
    for (const c of liveBoardCards(G.players[ctx.movingPlayer])) healUnit(G, c, 4, 'Rallying Charge');
    const s = ultSpi();
    eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => damageUnit(G, c, 4 + s, 'spirit'));
  },
};
const eff_ult_rem: AbilityDef = {
  id: 'eff_ult_rem', trigger: 'onPlay', target: 'enemyActive',
  base: 6, baseLabel: 'Sleep + wake dmg',
  // Naptime: sleep the enemy Active; the stored value (6) is the wake-up burst,
  // dealt when it wakes (any damage) or when the sleep expires (statusOps).
  run: (G, _ctx, { target }) => { if (target) addStatus(G, target, 'sleep', 6 + ultSpi(), 2); },
};
const eff_ult_seven: AbilityDef = {
  id: 'eff_ult_seven', trigger: 'onPlay', target: 'noTarget',
  base: 3, baseLabel: 'spirit AOE',
  run: (G, ctx) => { const s = ultSpi(); eachBoard(G, otherPlayer(ctx.movingPlayer), (c) => damageUnit(G, c, 3 + s, 'spirit')); },
};
const eff_ult_shiv: AbilityDef = {
  id: 'eff_ult_shiv', trigger: 'onPlay', target: 'enemyActive',
  base: 5, baseLabel: 'spirit + execute',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    // Killing Blow: execute a target already below half HP, else a 5 spirit hit.
    if (target.hp <= target.hpMax / 2) damageUnit(G, target, 999, 'pure', 'Killing Blow');
    else damageUnit(G, target, 5 + ultSpi(), 'spirit', 'Killing Blow');
  },
};
const eff_ult_sinclair: AbilityDef = {
  id: 'eff_ult_sinclair', trigger: 'onPlay', target: 'noTarget',
  baseLabel: 'copy enemy ultimate',
  // Audience Participation: copy the enemy Active hero's ultimate into your hand
  // as a free (0-cost) card. costOverride is read by playCard.
  run: (G, ctx) => {
    const pid = ctx.movingPlayer;
    const enemyActive = G.players[otherPlayer(pid)].active;
    if (!enemyActive || (enemyActive.respawnTurnsLeft ?? 0) > 0) {
      pushLog(G, 'Audience Participation: no enemy ultimate to copy.');
      return;
    }
    const ult = ULTIMATES.find((u) => u.linkedHero === enemyActive.cardId);
    if (!ult) { pushLog(G, 'Audience Participation: nothing to copy.'); return; }
    const copy: CardInstance = {
      iid: nextIid(), cardId: ult.id, ownerId: pid, zone: 'hand',
      attached: [], hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
      statuses: [], exhausted: false, skillUsedThisTurn: false, costOverride: 0,
    };
    G.players[pid].hand.push(copy);
    pushLog(G, `Audience Participation: copied ${ult.name} (free to cast).`);
  },
};
const eff_ult_vindicta: AbilityDef = {
  id: 'eff_ult_vindicta', trigger: 'onPlay', target: 'enemyAny',
  base: 5, baseLabel: 'spirit (execute bonus)',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    // Assassinate: 9 spirit to a target already below half HP, else 5.
    const dmg = (target.hp <= target.hpMax / 2 ? 9 : 5) + ultSpi();
    damageUnit(G, target, dmg, 'spirit', 'Assassinate');
  },
};
const eff_ult_viscous: AbilityDef = {
  id: 'eff_ult_viscous', trigger: 'onPlay', target: 'noTarget',
  base: 3, baseLabel: 'spirit AOE + self Unstoppable',
  run: (G, ctx) => {
    const ps = G.players[ctx.movingPlayer];
    const vis = [ps.active, ...ps.bench].find((c) => c && c.cardId === 'hero_viscous' && (c.respawnTurnsLeft ?? 0) === 0);
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
  base: 3, baseLabel: '+Bullet Power + Unstoppable + heal',
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
  base: 4, baseLabel: 'spirit + Stun',
  run: (G, _ctx, { target }) => {
    if (!target) return;
    damageUnit(G, target, 4 + ultSpi(), 'spirit');
    addStatus(G, target, 'stun', 1, 1);
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
    const s = ultSpi();
    let totalDealt = 0;
    eachBoard(G, enemy, (c) => {
      totalDealt += damageUnit(G, c, 3 + s, 'spirit', 'Warden');
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

// Mirage ultimate Traveler: canon Mirage teleports himself to safety. TCG
// mapping: a free reposition — if Mirage is Active, swap him to the bench with
// an available ally (no Retreat cost), then grant Shield 3 ("barrier on
// arrival"). A cheap escape/tempo tool, not a finisher.
const eff_ult_mirage: AbilityDef = {
  id: 'eff_ult_mirage', trigger: 'onPlay', target: 'noTarget',
  baseLabel: 'reposition + Shield',
  run: (G, ctx) => {
    const ps = G.players[ctx.movingPlayer];
    const mirage = [ps.active, ...ps.bench].find(
      (c) => c && c.cardId === 'hero_mirage' && (c.respawnTurnsLeft ?? 0) === 0,
    );
    if (!mirage) { pushLog(G, 'Traveler fizzled.'); return; }
    if (ps.active === mirage) {
      const benchAlly = ps.bench.find((b) => {
        if (!b || (b.respawnTurnsLeft ?? 0) > 0) return false;
        const d = CARDS_BY_ID[b.cardId];
        return d?.type === 'hero' && !d.flags?.benchOnly;
      });
      if (benchAlly) {
        const bSlot = benchAlly.slot ?? 1;
        ps.active = benchAlly; benchAlly.zone = 'active'; benchAlly.slot = 0;
        ps.bench[bSlot - 1] = mirage; mirage.zone = 'bench'; mirage.slot = bSlot;
      }
    }
    addStatus(G, mirage, 'shield', 3, 999);
    pushLog(G, 'Traveler: Mirage slips to safety (Shield 3).');
  },
};

// Drifter ultimate Eternal Night: canon wraps up to 2 enemies in isolating
// darkness. TCG mapping: Silence the enemy Active + one bench hero for 2 turns
// (they can't cast skills/ults). Stops the opponent from answering with skill
// counter-plays.
const eff_ult_drifter: AbilityDef = {
  id: 'eff_ult_drifter', trigger: 'onPlay', target: 'noTarget',
  baseLabel: 'Silence 2 enemies',
  run: (G, ctx) => {
    const enemy = G.players[otherPlayer(ctx.movingPlayer)];
    if (enemy.active && (enemy.active.respawnTurnsLeft ?? 0) === 0) addStatus(G, enemy.active, 'silenced', 1, 2);
    const benchHero = enemy.bench.find((b) => b && (b.respawnTurnsLeft ?? 0) === 0);
    if (benchHero) addStatus(G, benchHero, 'silenced', 1, 2);
  },
};

const ABILITIES_LIST: AbilityDef[] = [
  // ----- Spells (15 cards) -----
  eff_healing_rite, eff_rusted_barrel,
  eff_cold_front, eff_slowing_hex, eff_healbane, eff_spirit_sap,
  eff_decay, eff_disarming_hex,
  eff_knockdown, eff_cast_metal_skin,
  // ----- Control spell pack (active items → spells) -----
  eff_silence_glyph, eff_curse, eff_debuff_remover, eff_unstoppable_cast, eff_echo_shard,
  // ----- Equipment passives (4 cards) -----
  eff_bullet_resist, eff_spirit_resist, eff_healing_booster, eff_healing_tempo,
  // ----- Equipment reactive procs (5 cards) -----
  eff_bullet_resist_shredder_proc,
  eff_restorative_shot_proc, eff_extra_regen_proc, eff_mystic_regeneration_proc,
  eff_bullet_shield_proc, eff_spirit_shield_proc, eff_cooldown_draw,
  eff_mystic_burst_proc, eff_improved_burst_proc,
  eff_bullet_lifesteal, eff_spirit_lifesteal,
  eff_surge_of_power, eff_diviners_kevlar, eff_quicksilver_reload, eff_mystic_reverb,
  eff_toxic_bullets, eff_tesla_bullets, eff_suppressor, eff_reactive_barrier,
  eff_escalating_exposure, eff_inhibitor, eff_crippling_headshot, eff_berserker,
  eff_colossus, eff_improved_bullet_armor, eff_improved_spirit_armor,
  eff_frenzy, eff_siphon_bullets,
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
import { withCast as _withCast, currentCast } from '@/engine/castContext';
setEquipmentDispatcher((G, bearer, kind, ctx, target, amount) => {
  if (!bearer.attached) return;
  // Iterate a snapshot: a proc (e.g. a spent cooldown→draw item) may detach
  // itself from bearer.attached mid-loop, which would skip a sibling otherwise.
  for (const eq of [...bearer.attached]) {
    const data = CARDS_BY_ID[eq.cardId];
    if (!data || data.type !== 'equipment' || !data.abilities) continue;
    for (const aid of data.abilities) {
      const ability = ABILITIES_BY_ID[aid];
      if (ability && ability.trigger === kind) {
        _withCast(bearer, 'proc', () => ability.run(G, ctx, { source: bearer, target, params: { equip: eq, amount } }));
      }
    }
  }
});
