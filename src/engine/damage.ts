import type { CardInstance, DamageType, GameState, PlayerID, PlayerState } from './types';
import { findCardOnBoard, pushLog } from './util';
import { CARDS_BY_ID } from '@/cards';
import { currentCast } from './castContext';
import { fireEquipmentTriggers } from './equipmentDispatch';
import { grantExp } from './expSystem';

// Damage routing for a unit. Returns the damage actually dealt after mitigation.
// `sourceName`, if omitted, is resolved from the current cast context so skill /
// spell / ult damage gets "Caster → Target" attribution in the log automatically.
export function damageUnit(G: GameState, target: CardInstance, amount: number, type: DamageType, sourceName?: string): number {
  if (amount <= 0) return 0;
  // Corpses can't take more damage — they're already KO'd waiting to respawn.
  if ((target.respawnTurnsLeft ?? 0) > 0) return 0;
  // Vindicta passive: flight. Reduces incoming attack (bullet) damage by 1 —
  // she's literally above the gunfire. Doesn't apply to spirit/pure.
  if (type === 'attack' && target.cardId === 'hero_vindicta') {
    amount = Math.max(0, amount - 1);
  }
  if (target.statuses.some((s) => s.id === 'unstoppable')) return 0;

  let dmg = amount;

  // Net resist: buff − shred. Positive = damage reduction, negative = amplification.
  if (type === 'attack') {
    const resist = target.statuses.find((s) => s.id === 'bullet_resist')?.value ?? 0;
    const shred = target.statuses.find((s) => s.id === 'bullet_resist_down')?.value ?? 0;
    const net = resist - shred;
    if (net > 0) dmg = Math.max(0, dmg - net);
    else if (net < 0) dmg += Math.abs(net);
  }
  if (type === 'spirit') {
    const resist = target.statuses.find((s) => s.id === 'spirit_resist')?.value ?? 0;
    const shred = target.statuses.find((s) => s.id === 'spirit_resist_down')?.value ?? 0;
    const net = resist - shred;
    if (net > 0) dmg = Math.max(0, dmg - net);
    else if (net < 0) dmg += Math.abs(net);
  }

  // Pure ignores everything else (no Shield interaction either)
  if (type !== 'pure') {
    // Shield absorbs first
    const shield = target.statuses.find((s) => s.id === 'shield');
    if (shield && dmg > 0) {
      const absorbed = Math.min(shield.value, dmg);
      shield.value -= absorbed;
      dmg -= absorbed;
      if (shield.value <= 0) {
        target.statuses = target.statuses.filter((s) => s !== shield);
      }
    }
  }

  if (dmg <= 0) return 0;

  const hpBefore = target.hp;
  target.hp -= dmg;

  const targetName = CARDS_BY_ID[target.cardId]?.name ?? target.cardId;
  let effectiveSource = sourceName;
  if (!effectiveSource) {
    const cast = currentCast();
    // Procs (kind='proc') already pass their own sourceName; only fill in for
    // skill/spell/ult/attack frames.
    if (cast && cast.source && cast.kind !== 'proc') {
      effectiveSource = CARDS_BY_ID[cast.source.cardId]?.name ?? cast.source.cardId;
    }
  }
  const arrow = effectiveSource ? `${effectiveSource} → ${targetName}` : targetName;
  const typeLabel = type === 'attack' ? 'bullet' : type;
  pushLog(G, `${arrow}: ${dmg} ${typeLabel} dmg (${targetName} ${target.hp} HP).`);

  // Overflow past 0 HP spills to the owner's Patron. Without this, the
  // respawn loop would let games drag past natural finish.
  if (target.hp < 0) {
    const overflow = -target.hp;
    target.hp = 0;
    damagePlayer(G, target.ownerId, overflow);
    pushLog(G, `Overflow: ${overflow} dmg spills to P${target.ownerId}'s patron.`);
  }

  // Equipment trigger dispatch — routed via a dispatcher to avoid a
  // damage.ts ⇄ abilities/index.ts circular import.
  const cast = currentCast();
  if (cast && cast.source) {
    if (cast.kind === 'skill' || cast.kind === 'spell' || cast.kind === 'ult') {
      fireEquipmentTriggers(G, cast.source, 'onBearerSkillDamage', { movingPlayer: cast.source.ownerId }, target);
    }
    if (cast.kind === 'attack') {
      fireEquipmentTriggers(G, cast.source, 'onAttack', { movingPlayer: cast.source.ownerId }, target);
    }
  }

  // Damaged-by-type triggers — fired on the *target*, regardless of who or
  // what dealt the damage. Bullet Shield / Spirit Shield read these to grant
  // the bearer a reactive Shield after eating a bullet / spirit hit.
  if (type === 'attack') {
    fireEquipmentTriggers(G, target, 'onBearerDamagedByBullet', { movingPlayer: target.ownerId });
  } else if (type === 'spirit') {
    fireEquipmentTriggers(G, target, 'onBearerDamagedBySpirit', { movingPlayer: target.ownerId });
  }

  // Kill blow → +2 exp to the killer hero (only the hit that drops hp to 0).
  // A kill is the highest-value source of exp; rewards aggression over the
  // passive +1 from end-of-turn and +1 from equip.
  if (hpBefore > 0 && target.hp <= 0 && cast && cast.source) {
    const srcData = CARDS_BY_ID[cast.source.cardId];
    if (srcData?.type === 'hero') {
      grantExp(G, cast.source, 2);
    }
  }

  // Sleep wakes on any connecting damage (target still alive). Strip it first so
  // the wake-up burst (Rem's Naptime) doesn't re-enter this hook, then deal it.
  if (target.hp > 0) {
    const sleeping = target.statuses.find((s) => s.id === 'sleep');
    if (sleeping) {
      target.statuses = target.statuses.filter((s) => s.id !== 'sleep');
      pushLog(G, `${targetName} wakes.`);
      if (sleeping.value > 0) damageUnit(G, target, sleeping.value, 'spirit', 'Naptime');
    }
  }

  return dmg;
}

