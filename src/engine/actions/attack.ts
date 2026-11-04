/**
 * The Active's attack: it swings at its target — the rival Active, or with
 * reach any living enemy hero the player names — for its bullet damage, then
 * once more at the same hero for each Extra Attack it has queued. It costs
 * nothing, it is one-way — the defender does not strike back — and the turn
 * stays with the player, who can go on playing cards, skills and a retreat
 * before `endTurn`. Attacks are per hero: this one marks its attacker, and a
 * hero a Retreat brings in afterwards may attack too. `attackBlocked`
 * (legality.ts) holds every condition, so this assumes a living Active, a
 * legal target and a swing that deals something.
 *
 * Every swing is reported as a `swing` event BEFORE its damage, so the stream
 * reads "this swing, then what it did" — and the forecast (forecast.ts) is
 * just this action run on a copy and read back.
 *
 * Ricochet N (`ricochetPower`): a swing that lands bounces, and every other
 * living enemy hero takes N bullet damage and the swing's on-hit debuffs. Each
 * swing bounces, Extra Attacks too; a bounce never bounces again.
 */
import type { CardInstance, GameState, PlayerID } from '../types';
import { cardName } from '@/cards';
import { damageUnit } from '../damage';
import { resolve } from '../death';
import { attackTargets } from '../legality';
import { attackPower, findCardOnBoard, isRespawning, isUntargetable, ricochetPower, targetsFor, type AttackPower } from '../query';
import { fireTriggers } from '../triggers';
import { withCast } from '../castContext';
import { pushFx } from '../fx';

/** Make the Active's attack: mark the attacker (and that the turn has seen an
 *  attack), swing, then each Extra Attack. The target is `targetIid`, left out
 *  the first of `attackTargets`. */
export function attack(G: GameState, pid: PlayerID, targetIid?: string) {
  const atk = G.players[pid].active!;
  // Who is swung at is settled before the attacker is marked: once it is,
  // `attackTargets` is empty.
  const target = (targetIid === undefined ? attackTargets(G, pid)[0] : findCardOnBoard(G, targetIid)?.card)!;
  G.attackUsed = true;
  atk.attackedThisTurn = true;

  // ---- The primary swing. ----
  swing(G, atk, target, 0, attackPower(atk, target));

  // ---- Extra Attacks: additional full-power swings queued this turn (Active
  // Reload, Burst Fire, Fixation — the value of the `extra_attack` status,
  // read after the primary swing because Fixation grants one there). Each
  // re-fires the attacker's onAttack procs (lifesteal, bleed, Djinn's Mark,
  // Tesla chain) and bounces again with Ricochet. Power is re-read every swing
  // so mid-attack threshold gear (Frenzy) stays honest. ----
  const extras = atk.statuses.find((s) => s.id === 'extra_attack')?.value ?? 0;
  let index = 1;
  for (let i = 0; i < extras; i++) {
    if (atk.hp <= 0 || target.hp <= 0) break;
    const power = attackPower(atk, target);
    if (power.total <= 0) continue;
    swing(G, atk, target, index++, power);
  }
  atk.statuses = atk.statuses.filter((s) => s.id !== 'extra_attack');
  // The patron is only damaged when a hero dies (its level, `koPatronDamage`,
  // charged in killInPlace), never by the swings themselves.
  resolve(G);
}

/**
 * A full-power swing at every living enemy hero, in `targetsFor` order: each is
 * its own `swing` (index 0, 1, 2, ...) with its power read for that hero, its
 * own on-attack procs, and the state-based pass at the end. For an ultimate that
 * attacks the whole board. It is not the hero's attack: `G.attackUsed` and the
 * attacker's flags are left as they are, and Extra Attacks are neither read nor
 * spent. A hero a Dome keeps from being the target of an attack is skipped, and
 * so is a swing that would deal nothing (the attacker is Disarmed, say). The
 * volley does not ricochet: it already reaches every hero a bounce would.
 */
export function attackAll(G: GameState, attacker: CardInstance) {
  if (isRespawning(attacker)) return;
  let index = 0;
  for (const foe of targetsFor(G, attacker.ownerId, 'enemyHero')) {
    if (attacker.hp <= 0) break;
    // A hero an earlier swing's follow-through (a chain, a detonation) already
    // took down is not hit again.
    if (foe.hp <= 0 || isUntargetable(foe, 'attack')) continue;
    const power = attackPower(attacker, foe);
    if (power.total <= 0) continue;
    swing(G, attacker, foe, index++, power, false);
  }
  resolve(G);
}

/** One swing at `power`: the event, the damage, then the follow-through. The
 *  attacker's worn equipment reacts inside damageUnit (HP already off, and only
 *  when damage got through); its passives follow once the damage call has
 *  returned, with how much got through (Drifter's Bloodscent heals half of it).
 *  Then, if the swing landed, it bounces (`bounces` off: the volley). */
function swing(G: GameState, atk: CardInstance, target: CardInstance, index: number, power: AttackPower, bounces = true) {
  const extra = index > 0;
  pushFx(G, {
    kind: 'swing', iid: atk.iid, targetIid: target.iid, index, raw: power.total,
    label: extra ? 'Extra Attack' : power.parts.find((p) => p.bonus)?.label,
    targetHp: target.hp,
  });
  const atkName = cardName(atk.cardId);
  let dealt = 0;
  withCast(atk, 'attack', () => {
    dealt = damageUnit(G, target, power.total, 'attack', extra ? `${atkName} (Extra Attack)` : atkName);
  });
  // `primary: true` marks the hero's main swing of the turn — Haze's Fixation
  // grants its extra attack only here, so the extra swings it spawns don't
  // re-trigger it.
  fireTriggers(G, atk, 'onAttack', { only: 'passives', target, params: extra ? { dealt } : { primary: true, dealt } });

  // ---- Ricochet: a swing that got through bounces to every other living enemy
  // hero a Dome does not cover, for N bullet damage each. A bounce is the
  // swing's bullet, so it is dealt in an attack frame — the gear reacts and the
  // passives follow as for the swing, each told `bounce` so the attacker's own
  // heals and chains stay with the swing and its on-hit debuffs spread. A kill
  // takes the usual path: the exp to the frame's source, the KO bounty and the
  // patron's loss when the attack resolves. Only the swing reads Ricochet, so a
  // bounce never bounces. ----
  const n = bounces && dealt > 0 ? ricochetPower(atk) : 0;
  if (n <= 0) return;
  for (const foe of targetsFor(G, atk.ownerId, 'enemyHero')) {
    if (atk.hp <= 0) break; // Return Fire has dropped the attacker: its bullets stop
    if (foe === target || foe.hp <= 0 || isUntargetable(foe, 'attack')) continue;
    let hit = 0;
    withCast(atk, 'attack', () => {
      hit = damageUnit(G, foe, n, 'attack', `${atkName} (Ricochet)`, { tag: 'ricochet' });
    }, { bounce: true });
    fireTriggers(G, atk, 'onAttack', { only: 'passives', target: foe, params: { dealt: hit, bounce: true } });
  }
}
