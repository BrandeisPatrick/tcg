/**
 * The balance sim's statistics (scripts/eval/stats.ts), checked against
 * numbers worked out by hand: Wilson intervals, the games-needed formula, and
 * logistic fits on data whose maximum-likelihood answer is known in closed
 * form. Small and deterministic.
 */
import { describe, expect, it } from 'vitest';
import { fitTeams, gamesNeeded, logisticFit, mulberry32, wilson, type TeamGame } from '../../scripts/eval/stats';

/** `wins` rows of (x, 1) and `losses` rows of (x, 0). */
function rows(x: number[], wins: number, losses: number) {
  return {
    X: Array.from({ length: wins + losses }, () => x),
    y: Array.from({ length: wins + losses }, (_, i) => (i < wins ? 1 : 0)),
  };
}
function stack(...parts: { X: number[][]; y: number[] }[]) {
  return { X: parts.flatMap((p) => p.X), y: parts.flatMap((p) => p.y) };
}
/** `n` games of side0 against side1, `side0Wins` of them won by side 0. */
function matches(side0: string[], side1: string[], n: number, side0Wins: number): TeamGame[] {
  return Array.from({ length: n }, (_, i) => ({ side0, side1, side0Won: i < side0Wins }));
}

describe('mulberry32', () => {
  it('replays the same stream from the same seed', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(c()).not.toBe(first[0]);
    for (const v of first) expect(v >= 0 && v < 1).toBe(true);
  });
});

describe('wilson', () => {
  it('matches the textbook interval for 50 of 100', () => {
    const w = wilson(50, 100);
    expect(w.p).toBe(0.5);
    expect(w.lo).toBeCloseTo(0.40383, 5);
    expect(w.hi).toBeCloseTo(0.59617, 5);
  });

  it('stays inside [0, 1] at the edges and is symmetric', () => {
    const none = wilson(0, 10);
    expect(none.lo).toBe(0);
    expect(none.hi).toBeCloseTo(0.27754, 5);
    expect(wilson(30, 100).lo).toBeCloseTo(1 - wilson(70, 100).hi, 12);
  });

  it('an empty sample is the whole of [0, 1]', () => {
    expect(wilson(0, 0)).toEqual({ p: 0, lo: 0, hi: 1 });
  });
});

describe('gamesNeeded', () => {
  it('is z²·p(1 − p) / margin², rounded up', () => {
    expect(gamesNeeded(0.03)).toBe(1068);
    expect(gamesNeeded(0.05)).toBe(385);
  });

  it('scales by the share of games the measured thing plays in', () => {
    // Eight of nineteen heroes play each game, so one hero is in 8/19 of them.
    expect(gamesNeeded(0.03, { share: 8 / 19 })).toBe(2535);
  });

  it('delivers the margin it promises', () => {
    for (const m of [0.02, 0.03, 0.05]) {
      const n = gamesNeeded(m);
      const w = wilson(n / 2, n);
      expect((w.hi - w.lo) / 2).toBeLessThanOrEqual(m);
    }
  });
});

describe('logisticFit', () => {
  it('one feature, no intercept: 75% at x = +1 and 25% at x = −1 is β = ln 3', () => {
    const { X, y } = stack(rows([1], 75, 25), rows([-1], 25, 75));
    const fit = logisticFit(X, y);
    expect(fit.converged).toBe(true);
    expect(fit.coef[0]).toBeCloseTo(Math.log(3), 9);
    // Information Σ w·x² = 200 · 0.75 · 0.25.
    expect(fit.se[0]).toBeCloseTo(1 / Math.sqrt(37.5), 9);
  });

  it('with an intercept: 80% at +1 and 40% at −1', () => {
    const { X, y } = stack(rows([1, 1], 80, 20), rows([1, -1], 40, 60));
    const fit = logisticFit(X, y);
    // logit 0.8 = b0 + b1 and logit 0.4 = b0 − b1.
    expect(fit.coef[0]).toBeCloseTo((Math.log(4) + Math.log(2 / 3)) / 2, 9);
    expect(fit.coef[1]).toBeCloseTo((Math.log(4) - Math.log(2 / 3)) / 2, 9);
    // The information is [[40, −8], [−8, 40]], so each variance is 40 / 1536.
    expect(fit.se[0]).toBeCloseTo(Math.sqrt(40 / 1536), 9);
    expect(fit.se[1]).toBeCloseTo(Math.sqrt(40 / 1536), 9);
  });

  it('separated data have no maximum: it says so instead of pretending', () => {
    const { X, y } = stack(rows([1], 10, 0), rows([-1], 0, 10));
    const fit = logisticFit(X, y);
    expect(fit.converged).toBe(false);
    expect(fit.coef[0]).toBeGreaterThan(10);
  });

  it('refuses columns it cannot tell apart, and an empty sample', () => {
    const { X, y } = stack(rows([1, 1], 6, 4), rows([-1, -1], 4, 6));
    expect(() => logisticFit(X, y)).toThrow(/singular/);
    expect(() => logisticFit([], [])).toThrow(/no rows/);
    expect(() => fitTeams([])).toThrow(/no decisive games/);
  });
});

