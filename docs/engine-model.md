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
| `constants.ts` | every rule number (costs, caps, patron HP, income and comeback, bounty, cooldowns, respawn, levels) |
| `rounds.ts` | counting turns: `firstMover`, `ownTurn(G, pid)`, `round(G)` — the one conversion from the engine turn |
| `query.ts` | pure reads: the board, `targetsFor`, `abilitySources`, `heroAbilities` (what a hero card prints: its skills, then passives), `kitAbilityIds` / `resolveSkill` (what a hero may use: its skills, its ultimate, a borrowed ultimate; which one an action names), `ultimateCard`, `isBlocked` / `isUntargetable`, `hasReach`, `ricochetPower`, `attackPower` / `effectiveAtk`, `effectiveSpirit`, `wornEquipment`, worth (`listPrice`, `heroWorth`, `netWorth`, `isRichestHero`, `killBounty`, `comebackBonus`), `checkWinner` |
| `legality.ts` | the only place a move's legality is written: `attackBlocked` / `attackTargets` (who the attack may name), `skillBlocked` / `skillTargets` (skills and ultimates), `playBlocked` / `playTargets`, `cardCost`, `retreatCost`, `moveBlocked`, `promoteBlocked`, `blocked(G, pid, action)` (a promotion owed blocks everything else; after the turn's attack only `endTurn` is left), `legalActions` |
| `engine.ts` | `Action`, `perform(G, pid, action)` — validate, then mutate |
| `actions/` | what each action does once it is legal: `attack` (and `attackAll`, a swing at every enemy hero), `playCard`, `useSkill`, `board` (swap / promote, and the free `swapIntoActive` / `pullToActive` a card's effect makes), `turn` (start / end), `setup` (draft, rosters) |
| `damage.ts`, `death.ts`, `statusOps.ts`, `expSystem.ts`, `deckOps.ts` | the kernel every effect goes through: damage and heals, death / reap / promotion and souls (`awardSouls`), statuses and their ticks, exp, the deck and the hand (`returnToHand`) |
| `lane.ts` | `leaveActive`: what ends when a hero leaves the Active slot (a leaf, so death, statuses and the board moves all call it) |
| `triggers.ts`, `registry.ts` | the one dispatcher for hero passives and worn equipment; abilities register themselves at load |
| `forecast.ts` | `simulate(G, pid, action)` and `forecastAttack(G, pid, targetIid?)` |
| `ids.ts`, `fx.ts`, `log.ts`, `castContext.ts` | counters in `G`, the event stream, the match log, the cast frame |
| `game.ts` | the boardgame.io adapter only: setup, turn hooks, moves → `perform`, `endIf` |

Card behaviour is `src/abilities/index.ts` (one `AbilityDef` per effect);
status semantics are `src/statuses/index.ts`. The AI is `src/ai/heuristic.ts`:
it lists `legalActions` and ranks each by the position it leads to
(`evalState`). What it thinks a status, a channelled ultimate or a merged Rem
is worth is judgement, kept in one table (`STATUS_WEIGHT`) at the top of that
file.

## The turn

**Seats.** The pie rule: seat 0 drafts first and seat 1 moves first
(`G.firstMover`). The last pick ends the draft's turn, so engine turn 1 opens
with a real `beginTurn` for the first mover (the draft itself is turn 0). A
scripted match (a Story node, a lesson) opens on seat 0's turn, its first mover
set to match. `rounds.ts` converts: the first mover's own turn r is engine turn
2r − 1, the second mover's 2r, and round r holds both. Nothing in the engine is
seat 0's by default any more except `G.humanSeat` (seat 0, or null in a sim):
a fallen Active is promoted on the spot for every other seat, and the human
seat is asked (`pendingPromotion`).

**Income.** Souls accumulate: nothing refills and nothing is lost at the end of
a turn. At the start of every own turn (the first included) the lane pays
`LANE_INCOME`, plus a comeback for a side that trails on net worth — souls
plus the list price of every item its heroes wear (`netWorth`): +1 at 8
behind, +2 at 16 (`COMEBACK_STEPS`) — and `SECOND_MOVER_FIRST_INCOME_BONUS` on
the second mover's first. Then cooldowns and respawn timers tick (on corpses
too) and the turn's card is drawn.

**Abilities.** Each hero uses one ability a turn — a skill or its ultimate —
and abilities cost nothing. A skill waits its `cooldown` in own turns after
use (`SKILL_COOLDOWN` = 1, every turn, when its data names none). The ultimate
is a kit ability, not a card: `HeroCard.ult` names its ability, it unlocks at
`ULT_UNLOCK_LEVEL` (2) and waits `ULT_COOLDOWN` (3) own turns after each use.
It runs through `useSkill` like a skill, in an `'ult'` cast frame, and sets off
`onBearerUltCast`. Sinclair's ultimate borrows the rival Active's
(`borrowedUlt`): a kit ability used once, free, with no level or cooldown.
Echo Shard repeats a skill, never an ultimate.

**The Act.** One basic attack a turn per player (`G.attackUsed`), and it ends
the Act: after it nothing is legal but `endTurn` and an owed promotion
(`blocked` answers `'actOver'`). A hero that used its ability may still attack.
A Retreat comes before the attack — the hero who steps in makes it — and one a
turn (`G.retreatUsed`); it costs `retreatCost`: `RETREAT_COST`, less what the
hero leaving carries (`retreatDiscount`), and nothing while it is Swift — the
Retreat spends the Swift. Extra swings exist only as explicit `extra_attack`
grants (Haze's Fixation from Level 3, Burst Fire, Fleetfoot, Fury Trance, Blood
Tribute), all inside the one attack. Turn 1 has no attack, and a promotion off
a fallen Active is free and brings in a hero who may make the attack if none
has been made.

