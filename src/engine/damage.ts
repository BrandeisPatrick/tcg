import type { CardInstance, DamageType, FxCastKind, FxTag, GameState } from './types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { pushLog } from './log';
import { chargedUlt, fallPending, incomingDamage, isBoss, isRespawning, itemHealingBoost, itemResist, optionalTriggers, seatOf } from './query';
import { currentCast, withCast } from './castContext';
import { fireTriggers } from './triggers';
import { grantExp } from './expSystem';
import { pushFx, fxSource } from './fx';
import { tallyBossHit } from './map';
import { EXP_ON_KILL } from './constants';

/** Presentation hints for the FX layer, passed by call sites whose damage is
 *  one of a kind (a Djinn's Mark detonation, a Killing Blow execute, a Tesla
 *  chain…). Everything else is inferred from the cast context. */
interface DamageFxOpts {
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
  // Corpses can't take more damage — they're already KO'd waiting to respawn —
  // and neither can a hero whose fall waits on a trigger prompt.
  if (isRespawning(target) || fallPending(G, target)) return 0;
  const cast = currentCast();
  // The Mid-Boss in the pit takes the basic swing's own bullets and nothing
  // else: no ability, item, proc, rider, Ricochet bounce or tick reaches it.
  const pit = isBoss(target);
  if (pit && !(type === 'attack' && cast?.kind === 'attack' && !cast.bounce && !!cast.source)) return 0;
  // Incoming-damage hooks come before everything else (Vindicta's flight takes
  // 1 off a bullet — she's literally above the gunfire).
  amount = incomingDamage(target, amount, type);
  // The FX layer's notion of who did this and how: an explicit hint wins, then
  // the cast frame, then "a status ticking on its own".
  const castKind: FxCastKind = fx?.cast ?? cast?.kind ?? 'tick';
  // What the events of this hit are filed under: the basic swing's own are
  // 'attack'; a tagged effect riding on a swing is a proc.
  const fxCast: FxCastKind = castKind === 'attack' && fx?.tag ? 'proc' : castKind;
  const fxFrom = fxSource(fx?.source ?? cast?.source);
  // Invulnerable takes no damage (The Cube; the Unstoppable item and Prism Blast).
  if (target.statuses.some((s) => s.id === 'invulnerable')) {
    pushFx(G, { kind: 'immune', iid: target.iid, what: 'damage', cast: fxCast });
    return 0;
  }

  let dmg = amount;

