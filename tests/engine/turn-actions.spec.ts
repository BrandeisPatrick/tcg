import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { attackBlocked, attackTurn, type AttackBlock } from '@/engine/legality';
import { planAttackPhase } from '@/engine/forecast';
import { effectiveAtk, liveBoardCards } from '@/engine/query';
import { addStatus, clearTurnFlags, tickRemMerges } from '@/engine/statusOps';
import { resolve } from '@/engine/death';
import { enumerateAIMoves } from '@/ai/heuristic';
import type { GameState, PlayerID } from '@/engine/types';
import { freshReadyGame, configureReadyMatch, makeHero } from './_helpers';

// A turn is the player's to spend on cards, skills and a retreat in any order,
// with at most one attack among them: `attack` makes the Active swing one-way
// at the rival Active and keeps the turn; `endTurn` hands it over and never
// attacks. Each hero may use its skill once a turn, and a hero does one or the
// other — skill or attack.

beforeAll(configureReadyMatch);

function newClient() {
  const client = Client({ game: DeadlockGame, numPlayers: 2 });
  client.start();
  return client;
}
function snap(c: ReturnType<typeof newClient>) {
  const s = c.getState();
  if (!s) throw new Error('no state');
  return { G: s.G as GameState, ctx: s.ctx as Ctx };
}
/** Both Actives' HP, [P0, P1]. */
const activeHp = (G: GameState) => [G.players['0'].active!.hp, G.players['1'].active!.hp];

