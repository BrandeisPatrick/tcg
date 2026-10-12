import { describe, it, expect } from 'vitest';
import { enumerateAIMoves } from '@/ai/heuristic';
import { INVALID, perform } from '@/engine/engine';
import { effectiveAtk, liveBoardCards } from '@/engine/query';
import type { CardInstance, GameState, PlayerID, StatusInstance } from '@/engine/types';
import { freshReadyGame, makeHero } from './_helpers';

// What the AI makes of a position: `evalState` (src/ai/heuristic.ts) prices the
// statuses a unit carries, the channel it is running and a Rem merged into it.
// The AI knows no rules, so these tests read its judgement off the list it
// returns — passing is scored as the position stands, a play as the position it
// leaves — on boards staged by hand. P1 is the seat to move; P0 is the rival.

const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as any;

/** The position, read straight off the AI: with no souls and no hand the list is the
 *  attack and passing, and passing is scored as the position stands. */
function standing(G: GameState): number {
  G.players['1'].souls = 0;
  G.players['1'].hand = [];
  return enumerateAIMoves(G, ctx('1')).find((m) => m.move === 'endTurn')!.score;
}

const own = (G: GameState) => G.players['1'].active!;   // Abrams: a passive, no skill, 1 attack
const foe = (G: GameState) => G.players['0'].active!;    // Haze
const put = (c: CardInstance, id: string, value: number, duration: number, ramp?: number) => {
  const s: StatusInstance = { id, value, duration };
  if (ramp) s.ramp = ramp;
  c.statuses.push(s);
};

describe('AI valuation: a status is worth its magnitude and its turns', () => {
  // [status, value, duration, what it is worth to its bearer]. Each is a status
  // that leaves the bearer's attack alone, so the whole difference is the status.
  const PRICES: [string, number, number, number][] = [
    ['silenced', 1, 1, -3],            // hard CC: a denied turn is about a unit's threat…
    ['silenced', 1, 2, -6],
    ['silenced', 1, 4, -6],            // …two turns at most
    ['bleed', 3, 2, -12],              // pure damage still to come, a point of HP each: the value, for each turn left
    ['bleed', 2, 5, -12],              // …three turns at most
    ['charged', 1, 2, -3],             // a Stun on its way
    ['djinns_mark', 2, 3, -3],         // the detonation (3 a stack), discounted
    ['reverb', 4, 1, -4],              // the echo
    ['bullet_resist', 3, 999, 12],     // a point of the stat is a point of HP on a hit, for two turns; a permanent one counts as two
    ['spirit_resist', 2, 1, 4],
    ['spirit_power', 2, 2, 8],
    ['bullet_resist_down', 1, 2, -4],
    ['spirit_resist_down', 2, 2, -8],
    ['spirit_power_down', 1, 2, -4],
    ['healing_boost', 2, 999, 8],
    ['healing_boost_down', 1, 2, -4],  // no healing at all, about 2 a turn
    ['unstoppable', 1, 1, 6],          // a turn of immunity is worth a lot
    ['unstoppable', 1, 3, 12],
    ['shield', 3, 999, 6],             // counted with the unit as always (2 a point), not again as a status
    ['extra_attack', 2, 99, 0],        // bookkeeping
    ['siphon_gain', 2, 2, 0],
    ['siphon_drain', 2, 2, 0],
  ];

  it('prices each status, against its bearer and for its rival', () => {
    const base = standing(freshReadyGame());
    for (const [id, value, duration, price] of PRICES) {
      const mine = freshReadyGame();
      put(own(mine), id, value, duration);
      expect(standing(mine) - base, `${id} ${value} for ${duration} on an own unit`).toBeCloseTo(price);
      const theirs = freshReadyGame();
      put(foe(theirs), id, value, duration);
      expect(standing(theirs) - base, `${id} ${value} for ${duration} on the rival`).toBeCloseTo(-price);
    }
  });

  it('prices the statuses on the bench as well as on the Active', () => {
    const base = standing(freshReadyGame());
    const G = freshReadyGame();
    put(G.players['0'].bench[0]!, 'silenced', 1, 2); // Curse on a bench caster
    expect(standing(G) - base).toBeCloseTo(6);
  });

  it('a Stun, Disarm or Sleep costs the denied turn and the swing the unit can no longer make', () => {
    const base = standing(freshReadyGame());
    for (const id of ['stun', 'disarm', 'sleep']) {
      const G = freshReadyGame();
      const swing = effectiveAtk(own(G));
      expect(swing).toBeGreaterThan(0);
      put(own(G), id, 0, 1);
      // hvalue −2 × 3 for the one turn, plus the swing (1.5 of threat a point).
      expect(base - standing(G), id).toBeCloseTo(6 + 1.5 * swing);
    }
  });

  it('a Sleep that stores a wake-up burst (Naptime) is also worth that damage, halved', () => {
    const plain = freshReadyGame();
    put(own(plain), 'sleep', 0, 2);
    const burst = freshReadyGame();
    put(burst.players['1'].active!, 'sleep', 6, 2);
    expect(standing(plain) - standing(burst)).toBeCloseTo(6); // hvalue −2 × 6 × ½
    const theirs = freshReadyGame();
    put(foe(theirs), 'sleep', 6, 2);
    const theirsPlain = freshReadyGame();
    put(foe(theirsPlain), 'sleep', 0, 2);
    expect(standing(theirs) - standing(theirsPlain)).toBeCloseTo(6);
  });
});