  // Net resist: buff − shred. Positive = damage reduction, negative = amplification.
  // The buff is the larger of a resist status and what the target wears (the
  // Resilience items' `resist` hook).
  if (type === 'attack' || type === 'spirit') {
    const [buffId, shredId] = type === 'attack' ? ['bullet_resist', 'bullet_resist_down'] : ['spirit_resist', 'spirit_resist_down'];
    const resist = Math.max(target.statuses.find((s) => s.id === buffId)?.value ?? 0, itemResist(target, type));
    const shred = target.statuses.find((s) => s.id === shredId)?.value ?? 0;
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
      // flashes the shield glyph with "ABSORBED N" / "BLOCKED".
      if (absorbed > 0) {
        pushFx(G, { kind: 'shield', iid: target.iid, absorbed, broken, type, cast: fxCast, source: fxFrom });
      }
    }
  }

  if (dmg <= 0) return 0;

  const hpBefore = target.hp;
  target.hp -= dmg;
  // Charged ultimates count it (docs/hero-design.md §2): one that charges on
  // damage taken (Victor's), on its target; one that charges on damage dealt
  // (Silver's), on whoever dealt it.
  chargeUlt(target, 'taken', dmg);
  const dealer = fx?.source ?? cast?.source;
  if (dealer && dealer !== target) chargeUlt(dealer, 'dealt', dmg);

  const targetName = cardName(target.cardId);
  let effectiveSource = sourceName;
  if (!effectiveSource) {
    const cast = currentCast();
    // Procs (kind='proc') already pass their own sourceName; only fill in for
    // skill/spell/ult/attack frames.
    if (cast && cast.source && cast.kind !== 'proc') {
      effectiveSource = cardName(cast.source.cardId);
    }
  }
  const arrow = effectiveSource ? `${effectiveSource} → ${targetName}` : targetName;
  const typeLabel = type === 'attack' ? 'bullet' : type;
  pushLog(G, `${arrow}: ${dmg} ${typeLabel} dmg (${targetName} ${target.hp} HP).`);

  // Structures are only pushed when a hero dies (killInPlace) — excess past
  // 0 HP is discarded, not spilled. Just clamp.
  if (target.hp < 0) target.hp = 0;

  // A swing at the Mid-Boss: the HP it took off counts for the attacker's side
  // (the side with more takes the boss when it falls), and that is all —
  // nothing the attacker carries reacts to a hit on it, and its fall earns no
  // kill exp (its reward is the boss's own, map.ts).
  if (pit) {
    tallyBossHit(G, seatOf(cast!.source!), hpBefore - target.hp);
    pushFx(G, { kind: 'hit', iid: target.iid, amount: dmg, type, ko: target.hp <= 0, cast: fxCast, source: fxFrom });
    return dmg;
  }

  // Worn-equipment reactions to the damage, through the one trigger dispatcher.
  if (cast && cast.source) {
    if (cast.kind === 'skill' || cast.kind === 'spell' || cast.kind === 'ult') {
      fireTriggers(G, cast.source, 'onBearerSkillDamage', { reaction: true, target, amount: dmg });
    }
    // A Ricochet bounce is an attack frame marked `bounce`: the gear hears it,
    // so what belongs to the swing alone (a heal, a chain) can sit it out. The
    // gear is told what the hit dealt (`amount`), so a headshot item can tell a
    // hit that found its target at full HP (Weakening Headshot, Headhunter).
    if (cast.kind === 'attack') {
      fireTriggers(G, cast.source, 'onAttack', { reaction: true, target, amount: dmg, params: cast.bounce ? { bounce: true } : undefined });
    }
  }

  // Return Fire: an enemy hero's swing that lands on a standing bearer comes
  // back at the attacker as bullet damage — a Ricochet bounce too, which is the
  // swing's bullet. It is dealt in a proc frame, so it is no attack of its own:
  // it fires no on-attack gear and cannot bounce back.
  if (type === 'attack' && cast?.kind === 'attack' && cast.source && cast.source.ownerId !== target.ownerId
      && CARDS_BY_ID[cast.source.cardId]?.type === 'hero' && target.hp > 0 && !isRespawning(target)) {
    const returnFire = target.statuses.find((s) => s.id === 'return_fire');
    const attacker = cast.source;
    if (returnFire && attacker.hp > 0 && !isRespawning(attacker)) {
      withCast(target, 'proc', () => damageUnit(G, attacker, returnFire.value, 'attack', 'Return Fire'));
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

  // Kill blow → EXP_ON_KILL to the killer hero (only the hit that drops hp
  // to 0): the highest-value source of exp, so aggression outpaces standing
  // the turn.
  // A hero that may cancel its own fall (an optional trigger at 'onFall':
  // Victor's revive) holds the exp back until the fall is decided (`downedBy`,
  // paid by killInPlace): a fall that never happens pays none.
  if (hpBefore > 0 && target.hp <= 0 && cast && cast.source) {
    const srcData = CARDS_BY_ID[cast.source.cardId];
    if (srcData?.type === 'hero') {
      if (optionalTriggers(target, 'onFall').length > 0) target.downedBy = cast.source.iid;
      else grantExp(G, cast.source, EXP_ON_KILL);
    }
  }

  // Surface the hit for the FX layer. The basic swing is in the stream like
  // everything else, filed 'attack' (the board skips it: the combat
  // choreographer has already walked it); anything riding on a swing (Tesla,
  // a Ricochet bounce, a Djinn's Mark detonation) carries a tag and is filed as a proc.
  pushFx(G, {
    kind: 'hit', iid: target.iid, amount: dmg, type, ko: target.hp <= 0,
    cast: fxCast, source: fxFrom, tag: fx?.tag, stacks: fx?.stacks,
  });

  // Sleep is a Stun for its turns (docs/hero-design.md §3): damage does not wake it.

  return dmg;
}


/** Presentation hints for a heal: 'lifesteal' streams motes from the unit the
 *  HP was drawn out of; 'regen' is the quiet start-of-turn tick. */
interface HealFxOpts {
  tag?: FxTag;
  from?: CardInstance | null;
}

/** Heal a unit. `sourceName` falls back to the cast-context caster for logging. */
export function healUnit(G: GameState, target: CardInstance, amount: number, sourceName?: string, fx?: HealFxOpts): number {
  if (amount <= 0) return 0;
  if (isRespawning(target)) return 0;                  // corpse on the respawn timer
  if (target.hp <= 0) return 0;                        // dead, not yet reaped — a heal must not undo the KO
  const targetName = cardName(target.cardId);
  if (target.statuses.some((s) => s.id === 'healing_boost_down')) {
    pushLog(G, `${targetName} could not be healed (Healing Blocked).`);
    return 0;
  }
  // Healing Boost: the larger of a status and what the unit wears (Healing
  // Booster and Tempo), on the healed unit and on the caster of the heal.
  const boost = (c: CardInstance) => Math.max(c.statuses.find((s) => s.id === 'healing_boost')?.value ?? 0, itemHealingBoost(c));
  const targetBoost = boost(target);
  const cast = currentCast();
  const casterBoost = cast?.source && cast.source !== target ? boost(cast.source) : 0;
  const healed = Math.min(amount + targetBoost + casterBoost, target.hpMax - target.hp);
  target.hp += healed;
  if (healed > 0) {
    let effectiveSource = sourceName;
    if (!effectiveSource) {
      if (cast && cast.source && cast.kind !== 'proc') {
        const srcName = cardName(cast.source.cardId);
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

/** Count `amount` damage toward `card`'s charged ultimate, when it charges on
 *  damage `how` ('taken' or 'dealt'): its `tally`, under the ultimate's id,
 *  which `kitCost` takes off the printed price. */
function chargeUlt(card: CardInstance, how: 'taken' | 'dealt', amount: number) {
  const charged = chargedUlt(card);
  if (!charged || charged.by !== how || amount <= 0) return;
  (card.tally ??= {})[charged.id] = (card.tally[charged.id] ?? 0) + amount;
}