function runMove(name: string, G: GameState, pid: PlayerID, ...args: any[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}

/** A rival Active that survives anything P0's Active can throw at it, so a
 *  KO (and the AI's auto-promotion) does not swap the hero under the test. */
function sturdyRival(G: GameState) {
  const rival = G.players['1'].active!;
  rival.hp = rival.hpMax = 30;
  return rival;
}

describe('turn actions: the attack is a move', () => {
  it('Turn 1 has no attack: the move is rejected and the turn simply ends', () => {
    const c = newClient();
    const before = snap(c);
    expect(attackTurn(before.G)).toBe(false);
    expect(attackBlocked(before.G, '0')).toBe('turn1');
    (c.moves as any).attack();
    expect(snap(c).G.attackUsed).toBe(false);
    expect(activeHp(snap(c).G)).toEqual(activeHp(before.G));
    c.moves.endTurn?.();
    expect(snap(c).ctx.currentPlayer).toBe('1');
    expect(activeHp(snap(c).G)).toEqual(activeHp(before.G)); // nobody swung
  });

  it('attack strikes the rival Active, costs nothing and keeps the turn', () => {
    const c = newClient();
    c.moves.endTurn?.(); // → P1, turn 2
    const before = snap(c);
    expect(before.ctx.currentPlayer).toBe('1');
    expect(attackBlocked(before.G, '1')).toBeNull();
    (c.moves as any).attack();
    const after = snap(c);
    expect(after.ctx.currentPlayer).toBe('1'); // still P1's turn
    expect(after.G.attackUsed).toBe(true);
    expect(after.G.players['1'].active!.attackedThisTurn).toBe(true);
    expect(after.G.players['1'].souls).toBe(before.G.players['1'].souls);
    // One-way: the rival Active took the swing, the attacker took nothing back.
    expect(after.G.players['0'].active!.hp).toBeLessThan(before.G.players['0'].active!.hp);
    expect(after.G.players['1'].active!.hp).toBe(before.G.players['1'].active!.hp);
  });

  it('there is one attack a turn: a second one is rejected, and endTurn does not swing again', () => {
    const c = newClient();
    c.moves.endTurn?.();
    (c.moves as any).attack();
    const struck = activeHp(snap(c).G);
    expect(attackBlocked(snap(c).G, '1')).toBe('used');
    (c.moves as any).attack();
    expect(activeHp(snap(c).G)).toEqual(struck);
    c.moves.endTurn?.();
    const next = snap(c);
    expect(next.ctx.currentPlayer).toBe('0');
    // Neither Active regenerates at P0's turn start in this roster, so the HP
    // after the handover is the HP the attack left.
    expect(activeHp(next.G)).toEqual(struck);
  });

  it('ending the turn without attacking deals no damage', () => {
    const c = newClient();
    c.moves.endTurn?.(); // → P1, turn 2: the attack is open
    const before = snap(c);
    expect(attackBlocked(before.G, '1')).toBeNull();
    c.moves.endTurn?.(); // P1 lets it go
    const after = snap(c);
    expect(after.ctx.currentPlayer).toBe('0');
    expect(activeHp(after.G)).toEqual(activeHp(before.G));
    expect([after.G.players['0'].hp, after.G.players['1'].hp])
      .toEqual([before.G.players['0'].hp, before.G.players['1'].hp]);
  });

  it("the attack is one-way: the defender's onAttack passive (Shiv's Bleed) does not land on the attacker", () => {
    const G = freshReadyGame();
    G.players['1'].active = makeHero('hero_shiv', '1', 'active', 0);
    const shiv = sturdyRival(G);
    const haze = G.players['0'].active!;
    const hazeHp = haze.hp;
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(shiv.hp).toBeLessThan(30);
    expect(haze.hp).toBe(hazeHp);
    expect(haze.statuses.some((s) => s.id === 'bleed')).toBe(false);
  });

  it('after the attack the turn still takes moves: a bench skill', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 5;
    const rival = sturdyRival(G);
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    const lash = me.bench[1]!; // Lash carries a skill; the Active (Haze) is passive-only
    const hpBefore = rival.hp;
    expect(runMove('useSkill', G, '0', lash.iid, rival.iid)).not.toBe('INVALID_MOVE');
    expect(rival.hp).toBeLessThan(hpBefore);
    expect(me.souls).toBe(4);
  });

  it('a fallen Active is replaced before the attack: the move waits for the promotion', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.active!.hp = 0;
    resolve(G); // the Active falls; a bench hero can step up, so a promotion is owed
    expect(G.pendingPromotion).toBe('0');
    expect(attackBlocked(G, '0')).toBe('noActive');
    expect(runMove('attack', G, '0')).toBe('INVALID_MOVE');
    expect(G.attackUsed).toBe(false); // the attack is still there for whoever steps up
    expect(runMove('promoteToActive', G, '0', me.bench.find((b) => b && !b.respawnTurnsLeft)!.iid)).not.toBe('INVALID_MOVE');
    expect(attackBlocked(G, '0')).toBeNull();
    const rivalHp = G.players['1'].active!.hp;
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(G.players['1'].active!.hp).toBeLessThan(rivalHp);
  });

  it('a channeler cannot attack, and its ultimate pulses at the end of the turn', () => {
    const c = newClient();
    c.moves.endTurn?.(); // → P1, turn 2
    c.moves.endTurn?.(); // → P0, turn 3
    // Hand P0 a channeling Dynamo through the store's own state.
    const state = c.getState()!;
    const G = structuredClone(state.G) as GameState;
    const dynamo = makeHero('hero_dynamo', '0', 'active', 0);
    G.players['0'].active = dynamo;
    addStatus(G, dynamo, 'casting', 3, 3);
    (c as any).store.dispatch({ type: 'SYNC', state: { ...state, G } });

    expect(attackBlocked(snap(c).G, '0')).toBe('cannot');
    const benchBefore = snap(c).G.players['1'].bench.map((b) => b?.hp);
    (c.moves as any).attack();
    expect(snap(c).G.attackUsed).toBe(false);
    expect(snap(c).G.players['1'].bench.map((b) => b?.hp)).toEqual(benchBefore);
    c.moves.endTurn?.();
    const benchAfter = snap(c).G.players['1'].bench.map((b) => b?.hp);
    benchAfter.forEach((hp, i) => { if (hp != null) expect(hp).toBeLessThan(benchBefore[i]!); });
  });
});