export function damagePlayer(G: GameState, pid: PlayerID, amount: number): number {
  if (amount <= 0) return 0;
  G.players[pid].hp -= amount;
  const teamName = pid === '0' ? 'Amber Hand' : 'Sapphire Flame';
  pushLog(G, `${teamName} patron: ${amount} dmg (${G.players[pid].hp} HP).`);
  return amount;
}

/** Heal a unit. `sourceName` falls back to the cast-context caster for logging. */
export function healUnit(G: GameState, target: CardInstance, amount: number, sourceName?: string): number {
  if (amount <= 0) return 0;
  if ((target.respawnTurnsLeft ?? 0) > 0) return 0;
  const targetName = CARDS_BY_ID[target.cardId]?.name ?? target.cardId;
  if (target.statuses.some((s) => s.id === 'healing_boost_down')) {
    pushLog(G, `${targetName} could not be healed (Healing Blocked).`);
    return 0;
  }
  const targetBoost = target.statuses.find((s) => s.id === 'healing_boost')?.value ?? 0;
  const cast = currentCast();
  const casterBoost = (cast?.source && cast.source !== target)
    ? (cast.source.statuses.find((s) => s.id === 'healing_boost')?.value ?? 0)
    : 0;
  const healed = Math.min(amount + targetBoost + casterBoost, target.hpMax - target.hp);
  target.hp += healed;
  if (healed > 0) {
    let effectiveSource = sourceName;
    if (!effectiveSource) {
      if (cast && cast.source && cast.kind !== 'proc') {
        const srcName = CARDS_BY_ID[cast.source.cardId]?.name ?? cast.source.cardId;
        if (srcName !== targetName) effectiveSource = srcName;
      }
    }
    const tag = effectiveSource ? ` (${effectiveSource})` : '';
    pushLog(G, `${targetName} healed ${healed}${tag}.`);
  }
  return healed;
}