describe('AI valuation: a channel is the damage it still has to deal', () => {
  const dynamo = (G: GameState) => G.players['1'].bench.find((b) => b?.cardId === 'hero_dynamo')!;

  it('counts the pulses still to come against each enemy unit standing', () => {
    const channelling = (kind: 'casting' | 'casting_light', value: number, duration: number, ramp?: number, downs = 0) => {
      const G = freshReadyGame();
      for (let i = 0; i < downs; i++) { const b = G.players['0'].bench[i]!; b.hp = 0; b.respawnTurnsLeft = 2; }
      const at = standing(G);
      put(dynamo(G), kind, value, duration, ramp);
      return standing(G) - at;
    };
    // The same channel is worth 3 more per pulse of 3 for each enemy unit that stands: 4 against 3.
    expect(channelling('casting_light', 3, 3) - channelling('casting_light', 3, 3, undefined, 1)).toBeCloseTo(3 * 3);
    // Fewer turns left, fewer pulses.
    expect(channelling('casting_light', 3, 3) - channelling('casting_light', 3, 2)).toBeCloseTo(3 * 4);
    // An escalating channel (Seven's) hits harder each pulse: +1 on the 2nd and +2 on the 3rd, on every enemy.
    expect(channelling('casting_light', 2, 3, 1) - channelling('casting_light', 2, 3)).toBeCloseTo(3 * 4);
  });

  it('a heavy channel locks its caster out; a light one does not', () => {
    const light = freshReadyGame();
    put(dynamo(light), 'casting_light', 3, 3);
    const heavy = freshReadyGame();
    put(dynamo(heavy), 'casting', 3, 3);
    // Same pulses, but the heavy channel's caster can neither attack nor cast while it runs.
    expect(standing(light)).toBeGreaterThan(standing(heavy));
  });

  it('a channel run by the rival counts against the AI', () => {
    const base = standing(freshReadyGame());
    const mine = freshReadyGame();
    put(dynamo(mine), 'casting_light', 3, 3);
    const theirs = freshReadyGame();
    put(theirs.players['0'].bench[0]!, 'casting_light', 3, 3); // 4 enemy units on P1's side
    expect(standing(mine)).toBeGreaterThan(base + 20);
    expect(standing(theirs)).toBeLessThan(base - 20);
  });
});

describe('AI valuation: a position is worth to one seat what it costs the other', () => {
  it('is zero-sum with statuses, channels and a merged Rem on both sides', () => {
    const G = freshReadyGame();
    put(own(G), 'bleed', 2, 2);
    put(foe(G), 'unstoppable', 1, 1);
    put(G.players['1'].bench[0]!, 'casting', 3, 3);
    put(G.players['0'].bench[1]!, 'casting_light', 2, 3, 1);
    const rem = makeHero('hero_rem', '0', 'equipment', 3);
    rem.attachedTo = foe(G).iid;
    rem.remMergeTurnsLeft = 2;
    rem.remMergeHpBuff = 0;
    foe(G).attached = [rem];
    const score = (pid: PlayerID) => {
      G.players[pid].souls = 0;
      G.players[pid].hand = [];
      return enumerateAIMoves(G, ctx(pid)).find((m) => m.move === 'endTurn')!.score;
    };
    expect(score('0') + score('1')).toBeCloseTo(0);
    expect(score('1')).not.toBeCloseTo(0); // …and not because nothing was priced
  });
});

