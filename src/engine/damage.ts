import type { CardInstance, DamageType, FxCastKind, FxTag, GameState, PlayerID } from './types';
import { CARDS_BY_ID } from '@/cards';
import { pushLog } from './log';
import { incomingDamage, isRespawning } from './query';
import { currentCast } from './castContext';
import { fireTriggers } from './triggers';
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
  if (isRespawning(target)) return 0;
  // Incoming-damage hooks come before everything else (Vindicta's flight takes
  // 1 off a bullet — she's literally above the gunfire).
  amount = incomingDamage(target, amount, type);
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

  // Worn-equipment reactions to the damage, through the one trigger dispatcher.
  if (cast && cast.source) {
    if (cast.kind === 'skill' || cast.kind === 'spell' || cast.kind === 'ult') {
      fireTriggers(G, cast.source, 'onBearerSkillDamage', { reaction: true, target, amount: dmg });
    }
    if (cast.kind === 'attack') {
      fireTriggers(G, cast.source, 'onAttack', { reaction: true, target });
    }
  }

  // Damaged-by-type triggers — fired on the *target*, regardless of who or
  // what dealt the damage. Bullet Shield / Spirit Shield read these to grant
  // the bearer a reactive Shield after eating a bullet / spirit hit.
  if (type === 'attack') {
    fireTriggers(G, target, 'onBearerDamagedByBullet', { reaction: true });
  } else if (type === 'spirit') {
    fireTriggers(G, target, 'onBearerDamagedBySpirit', { reaction: true });
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
  if (isRespawning(target)) return 0;                  // corpse on the respawn timer
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
