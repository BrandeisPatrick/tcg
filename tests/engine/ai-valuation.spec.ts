import { describe, it, expect } from 'vitest';
import { enumerateAIMoves } from '@/ai/heuristic';
import { effectiveAtk, kitCost, liveBoardCards, seatOf } from '@/engine/query';
import { CARDS_BY_ID } from '@/cards';
import type { CardInstance, GameState, HeroCard, PlayerID, StatusInstance } from '@/engine/types';
import { freshReadyGame, giveItem, makeHero } from './_helpers';
import { newTrack } from '@/engine/map';

// What the AI makes of a position: `evalState` (src/ai/heuristic.ts) prices the
// statuses a unit carries, the channel it is running and a Rem riding on it.
// The AI knows no rules, so these tests read its judgement off the list it
// returns — passing is scored as the position stands, a play as the position it
// leaves — on boards staged by hand. P1 is the seat to move; P0 is the rival.

const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as any;

/** The position, read straight off the AI in the act step: with no souls and no
 *  items, passing is scored as the position stands. */
function standing(G: GameState): number {
  G.players['1'].souls = 0;
  return enumerateAIMoves(G, ctx('1')).find((m) => m.move === 'endTurn')!.score;
}

const own = (G: GameState) => G.players['1'].active!;   // Abrams: a passive, no skill, 2 attack
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

  it('a Sleep is a Stun for its turns: its value stores no wake-up burst, so it adds nothing to the price', () => {
    const plain = freshReadyGame();
    put(own(plain), 'sleep', 1, 2);
    const big = freshReadyGame();
    put(own(big), 'sleep', 6, 2);
    expect(standing(plain) - standing(big)).toBeCloseTo(0);
    const theirs = freshReadyGame();
    put(foe(theirs), 'sleep', 6, 2);
    const theirsPlain = freshReadyGame();
    put(foe(theirsPlain), 'sleep', 1, 2);
    expect(standing(theirs) - standing(theirsPlain)).toBeCloseTo(0);
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
      return enumerateAIMoves(G, ctx(pid)).find((m) => m.move === 'endTurn')!.score;
    };
    expect(score('0') + score('1')).toBeCloseTo(0);
    expect(score('1')).not.toBeCloseTo(0); // …and not because nothing was priced
  });
});

