/**
 * The statistics the balance tools report with, kept apart from the game so
 * they can be checked against numbers worked out by hand
 * (tests/sim/stats.spec.ts). No dependencies.
 *
 *  - `mulberry32`: the seeded PRNG every driver pins Math.random to.
 *  - `wilson`: a 95% Wilson score interval for a win rate.
 *  - `gamesNeeded`: how many games a rate needs before its interval is ±margin.
 *  - `logisticFit`: logistic regression by Newton steps, with standard errors.
 *  - `fitTeams`: the two-team model the balance sim fits. Side 0's members
 *    enter at +1 and side 1's at −1, the intercept is side 0's edge, and the
 *    member effects sum to zero, so each is measured against the average
 *    member and net of its teammates: a four-hero team's result credits all
 *    four, and a hero who keeps strong company is not paid for it.
 */

/** Seeded mulberry32: the same seed gives the same stream on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Interval { p: number; lo: number; hi: number }

/** Wilson score interval for `wins` out of `n` (95% at the default z). An
 *  empty sample says nothing: p 0 and the whole of [0, 1]. */
export function wilson(wins: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { p: 0, lo: 0, hi: 1 };
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/**
 * Games needed before a rate near `p` has a 95% interval of about ±`margin`:
 * n = z²·p(1 − p) / margin², the normal approximation (Wilson's interval is a
 * shade narrower near 50%, so this errs on the safe side). `share` is the
 * fraction of games the measured thing takes part in: 1 for a seat, 8/19 for
 * one hero when eight of nineteen heroes play each game.
 */
export function gamesNeeded(margin: number, opts: { p?: number; z?: number; share?: number } = {}): number {
  const { p = 0.5, z = 1.96, share = 1 } = opts;
  return Math.ceil((z * z * p * (1 - p)) / (margin * margin) / share);
}

/** The inverse of a square matrix by Gauss–Jordan elimination with partial
 *  pivoting; throws when the matrix is singular (a pivot below 1e-12 of the
 *  largest diagonal entry). */
function invert(m: number[][]): number[][] {
  const k = m.length;
  const tiny = 1e-12 * Math.max(0, ...m.map((row, i) => Math.abs(row[i])));
  const a = m.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let pivot = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (!(Math.abs(a[pivot][c]) > tiny)) throw new Error('logisticFit: singular information matrix (a column is empty or a combination of others)');
    [a[c], a[pivot]] = [a[pivot], a[c]];
    const div = a[c][c];
    for (let j = 0; j < 2 * k; j++) a[c][j] /= div;
    for (let r = 0; r < k; r++) {
      if (r === c || a[r][c] === 0) continue;
      const f = a[r][c];
      for (let j = 0; j < 2 * k; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row) => row.slice(k));
}

/** log(1 + e^x) without overflow. */
const softplus = (x: number) => (x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x)));

export interface LogitFit {
  coef: number[];
  /** Standard errors: the square roots of the inverse information's diagonal. */
  se: number[];
  /** The inverse information matrix at the fit (the coefficients' covariance). */
  cov: number[][];
  logLik: number;
  iterations: number;
  converged: boolean;
}

/**
 * Logistic regression of `y` (0 or 1) on the rows of `X` by Newton–Raphson,
 * starting from zero and halving any step that would lower the likelihood. Put
 * a column of ones in `X` for an intercept. Data that separate perfectly have
 * no maximum: the fit stops at `maxIter` with `converged` false and huge
 * standard errors. Collinear columns (too few games to tell two heroes apart)
 * throw.
 */