describe('AI valuation: a merged Rem is a hero on the board, not gear', () => {
  /** P1's board with Rem on slot 1 of the bench and nothing else there. */
  function remGame() {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.bench = [makeHero('hero_rem', '1', 'bench', 1), null, null];
    return G;
  }

  it('merging into a healthy ally is not the loss of a hero', () => {
    const G = remGame();
    const before = standing(G);
    const rem = G.players['1'].bench[0]!;
    G.players['1'].souls = 1;
    expect(perform(G, '1', { type: 'useSkill', heroIid: rem.iid, targetIid: own(G).iid })).not.toBe(INVALID);
    expect(liveBoardCards(G.players['1']).includes(rem)).toBe(false); // she left the bench…
    // …and the position gained what the merge gave the bearer (+1 max HP, 2 a point), not lost her.
    expect(standing(G) - before).toBeCloseTo(2);
  });

  it("the rival's merged Rem is still one of its heroes", () => {
    const G = freshReadyGame();
    const theirs = G.players['0'];
    const rem = makeHero('hero_rem', '0', 'bench', 3);
    theirs.bench[2] = rem;
    const before = standing(G);
    theirs.souls = 1;
    expect(perform(G, '0', { type: 'useSkill', heroIid: rem.iid, targetIid: foe(G).iid })).not.toBe(INVALID);
    expect(liveBoardCards(theirs).includes(rem)).toBe(false);
    // The rival gained the HP she granted (+1 max HP, 2 a point, so −2 here), not lost a hero.
    expect(standing(G) - before).toBeCloseTo(-2);
  });

  it('merges Rem into a hurt Active rather than passing it by', () => {
    const G = remGame();
    const ai = G.players['1'];
    ai.souls = 1;
    ai.hand = [];
    own(G).hp = 2;
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('useSkill');
    expect(best.args[0]).toBe(ai.bench[0]!.iid);
  });
});

describe('AI valuation: control cards and channel ultimates get played', () => {
  /** P1 with only `cardId` in hand and the souls to pay for it, no bench to cast from. */
  function holding(cardId: string, souls: number) {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.bench = [null, null, null];
    ai.souls = souls;
    ai.hand = [{ ...ai.deck[0], cardId, iid: 'held', zone: 'hand' as const }];
    return G;
  }

  // Each of these is a play whose whole worth is a status; with the attack
  // available too, it comes first — the line is "this, then the attack".
  for (const [cardId, souls, why] of [
    ['knockdown', 6, 'a Stun on the Active'],
    ['decay', 5, 'Bleed 3 for 2 turns'],
    ['disarming_hex', 5, 'a Disarm for 2 turns'],
    ['curse', 5, 'Silence and Disarm for 3 turns'],
    ['slowing_hex', 3, 'a Silence'],
    ['metal_skin', 6, 'Bullet Resist 5 for 2 turns'],
  ] as const) {
    it(`plays ${cardId.replace('_', ' ')} (${why}) ahead of the attack alone`, () => {
      const best = enumerateAIMoves(holding(cardId, souls), ctx('1'))[0];
      expect(best.move).toBe('playCard');
      expect(best.args[0]).toBe('held');
    });
  }

  it('casts Singularity, a channel, when it can pay for it', () => {
    const G = holding('ult_dynamo', 9);
    G.players['1'].active = makeHero('hero_dynamo', '1', 'active', 0);
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('playCard');
    expect(best.args[0]).toBe('held');
  });

  it('casts Storm Cloud and Last Stand too', () => {
    for (const [ult, hero, souls] of [['ult_seven', 'hero_seven', 8], ['ult_warden', 'hero_warden', 9]] as const) {
      const G = holding(ult, souls);
      G.players['1'].active = makeHero(hero, '1', 'active', 0);
      const best = enumerateAIMoves(G, ctx('1'))[0];
      expect(best.move, ult).toBe('playCard');
      expect(best.args[0], ult).toBe('held');
    }
  });

  it('casts Naptime (a Sleep with a wake-up burst) and Eternal Night (two Silences)', () => {
    for (const [ult, souls] of [['ult_rem', 7], ['ult_drifter', 8]] as const) {
      const best = enumerateAIMoves(holding(ult, souls), ctx('1'))[0];
      expect(best.move, ult).toBe('playCard');
      expect(best.args[0], ult).toBe('held');
    }
  });

  it('still sees lethal first, whatever a status is worth', () => {
    const G = holding('knockdown', 6);
    G.players['0'].active!.hp = 1;
    G.players['0'].hp = 1;
    const top = enumerateAIMoves(G, ctx('1'))[0];
    expect(top.move).toBe('attack');
    expect(top.score).toBeGreaterThanOrEqual(1_000_000);
  });
});
