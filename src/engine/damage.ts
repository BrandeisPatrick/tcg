import type { CardInstance, DamageType, FxCastKind, FxTag, GameState, PlayerID, PlayerState } from './types';
import { pushLog, stepInCandidates } from './util';
import { CARDS_BY_ID } from '@/cards';
import { currentCast } from './castContext';
import { fireEquipmentTriggers } from './equipmentDispatch';
import { grantExp } from './expSystem';
import { pushFx, fxSource } from './fx';

/** Presentation hints for the FX layer, passed by call sites whose damage is
 *  one of a kind (a Djinn's Mark detonation, a Killing Blow execute, a Tesla
 *  chain…). Everything else is inferred from the cast context. */
export interface DamageFxOpts {
  tag?: FxTag;
  /** Who did it, when the cast context doesn't know (a passive firing outside
   *  its owner's cast frame, a status ticking on its own). */
  source?: CardInstance | null;
  /** Tag-specific count (Djinn's Mark stacks). */
  stacks?: number;
  /** Override the inferred cast kind. */
  cast?: FxCastKind;
}

// Damage routing for a unit. Returns the damage actually dealt after mitigation.
// `sourceName`, if omitted, is resolved from the current cast context so skill /
// spell / ult damage gets "Caster → Target" attribution in the log automatically.
export function damageUnit(G: GameState, target: CardInstance, amount: number, type: DamageType, sourceName?: string, fx?: DamageFxOpts): number {
  if (amount <= 0) return 0;
  // Corpses can't take more damage — they're already KO'd waiting to respawn.
  if ((target.respawnTurnsLeft ?? 0) > 0) return 0;
  // Vindicta passive: flight. Reduces incoming attack (bullet) damage by 1 —
  // she's literally above the gunfire. Doesn't apply to spirit/pure.
  if (type === 'attack' && target.cardId === 'hero_vindicta') {
    amount = Math.max(0, amount - 1);
  }
  const cast = currentCast();
  // The FX layer's notion of who did this and how: an explicit hint wins, then
  // the cast frame, then "a status ticking on its own".
  const castKind: FxCastKind = fx?.cast ?? cast?.kind ?? 'tick';
  const fxFrom = fxSource(fx?.source ?? cast?.source);
  if (target.statuses.some((s) => s.id === 'unstoppable')) {
    pushFx(G, { kind: 'immune', iid: target.iid, what: 'damage' });
    return 0;
  }

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
      const broken = shield.value <= 0;
      if (broken) {
        target.statuses = target.statuses.filter((s) => s !== shield);
      }
      // The impact still has to read even when HP doesn't move — the FX layer
      // flashes the shield glyph with "ABSORBED N" / "BLOCKED". The basic
      // swing is left out, like its hit below: the combat choreographer has
      // already shown that deflect by the time the attack resolves.
      if (absorbed > 0 && (castKind !== 'attack' || fx?.tag)) {
        pushFx(G, { kind: 'shield', iid: target.iid, absorbed, broken, type, source: fxFrom });
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

  // The patron is ONLY damaged when a hero dies (flat 1, in killInPlace) —
  // excess past 0 HP is discarded, not spilled. Just clamp.
  if (target.hp < 0) target.hp = 0;

  // Equipment trigger dispatch — routed via a dispatcher to avoid a
  // damage.ts ⇄ abilities/index.ts circular import.
  if (cast && cast.source) {
    if (cast.kind === 'skill' || cast.kind === 'spell' || cast.kind === 'ult') {
      fireEquipmentTriggers(G, cast.source, 'onBearerSkillDamage', { movingPlayer: cast.source.ownerId }, target, dmg);
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

  // Surface the hit for the FX layer. The basic swing is left out — the combat
  // choreographer animates it BEFORE the engine resolves — but anything riding
  // on a swing (Tesla, Ricochet, a Djinn's Mark detonation) carries a tag and
  // is kept, filed as a proc.
  if (castKind !== 'attack' || fx?.tag) {
    pushFx(G, {
      kind: 'hit', iid: target.iid, amount: dmg, type, ko: target.hp <= 0,
      cast: castKind === 'attack' ? 'proc' : castKind,
      source: fxFrom, tag: fx?.tag, stacks: fx?.stacks,
    });
  }

  // Sleep wakes on any connecting damage (target still alive). Strip it first so
  // the wake-up burst (Rem's Naptime) doesn't re-enter this hook, then deal it.
  if (target.hp > 0) {
    const sleeping = target.statuses.find((s) => s.id === 'sleep');
    if (sleeping) {
      target.statuses = target.statuses.filter((s) => s.id !== 'sleep');
      pushLog(G, `${targetName} wakes.`);
      if (sleeping.value > 0) damageUnit(G, target, sleeping.value, 'spirit', 'Naptime', { tag: 'naptime' });
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

/** Presentation hints for a heal: 'lifesteal' streams motes from the unit the
 *  HP was drawn out of; 'regen' is the quiet start-of-turn tick. */
export interface HealFxOpts {
  tag?: FxTag;
  from?: CardInstance | null;
}

/** Heal a unit. `sourceName` falls back to the cast-context caster for logging. */
export function healUnit(G: GameState, target: CardInstance, amount: number, sourceName?: string, fx?: HealFxOpts): number {
  if (amount <= 0) return 0;
  if ((target.respawnTurnsLeft ?? 0) > 0) return 0;   // corpse on the respawn timer
  if (target.hp <= 0) return 0;                        // dead, not yet reaped — a heal must not undo the KO
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
    pushFx(G, {
      kind: 'heal', iid: target.iid, amount: healed, tag: fx?.tag,
      from: fxSource(fx?.from),
      source: cast?.source && cast.source !== target ? fxSource(cast.source) : undefined,
    });
  }
  return healed;
}

/** Turns a hero takes to respawn after being KO'd. Long enough that death
 *  matters, short enough that you can rebuild. Hero stays in their slot,
 *  greyed-out, while this counts down. */
export const RESPAWN_TURNS = 3;

/** Patron HP a side loses each time one of its heroes falls — the only way a
 *  patron is ever damaged. One number, charged by `killInPlace` and projected
 *  by the attack planner, so the two cannot drift apart. */
export const KO_PATRON_DAMAGE = 1;

/**
 * Process a hero's death in place: wipe active statuses, arm the respawn
 * timer, charge the death cost. Level / exp / equipment / atkMod / spiritMod /
 * hpMax all persist — only the live combat state (hp, statuses, turn flags)
 * resets. `tickRespawn` brings the hero back at full hp when the timer ticks down.
 */
function killInPlace(G: GameState, ps: PlayerState, hero: CardInstance) {
  pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} fell.`);
  // Cap the KO bounty at the soul ceiling (the refill table tails at 10). Using
  // a lower cap would *reduce* a player's souls when they scored a kill while
  // holding 8–10 — the bounty must never subtract.
  const SOULS_MAX = 10;
  const oppId: PlayerID = ps.id === '0' ? '1' : '0';
  const before = G.players[oppId].souls;
  G.players[oppId].souls = Math.min(SOULS_MAX, before + 1);
  if (G.players[oppId].souls > before) pushLog(G, `P${oppId} +1 Souls (KO bounty).`);
  damagePlayer(G, ps.id, KO_PATRON_DAMAGE);
  // Rem rescue: a merged Rem detaches to safety (back to the bench) instead of
  // dying with the body — and her granted max-HP is reverted here too.
  const rem = hero.attached?.find((a) => a.cardId === 'hero_rem' && a.remMergeTurnsLeft != null);
  if (rem) returnRemToBench(G, ps, hero, rem);
  // Revert any temporary Siphon Bullets max-HP swing before statuses are wiped,
  // so the hero respawns with its true max HP.
  const sDrain = hero.statuses.find((s) => s.id === 'siphon_drain');
  if (sDrain) hero.hpMax += sDrain.value;
  const sGain = hero.statuses.find((s) => s.id === 'siphon_gain');
  if (sGain) hero.hpMax -= sGain.value;
  hero.statuses = [];
  hero.skillUsedThisTurn = false;
  hero.attackedThisTurn = false;
  hero.exhausted = true;
  hero.hp = 0;
  hero.respawnTurnsLeft = RESPAWN_TURNS;
  // Level + exp + stat mods INTENTIONALLY persist through respawn — the
  // hero comes back at full hp with their rank intact (see leveling.spec).
  pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} respawning in (${RESPAWN_TURNS}).`);
}

/**
 * Detach a merged Rem from `bearer` and return her to her bench slot: reverts
 * the temporary max-HP she granted, pulls her out of `bearer.attached`, and
 * drops her back into her original bench slot (or the first free one). Shared
 * by the merge-countdown expiry (tickRemMerges) and the bearer-death rescue.
 */
export function returnRemToBench(G: GameState, ps: PlayerState, bearer: CardInstance, rem: CardInstance) {
  const buff = rem.remMergeHpBuff ?? 0;
  bearer.hpMax = Math.max(1, bearer.hpMax - buff);
  if (bearer.hp > bearer.hpMax) bearer.hp = bearer.hpMax;
  if (bearer.attached) bearer.attached = bearer.attached.filter((a) => a !== rem);
  rem.remMergeTurnsLeft = undefined;
  rem.remMergeHpBuff = undefined;
  rem.zone = 'bench';
  rem.attachedTo = undefined;
  const slotIdx = (rem.slot ?? 1) - 1;
  if (slotIdx >= 0 && slotIdx < ps.bench.length && ps.bench[slotIdx] == null) {
    ps.bench[slotIdx] = rem;
  } else {
    const free = ps.bench.findIndex((b) => b == null);
    if (free >= 0) ps.bench[free] = rem;
  }
  pushLog(G, `Rem returns to the bench.`);
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
}

/** Does this player owe a forced promotion — Active is a corpse AND an eligible
 *  (alive, non-bench-only) bench hero can step up? */
export function needsPromotion(ps: PlayerState): boolean {
  if (!ps.active || (ps.active.respawnTurnsLeft ?? 0) === 0) return false;
  return stepInCandidates(ps).length > 0;
}

/**
 * The single state-based-actions pass. Run this after ANY board mutation
 * (combat, ability, status tick, turn start, promotion) — it resolves the
 * board to a stable state in ONE fixed, linear order so no caller can forget a
 * step or leave a half-resolved board:
 *
 *   1. Reap dead heroes (both players) — arm respawn timers + the patron tax.
 *   2. Forced promotions — the AI side ('1') auto-promotes its strongest bench
 *      hero immediately; the local side ('0') is surfaced via `pendingPromotion`
 *      for the UI (human modal) or the auto-play loop to resolve.
 *
 * The win check is intentionally NOT here — boardgame.io's `endIf` is the
 * canonical gate and runs after every move on the already-resolved state.
 */
export function resolve(G: GameState) {
  reapDead(G, G.players['0']);
  reapDead(G, G.players['1']);
  autoPromoteAi(G, G.players['1']);
  G.pendingPromotion = needsPromotion(G.players['0']) ? '0' : undefined;
}

/**
 * If AI's Active is a corpse and there's an alive bench hero, swap the
 * strongest bench hero into Active. Heuristic: highest current HP. The dying
 * corpse takes the bench slot the new Active vacated and continues its
 * respawn countdown there.
 */
function autoPromoteAi(G: GameState, ps: PlayerState) {
  if (!ps.active || (ps.active.respawnTurnsLeft ?? 0) === 0) return;
  const candidates = stepInCandidates(ps);
  if (candidates.length === 0) return;
  // Highest HP steps up; on a tie, the earliest bench slot.
  const benchHero = candidates.reduce((best, b) => (b.hp > best.hp ? b : best));
  const bestIdx = ps.bench.indexOf(benchHero);
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