export function logisticFit(
  X: number[][],
  y: number[],
  opts: { maxIter?: number; tol?: number } = {},
): LogitFit {
  const { maxIter = 50, tol = 1e-10 } = opts;
  const n = X.length;
  const k = X[0]?.length ?? 0;
  if (!n || !k) throw new Error('logisticFit: no rows or no columns to fit');
  const dot = (row: number[], b: number[]) => row.reduce((s, v, j) => s + v * b[j], 0);
  const objective = (b: number[]) => {
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const eta = dot(X[i], b);
      ll += y[i] * eta - softplus(eta);
    }
    return ll;
  };
  const information = (b: number[]) => {
    const g = new Array<number>(k).fill(0);
    const H = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    for (let i = 0; i < n; i++) {
      const row = X[i];
      const eta = dot(row, b);
      // P(1) and P(0) each from its own exponential, so neither tail rounds to 0.
      const p1 = 1 / (1 + Math.exp(-eta));
      const p0 = 1 / (1 + Math.exp(eta));
      const residual = y[i] ? p0 : -p1;
      const w = p1 * p0;
      for (let j = 0; j < k; j++) {
        if (row[j] === 0) continue;
        g[j] += residual * row[j];
        for (let l = 0; l < k; l++) H[j][l] += w * row[j] * row[l];
      }
    }
    return { g, H };
  };

  let beta = new Array<number>(k).fill(0);
  let current = objective(beta);
  let iterations = 0;
  let converged = false;
  while (iterations < maxIter) {
    iterations++;
    const { g, H } = information(beta);
    const inv = invert(H);
    const step = inv.map((row) => dot(row, g));
    let scale = 1;
    let next = beta.map((b, j) => b + step[j]);
    let value = objective(next);
    while (value < current - 1e-12 && scale > 1e-6) {
      scale /= 2;
      next = beta.map((b, j) => b + scale * step[j]);
      value = objective(next);
    }
    const moved = Math.max(0, ...step.map((s) => Math.abs(s * scale)));
    beta = next;
    current = value;
    if (moved < tol) { converged = true; break; }
  }
  const cov = invert(information(beta).H);
  return { coef: beta, se: cov.map((row, j) => Math.sqrt(Math.max(0, row[j]))), cov, logLik: current, iterations, converged };
}

export interface TeamGame { side0: string[]; side1: string[]; side0Won: boolean }

export interface TeamFit {
  /** Side 0's edge in log-odds between two average teams. */
  seat: { coef: number; se: number };
  /** One row per member, strongest first. Coefficients sum to zero; σ(coef) is
   *  the member's win rate when it replaces an average member of an otherwise
   *  even matchup with no seat edge. */
  members: { id: string; coef: number; se: number }[];
  games: number;
  iterations: number;
  converged: boolean;
}

/**
 * The joint fit of a team game: logit P(side 0 wins) = seat + Σ effect(side 0)
 * − Σ effect(side 1). Both sides field the same number of members, so every
 * row's member columns sum to zero and the effects are only known up to a
 * shared constant; the fit fixes it by writing the last member as minus the
 * sum of the others (effects sum to zero) and reads that member's standard
 * error off the covariance.
 */
export function fitTeams(games: TeamGame[]): TeamFit {
  if (!games.length) throw new Error('fitTeams: no decisive games to fit');
  if (games.some((g) => g.side0.length !== g.side1.length)) throw new Error('fitTeams: both sides must field the same number of members');
  const ids = [...new Set(games.flatMap((g) => [...g.side0, ...g.side1]))].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const last = ids.length - 1;
  const X: number[][] = [];
  const y: number[] = [];
  for (const g of games) {
    const x = new Array<number>(ids.length).fill(0);
    for (const id of g.side0) x[index.get(id)!] += 1;
    for (const id of g.side1) x[index.get(id)!] -= 1;
    // Column 0 is the seat. With effect_last = −Σ effect_j, member j's column is x_j − x_last.
    X.push([1, ...x.slice(0, last).map((v) => v - x[last])]);
    y.push(g.side0Won ? 1 : 0);
  }
  const fit = logisticFit(X, y);
  const free = fit.coef.slice(1);
  const lastCoef = -free.reduce((s, v) => s + v, 0);
  let lastVar = 0;
  for (let j = 1; j <= last; j++) for (let l = 1; l <= last; l++) lastVar += fit.cov[j][l];
  const members = ids.map((id, i) => (i < last
    ? { id, coef: free[i], se: fit.se[i + 1] }
    : { id, coef: lastCoef, se: Math.sqrt(Math.max(0, lastVar)) }));
  members.sort((a, b) => b.coef - a.coef);
  return {
    seat: { coef: fit.coef[0], se: fit.se[0] },
    members,
    games: games.length,
    iterations: fit.iterations,
    converged: fit.converged,
  };
}
