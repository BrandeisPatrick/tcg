# Testing / Evaluation Model

How we evaluate balance computationally. Companion to `docs/balance-model.md`
(the design targets this framework checks). Grounded in how pros test card games
(MTG dual-eyes + FFL, Hearthstone/LoR telemetry, the academic "Restricted Play"
agent-simulation method, Slay the Spire's data-from-prototyping).

Our advantage: a **deterministic engine** + an **existing heuristic AI**, so we
can simulate thousands of games cheaply and reproducibly.

## The harness — `scripts/eval/`
- `framework.ts` — seeded runner, agent ladder, Wilson CIs, matchup control.
- `run.ts` — batteries + report → writes `sim-reports/evaluation.md`.

Run:
```
npx vite-node scripts/eval/run.ts smoke        # fast sanity (incl. MCTS)
npx vite-node scripts/eval/run.ts full 1000    # full battery
```
A simpler one-shot per-hero sim also exists: `scripts/balance-sim.ts`.

## What makes it FAIR (vs. a naive AI-vs-AI sim)

1. **Agent ladder** — `random`, `heuristic`, `mcts` (boardgame.io `MCTSBot`).
   Different agents answer different questions:
   - **random vs random** → pure *structural* signal at zero skill (seat
     advantage, dead cards, stalemates) — can't be blamed on a smart/dumb bot.
   - **heuristic vs random** → does the game reward *basic* skill at all?
   - **MCTS vs heuristic** → is there headroom above the heuristic? **If MCTS
     beats it, the heuristic is too weak to trust for skill-dependent (caster)
     heroes** — their win-rates are then a *lower bound*, not a verdict.
2. **Seeded determinism** — a master seed derives per-game seeds, so a balance
   change can be A/B'd on the *same* games (real before/after, not noise).
3. **Wilson confidence intervals** — every win-rate is reported with a 95% CI;
   only rows whose CI **excludes 50%** are flagged (★). At ~200 games/hero a WR
   within ±~7% of 50% is statistically indistinguishable from fair — don't chase
   it.
4. **Matchup control** — random drafts (even hero sampling) by default; a hero
   can be **forced** onto a side (`force`) to test a specific card at higher N.

## Metrics that matter (and what they reveal)
| Metric | Reveals |
|---|---|
| First-player WR (+CI) | seat fairness — fix with a mechanic, not card tweaks |
| Per-hero WR (+CI, ★) | over/under-tuned heroes — but read with the skill-gap caveat |
| Game-length distribution | pacing vs the phase curve (early-survive → late-snowball) |
| Stalemate rate (turn cap) | non-termination / sustain-out-of-control |
| Skill gap (cross-agent WR) | does the game reward skill; is the bot trustworthy |

## Known confounds (state them, don't hide them)
- **Weak-AI blind spot** — a heuristic that doesn't build Spirit/sequence skills
  underplays casters; their numbers deflate for AI reasons, not balance. The
  MCTS rung exists to *measure* this.
- **Random teams ≠ constructed play** — no synergy/combos; a strong hero with 3
  weak teammates still loses. Use forced matchups for specific-card tests.
- **Overfitting to the bot** — never tune until *our* bot hits 50/50; require an
  outlier to be flagged across agents and keep humans in the loop.

## The loop
**Self-play at scale → CI-flagged outliers (paired metrics) → human picks the
fun-preserving fix (magnitude, not verb) → re-sim the *same seeds* to confirm the
metric moved → human/blind spot-check.**
