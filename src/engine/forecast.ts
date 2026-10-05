/**
 * Predicting by running. `simulate` makes an action on a copy of the game and
 * hands back what happened; `forecastAttack` is the turn's attack run that way
 * and read back — the board's damage preview, the choreographer's walk and the
 * AI's attack score all come from the real rules because nothing here knows
 * any: no damage math, no card ids, only the events the attack really pushed
 * and the state it really left.
 */
import type { FxEvent, GameState, HitFx, PlayerID, SwingFx } from './types';
import { CARDS_BY_ID } from '@/cards';
import { INVALID, perform, type Action } from './engine';
import { findCardOnBoard, otherPlayer } from './query';

export interface SimResult {
  /** The copy, after the action. */
  G: GameState;
  /** What the action appended to `G.fx`, seqs included — exactly what making
   *  it for real appends to the live game's stream. */
  events: FxEvent[];
  /** The action was not legal; the copy is as it was. */
  invalid: boolean;
}

/**
 * Make `a` as `pid` on a deep copy of `G`; the input is never touched. The
 * copy leaves the (up to 200-line) match log behind, since a forecast has no
 * use for it and the board asks on every change of G; pass `keepLog` to carry
 * it. The copy carries `G.counters`, so ids and seqs come out as they will in
 * the live game. `endTurn` is checked, not played: the turn hooks belong to
 * boardgame.io, not to an action.
 */
export function simulate(G: GameState, pid: PlayerID, a: Action, opts: { keepLog?: boolean } = {}): SimResult {
  const sim = structuredClone(opts.keepLog ? G : { ...G, log: [] }) as GameState;
  const before = sim.fx.length;
  const invalid = perform(sim, pid, a) === INVALID;
  return { G: sim, events: sim.fx.slice(before), invalid };
}

/** One swing of the attack, as the engine made it. */
export interface AttackStep {
  attackerIid: string;
  attackerName: string;
  /** iid of the defending hero — always the rival's living Active. */
  targetIid: string;
  targetName: string;
  /** HP the swing's own hit took off the target after mitigation (shield/armor). */
  finalDamage: number;
  /** The swing's attack power, before mitigation, for tooltips. */
  rawDamage: number;
  /** The target's HP once everything this swing caused has happened — riders
   *  and detonations included (clamped at 0). */
  predictedHpAfter: number;
  /** True if the swing's own hit dropped the target to 0 — what the
   *  choreographer breaks the card on. A rider or detonation that finishes it
   *  instead (Mixed Bullets, Djinn's Mark) is a tagged proc the FX layer plays
   *  after the walk, KO and all, so it is not this swing's knockout; the
   *  plan's `defenderActiveKO` says the target fell either way. */
  predictedKO: boolean;
  /** Amount the target's Shield absorbed at this step. > 0 means the attack
   *  landed but Shield mitigated some/all of it — choreographer renders a
   *  green deflect flash so the impact reads even when HP doesn't move. */
  shieldAbsorbed: number;
  /** What the swing carried: 'Extra Attack' on an extra swing, Frenzy's label
   *  on a swing whose attack power included it. */
  bonusLabel?: string;
}

export interface AttackPlan {
  attackerId: PlayerID;
  defenderId: PlayerID;
  steps: AttackStep[];
  /** HP the defender's Active loses over the whole attack (clamped ≥ 0) —
   *  swings, riders and detonations together. */
  damageToActive: number;
  /** Patron HP the attack costs the defender: the flat KO_PATRON_DAMAGE when
   *  its Active is knocked out, 0 otherwise. The swings themselves never reach
   *  the patron — damage past 0 HP is discarded, not spilled. */
  patronDamage: number;
  /** iid of the defender's Active if it fell during the attack. */
  defenderActiveKO: string | null;
}

/**
 * What the attack `pid`'s Active would make does, read off `simulate`'s run of
 * it: one step per `swing` event, with the hit, the Shield and the target's HP
 * that swing produced. An attack that may not be made has an empty plan.
 */
export function forecastAttack(G: GameState, pid: PlayerID): AttackPlan {
  const defenderId = otherPlayer(pid);
  const plan: AttackPlan = { attackerId: pid, defenderId, steps: [], damageToActive: 0, patronDamage: 0, defenderActiveKO: null };
  const { G: after, events, invalid } = simulate(G, pid, { type: 'attack' });
  if (invalid) return plan;

  // The events from one swing to the next are that swing's: its own hit and
  // Shield carry cast 'attack'; what follows (procs, riders) does not.
  const swings: { swing: SwingFx; events: FxEvent[] }[] = [];
  for (const e of events) {
    if (e.kind === 'swing') swings.push({ swing: e, events: [] });
    else swings.at(-1)?.events.push(e);
  }
  if (swings.length === 0) return plan;
  const targetIid = swings[0].swing.targetIid;
  const hpBefore = swings[0].swing.targetHp;
  const hpAfter = findCardOnBoard(after, targetIid)!.card.hp;
  const nameOf = (iid: string) => {
    const cardId = findCardOnBoard(G, iid)!.card.cardId;
    return CARDS_BY_ID[cardId]?.name ?? cardId;
  };

  swings.forEach(({ swing: s, events: mine }, i) => {
    const ownHits = mine.filter((e): e is HitFx => e.kind === 'hit' && e.cast === 'attack' && e.iid === s.targetIid);
    const finalDamage = ownHits.reduce((n, e) => n + e.amount, 0);
    const shieldAbsorbed = mine.reduce((n, e) => (e.kind === 'shield' && e.cast === 'attack' && e.iid === s.targetIid ? n + e.absorbed : n), 0);
    // Nothing happens between one swing and the next, so the target's HP as
    // the next begins is its HP after this one, riders and all.
    const hpAfterSwing = i + 1 < swings.length ? swings[i + 1].swing.targetHp : hpAfter;
    plan.steps.push({
      attackerIid: s.iid,
      attackerName: nameOf(s.iid),
      targetIid: s.targetIid,
      targetName: nameOf(s.targetIid),
      finalDamage,
      rawDamage: s.raw,
      predictedHpAfter: Math.max(0, hpAfterSwing),
      predictedKO: ownHits.some((e) => e.ko),
      shieldAbsorbed,
      bonusLabel: s.label,
    });
  });

  plan.damageToActive = Math.max(0, hpBefore - hpAfter);
  plan.patronDamage = Math.max(0, G.players[defenderId].hp - after.players[defenderId].hp);
  plan.defenderActiveKO = hpAfter <= 0 ? targetIid : null;
  return plan;
}