describe('fitTeams', () => {
  it('recovers 1v1 strengths that sum to zero, net of the seat', () => {
    // True effects a = ln 2, b = 0, c = −ln 2 and no seat edge, so a beats b
    // and b beats c two times in three, and a beats c four times in five —
    // from either seat. The proportions are exact, so the fit is exact.
    const games = [
      ...matches(['a'], ['b'], 30, 20), ...matches(['b'], ['a'], 30, 10),
      ...matches(['b'], ['c'], 30, 20), ...matches(['c'], ['b'], 30, 10),
      ...matches(['a'], ['c'], 50, 40), ...matches(['c'], ['a'], 50, 10),
    ];
    const fit = fitTeams(games);
    expect(fit.converged).toBe(true);
    expect(fit.games).toBe(220);
    expect(fit.seat.coef).toBeCloseTo(0, 9);
    expect(fit.members.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    const [a, b, c] = fit.members;
    expect(a.coef).toBeCloseTo(Math.log(2), 9);
    expect(b.coef).toBeCloseTo(0, 9);
    expect(c.coef).toBeCloseTo(-Math.log(2), 9);
    // a and c play mirror-image schedules, so their errors match, though c's
    // is read off the covariance (it is written as minus the others' sum).
    expect(c.se).toBeCloseTo(a.se, 9);
    expect(a.se).toBeGreaterThan(0);
  });

  it('separates the seat from the team', () => {
    // Seat edge ln 2 and a team edge ln 2 for a over b: a wins 80% from
    // seat 0 and 50% from seat 1.
    const games = [...matches(['a'], ['b'], 50, 40), ...matches(['b'], ['a'], 50, 25)];
    const fit = fitTeams(games);
    expect(fit.seat.coef).toBeCloseTo(Math.log(2), 9);
    expect(fit.members[0]).toMatchObject({ id: 'a' });
    expect(fit.members[0].coef).toBeCloseTo(Math.log(2) / 2, 9);
    expect(fit.members[1].coef).toBeCloseTo(-Math.log(2) / 2, 9);
  });

  it('fits 2v2 teams jointly: each effect is net of the teammates it played with', () => {
    // Four heroes, every 2v2 split, both seat orders. Effects 1, 0, 0, −1: a
    // team's log-odds is its sum minus the other's, so b and c win more beside
    // a than beside d, yet both come out at 0.
    const eff: Record<string, number> = { a: 1, b: 0, c: 0, d: -1 };
    const teams: [string[], string[]][] = [[['a', 'b'], ['c', 'd']], [['a', 'c'], ['b', 'd']], [['a', 'd'], ['b', 'c']]];
    const games: TeamGame[] = [];
    for (const [t, u] of teams) {
      for (const [s0, s1] of [[t, u], [u, t]]) {
        const p = 1 / (1 + Math.exp(-(s0.reduce((s, h) => s + eff[h], 0) - s1.reduce((s, h) => s + eff[h], 0))));
        // 1,000 games at the exact rate, rounded: close to the truth, not exact.
        games.push(...matches(s0, s1, 1000, Math.round(1000 * p)));
      }
    }
    const fit = fitTeams(games);
    const coef = Object.fromEntries(fit.members.map((m) => [m.id, m.coef]));
    expect(coef.a).toBeCloseTo(1, 2);
    expect(coef.b).toBeCloseTo(0, 2);
    expect(coef.c).toBeCloseTo(0, 2);
    expect(coef.d).toBeCloseTo(-1, 2);
    expect(fit.members.reduce((s, m) => s + m.coef, 0)).toBeCloseTo(0, 9);
  });
});
