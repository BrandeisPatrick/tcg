/**
 * Determinism: a seed is a whole game, and a game leaves nothing behind.
 *   1  the same seed played twice gives the same moves, winner and final G — byte for byte, fx
 *      seqs and action ids included (they count in `G.counters`, per game);
 *   2  seed A, then B, then A again: the second A is the first A (no state leaks between games);
 *   3  playing a game restores what it borrowed (Math.random, console, the match config, the
 *      cast-context stack).
 */
import { describe, expect, it } from 'vitest';
import { getMatchConfig } from '@/storage/matchConfig';
import { currentCast } from '@/engine/castContext';
import { MIXES } from './collect';
import { playGame, type GameRecord, type Policy } from './driver';
import { diffPaths, fuzzGames } from './oracle';

const SEEDS = Array.from({ length: fuzzGames(6) }, (_, i) => 7000 + i * 13);
const DET_MIXES = [0, 2, 3].map((i) => MIXES[i]);
const POLICIES: Record<'0' | '1', Policy>[] = DET_MIXES.map((m) => m.policies);
const PREFER = DET_MIXES.map((m) => m.prefer);

/** JSON view of a finished game. */
function view(rec: GameRecord) {
  return {
    G: JSON.parse(JSON.stringify(rec.final.G)),
    turn: rec.final.ctx.turn,
    currentPlayer: rec.final.ctx.currentPlayer,
    gameover: rec.final.ctx.gameover ?? null,
    steps: rec.steps,
    moves: rec.moves.map((m) => `${m.player}:${m.name}(${JSON.stringify(m.args)})`),
  };
}

describe('seeded games are deterministic', () => {
  POLICIES.forEach((policies, mixIndex) => {
    const label = DET_MIXES[mixIndex].label;
    const prefer = PREFER[mixIndex];

    it(`${label}: the same seed twice is the same game`, () => {
      for (const seed of SEEDS) {
        const a = view(playGame({ seed, policies, prefer }));
        const b = view(playGame({ seed, policies, prefer }));
        expect(b.moves, `seed ${seed}: the sequence of moves differs`).toEqual(a.moves);
        expect(diffPaths(a, b, 5), `seed ${seed}: final state differs`).toEqual([]);
      }
    });

    it(`${label}: A, B, A — nothing leaks from one game into the next`, () => {
      const [sa, sb] = [SEEDS[0], SEEDS[1]];
      const a1 = view(playGame({ seed: sa, policies, prefer }));
      const b = view(playGame({ seed: sb, policies, prefer }));
      const a2 = view(playGame({ seed: sa, policies, prefer }));
      expect(a2.moves).toEqual(a1.moves);
      expect(diffPaths(a1, a2, 5)).toEqual([]);
      // and the games really were different games
      expect(b.moves).not.toEqual(a1.moves);
    });
  });

  it('a game restores Math.random, console, the match config and the cast stack', () => {
    const random = Math.random;
    const log = console.log;
    const error = console.error;
    const config = getMatchConfig();
    playGame({ seed: 4242, policies: POLICIES[1] }); // the chaos mix: throws and rejections included
    expect(Math.random).toBe(random);
    expect(console.log).toBe(log);
    expect(console.error).toBe(error);
    expect(getMatchConfig()).toEqual(config);
    expect(currentCast()).toBeNull();
  });

  it('the ambient Math.random does not matter: a pinned game ignores whatever was drawn before it', () => {
    const policies = POLICIES[0];
    const clean = view(playGame({ seed: 99, policies }));
    for (let i = 0; i < 1000; i++) Math.random();
    const after = view(playGame({ seed: 99, policies }));
    expect(after.moves).toEqual(clean.moves);
    expect(diffPaths(clean, after, 5)).toEqual([]);
  });

  it('different seeds are different games', () => {
    const a = view(playGame({ seed: SEEDS[0], policies: POLICIES[0] }));
    const b = view(playGame({ seed: SEEDS[2], policies: POLICIES[0] }));
    expect(a.G.players['0'].archetype === b.G.players['0'].archetype && JSON.stringify(a.moves) === JSON.stringify(b.moves)).toBe(false);
  });
});
