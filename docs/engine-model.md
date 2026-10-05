# Engine model — one rulebook

How the game's rules are built, and the habits that keep them from drifting.
Companion docs: [fx-model.md](./fx-model.md) (how the board animates what the
engine reports), [stats-model.md](./stats-model.md) (status timing),
[testing-model.md](./testing-model.md) (balance evaluation).

## Why it is built this way

The bugs that kept coming back (a Frenzy bonus swinging through a Stun, a
patron loss the preview promised and the engine never dealt, an attack
animated that the engine then refused, an AI that thought it had lethal) were
one disease: a rule written twice, and the copies drifting. The attack had a
hand-written "planner" mirroring the resolver; the AI and the board each kept
their own copy of who may be targeted, what a card costs and which statuses
lock a skill. The engine fixes that by construction:

1. **Every rule lives in one function.** Moves, the forecast, the AI, the board
   and the tutorial call it. Nobody re-derives a rule.
2. **Predict by running, not by mirroring.** A forecast is the real action made
   on a copy of `G` and read back (`simulate`, `forecastAttack`).
3. **The engine reports everything it does** as events in `G.fx` — the basic
   swing included — so a forecast and the board read the same account.
4. **Card behaviour lives on the card.** The engine core never asks
   `cardId === '…'`; abilities declare hooks, statuses declare what they block
   and how they stack.
5. **`G` is the whole truth.** Instance ids, FX seqs and action ids count in
   `G.counters`; a simulation on a clone never moves the live game's numbers.
6. **The engine trusts no caller.** `perform` asks legality before it touches
   anything; an illegal action is `INVALID` and leaves `G` exactly as it was.

## Where things are (`src/engine`)

| Module | Holds |
|---|---|
| `constants.ts` | every rule number (costs, caps, patron HP, soul ramp, respawn, levels) |
| `query.ts` | pure reads: the board, `targetsFor`, `abilitySources`, `isBlocked`, `attackPower` / `effectiveAtk`, `effectiveSpirit`, `wornEquipment`, `checkWinner` |
| `legality.ts` | the only place a move's legality is written: `attackBlocked`, `skillBlocked` / `skillTargets`, `playBlocked` / `playTargets`, `cardCost`, `moveBlocked`, `promoteBlocked`, `blocked(G, pid, action)` (a promotion owed blocks everything else), `legalActions` |
| `engine.ts` | `Action`, `perform(G, pid, action)` — validate, then mutate |
| `actions/` | what each action does once it is legal: `attack`, `playCard`, `useSkill`, `board` (swap / promote), `turn` (start / end), `setup` (draft, rosters) |
| `damage.ts`, `death.ts`, `statusOps.ts`, `expSystem.ts`, `deckOps.ts` | the kernel every effect goes through: damage and heals, death / reap / promotion, statuses and their ticks, exp, the deck |
| `triggers.ts`, `registry.ts` | the one dispatcher for hero passives and worn equipment; abilities register themselves at load |
| `forecast.ts` | `simulate(G, pid, action)` and `forecastAttack(G, pid)` |
| `ids.ts`, `fx.ts`, `log.ts`, `castContext.ts` | counters in `G`, the event stream, the match log, the cast frame |
| `game.ts` | the boardgame.io adapter only: setup, turn hooks, moves → `perform`, `endIf` |

Card behaviour is `src/abilities/index.ts` (one `AbilityDef` per effect);
status semantics are `src/statuses/index.ts`.

## Adding or changing a card

- **An effect** (a skill, a spell, an ultimate, an equipment proc) is an
  `AbilityDef` with a `trigger` and `run`. Its `target` filter is all the
  legality it needs — the engine, the board and the AI all read it.
- **A number the rules read** — a bonus to the basic swing, damage the bearer
  takes, how long its buffs last — is a pure hook on the ability:
  `attackBonus` (Frenzy), `incoming` (Vindicta's flight), `buffDuration`
  (Superior Duration). `attackPower`, `damageUnit` and `addStatus` ask every
  ability the hero carries; nothing else needs to know.
- **A status** declares `blocks` (attack / skill / channel pulse), `cc` (hard
  crowd control: Unstoppable blocks it, it ticks at the end of the turn) and
  `stack`. `isBlocked(card, act)` is the only lockout check there is.
- **Never** add a `cardId === '…'` to `src/engine`, a status list to the UI or
  the AI, or a cost / target / cap check outside `legality.ts`.

## Proving a change

- `npx tsc -b`, `npx vitest run --dir tests`.
- **Replay trace** (`scripts/replay-trace.ts`): 300 AI-vs-AI games with
  pinned randomness, a hash of the state after every move. Record one before
  the change and one after, then `compare`: a refactor must reproduce the
  previous trace byte for byte; a rule change must diverge only in the games it
  explains (`compare` names the first differing move of each).
- **Fuzz** (`tests/engine/fuzz/`): seeded self-play — the real AI, random legal
  play, and malformed "chaos" moves — checks state invariants after every move,
  that legality and the engine agree in both directions, that a refused move
  changes nothing, that the forecast equals the real attack, and that a seed
  replays identically.
- **In the browser**: `scripts/qa/tutorial.mjs` and `match.mjs` at both sizes
  (they fail on any console error or React warning), `legality.mjs` for the
  board's refusals on staged boards.