**Kills and the end.** A kill pays the victim's opponent its level + 1, and 2
more if it was strictly the richest hero on the board (`killBounty`); the
patron loses the victim's level; the hero respawns with its items and level
(an item that puts a lasting status on its bearer when worn puts it back). A
board with every hero down is no loss by itself: at the end of a turn, if the
rival has no standing hero, the ending player's standing Active pushes its
bullet power into the rival's patron. A patron at 0 loses; if both fall to one
action, the one with more HP left wins, and on a tie the second mover.

**Ricochet.** A swing whose damage gets through bounces: every other living
enemy hero a Dome does not cover takes N bullet damage, where N is
`ricochetPower` — a `ricochet` status on the attacker (Split Shot, swept with
Swift when the turn ends) plus the `ricochet` hooks of what it carries (the
Ricochet item: 2). Each swing bounces, Extra Attacks too; a swing absorbed to 0
does not, and a bounce never bounces again (only `swing` reads it). The
volley of `attackAll` does not ricochet. A bounce is the swing's bullet, so it
is dealt in an attack frame marked `bounce` (`withCast(atk, 'attack', fn,
{ bounce: true })`): the attacker's gear reacts and its passives follow as for
the swing, each with `bounce: true` and never `primary`. What the swing puts on
its target spreads (Bleed, the resist and power shreds, Root, Djinn's Mark,
Siphon's steal); what it does for the attacker stays with the swing — every
self-heal, Tesla's chain, Mixed Bullets' spirit half, Fixation's extra swing —
each of those procs returns on `bounce`. A bounce meets the hero's own Bullet
Resist, Shield and Return Fire, and a kill by it is the attacker's: the exp
through the frame's source, the KO bounty and the patron's loss when the attack
resolves, once, at its end.

## Adding or changing a card

- **An effect** (a skill, a spell, an ultimate, an equipment proc) is an
  `AbilityDef` with a `trigger` and `run`. Its `target` filter is all the
  legality it needs — the engine, the board and the AI all read it.
- **A number the rules read** — a bonus to the basic swing, damage the bearer
  takes, how long its buffs last — is a pure hook on the ability:
  `attackBonus(self, target)` (Frenzy; the swing passes its target, for a bonus
  that reads it — Fixation's stacks — and the card face passes none),
  `incoming` (Vindicta's flight), `buffDuration` (Superior Duration),
  `retreatDiscount` (Sprint Boots: souls off the bearer's Retreat, read by
  `retreatCost`), `resists` (Enduring Speed: a status `addStatus` refuses to
  put on the bearer, saying so in the log), `ricochet` (the Ricochet item: the
  bearer's swing bounces, summed by `ricochetPower`). `attackPower`, `damageUnit`,
  `addStatus` and `retreatCost` ask every ability the hero carries; nothing
  else needs to know.
- **Gear that reacts to a move** listens for a trigger the engine fires
  through `fireTriggers` with `reaction: true`: `onBearerStepIn` goes off for the
  hero that takes the Active slot by a move its player chose — the Retreat
  (`moveHero`) or a card's `swapIntoActive` — never by a promotion off a fallen
  Active, nor when the rival drags it to the front (`pullToActive`). Kinetic
  Dash listens for it.
- **Who the attack may name** — `reach` on a passive (or worn gear) lets its
  hero's basic attack name any living enemy hero, not only the rival Active;
  `attackTargets` is the one list, and the move, the forecast, the AI and
  `legalActions` all read it — and the board: with more than one entry the
  Attack plate arms a targeting flow (`ui/board/attackAim.ts`) that lights
  exactly that list and dispatches `attack(targetIid)`, the first target bare.
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
- **Card text** is read by players and by tests: mark each number the effect
  adds Spirit Power to `{sp:N}` (Bullet Power `{bp:N}`) so it prints in its
  colour and explains itself on hover or tap (`ui/card/scaling.ts`,
  `ui/explain/`; the rule is in [stats-model.md](./stats-model.md) §3), and
  word a status keyword by its registry name so a tap on it says what the
  status does. A hero's sheet prints the ability's own `text` with the hero's
  live figures behind it.
- **Never** add a `cardId === '…'` to `src/engine`, a status list to the UI or
  the AI (the AI's `STATUS_WEIGHT` prices statuses; what a status does is only
  ever read from `StatusDef`), or a cost / target / cap check outside
  `legality.ts`.

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
- **AI vs AI** (`scripts/eval/ai-vs-ai.ts`): a change to how the AI values a
  position plays the new AI against the previous commit's over 1000 seeded
  games, seats alternating; it must win at least 52% with the 95% Wilson
  interval above 50% (see [testing-model.md](./testing-model.md)). The balance
  sim and the match telemetry then say what the new play does to the card and
  hero tables.
- **In the browser**: `scripts/qa/tutorial.mjs` and `match.mjs` at both sizes
  (they fail on any console error or React warning), `legality.mjs` for the
  board's refusals on staged boards (a Dome, a Rooted hero, an attack that
  names its target) and for a number's colour and what hovering or tapping it
  (or a status) says, `fx-gallery.mjs` / `fx-match.mjs` to film the effects.