describe('turn actions: skill or attack', () => {
  it('the Active that used its skill cannot attack', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 5;
    me.active = makeHero('hero_lady_geist', '0', 'active', 0);
    const rival = sturdyRival(G);
    expect(runMove('useSkill', G, '0', me.active.iid, rival.iid)).not.toBe('INVALID_MOVE');
    expect(attackBlocked(G, '0')).toBe('skill');
    const hp = rival.hp;
    expect(runMove('attack', G, '0')).toBe('INVALID_MOVE');
    expect(rival.hp).toBe(hp);
    expect(G.attackUsed).toBe(false); // still there for a hero who steps in
  });

  it('the Active that attacked cannot use its skill; a bench hero still can', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 5;
    me.active = makeHero('hero_lady_geist', '0', 'active', 0);
    const rival = sturdyRival(G);
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', me.active.iid, rival.iid)).toBe('INVALID_MOVE');
    expect(me.souls).toBe(5); // nothing spent on the rejected skill
    expect(runMove('useSkill', G, '0', me.bench[1]!.iid, rival.iid)).not.toBe('INVALID_MOVE'); // Lash
  });

  it('two different heroes each use their skill in one turn; the same hero cannot twice', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 3;
    const lash = me.bench[1]!;
    const paige = me.bench[2]!;
    const rival = sturdyRival(G);
    expect(runMove('useSkill', G, '0', lash.iid, rival.iid)).not.toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', paige.iid, me.active!.iid)).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(1);
    expect(runMove('useSkill', G, '0', lash.iid, rival.iid)).toBe('INVALID_MOVE');
    expect(me.souls).toBe(1);
    // Bench skills leave the Active's attack where it was.
    expect(attackBlocked(G, '0')).toBeNull();
  });

  it('each skill still costs a soul: a second hero waits for the souls to pay', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 1;
    const rival = sturdyRival(G);
    expect(runMove('useSkill', G, '0', me.bench[1]!.iid, rival.iid)).not.toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', me.bench[2]!.iid, me.active!.iid)).toBe('INVALID_MOVE');
    expect(me.bench[2]!.skillUsedThisTurn).toBe(false);
  });

  it('after the attack a retreat brings in a hero who cannot attack again; the attacker keeps its skill spent', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 9;
    const rival = sturdyRival(G);
    expect(runMove('moveHero', G, '0', 2, 0)).not.toBe('INVALID_MOVE'); // Lash steps in
    const lash = me.active!;
    expect(lash.cardId).toBe('hero_lash');
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(runMove('moveHero', G, '0', 2, 0)).not.toBe('INVALID_MOVE'); // Haze back in
    expect(me.active!.cardId).toBe('hero_haze');
    expect(attackBlocked(G, '0')).toBe('used');
    const hp = rival.hp;
    expect(runMove('attack', G, '0')).toBe('INVALID_MOVE');
    expect(rival.hp).toBe(hp);
    // Lash made the attack: her skill stays shut from the bench as well.
    expect(runMove('useSkill', G, '0', lash.iid, rival.iid)).toBe('INVALID_MOVE');
  });

  it('after a skill, a retreat brings in a hero who may make the attack', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 9;
    const rival = sturdyRival(G);
    expect(runMove('moveHero', G, '0', 2, 0)).not.toBe('INVALID_MOVE'); // Lash steps in
    const lash = me.active!;
    expect(runMove('useSkill', G, '0', lash.iid, rival.iid)).not.toBe('INVALID_MOVE');
    expect(attackBlocked(G, '0')).toBe('skill');
    expect(runMove('moveHero', G, '0', 2, 0)).not.toBe('INVALID_MOVE'); // Haze back in
    expect(me.active!.cardId).toBe('hero_haze');
    expect(attackBlocked(G, '0')).toBeNull();
    const hp = rival.hp;
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(rival.hp).toBeLessThan(hp);
    expect(me.active!.attackedThisTurn).toBe(true);
    expect(lash.attackedThisTurn).toBeFalsy();
  });

  it('a merged Rem comes back from the merge with her skill ready', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 5;
    const rem = makeHero('hero_rem', '0', 'bench', 1);
    me.bench[0] = rem;
    expect(runMove('useSkill', G, '0', rem.iid, me.active!.iid)).not.toBe('INVALID_MOVE');
    expect(rem.zone).toBe('equipment'); // riding on the Active, off the bench
    clearTurnFlags(me);                  // her turn ends…
    rem.remMergeTurnsLeft = 1;
    tickRemMerges(G, me);                // …and on a later one the merge runs out
    expect(me.bench).toContain(rem);
    expect(runMove('useSkill', G, '0', rem.iid, me.active!.iid)).not.toBe('INVALID_MOVE');
  });

  it('the flags reset when the next turn begins', () => {
    const c = newClient();
    c.moves.endTurn?.(); // → P1, turn 2 (one soul)
    let G = snap(c).G;
    const dynamo = G.players['1'].bench.find((b) => b?.cardId === 'hero_dynamo')!;
    (c.moves as any).useSkill(dynamo.iid, G.players['1'].active!.iid); // a bench skill…
    (c.moves as any).attack();                                          // …and the attack
    G = snap(c).G;
    expect(G.attackUsed).toBe(true);
    expect(G.players['1'].active!.attackedThisTurn).toBe(true);
    expect(G.players['1'].bench.find((b) => b?.iid === dynamo.iid)!.skillUsedThisTurn).toBe(true);
    c.moves.endTurn?.(); // → P0, turn 3
    G = snap(c).G;
    expect(G.attackUsed).toBe(false);
    expect(attackBlocked(G, '0')).toBeNull();
    expect(G.players['1'].active!.attackedThisTurn).toBe(false);
    expect(G.players['1'].bench.find((b) => b?.iid === dynamo.iid)!.skillUsedThisTurn).toBe(false);
  });
});