describe('AI valuation: Rem — riding, she is a hero on the board, not gear; Tag Along and the lane', () => {
  /** P1's board with Rem on slot 1 of the bench and nothing else there. */
  function remGame() {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.bench = [makeHero('hero_rem', '1', 'bench', 1), null, null];
    return G;
  }

  /** Merge `rem` into `bearer` by hand, as the old Lil Helpers did (no hero's
   *  skill merges now; the engine's merge machinery and the AI's reading of it
   *  remain): out of her bench slot, onto the bearer's `attached`, the max HP
   *  she grants (and the HP that fills it) on him. */
  function mergeByHand(G: GameState, rem: CardInstance, bearer: CardInstance, hpBuff: number) {
    const ps = G.players[seatOf(rem)];
    const idx = ps.bench.findIndex((b) => b === rem);
    if (idx >= 0) ps.bench[idx] = null;
    bearer.hpMax += hpBuff;
    bearer.hp += hpBuff;
    rem.zone = 'equipment';
    rem.attachedTo = bearer.iid;
    rem.remMergeTurnsLeft = 3;
    rem.remMergeHpBuff = hpBuff;
    (bearer.attached ??= []).push(rem);
  }

  it('merging into a healthy ally (set by hand) is not the loss of a hero', () => {
    const G = remGame();
    const before = standing(G);
    const rem = G.players['1'].bench[0]!;
    mergeByHand(G, rem, own(G), 1);
    expect(liveBoardCards(G.players['1']).includes(rem)).toBe(false); // she left the bench…
    // …and the position gained what the merge gave the bearer (+1 max HP, 2 a point), not lost her.
    expect(standing(G) - before).toBeCloseTo(2);
  });

  it("the rival's merged Rem (set by hand) is still one of its heroes", () => {
    const G = freshReadyGame();
    const theirs = G.players['0'];
    const rem = makeHero('hero_rem', '0', 'bench', 3);
    theirs.bench[2] = rem;
    const before = standing(G);
    mergeByHand(G, rem, foe(G), 1);
    expect(liveBoardCards(theirs).includes(rem)).toBe(false);
    // The rival gained the HP she granted (+1 max HP, 2 a point, so −2 here), not lost a hero.
    expect(standing(G) - before).toBeCloseTo(-2);
  });

  it('uses Rem\'s Tag Along on a hurt Active, when it can pay for it, rather than passing it by', () => {
    const G = remGame();
    const ai = G.players['1'];
    const rem = ai.bench[0]!;
    ai.souls = kitCost(rem, 'skill_rem');
    own(G).hp = 2;
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('useSkill');
    expect(best.args[0]).toBe(rem.iid);
    expect(best.args[1]).toBe(own(G).iid);
  });

  it('a ride (Tag Along, made through the engine) is not the loss of Rem, nor of what she wears', () => {
    const G = remGame();
    const ai = G.players['1'];
    const rem = ai.bench[0]!;
    giveItem(G, rem, 'extra_spirit');
    ai.souls = kitCost(rem, 'skill_rem');
    const ride = enumerateAIMoves(G, ctx('1'), true).find((m) => m.move === 'useSkill' && m.args[0] === rem.iid);
    // Abrams at full HP: the ride heals nothing, so all it costs is the 2 souls it pays.
    const pass = enumerateAIMoves(G, ctx('1'), true).find((m) => m.move === 'endTurn')!;
    expect(ride).toBeDefined();
    expect(pass.score - ride!.score).toBeLessThan(2 * 0.3 + 1); // its souls, give or take the swing
    expect(enumerateAIMoves(G, ctx('1'))[0].args[0]).not.toBe(rem.iid); // and it is not worth making
  });

  it('uses Tag Along on a hurt bench ally too', () => {
    const G = remGame();
    const ai = G.players['1'];
    const rem = ai.bench[0]!;
    const kelvin = ai.bench[1] = makeHero('hero_kelvin', '1', 'bench', 2);
    kelvin.hp = 1;
    ai.souls = kitCost(rem, 'skill_rem');
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect([best.move, best.args[0], best.args[1]]).toEqual(['useSkill', rem.iid, kelvin.iid]);
  });

  it('pulls Rem out of a lane she is losing with Tag Along, though no ally needs the heal', () => {
    const G = freshReadyGame();
    const ai = G.players['1'];
    const rem = makeHero('hero_rem', '1', 'active', 0);
    ai.active = rem;
    ai.souls = kitCost(rem, 'skill_rem');
    foe(G).atkMod = 4; // the rival's Haze would fell her with one swing
    for (const b of ai.bench) expect(b!.hp).toBe(b!.hpMax);
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('useSkill');
    expect(best.args[0]).toBe(rem.iid);
    expect(best.args.length).toBe(2); // her first skill, Tag Along, on an ally (Naptime would be named)
    expect(ai.bench.map((b) => b!.iid)).toContain(best.args[1]);
    // In a lane she is not losing, with nobody hurt, she stays and fights.
    const H = freshReadyGame();
    const h = H.players['1'];
    const calm = makeHero('hero_rem', '1', 'active', 0);
    h.active = calm;
    h.souls = kitCost(calm, 'skill_rem');
    H.players['0'].active!.statuses.push({ id: 'stun', value: 1, duration: 2 }); // the rival's Active cannot swing
    expect(enumerateAIMoves(H, ctx('1'))[0].args[0]).not.toBe(calm.iid);
  });

  it('puts Rem straight into an empty lane from its hand', () => {
    const G = freshReadyGame();
    G.turnNumber = 3; // P1's turn: the hand's plays are its own turn's
    const ai = G.players['1'];
    ai.active = null;
    ai.bench = [null, null, null];
    const rem = makeHero('hero_rem', '1', 'hand', 0);
    rem.slot = undefined;
    ai.hand.push(rem);
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('placeHero');
    expect(best.args[0]).toBe(rem.iid);
    expect(best.args[1]).toBe(true); // toActive
  });
});