/** Turns a hero takes to respawn after being KO'd. Long enough that death
 *  matters, short enough that you can rebuild. Hero stays in their slot,
 *  greyed-out, while this counts down. */
export const RESPAWN_TURNS = 3;

/**
 * Process a hero's death in place: wipe active statuses, arm the respawn
 * timer, charge the death cost. Level / exp / equipment / atkMod / spiritMod /
 * hpMax all persist — only the live combat state (hp, statuses, turn flags)
 * resets. `tickRespawn` brings the hero back at full hp when the timer ticks down.
 */
function killInPlace(G: GameState, ps: PlayerState, hero: CardInstance) {
  pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} fell.`);
  const SOULS_MAX = 7;
  const oppId: PlayerID = ps.id === '0' ? '1' : '0';
  const before = G.players[oppId].souls;
  G.players[oppId].souls = Math.min(SOULS_MAX, before + 1);
  if (G.players[oppId].souls > before) pushLog(G, `P${oppId} +1 Souls (KO bounty).`);
  damagePlayer(G, ps.id, 1);
  hero.statuses = [];
  hero.skillUsedThisTurn = false;
  hero.exhausted = true;
  hero.hp = 0;
  hero.respawnTurnsLeft = RESPAWN_TURNS;
  // Level + exp + stat mods INTENTIONALLY persist through respawn — the
  // hero comes back at full hp with their rank intact (see leveling.spec).
  pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} respawning in (${RESPAWN_TURNS}).`);
}

/**
 * Sweep a player's board for heroes that just hit 0 HP. The hero stays in its
 * slot — `killInPlace` arms the respawn timer instead of moving them out.
 * Then, for AI (player '1'), immediately auto-promote a bench hero into the
 * vacated Active slot so the engine never sits idle waiting on AI's turn to
 * pick a replacement. Player '0' (the human) keeps the manual choice via the
 * PromotionOverlay.
 */
export function reapDead(G: GameState, ps: PlayerState) {
  if (ps.active && ps.active.hp <= 0 && ps.active.respawnTurnsLeft == null) {
    killInPlace(G, ps, ps.active);
  }
  for (const b of ps.bench) {
    if (b && b.hp <= 0 && b.respawnTurnsLeft == null) {
      killInPlace(G, ps, b);
    }
  }
  if (ps.id === '1') autoPromoteAi(G, ps);
}

/**
 * If AI's Active is a corpse and there's an alive bench hero, swap the
 * strongest bench hero into Active. Heuristic: highest current HP. The dying
 * corpse takes the bench slot the new Active vacated and continues its
 * respawn countdown there.
 */
function autoPromoteAi(G: GameState, ps: PlayerState) {
  if (!ps.active || (ps.active.respawnTurnsLeft ?? 0) === 0) return;
  let bestIdx = -1;
  let bestHp = -1;
  for (let i = 0; i < ps.bench.length; i++) {
    const b = ps.bench[i];
    if (!b || (b.respawnTurnsLeft ?? 0) > 0) continue;
    const d = CARDS_BY_ID[b.cardId];
    if (d?.type !== 'hero' || d.flags?.benchOnly) continue;
    if (b.hp > bestHp) { bestHp = b.hp; bestIdx = i; }
  }
  if (bestIdx === -1) return;
  const benchHero = ps.bench[bestIdx]!;
  const corpse = ps.active;
  ps.active = benchHero;
  benchHero.zone = 'active';
  benchHero.slot = 0;
  ps.bench[bestIdx] = corpse;
  corpse.zone = 'bench';
  corpse.slot = (bestIdx + 1) as 1 | 2 | 3;
  const data = CARDS_BY_ID[benchHero.cardId];
  pushLog(G, `P${ps.id} promoted ${data?.name ?? benchHero.cardId} to Active.`);
}
