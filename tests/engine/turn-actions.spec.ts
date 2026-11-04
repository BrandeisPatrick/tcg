import { describe, it, expect, beforeAll } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { DeadlockGame } from '@/engine/game';
import { attackBlocked, attackTurn, blocked, type AttackBlock } from '@/engine/legality';
import { forecastAttack, simulate } from '@/engine/forecast';
import { effectiveAtk, findCardOnBoard, liveBoardCards, wornItems } from '@/engine/query';
import { addStatus, clearTurnFlags, tickCooldowns, tickRemMerges } from '@/engine/statusOps';
import { resolve } from '@/engine/death';
import { enumerateAIMoves } from '@/ai/heuristic';
import type { GameState, PlayerID } from '@/engine/types';
import { freshReadyGame, configureReadyMatch, giveCard, giveItem, makeHero, passTurn, readyClient } from './_helpers';

// A turn opens in its shop step (buy, sell and move items, then close the
// shop); its act step is the player's to spend on abilities (each hero one a
// turn, free: a skill, an active item it wears or its ultimate) and one
// Retreat, and then one attack: `attack` makes the Active swing one-way at the
// rival Active, and it ends the Act — after it only `endTurn` (and an owed
// promotion) is left; `endTurn` hands the turn over and never attacks. A
// Retreat before the attack lets the hero who steps in make it, and a hero
// that used its ability may still attack.

beforeAll(configureReadyMatch);

function snap(c: ReturnType<typeof readyClient>) {
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
    const c = readyClient(); // P0's turn 1, past its shop: the act step
    const before = snap(c);
    expect(before.G.step).toBe('act');
    expect(attackTurn(before.G)).toBe(false);
    expect(attackBlocked(before.G, '0')).toBe('turn1');
    expect(blocked(before.G, '0', { type: 'attack' })).toBe('turn1');
    (c.moves as any).attack();
    expect(snap(c).G.attackUsed).toBe(false);
    expect(activeHp(snap(c).G)).toEqual(activeHp(before.G));
    c.moves.endTurn?.();
    expect(snap(c).ctx.currentPlayer).toBe('1');
    expect(activeHp(snap(c).G)).toEqual(activeHp(before.G)); // nobody swung
  });

  it('attack strikes the rival Active, costs nothing and keeps the turn', () => {
    const c = readyClient();
    passTurn(c); // → P1, turn 2, past its shop
    const before = snap(c);
    expect(before.ctx.currentPlayer).toBe('1');
    expect(attackBlocked(before.G, '1')).toBeNull();
    (c.moves as any).attack();
    const after = snap(c);
    expect(after.ctx.currentPlayer).toBe('1'); // still P1's turn
    expect(after.G.attackUsed).toBe(true);
    expect(after.G.players['1'].souls).toBe(before.G.players['1'].souls);
    // One-way: the rival Active took the swing, the attacker took nothing back.
    expect(after.G.players['0'].active!.hp).toBeLessThan(before.G.players['0'].active!.hp);
    expect(after.G.players['1'].active!.hp).toBe(before.G.players['1'].active!.hp);
  });

  it('one attack a turn: a second is rejected, and endTurn does not swing again', () => {
    const c = readyClient();
    passTurn(c); // → P1, turn 2, past its shop
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
    const c = readyClient();
    passTurn(c); // → P1, turn 2, past its shop: the attack is open
    const before = snap(c);
    expect(blocked(before.G, '1', { type: 'attack' })).toBeNull();
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

  it('the attack ends the Act: after it a bench skill, an active item, a card from the hand and a retreat are refused; endTurn is not', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 5;
    const rival = sturdyRival(G);
    const grit = giveItem(G, me.bench[0]!, 'grit'); // Vindicta wears a ready Grit
    const card = giveCard(G, '0', 'extended_magazine');
    expect(blocked(G, '0', { type: 'activate', itemIid: grit.iid })).toBeNull();
    expect(blocked(G, '0', { type: 'playCard', cardIid: card.iid, heroIid: me.active!.iid })).toBeNull();
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    const lash = me.bench[1]!; // Lash carries a skill; the Active (Haze) is passive-only
    const hpBefore = rival.hp;
    expect(runMove('useSkill', G, '0', lash.iid, rival.iid)).toBe('INVALID_MOVE');
    expect(rival.hp).toBe(hpBefore);
    expect(runMove('activate', G, '0', grit.iid)).toBe('INVALID_MOVE');
    expect(blocked(G, '0', { type: 'activate', itemIid: grit.iid })).toBe('actOver');
    expect(grit.cooldowns).toBeUndefined(); // not used: still ready
    expect(runMove('playCard', G, '0', card.iid, me.active!.iid)).toBe('INVALID_MOVE');
    expect(blocked(G, '0', { type: 'playCard', cardIid: card.iid, heroIid: me.active!.iid })).toBe('actOver');
    expect(me.hand).toEqual([card]);
    expect(runMove('moveHero', G, '0', 1, 0)).toBe('INVALID_MOVE');
    expect(me.souls).toBe(5);
    expect(blocked(G, '0', { type: 'endTurn' })).toBeNull();
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
    const c = readyClient();
    passTurn(c); // → P1, turn 2
    passTurn(c); // → P0, turn 3, past its shop
    // Hand P0 a channeling Dynamo through the store's own state.
    const state = c.getState()!;
    const G = structuredClone(state.G) as GameState;
    const dynamo = makeHero('hero_dynamo', '0', 'active', 0);
    G.players['0'].active = dynamo;
    addStatus(G, dynamo, 'casting', 3, 3);
    (c as any).store.dispatch({ type: 'SYNC', state: { ...state, G } });

    expect(attackBlocked(snap(c).G, '0')).toBe('cannot');
    expect(blocked(snap(c).G, '0', { type: 'attack' })).toBe('cannot');
    const benchBefore = snap(c).G.players['1'].bench.map((b) => b?.hp);
    (c.moves as any).attack();
    expect(snap(c).G.attackUsed).toBe(false);
    expect(snap(c).G.players['1'].bench.map((b) => b?.hp)).toEqual(benchBefore);
    c.moves.endTurn?.();
    const benchAfter = snap(c).G.players['1'].bench.map((b) => b?.hp);
    benchAfter.forEach((hp, i) => { if (hp != null) expect(hp).toBeLessThan(benchBefore[i]!); });
  });
});

