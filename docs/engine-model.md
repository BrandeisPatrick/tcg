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
| `constants.ts` | every rule number (costs, caps, the income, prices, cooldowns, the ultimates' `ULT_COST` by size, levels; the deck's: `DECK_SIZE`, `MAX_COPIES`, `OPENING_HAND`, `DRAW_PER_TURN`, `MAX_HAND`; the map's: `STRUCTURES`, the late game, the Mid-Boss, the Rejuvenator, `RESPAWN_TURNS`, `ROUND_CAP`) |
| `rounds.ts` | counting turns: `firstMover`, `ownTurn(G, pid)`, `round(G)` — the one conversion from the engine turn — and the map's clocks: `lateGame` / `pushMultiplier`, `bossReturnRound`, `reviveLastRound`, `endsRound` / `endsLastRound`, `MATCH_TURNS` |
| `query.ts` | pure reads: the board (`slottedHeroes`, `liveBoardCards`, `heroesOf`), `targetsFor`, `abilitySources`, `heroAbilities` (what a hero card prints: its skills, then passives), `kitAbilityIds` / `resolveSkill` (what a hero may use: its skill, its ultimate; which one an action names), `kitCost` (what one costs in souls: a skill's `souls`, an ultimate's `ULT_COST` by its card's size — a charged one its own price less the hero's count, `ultPrice` / `chargedUlt`), the optional triggers (`optionalTriggers`, `triggerPrice`, `promptOwed`, `fallPending`), `abilityAim` (what one is aimed at: its `target`, or its `aim` read off the board), `heroRetreat` (a hero's printed Retreat), `ultimateCard`, `isBlocked` / `isUntargetable`, `hasReach`, `ricochetPower`, `attackPower` / `effectiveAtk`, `effectiveSpirit`, items (`wornItems`, `wornActives`, `wornEquipment`, `findWornItem`, `slotCap`, `hasSpike`, `activeCooldown`, `itemCooldown`), the hand (`handCard`, `isHeroCard`, `laneOpen`), worth (`itemPrice`, `heroWorth`, `handWorth`, `netWorth`), the map (`structureHp`, `structureOf`, `frontStructure`, `patronFallen`, `killPush`, `respawnTimer`, `reviveReady`, `standingBoss`, `isBoss`, `bossTaker`, `seatOf`), `standingVerdict`, `checkWinner` |
| `legality.ts` | the only place a move's legality is written: `attackBlocked` / `attackTargets` (who the attack may name), `skillBlocked` / `skillTargets` (skills and ultimates), `activateBlocked` / `activateTargets` (active items), the hand (`playBlocked`, `playCost`, `playTargets`, `upgradeComponent`, `placeHeroBlocked`, `freeBenchSlot`, `chooseActiveBlocked`, `discardBlocked`), `retreatCost`, `moveBlocked`, `promoteBlocked`, `blocked(G, pid, action)` (an owed choice — the first Active, a promotion, a discard — blocks everything else; after the turn's attack only `endTurn` is left), `legalActions`, and the trigger prompt's (`triggerBlocked`: level, wait, souls; `answerBlocked`) |
| `engine.ts` | `Action`, `perform(G, pid, action)` — validate, then mutate |
| `actions/` | what each action does once it is legal: `hand` (`playCard`: an item onto a hero, an evolve, the upgrade shuffled in; `placeHero`; `chooseActive`; `discard`), `activate` (an active item), `attack` (and `attackAll`, a swing at every enemy hero), `useSkill`, `board` (swap / promote, and the free `swapIntoActive` / `pullToActive` a card's effect makes), `turn` (start / end), `setup` (draft, rosters, the decks and the opening) |
| `deck.ts` | the deck, the hand and the discard pile: the match's seeded stream (`nextRandom`, `shuffle`), what a side brings (`buildOf`, `sideDeckIds`, `fillDeck`), `drawCards`, `dealOpeningHand` (the hero guarantee), `toDiscard`, `oweDiscard` / `discardFromHand`, `shuffleIntoDeck` (an upgrade made), `heroToHand` (a fallen hero back) |
| `map.ts`, `souls.ts` | the map: `newTrack`, `pushStructures` (front first, the Walker's flex slot), the Mid-Boss (`riseBoss`, `tallyBossHit`, `reapBoss`), the Rejuvenator lapsing (`lapseRevives`); `awardSouls`, the one way souls are paid outside the income (Golden Goose Egg) |
| `rng.ts` | the seeded generator the match's stream draws with (`seededRandom`) |
| `instances.ts` | card instances and items going on and off heroes: `makeInstance`, `attachItem` / `detachItem` (a passive's bonus on and off), `syncVitalitySpike` |
| `damage.ts`, `death.ts`, `statusOps.ts`, `expSystem.ts` | the kernel every effect goes through: damage and heals, death / reap / promotion and souls (`awardSouls`), statuses and their ticks, exp |
| `lane.ts` | `leaveActive`: what ends when a hero leaves the Active slot (a leaf, so death, statuses and the board moves all call it) |
| `triggers.ts`, `registry.ts` | the one dispatcher for hero passives and worn equipment (and the hand-off of optional triggers to `prompts.ts`); abilities register themselves at load |
| `prompts.ts` | the trigger prompt system: `offerTriggers` (ask at a moment, only what can be used), `answerTrigger` (use or pass, then the moment goes on), `triggerName` — see "Trigger prompts" below |
| `forecast.ts` | `simulate(G, pid, action)` and `forecastAttack(G, pid, targetIid?)` |
| `ids.ts`, `fx.ts`, `log.ts`, `castContext.ts` | counters in `G`, the event stream, the match log, the cast frame |
| `game.ts` | the boardgame.io adapter only: setup, turn hooks, moves → `perform`, `endIf`, and the 'respond' stage a trigger prompt holds the asked seat in |

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

**The deck.** A side's cards that are not on the board are in its deck (face
down, drawn from the top: the end of `PlayerState.deck`), its hand or its
discard pile. A drafted match builds each deck as the last pick lands
(`openDraftedMatch`): the side's items — the human seat's saved deck
(`G.playerDeck`, DECK_SIZE items, at most MAX_COPIES of one) when it is a
legal one, else the deck its heroes' builds make (`deckFromBuilds`,
cards/decks.ts: the builds read across, round by round) — and its four drafted
heroes, shuffled from the match seed (`nextRandom`, counted in
`G.counters.rng`, so a game replays from G alone). Each side draws OPENING_HAND
with at least one hero that can stand in the lane (`dealOpeningHand`: a hand
with none swaps a random item for a random such hero of the deck) and puts one
hero from it in the lane as its first Active: an AI seat at once, the human
seat when asked (`G.pendingActive`: only `chooseActive` is legal, for that
seat's hand, from either seat). A scripted match (a Story fight, a lesson)
keeps its rosters on the board and deals from a deck of items (`StorySetup`
may name the decks, top first, and the opening hand's size).

**Income and the draw.** Souls accumulate: nothing refills and nothing is lost
at the end of a turn. At the start of every own turn (the first included) the
lane pays `LANE_INCOME` (5) — the only souls there are: kills, the Guardian and
the Mid-Boss pay none, and there is no comeback (`SECOND_MOVER_FIRST_INCOME_BONUS`,
the pie rule's dial, is 0). Cooldowns (the heroes' and the worn items', on
corpses and on heroes waiting in the hand too) and the fallen heroes' waits
tick; a hero whose wait is over goes back to the hand (`heroToHand`); then the
side draws DRAW_PER_TURN (`drawCards`: a draw into a hand of MAX_HAND is
skipped, an empty deck draws nothing and nothing else happens). A turn has no
steps: the player plays from the hand, uses abilities and retreats until the
turn's attack, which ends it.

**The hand.** It holds heroes and items (zone `'hand'`); every move from it
is `pid`'s own turn's, before the attack.
- `placeHero(cardIid, toActive?)` puts a hero on the first free bench slot
  (`freeBenchSlot`: not one a merged Rem will come back to) or, `toActive`,
  into an EMPTY Active slot. Free. The state-based pass follows, so a hero
  benched while the lane is open steps up (an AI seat's at once, the human
  seat is asked).
- `playCard(cardIid, heroIid, upgradeId?)` puts an item on one of the
  player's heroes in a slot — the bench and corpses included — for `playCost`:
  `PRICE[tier]` (2 / 4 / 8 / 16 / 24), or, an upgrade onto the hero that wears
  its component (`upgradeComponent`), the difference: it evolves, taking the
  component's place (on a full hero too), and the component goes to the
  discard pile. On any other hero an upgrade costs its full price and evolves
  nothing. The hero needs a free slot (`slotCap`: 3, 4 with the flex slot)
  unless it evolves, and may not wear a copy already (`playBlocked`). An
  active starts on its full cooldown (`activeCooldown`: the card's own
  `cooldown` when it names one, else by tier) or, hard crowd control, with
  `HARD_CC_CHARGES`; a passive's `bonus` goes on; the hero earns `EXP_ON_EQUIP`
  the first time it wears that item. An item Deadlock builds into a bigger one
  (`upgradesOf`, the cards' `upgradesFrom` read backwards) makes that upgrade
  and shuffles it into the deck (`shuffleIntoDeck`, a `deck` event): the
  player's pick (`upgradeId`) when there are several — `legalActions` lists
  one play per upgrade then — the first otherwise.
- The draw cards (the Cooldown family, actives declaring `draw` on their
  ability) draw and then owe a discard (`oweDiscard`: never more than the hand
  holds): `G.pendingDiscard` makes `discard(cardIids)` — any cards of the
  hand, up to what is owed — the only legal move until it is paid.
- Items stay on through death, and a fallen hero carries them back to the
  hand. A hero wearing three items of one tab has that tab's category spike
  (+1 Bullet Power, Spirit Power or max HP), read off what it wears. Hand
  items count in net worth at list price (a hero card at 0).

Every move of a card between the deck, the hand and the discard pile is a
`deck` FX event (`shuffle`, `draw`, `discard`, `upgrade`, `toHand`), for the
board's animation layer; the FX timeline ignores them.

**The heroes.** Each hero card is built to [hero-design.md](hero-design.md):
its Level 1 `atk` and `hp` (4 + its tank score, moved a point by its curve),
the `growth` each level adds (`grantExp`: 2, 3 or 4 points by curve, split
between Attack, HP and Spirit), its printed `retreat` (0–2 souls) and its
`profile` (role, mix, reach, curve). Its kit is one skill or one passive, plus
an ultimate.

**Abilities.** Each hero uses one ability a turn — its skill, an active item it
wears (`activate`, in a cast frame whose source is the bearer; free; it then
cools down 2 own turns for tiers 1–2, 3 for tiers 3 and up, or spends one of a
hard crowd-control item's charges), or its ultimate. A skill and an ultimate
are paid in souls (`kitCost`): a skill its own `souls` (1–3), an ultimate
`ULT_COST` by its card's size (small 4, medium 8, large 12), or a charged
ultimate's own price (`UltimateCard.charged`: Victor 20, Silver 16) less the
hero's count of the damage it takes or deals (its `tally`, counted by
`damageUnit`, never below 0). `skillBlocked`
refuses one the player cannot pay for (`'souls'`), and `useSkill` charges it
before the ability runs (`payKit`: the souls, the cooldown, a charged
ultimate's count started over — the trigger prompt pays a trigger the same way).
An ability that is an optional trigger (`optional`) is never used from its
button (`'trigger'`): the trigger prompt asks it at its moment. A skill waits its `cooldown` in own turns after use
(`SKILL_COOLDOWN` = 1: ready again on the hero's next turn, when its data names
none). The ultimate is a button printed on the hero card, not a card:
`HeroCard.ult` names its ability, it unlocks at `ULT_UNLOCK_LEVEL` (2) and
waits `ULT_COOLDOWN` (3) own turns after each use. It runs through `useSkill`
like a skill, in an `'ult'` cast frame, and sets off `onBearerUltCast`. An
ability whose aim depends on the board says so with `aim` (Traveler needs
Mirage in the lane; Sinclair's Audience Participation aims as the rival
Active's ultimate it casts at once as his own). Echo Shard repeats a skill,
never an ultimate, and pays no souls for it.

**The Act.** One basic attack a turn per player (`G.attackUsed`), and it ends
the Act: after it nothing is legal but `endTurn` and an owed promotion
(`blocked` answers `'actOver'`). A hero that used its ability may still attack.
A Retreat comes before the attack — the hero who steps in makes it — and one a
turn (`G.retreatUsed`); it costs `retreatCost`: the leaving hero's printed
`retreat`, less what it carries (`retreatDiscount`), and nothing while it is
Swift — the Retreat spends the Swift. Extra swings exist only as explicit
`extra_attack` grants (Burst Fire, Express Shot, Spellslinger,
Infinite Rounds, Fleetfoot, Fury Trance, Blood Tribute, Vampiric Burst), all
inside the one attack. Turn 1 has no attack, and a promotion off a fallen
Active is free and brings in a hero who may make the attack if none has been
made.

**Kills and the end.** A kill pays no souls; it pushes the victim's level + 1
into the victim's side's structures (`killPush`) and goes on the record. The
fallen hero waits `RESPAWN_TURNS` (2) of its owner's turns in its slot as a
corpse (`respawnTimer`), then goes back to its owner's hand at full HP with its
level and items (`heroToHand`), its slot left empty; with `RESPAWN_TURNS` 0 it
goes straight there. An empty or fallen Active slot is filled from the bench
(`laneOpen`: the promotion), or, empty, from the hand (`placeHero`). A board with
every hero down is no loss by itself: at the End, if the rival has no standing
hero, the ending player's standing Active pushes its bullet power into the
rival's structures. How a match ends is the map's (below).

## Trigger prompts

Some effects are optional and come at a moment, often on the other player's
turn: "When Victor falls, you may use this" (docs/hero-design.md §6). They go
through one system, `prompts.ts`, and a card only declares one:

- **The declaration** is on the ability: its moment (`trigger`, e.g.
  `'onFall'`), that it is a "may" (`optional: true`), its cost (a kit
  ability's `kitCost`, a passive's `souls`), its wait (its cooldown, as from a
  button) and its effect (`run`, with `source` the hero and `target` the hero
  the moment is about). A new card adds a trigger, not prompt code.
- **The moment** is asked through `fireTriggers`, which runs the automatic
  reactions and hands the optional ones to `offerTriggers`. It keeps the ones
  `triggerBlocked` lets through (the level, the wait, the souls). None: it
  returns false and the moment goes on. Otherwise it pushes a
  `PendingTrigger` onto `G.triggers` and returns true, and the moment's own
  outcome waits. The first moment is a hero's fall: `reapDead` and
  `fallToBoss` ask through `fall` before `killInPlace`.
- **The pause.** While a prompt is owed (`promptOwed`, the last of the stack)
  `blocked` allows only its answers — `useTrigger` one of its offers, or
  `passTrigger` — from either seat, and `legalActions` lists only those. The
  falling hero stays at 0 HP in its slot (`fallPending`): `damageUnit` leaves
  it alone, `resolve` does not reap it and holds the promotions until the
  answer, the End step neither levels it nor counts it fallen for the
  empty-lane push. The adapter (`syncPrompt`, game.ts) puts the asked seat —
  and the seat on turn, whose seat the local client sends every move as — in
  the `respond` stage, and lets it go once nothing is owed. A prompt opened in
  the End step is held into the next turn, whose `onBegin` opens the stage.
- **The answer.** `answerTrigger` pops the prompt. A use pays (`payKit`), is
  reported as the ability's cast (and an ultimate's reveal in `G.action`),
  runs the effect and fires the worn reactions to an ultimate; it is no turn's
  ability (`skillUsedThisTurn` is untouched). A pass logs. Then `settle` lets
  the moment go on — for a fall, `killInPlace` unless the answer stood the
  hero back up — and `resolve` runs again (which may ask the next prompt).
  The exp of the blow that dropped a hero who may cancel its fall is held on
  it (`downedBy`) and paid by `killInPlace`.
- **The AI** answers the same prompt: `enumerateAIMoves` returns the answers
  for the seat asked, whoever is on turn, each scored by the position it
  leaves (`answerScore`), and the lookahead's lines answer a prompt they open
  as the rival would (`answered`). The board's AI loop runs for the seat
  asked; the board shows `TriggerPrompt` for the human seat's own.

**Adding chains later.** The stack is there for it. A chain is an answer to
an answer, the newest resolving first:
1. Give `PendingTrigger` a `chosen?: TriggerOffer` and a moment for
   "a trigger was used" (`'onTriggerUsed'`, its subject the hero that used it).
2. In `answerTrigger`, a use no longer resolves at once: it pays, sets the
   entry's `chosen` and leaves the entry on the stack, then fires the new
   moment for the other side's heroes (`fireTriggers` → `offerTriggers` pushes
   their prompt on top, if any of theirs can be used).
3. When the top prompt is passed (or a use opens no answer), resolve the
   stack from the top down: pop each entry, run its `chosen` effect if it has
   one, `settle` its moment, and stop at the first entry still unanswered.
4. `promptOwed` already reads the top; `blocked`, `legalActions`, the stage
   and the AI need no change, since they ask only "what is owed now".

**Adding an auto / on / off setting later** (Master Duel's): a per-seat mode
in `G` (say `G.triggerMode: Record<PlayerID, 'ask' | 'auto' | 'off'>`, copied
in at setup from the player's settings like `playerBuilds` — the engine never
reads storage), read in `offerTriggers`: `'off'` returns false (nothing asked,
the moment goes on, as with nothing usable); `'auto'` answers at once with
the AI's choice for that seat (or always uses) instead of pushing a prompt;
`'ask'` is today's.

## The map

**Structures.** Each side has a track, Guardian 4 → Walker 6 → Patron 8
(`PlayerState.structures`; a Story fight or a lesson may give a shorter one,
`StorySetup.patronHp` / `structures`). `pushStructures` damages the front
standing structure and carries the rest on; what is left past the Patron is
lost. No fall pays souls: a felled Walker gives every hero of the pushing side
the flex slot (`slotCap`), a felled Patron loses the match. Pushes come from kills and from an empty lane, both doubled
from round `LATE_GAME_ROUND` (`pushMultiplier`). Every structure hit is a
`push` event and every fall a `fall` event.

**The Mid-Boss** (`G.boss`: a card instance in the pit, zone `'pit'`, owned by
`'none'`) rises at the start of round `BOSS_SPAWN_ROUND` and again
`BOSS_RESPAWN_ROUNDS` after the round it died in (`riseBoss`, every turn's
start). `attackTargets` offers it after the enemy heroes — the attack's own
rules hold — and a swing at it is bullets alone: `damageUnit` lets only a
swing's own hit through (no ability, proc, rider, bounce or tick), nothing the
attacker carries reacts, it does not ricochet, `addStatus` refuses it and
`targetsFor` never lists it. Each side's damage is tallied (`G.bossDamage`); at
0 HP the state-based pass gives it to the side with more (`bossTaker`: then the
side behind on net worth, then the last hit), with the Rejuvenator (no souls). At the End of a turn in which a hero attacked it, it hits that
hero for `BOSS_RETALIATION` pure damage; a death from it pays no bounty and
pushes nothing (`fallToBoss`).

**The Rejuvenator.** `reviveCredits` revives, good through round
`reviveUntilRound` (`reviveLastRound`): a hero of the side that falls while one
is live is pushed as usual, then comes straight back in place at
full HP with its items and level (a `revive` event with `credit`), a credit
spent. Credits lapse as their last round ends (`lapseRevives`).

**The wait.** A fallen hero waits `RESPAWN_TURNS` own turns in every round,
whatever it wears (`respawnTimer`), and then goes back to the hand. The
Mid-Boss keeps its own return (`BOSS_RESPAWN_ROUNDS`).

**The end.** `checkWinner` (boardgame.io's `endIf`): a side whose Patron has
fallen loses; both at once, and round `ROUND_CAP` ending (`G.capped`, set as
the second mover's own turn 12 ends, so no turn 25 begins), go to
`standingVerdict` — more structure HP, then more net worth, then the second
mover. `G.record` keeps what each side did on the map (kills, pushes and their
damage, Mid-Bosses taken and those taken from behind, revives) for the result
sheet and the sims.

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
through the frame's source, the kill and the push when the attack
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
  bearer's swing bounces, summed by `ricochetPower`), `debuffDuration` (Debuff
  Reducer), `cooldownCut` (the Cooldown family: own turns off the cooldowns the
  bearer starts, never below 1), `resist` (Bullet and Spirit Resilience) and
  `healingBoost` (Healing Booster). `attackPower`, `damageUnit`, `healUnit`,
  `addStatus`, `retreatCost` and the cooldowns (`activeCooldown`, the
  ultimate's in `useSkill`) ask every ability the hero carries; nothing else
  needs to know.
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
- **A skill's price** — `souls` on the skill (1–3); an ultimate's is its card's
  `size`. `kitCost` reads both, and nothing else prices an ability.
- **An ability aimed by the board** — `aim(G, pid, hero)` on it returns the
  filter (or null: it cannot be aimed now); `abilityAim` reads it, so the
  legality, `useSkill`, the board's targeting and the AI all agree.
- **A passive that feeds on knockouts** — trigger `onRivalFall`: `killInPlace`
  fires it on the other side's standing Active when a hero falls to the rival
  (Drifter's Bloodscent). What it keeps for the game goes in the hero's
  `tally`, by ability id.
- **A "may"** — `optional: true` and its moment as the `trigger` (`'onFall'`:
  Victor's Shocking Reanimation): the trigger prompt asks it (above); nothing
  else is needed.
- **A charged ultimate** — `charged: { cost, by: 'taken' | 'dealt', text }` on
  its card: `damageUnit` counts the damage into the hero's `tally`, `kitCost`
  takes it off, `payKit` starts it over.
- **A form** — a status with `form: { hero, art }` (Silver's Wolf form): the
  board shows the status's title as a badge, and that hero's form art while it
  lasts (`heroForm`, cards/art/heroArt.tsx). The engine reads nothing there.
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
  one that pays out souls `awardSouls`; an ultimate that swings at the whole
  board calls `attackAll`. None of them is written twice.
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