describe('AI: the attack is a choice', () => {
  const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as any;

  it('offers attack exactly while attackBlocked is null, and always offers endTurn', () => {
    const cases: [AttackBlock | null, (G: GameState) => void][] = [
      [null, () => {}],
      ['turn1', (G) => { G.turnNumber = 1; }],
      ['used', (G) => { G.attackUsed = true; }],
      ['noActive', (G) => { G.players['1'].active!.respawnTurnsLeft = 2; }],
      ['skill', (G) => { G.players['1'].active!.skillUsedThisTurn = true; }],
      ['noTarget', (G) => { G.players['0'].active!.respawnTurnsLeft = 2; }],
      ['cannot', (G) => { addStatus(G, G.players['1'].active!, 'stun', 1, 1); }],
    ];
    for (const [block, doctor] of cases) {
      const G = freshReadyGame();
      doctor(G);
      expect(attackBlocked(G, '1')).toBe(block);
      for (const lookahead of [false, true]) {
        const moves = enumerateAIMoves(G, ctx('1'), lookahead).map((m) => m.move);
        expect(moves.includes('attack'), `${block} (lookahead ${lookahead})`).toBe(block === null);
        expect(moves, `${block} (lookahead ${lookahead})`).toContain('endTurn');
      }
    }
  });

  it('attacks rather than ending the turn when there is nothing else to do', () => {
    const G = freshReadyGame(); // the AI holds no souls: no skills or retreat
    G.players['1'].hand = [];
    expect(enumerateAIMoves(G, ctx('1'))[0].move).toBe('attack');
  });

  // The attack that wins the match is ranked above everything in the plain
  // move list. Only the Active swings and the swings never reach the patron:
  // a win is a knockout that costs the last patron life or leaves the rival
  // with no hero standing.
  const LETHAL = 1_000_000;
  const attackScore = (G: GameState) => enumerateAIMoves(G, ctx('1'), false).find((m) => m.move === 'attack')!.score;
  /** P0's bench, all down on the respawn timer. */
  const benchDown = (G: GameState) => {
    for (const b of G.players['0'].bench) if (b) { b.hp = 0; b.respawnTurnsLeft = 2; }
  };

  it("ranks the attack as lethal when its knockout takes the rival patron's last life", () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    p0.active!.hp = 1;
    p0.hp = 1;
    expect(attackScore(G)).toBe(LETHAL);
  });

  it('ranks the attack as lethal when its knockout leaves the rival no hero standing', () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    p0.active!.hp = 1;
    benchDown(G);
    expect(p0.hp).toBeGreaterThan(1); // the patron itself would survive
    expect(attackScore(G)).toBe(LETHAL);
  });

  it('a knockout with a patron life to spare and a hero to step in is not lethal', () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    p0.active!.hp = 1;
    p0.hp = 2;
    expect(planAttackPhase(G, '1').defenderActiveKO).toBe(p0.active!.iid);
    expect(attackScore(G)).toBeLessThan(LETHAL);
  });

  it("neither the bench's attack nor damage past a knockout counts toward lethal", () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    p0.active!.hp = p0.active!.hpMax = 30;
    const swing = planAttackPhase(G, '1').damageToActive;
    p0.active!.hp = p0.active!.hpMax = swing + 1; // the Active survives the swing
    p0.hp = 1;
    // What the old check summed — every live hero's attack against Active HP
    // plus patron HP — calls this lethal; it is not.
    const summed = liveBoardCards(G.players['1']).reduce((n, c) => n + effectiveAtk(c), 0);
    expect(summed).toBeGreaterThanOrEqual(p0.active!.hp + p0.hp);
    expect(attackScore(G)).toBeLessThan(LETHAL);
  });

  it('a merged Rem who walks off the fallen bearer keeps the rival in the match', () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    const bearer = p0.active!;
    bearer.hp = 1;
    benchDown(G);
    p0.bench[2] = null; // the slot she returns to
    const rem = makeHero('hero_rem', '0', 'equipment', 3);
    rem.attachedTo = bearer.iid;
    rem.remMergeTurnsLeft = 2;
    rem.remMergeHpBuff = 0;
    bearer.attached = [rem];
    expect(attackScore(G)).toBeLessThan(LETHAL);
    bearer.attached = []; // without her, the same knockout wipes the board
    expect(attackScore(G)).toBe(LETHAL);
  });

  it('never ranks a move the engine would reject', () => {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.souls = 9;
    // Gear the Active already wears, and a second copy in hand.
    const worn = { ...ai.deck[0], cardId: 'extended_magazine', iid: 'worn', zone: 'equipment' as const };
    ai.active!.attached = [worn];
    ai.hand = [{ ...ai.deck[1], cardId: 'extended_magazine', iid: 'copy', zone: 'hand' as const }];
    // A bench hero locked in a heavy channel: no skill from him.
    const dynamo = ai.bench.find((b) => b?.cardId === 'hero_dynamo')!;
    addStatus(G, dynamo, 'casting', 3, 3);

    for (const lookahead of [false, true]) {
      const moves = enumerateAIMoves(G, ctx('1'), lookahead);
      expect(moves.some((m) => m.move === 'playCard' && m.args[1] === ai.active!.iid)).toBe(false);
      expect(moves.some((m) => m.move === 'useSkill' && m.args[0] === dynamo.iid)).toBe(false);
      // …and everything it does offer, the engine takes.
      for (const m of moves) {
        if (m.move === 'endTurn') continue;
        expect(runMove(m.move, structuredClone(G), '1', ...m.args)).not.toBe('INVALID_MOVE');
      }
    }
  });

  it('a promotion owed by the other seat comes first, highest HP first', () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    p0.active!.hp = 0;
    p0.bench[2]!.hp = p0.bench[2]!.hpMax = 30; // the healthiest of the bench
    resolve(G);
    expect(G.pendingPromotion).toBe('0');
    const moves = enumerateAIMoves(G, ctx('1'));
    expect(moves.every((m) => m.move === 'promoteToActive')).toBe(true);
    expect(moves[0].args[0]).toBe(p0.bench[2]!.iid);
    // It is P0's promotion, made from P1's seat.
    expect(runMove('promoteToActive', G, '1', ...moves[0].args)).not.toBe('INVALID_MOVE');
    expect(G.players['0'].active!.iid).toBe(moves[0].args[0]);
    expect(G.pendingPromotion).toBeUndefined();
  });

  it('buffs before it attacks: gear that adds attack is played ahead of the attack', () => {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.souls = 2;
    ai.hand = [{ ...ai.deck[0], cardId: 'extended_magazine', iid: 'mag', zone: 'hand' }];
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('playCard');
    expect(best.args[0]).toBe('mag');
  });

  it('plays a bench skill ahead of the attack, which it leaves open', () => {
    const G = freshReadyGame();
    G.players['1'].souls = 1;
    G.players['1'].hand = []; // just the skills and the attack to weigh
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('useSkill');
    expect(best.args[0]).not.toBe(G.players['1'].active!.iid);
  });

  it("weighs the Active's skill against its attack, and casts when the skill is worth more", () => {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.active = makeHero('hero_lady_geist', '1', 'active', 0); // 1 attack, a 3-damage skill
    ai.bench = [null, null, null];
    ai.hand = [];
    ai.souls = 1;
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('useSkill');
    expect(best.args[0]).toBe(ai.active.iid);
  });

  it('an AI-played match, both seats, reaches a result', () => {
    const c = newClient();
    let guard = 0;
    while (!snap(c).ctx.gameover && guard++ < 5000) {
      const { G, ctx: live } = snap(c);
      expect(G.turnNumber).toBeLessThanOrEqual(60);
      const before = c.getState()!._stateID;
      const best = enumerateAIMoves(G, live)[0];
      if (!best || best.move === 'endTurn') c.moves.endTurn?.();
      else (c.moves as any)[best.move](...best.args);
      // A move the engine turned down would loop forever; hand the turn over.
      if (c.getState()!._stateID === before && !snap(c).ctx.gameover) c.moves.endTurn?.();
    }
    expect(snap(c).ctx.gameover).toBeDefined();
  });
});