describe('turn actions: abilities, then the attack', () => {
  it('the Active that used its skill may still make the attack', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 5;
    me.active = makeHero('hero_lady_geist', '0', 'active', 0);
    const rival = sturdyRival(G);
    expect(runMove('useSkill', G, '0', me.active.iid, rival.iid)).not.toBe('INVALID_MOVE');
    expect(attackBlocked(G, '0')).toBeNull();
    const hp = rival.hp;
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(rival.hp).toBeLessThan(hp);
    expect(me.souls).toBe(5); // abilities are free
  });

  it('the Active that attacked cannot use its skill afterwards, and neither can a bench hero', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 5;
    me.active = makeHero('hero_lady_geist', '0', 'active', 0);
    const rival = sturdyRival(G);
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', me.active.iid, rival.iid)).toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', me.bench[1]!.iid, rival.iid)).toBe('INVALID_MOVE'); // Lash
    expect(me.souls).toBe(5);
  });

  it('two different heroes each use their skill in one turn, free; the same hero cannot twice', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 3;
    const lash = me.bench[1]!;
    const paige = me.bench[2]!;
    const rival = sturdyRival(G);
    expect(runMove('useSkill', G, '0', lash.iid, rival.iid)).not.toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', paige.iid, me.active!.iid)).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(3);
    expect(runMove('useSkill', G, '0', lash.iid, rival.iid)).toBe('INVALID_MOVE');
    // Bench skills leave the Active's attack where it was.
    expect(attackBlocked(G, '0')).toBeNull();
  });

  it('abilities cost no souls: with none at all, two heroes use theirs', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 0;
    const rival = sturdyRival(G);
    expect(runMove('useSkill', G, '0', me.bench[1]!.iid, rival.iid)).not.toBe('INVALID_MOVE');
    expect(runMove('useSkill', G, '0', me.bench[2]!.iid, me.active!.iid)).not.toBe('INVALID_MOVE');
    expect(me.souls).toBe(0);
  });

  it('a retreat before the attack lets the hero who steps in make it; after the attack nothing moves', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 9;
    const rival = sturdyRival(G);
    expect(runMove('moveHero', G, '0', 2, 0)).not.toBe('INVALID_MOVE'); // Lash steps in, for 1 soul
    expect(me.souls).toBe(8);
    const lash = me.active!;
    expect(lash.cardId).toBe('hero_lash');
    const hp = rival.hp;
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(rival.hp).toBeLessThan(hp);
    expect(runMove('moveHero', G, '0', 2, 0)).toBe('INVALID_MOVE'); // Haze stays out
    expect(me.active!.iid).toBe(lash.iid);
    expect(attackBlocked(G, '0')).toBe('used');
  });

  it('one Retreat a turn; the hero who stepped in may use its skill and still attack', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 9;
    const rival = sturdyRival(G);
    expect(runMove('moveHero', G, '0', 2, 0)).not.toBe('INVALID_MOVE'); // Lash steps in
    const lash = me.active!;
    expect(runMove('useSkill', G, '0', lash.iid, rival.iid)).not.toBe('INVALID_MOVE');
    expect(attackBlocked(G, '0')).toBeNull();
    expect(runMove('moveHero', G, '0', 2, 0)).toBe('INVALID_MOVE'); // a second Retreat
    expect(me.active!.iid).toBe(lash.iid);
    // Bench to bench is no Retreat: still free, still open.
    expect(runMove('moveHero', G, '0', 1, 3)).not.toBe('INVALID_MOVE');
    const hp = rival.hp;
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(rival.hp).toBeLessThan(hp);
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
    tickCooldowns(me);                   // …a later one starts: her skill's cooldown runs out
    tickRemMerges(G, me);                // …and so does the merge
    expect(me.bench).toContain(rem);
    expect(runMove('useSkill', G, '0', rem.iid, me.active!.iid)).not.toBe('INVALID_MOVE');
  });

  it('the flags reset when the next turn begins', () => {
    const c = readyClient();
    passTurn(c); // → P1, turn 2, past its shop
    let G = snap(c).G;
    const dynamo = G.players['1'].bench.find((b) => b?.cardId === 'hero_dynamo')!;
    (c.moves as any).moveHero(1, 2);                                    // a free bench shuffle…
    G = snap(c).G;
    (c.moves as any).useSkill(dynamo.iid, G.players['1'].active!.iid); // …a bench skill…
    G = snap(c).G;
    (c.moves as any).moveHero(1, 0);                                    // …the Retreat…
    (c.moves as any).attack();                                          // …and the attack
    G = snap(c).G;
    expect(G.attackUsed).toBe(true);
    expect(G.retreatUsed).toBe(true);
    expect(G.players['1'].bench.concat(G.players['1'].active).find((b) => b?.iid === dynamo.iid)!.skillUsedThisTurn).toBe(true);
    c.moves.endTurn?.(); // → P0, turn 3: its shop step
    G = snap(c).G;
    expect(G.step).toBe('shop');
    expect(G.attackUsed).toBe(false);
    expect(G.retreatUsed).toBe(false);
    expect(attackBlocked(G, '0')).toBeNull();
    expect(G.players['1'].bench.concat(G.players['1'].active).find((b) => b?.iid === dynamo.iid)!.skillUsedThisTurn).toBe(false);
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
      [null, (G) => { G.players['1'].active!.skillUsedThisTurn = true; }], // an ability does not spend the attack
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
    const G = freshReadyGame(); // the AI holds no souls: no retreat; its bench has used its skills; it wears no item
    for (const b of G.players['1'].bench) if (b) b.skillUsedThisTurn = true;
    expect(enumerateAIMoves(G, ctx('1'))[0].move).toBe('attack');
  });

  // The attack that wins the match is ranked above everything in the plain
  // move list. Only the Active swings and the swings never reach the patron:
  // a win is a knockout that costs the last patron life. A board with every
  // hero down is no loss by itself.
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

  it('a knockout that leaves the rival no hero standing is not lethal: a wiped board is no loss', () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    p0.active!.hp = 1;
    benchDown(G);
    expect(p0.hp).toBeGreaterThan(1); // the patron itself survives
    expect(attackScore(G)).toBeLessThan(LETHAL);
  });

  it('a knockout with a patron life to spare and a hero to step in is not lethal', () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    p0.active!.hp = 1;
    p0.hp = 2;
    expect(forecastAttack(G, '1').defenderActiveKO).toBe(p0.active!.iid);
    expect(attackScore(G)).toBeLessThan(LETHAL);
  });

  it("neither the bench's attack nor damage past a knockout counts toward lethal", () => {
    const G = freshReadyGame();
    const p0 = G.players['0'];
    p0.active!.hp = p0.active!.hpMax = 30;
    const swing = forecastAttack(G, '1').damageToActive;
    p0.active!.hp = p0.active!.hpMax = swing + 1; // the Active survives the swing
    p0.hp = 1;
    // What the old check summed — every live hero's attack against Active HP
    // plus patron HP — calls this lethal; it is not.
    const summed = liveBoardCards(G.players['1']).reduce((n, c) => n + effectiveAtk(c), 0);
    expect(summed).toBeGreaterThanOrEqual(p0.active!.hp + p0.hp);
    expect(attackScore(G)).toBeLessThan(LETHAL);
  });


  // With lookahead the position after each line is scored, so a won game has to
  // look different from a good position: the winning line ranks first, whatever
  // else it leaves on the board.
  const winsFirst = (G: GameState) => {
    const top = enumerateAIMoves(G, ctx('1'))[0];
    expect(top.move).toBe('attack');
    expect(top.score).toBeGreaterThanOrEqual(LETHAL);
  };

  it('with lookahead the attack that takes the rival patron\'s last life ranks first, decisively', () => {
    const G = freshReadyGame();
    G.players['0'].active!.hp = 1;
    G.players['0'].hp = 1;
    winsFirst(G);
  });

  it('with lookahead the knockout that leaves the rival no hero standing is a good line, not a won game', () => {
    const G = freshReadyGame();
    G.players['0'].active!.hp = 1;
    benchDown(G);
    const attack = enumerateAIMoves(G, ctx('1')).find((m) => m.move === 'attack')!;
    expect(attack.score).toBeLessThan(LETHAL);
    expect(attack.score).toBeGreaterThan(enumerateAIMoves(G, ctx('1')).find((m) => m.move === 'endTurn')!.score);
  });

  it('with lookahead a won game is worth more than any position, a lost one less', () => {
    const won = freshReadyGame();
    won.players['0'].hp = 0; // the rival patron has already fallen
    expect(enumerateAIMoves(won, ctx('1')).every((m) => m.score >= LETHAL)).toBe(true);
    const lost = freshReadyGame();
    lost.players['1'].hp = 0;
    expect(enumerateAIMoves(lost, ctx('1')).every((m) => m.score < -LETHAL + 1)).toBe(true); // + the 0.1 bias toward acting
  });

  // With no souls to spend the list is the attack and passing, and passing is
  // scored as the position stands: `evalState` read straight off the list.
  const standing = (G: GameState) => {
    G.players['1'].souls = 0;
    const pass = enumerateAIMoves(G, ctx('1')).find((m) => m.move === 'endTurn');
    return pass!.score;
  };

  it('values a hero by the attack it really makes: Weaken counts against its owner and for its rival', () => {
    const base = standing(freshReadyGame());
    // The attack it makes: one point softer is 1.5 of threat, however the point was lost.
    const worn = freshReadyGame();
    worn.players['1'].active!.atkMod -= 1;
    expect(base - standing(worn)).toBeCloseTo(1.5);
    // Weaken takes that point off, and is itself a debuff the position prices:
    // a point of HP (2) for each of its 2 turns.
    const mine = freshReadyGame();
    addStatus(mine, mine.players['1'].active!, 'weapon_power_down', 1, 2);
    expect(effectiveAtk(mine.players['1'].active!)).toBe(effectiveAtk(freshReadyGame().players['1'].active!) - 1);
    expect(base - standing(mine)).toBeCloseTo(1.5 + 4);
    const theirs = freshReadyGame();
    addStatus(theirs, theirs.players['0'].active!, 'weapon_power_down', 1, 2);
    expect(standing(theirs) - base).toBeCloseTo(1.5 + 4);
  });

  it('never ranks a move the engine would reject', () => {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.souls = 9;
    // An item the Active wears that is still cooling down, and a bench hero
    // locked in a heavy channel: no skill from him, and no use of his item.
    const cooling = giveItem(G, ai.active!, 'cold_front', { cooldown: 1 });
    const dynamo = ai.bench.find((b) => b?.cardId === 'hero_dynamo')!;
    const grit = giveItem(G, dynamo, 'grit');
    addStatus(G, dynamo, 'casting', 3, 3);

    for (const lookahead of [false, true]) {
      const moves = enumerateAIMoves(G, ctx('1'), lookahead);
      expect(moves.some((m) => m.move === 'activate' && [cooling.iid, grit.iid].includes(m.args[0]))).toBe(false);
      expect(moves.some((m) => m.move === 'useSkill' && m.args[0] === dynamo.iid)).toBe(false);
      // …and everything it does offer, the engine takes.
      for (const m of moves) {
        if (m.move === 'endTurn') continue;
        expect(runMove(m.move, structuredClone(G), '1', ...m.args)).not.toBe('INVALID_MOVE');
      }
    }

    // Its shop step, the Active already wearing its build's first item: one move
    // at a time, each one the engine takes — a buy, then the card played at once
    // onto a hero that does not wear one — until it closes the shop, its hand empty.
    const shop = freshReadyGame({ step: 'shop' });
    shop.turnNumber = 3; // P1's own turn 2
    shop.players['1'].souls = 30;
    giveItem(shop, shop.players['1'].active!, 'healing_booster');
    let last = '';
    for (let guard = 0; shop.step === 'shop' && guard < 40; guard++) {
      const moves = enumerateAIMoves(shop, ctx('1'));
      expect(moves).toHaveLength(1);
      const [m] = moves;
      if (last === 'buy') expect(m.move, 'a card bought is played at once').toBe('playCard');
      if (m.move === 'playCard') {
        const card = shop.players['1'].hand.find((c) => c.iid === m.args[0])!;
        expect(wornItems(findCardOnBoard(shop, m.args[1])!.card).map((it) => it.cardId)).not.toContain(card.cardId);
      }
      expect(runMove(m.move, shop, '1', ...m.args)).not.toBe('INVALID_MOVE');
      last = m.move;
    }
    expect(shop.step).toBe('act');
    expect(shop.players['1'].hand).toEqual([]);
  });

  it('never offers a card play the engine refuses: not a duplicate, not a full hero, not a rival — in the act step either', () => {
    const G = freshReadyGame();
    G.turnNumber = 3; // P1's own turn 2, its act step
    const ai = G.players['1'];
    const active = ai.active!;
    giveItem(G, active, 'extended_magazine');
    const full = ai.bench[0]!;
    for (const id of ['extra_health', 'extra_regen', 'sprint_boots']) giveItem(G, full, id);
    const copy = giveCard(G, '1', 'extended_magazine');
    const spirit = giveCard(G, '1', 'extra_spirit');
    for (const lookahead of [false, true]) {
      const plays = enumerateAIMoves(G, ctx('1'), lookahead).filter((m) => m.move === 'playCard');
      expect(plays.some((m) => m.args[0] === copy.iid && m.args[1] === active.iid)).toBe(false);
      expect(plays.some((m) => m.args[1] === full.iid)).toBe(false);
      expect(plays.some((m) => [G.players['0'].active, ...G.players['0'].bench].some((h) => h?.iid === m.args[1]))).toBe(false);
      for (const m of plays) expect(runMove(m.move, structuredClone(G), '1', ...m.args), JSON.stringify(m.args)).not.toBe('INVALID_MOVE');
    }
    expect(enumerateAIMoves(G, ctx('1'), false).some((m) => m.move === 'playCard' && m.args[0] === spirit.iid)).toBe(true);
  });

  it('buffs before it attacks: a card in its hand that adds attack is played ahead of the attack', () => {
    const G = freshReadyGame();
    G.turnNumber = 3; // P1's own turn 2, its act step
    const ai = G.players['1'];
    const mag = giveCard(G, '1', 'extended_magazine'); // bought by hand before auto-play took over
    G.players['0'].active!.hp = G.players['0'].active!.hpMax = 30; // nobody falls
    // Only the card and the attack to weigh: the bench has used its skills, the Retreat is made.
    for (const b of ai.bench) if (b) b.skillUsedThisTurn = true;
    G.retreatUsed = true;
    const all = enumerateAIMoves(G, ctx('1'));
    const magOnActive = all.findIndex((m) => m.move === 'playCard' && m.args[0] === mag.iid && m.args[1] === ai.active!.iid);
    expect(magOnActive).toBeGreaterThanOrEqual(0);
    expect(magOnActive).toBeLessThan(all.findIndex((m) => m.move === 'attack'));
    expect(all[0]).toMatchObject({ move: 'playCard', args: [mag.iid, ai.active!.iid] });
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

  it('buffs before it attacks: an active item that adds attack is used ahead of the attack', () => {
    const G = freshReadyGame();
    const ai = G.players['1'];
    // Shadow Weave, worn and ready on the Active: +2 Bullet Power (and a Dome).
    const weave = giveItem(G, ai.active!, 'shadow_weave');
    const used = simulate(G, '1', { type: 'activate', itemIid: weave.iid });
    expect(used.invalid).toBeFalsy();
    expect(forecastAttack(used.G, '1').damageToActive).toBeGreaterThan(forecastAttack(G, '1').damageToActive);
    // With the bench's skills on offer too, the item still comes before the attack…
    const all = enumerateAIMoves(G, ctx('1'));
    const weaveAt = all.findIndex((m) => m.move === 'activate' && m.args[0] === weave.iid);
    expect(weaveAt).toBeGreaterThanOrEqual(0);
    expect(weaveAt).toBeLessThan(all.findIndex((m) => m.move === 'attack'));
    // …and with only the item and the attack to weigh (the bench has used its
    // skills; with no souls there is no Retreat) it is the first choice.
    for (const b of ai.bench) if (b) b.skillUsedThisTurn = true;
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('activate');
    expect(best.args[0]).toBe(weave.iid);
  });

  it('plays a bench skill ahead of the attack, which it leaves open', () => {
    const G = freshReadyGame();
    G.players['1'].souls = 1; // nobody wears an item: just the skills, a Retreat and the attack to weigh
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('useSkill');
    expect(best.args[0]).not.toBe(G.players['1'].active!.iid);
  });

  it("casts the Active's skill ahead of its attack: it may make both", () => {
    const G = freshReadyGame();
    const ai = G.players['1'];
    ai.active = makeHero('hero_lady_geist', '1', 'active', 0); // 1 attack, a 3-damage skill
    ai.bench = [null, null, null];
    ai.souls = 1;
    const best = enumerateAIMoves(G, ctx('1'))[0];
    expect(best.move).toBe('useSkill');
    expect(best.args[0]).toBe(ai.active.iid);
  });

  it('an AI-played match, both seats, reaches a result', () => {
    const c = readyClient({ shop: true }); // the AI shops too
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