describe('AI valuation: control items and ultimates get used', () => {
  /** P1 whose Active wears the active item `cardId` alone, ready to use, and
   *  nobody on the bench to use anything else. */
  function wearing(cardId: string) {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.bench = [null, null, null];
    const item = giveItem(G, ai.active!, cardId);
    return { G, item };
  }

  // Each of these is an item whose whole worth is a status; with the attack
  // available too, using it comes first — the line is "this, then the attack" —
  // though using it puts it on cooldown or spends one of its charges.
  for (const [cardId, why] of [
    ['knockdown', 'a Stun on the Active'],
    ['decay', 'Bleed 3 for 2 turns'],
    ['disarming_hex', 'a Disarm for 2 turns'],
    ['curse', 'Silence and Disarm for 3 turns'],
    ['slowing_hex', 'a Silence'],
    ['metal_skin', 'Bullet Resist 5 for 2 turns'],
  ] as const) {
    it(`uses ${cardId.replace('_', ' ')} (${why}) ahead of the attack alone`, () => {
      const { G, item } = wearing(cardId);
      const best = enumerateAIMoves(G, ctx('1'))[0];
      expect(best.move).toBe('activate');
      expect(best.args[0]).toBe(item.iid);
    });
  }

  /** P1 whose `hero` (Level 2: its ultimate unlocked) stands in `slot`, wearing
   *  nothing, and nobody else on the bench, with the souls its ultimate costs
   *  (`kitCost`: its size's) and no more. */
  function unlocked(hero: string, slot: 'active' | 'bench' = 'active') {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.bench = [null, null, null];
    const h = makeHero(hero, '1', slot, slot === 'active' ? 0 : 1);
    h.level = 2;
    if (slot === 'active') ai.active = h; else ai.bench[0] = h;
    ai.souls = kitCost(h, (CARDS_BY_ID[hero] as HeroCard).ult);
    return { G, h };
  }
  const usesUlt = (G: GameState, h: CardInstance, ult: string) => {
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move, ult).toBe('useSkill');
    expect(best.args[0], ult).toBe(h.iid);
    expect(best.args[2], ult).toBe(ult);
  };

  it('casts Singularity once Dynamo has unlocked it and can pay for it', () => {
    const { G, h } = unlocked('hero_dynamo');
    usesUlt(G, h, 'eff_ult_dynamo');
  });

  it('casts Storm Cloud and Last Stand too', () => {
    for (const [hero, ult] of [['hero_seven', 'eff_ult_seven'], ['hero_warden', 'eff_ult_warden']] as const) {
      const { G, h } = unlocked(hero);
      usesUlt(G, h, ult);
    }
  });

  it('casts Naptime (a Sleep, from the bench) and Eternal Night (damage, and +1 damage taken)', () => {
    const rem = unlocked('hero_rem', 'bench');
    usesUlt(rem.G, rem.h, 'eff_ult_rem');
    const drifter = unlocked('hero_drifter');
    usesUlt(drifter.G, drifter.h, 'eff_ult_drifter');
  });

  it('casts Audience Participation, Sinclair\'s copy of the rival Active\'s ultimate, when he can pay for it', () => {
    const { G, h } = unlocked('hero_sinclair');
    h.cooldowns = { skill_sinclair: 1 }; // nothing else of its own to use
    G.players['0'].active = makeHero('hero_lash', '0', 'active', 0); // Death Slam to copy
    usesUlt(G, h, 'eff_ult_sinclair');
  });

  it('still sees lethal first, whatever a status is worth', () => {
    const { G } = wearing('knockdown');
    G.players['0'].active!.hp = 1;
    G.players['0'].structures = newTrack({ patron: 1 }); // the kill's push fells the Patron
    const top = enumerateAIMoves(G, ctx('1'))[0];
    expect(top.move).toBe('attack');
    expect(top.score).toBeGreaterThanOrEqual(1_000_000);
  });
});
