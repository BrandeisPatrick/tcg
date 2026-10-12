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
| `query.ts` | pure reads: the board, `targetsFor`, `abilitySources`, `heroAbilities` / `resolveSkill` (a hero's kit: its skills, then passives; which skill a bare action names), `isBlocked` / `isUntargetable`, `hasReach`, `attackPower` / `effectiveAtk`, `effectiveSpirit`, `wornEquipment`, `checkWinner` |
| `legality.ts` | the only place a move's legality is written: `attackBlocked` / `attackTargets` (who the attack may name), `skillBlocked` / `skillTargets`, `playBlocked` / `playTargets`, `cardCost`, `moveBlocked`, `promoteBlocked`, `blocked(G, pid, action)` (a promotion owed blocks everything else), `legalActions` |
| `engine.ts` | `Action`, `perform(G, pid, action)` — validate, then mutate |
| `actions/` | what each action does once it is legal: `attack` (and `attackAll`, a swing at every enemy hero), `playCard`, `useSkill`, `board` (swap / promote, and the free `swapIntoActive` / `pullToActive` a card's effect makes), `turn` (start / end), `setup` (draft, rosters) |
| `damage.ts`, `death.ts`, `statusOps.ts`, `expSystem.ts`, `deckOps.ts` | the kernel every effect goes through: damage and heals, death / reap / promotion and souls (`awardSouls`), statuses and their ticks, exp, the deck and the hand (`returnToHand`) |
| `lane.ts` | `leaveActive`: what ends when a hero leaves the Active slot (a leaf, so death, statuses and the board moves all call it) |
| `triggers.ts`, `registry.ts` | the one dispatcher for hero passives and worn equipment; abilities register themselves at load |
| `forecast.ts` | `simulate(G, pid, action)` and `forecastAttack(G, pid, targetIid?)` |
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
  `attackBonus(self, target)` (Frenzy; the swing passes its target, for a bonus
  that reads it — Fixation's stacks — and the card face passes none),
  `incoming` (Vindicta's flight), `buffDuration` (Superior Duration).
  `attackPower`, `damageUnit` and `addStatus` ask every ability the hero
  carries; nothing else needs to know.
- **Who the attack may name** — `reach` on a passive (or worn gear) lets its
  hero's basic attack name any living enemy hero, not only the rival Active;
  `attackTargets` is the one list, and the move, the forecast, the AI and
  `legalActions` all read it.
- **A skill that costs HP** — `hpCost` on the skill: it is blocked unless the
  caster has more HP than that, and `useSkill` takes the HP straight off before
  the skill runs (through no Shield, setting off no trigger, never a kill).
- **A status** declares what it does to its bearer, and the engine reads it
  from that one place:
  - `blocks` — attack / skill / channel pulse / move (a Retreat, or being
    swapped into the Active slot: Rooted); `isBlocked(card, act)` is the only
    lockout check there is.
  - `untargetable` — the bearer cannot be the target of a basic attack (Dome);
    `isUntargetable(card, act)` is the only check on who may be aimed at.
  - `clearOnLeaveActive` — the status ends when its bearer leaves the Active
    slot (Fixation); `leaveActive` does it, and every move off the slot calls it.
  - `cc` (hard crowd control: Unstoppable blocks it, it ticks at the end of the
    turn) and `stack`.

  A delayed effect goes off in `tickStartOfTurn`, beside Charged and Reverb
  (Last Stand; the status instance carries its own `heal`).
- **Moving heroes, souls, cards** — a card that puts a bench hero in the Active
  slot calls `swapIntoActive`, one that drags an enemy there `pullToActive`,
  one that pays out souls `awardSouls`, one that returns a card to its owner's
  hand `returnToHand`; an ultimate that swings at the whole board calls
  `attackAll`. None of them is written twice.
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
