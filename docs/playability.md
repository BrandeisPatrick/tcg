# Playability — why it is not fun yet, and what to build

> **Status, 2026-11-05.** The `gameplay-redesign` branch built this plan as [mechanics-survey.md](./mechanics-survey.md) and the 2026-11-04 proposal revised it; [README.md](../README.md) and [engine-model.md](./engine-model.md) describe the game as it now plays. Where each of the proposal's six tabs ended up:
> - **The loop:** built (Income · Shop · Act · End, a match capped at round 12), with one change: the hand came back, as where a bought card waits until it is played onto a hero. The last sim, before the full shop, measured 5.4 own turns against the 8–10 target.
> - **Souls & shop:** built as the market fixed before turn one, changed: each drafted hero's build goes on sale beside its signatures, a tier 5 at 24 souls joins the ladder and the slice, and the catalogue grew to 140 items ([card-design.md](./card-design.md) §3).
> - **The turn:** built (free abilities, one attack ends the Act, Retreat 1, the pie rule, no first-turn attack, actives start on cooldown); cards are played from the hand in the shop or the Act, and the second mover's income bonus stays at 0.
> - **The map:** built (Guardian · Walker · Patron, the Mid-Boss from round 4, the Rejuvenator, respawn by round), changed: every kill pushes, bench included, and a boss still tied on net worth goes to the last hit. Revive credits cannot be stolen.
> - **Heroes:** in part. Free kits on cooldowns, the ultimate at level 2 and Haze's second swing at level 3 are built; the level-up choice, second skills and Lash's rewrite are deferred.
> - **Proof & order:** the 2,500-game seat-mirrored sim, both AI strengths, restricted play, the budget script and the difficulty dial are built. The pricing pass stopped early and its numbers were reverted, so numbers are set by reasoning and the gates wait for a testing round ([balance-model.md](./balance-model.md)).

Written 2026-11-03 after a phone playtest. Companion to
[balance-model.md](./balance-model.md) (what the numbers were meant to do) and
[engine-model.md](./engine-model.md) (where the rules live). This page says
what the game is today, why that does not play well, and the design to replace
it with. Nothing here is built yet; the last section is the order to build it.
[mechanics-survey.md](./mechanics-survey.md) (2026-11-04) tests this plan
against about forty games and corrects it in places; read its §3 before building.

## 1. What the game is today

- Draft four heroes each (snake, from a shared pool), then bring a 15-card deck
  of items and spells built *before* the draft, with no idea which heroes you
  will get.
- Souls refill like Hearthstone mana: turn N gives N, cap 10, nothing carries
  over. Draw one card a turn, hold seven.
- The Active duels; the bench casts. Each hero: one skill a turn for a soul, or
  the Active attacks. Retreat costs 2. Three items a hero.
- Levels from standing in the lane (2 exp Active, 1 bench), +1 on equip, +2 on
  a kill; each level +1 HP / BP / Spirit; the ultimate comes at level 2.
- A hero that dies **loses its items** to the discard and respawns in 3 turns.
  The patron (10) loses the dead hero's level. Patron at 0, or every hero down,
  is the loss.

The 300-game sim (`scripts/balance-sim.ts`, random drafts, the AI both seats):

| | |
|---|---|
| First player wins | **66%** (fair is 50) |
| Haze | **72%** · Lady Geist 64 · Yamato 59 |
| Lash | **40%** · Seven 41 · Abrams 42 · Viscous 44 · Wraith 44 |
| Match length | 13 turns mean, 5 to 23 |

## 2. Why it is not fun

**There is no loop.** A MOBA turn is *earn → buy → spike → fight → take the
objective*. Ours is *draw a random card → maybe play it → swing*. The only
goal is "kill heroes", and a kill moves a number on a patron nobody attacks.
Nothing on the board asks a question; no turn is a decision about *when*.

**Builds never happen.** The deck is built blind to the draft (a spirit deck
with three gun heroes), draw order decides whether the plan arrives, and when
the carry finally wears its third item it dies and the items are gone. That is
the opposite of Deadlock, where items are the one thing death does not take.

**The cards are not fair** because they are priced by canon tier, not by what
they do. Glass Cannon is +6 Bullet Power for 8 on a 2-power hero (a fresh hero
has 4–7 HP). Burst Fire is a free extra attack every turn, stacking, for 5.
Curse is three turns of no skill and no attack for 5; Knockdown is one turn of
stun for the same 5. Haze's passive is a second swing every turn from turn 2,
so a 3-power hero deals 6 a turn into 4-HP heroes. Ultimates run from 2 souls
(Mirage) to 10 (Paige). Refill souls make tempo everything, so the first mover
wins two games in three.

**It is not Deadlock.** The heroes are, and the item names are. The economy is
Hearthstone, the deck is Pokémon, and there is no lane, no shop, no farm, no
objective, no power spike, no team fight. Nobody ever *saves up* for anything.

## 3. The design: a MOBA in card form

The thesis: keep the heroes, the board, the abilities engine, the FX and the
phone UI; replace **the deck with the shop** and **mana with gold**. The match
becomes a real soul economy, and every other fix follows from it.

### 3.1 Souls are gold

Souls accumulate; nothing refills. Income arrives at the start of your turn:

| Source | Souls |
|---|---|
| Lane (every turn) | 4, flat — not per standing hero, so a side with corpses is not also broke |
| Kill | the dead hero's level + 1, to the killer's side |
| Mid-boss (§3.4) | 4, plus the Rejuvenator |
| Selling an item | half its price, rounded down |

Spending: items (below), a skill still costs 1, a Retreat 2. Souls on hand is
the number that matters on screen, and *saving three turns for a T3* is the
decision the game has never had.

### 3.2 The shop replaces draw

No deck, no hand, no draw. The whole catalogue is on sale every turn, laid out
like the game's shop: **Weapon · Spirit · Vitality** tabs, four tiers, prices
that make a tier a spike you plan for:

| Tier | Price | Deadlock |
|---|---|---|
| T1 | 3 | 500 |
| T2 | 6 | 1,250 |
| T3 | 11 | 3,000 |
| T4 | 18 | 6,200 |

(Deadlock's ratio is 1 : 2.5 : 6 : 12.4; at 4 souls a turn a T2 is a two-turn
save, a T3 three turns, a T4 the late game.) Four item slots a hero, any mix;
sell to make room. Buying is a free action on your turn; items go on any of
your heroes, bench included, and they **stay through death**.

**Active items are items, not cards.** In Deadlock an active item is reusable
on a cooldown; it is the one thing ours got wrong twice (one-shot, and random).
Each of the 37 spells becomes an item with an *activation* (a soul, like a
skill, on a cooldown of 2–3 turns). Knockdown is bought once and stuns every
third turn; Healing Rite is a heal the healer keeps. The hero's kit on the
board is then skill + ult + the actives it wears — a Deadlock hero.

**Builds are the loadout.** The Loadout screen stops building decks and builds
*builds*: a saved item list per hero, in order, like the game's build browser.
In a match the shop opens on your hero's build with the next affordable item
lit; the full catalogue is a tab away. That is deck-building that cannot fail
to execute.

### 3.3 The turn has a spine

1. **Income** — souls arrive; the plaque counts up.
2. **Shop** — a sheet opens on your turn (one tap to skip); buy, sell, move.
3. **Act** — cards are gone, so this is skills, actives, the attack, retreats.
4. **End** — statuses tick, the rival's turn.

Four beats the coach can name and the board can show. The "any order" turn
stays inside step 3.

### 3.4 One objective: the mid-boss

Every fifth turn (5, 10, 15) a neutral **Mid-Boss** stands in the lane: 12 HP,
hits whoever attacks it for 2. Either Active may swing at it instead of the
rival. The side that lands the kill gets the **Rejuvenator**: every hero healed
to full, every corpse back now, and 4 souls. It is the fight-or-farm question
a MOBA asks every few minutes, and the comeback a losing side can plan around.
Nothing else: no guardians, no walkers, no lanes. One objective, well timed.

### 3.5 Death, respawn, comeback

- Items stay on the hero. Respawn 2 turns, not 3.
- The killer's side earns the dead hero's level + 1. The patron still loses the
  level (the carry you feed is the carry that costs you).
- The player who is behind on net worth by 8 or more earns 1 extra lane soul a
  turn (Deadlock's comeback souls, blunt and visible).

### 3.6 Fair cards: price by the model, prove by the sim

Every item and active gets a price from one table before anyone argues about
feel. The budget: **1 soul buys about 1 damage, 1 heal, 1 shield, 1 turn of
one hero's stat, or half a turn of hard crowd control**, and a *permanent*
stat point costs 2. A T2 (6 souls) is a +2 or a 3-damage repeatable; a T4 (18)
is a build-defining passive. The sim then has gates a change must pass:

| Gate | Target |
|---|---|
| First-player win rate | 50 ± 3 |
| Every hero | 45 – 55 |
| Match length | 10 – 14 turns mean, under 2% hit the cap |
| Item win rate when bought (eval harness) | 45 – 55 |

### 3.7 Heroes that are Deadlock heroes (later)

Today most kits are "one skill, often 1 spirit damage". A Deadlock hero has
four abilities and spends **ability points** as it levels. That is the phase
after the economy: two skills a hero, a choice at each level (which skill to
grow), the passive and the ult as they are. It is the biggest content job and
the one the economy makes worth doing, so it waits for the economy to exist.

## 4. What goes, what stays

| Goes | Stays |
|---|---|
| Deck, hand, draw, mulligan, fatigue, Refresher | Draft, the four-hero board, Active + bench |
| Refill souls | Skills, passives, ults, levels, exp |
| Items lost on death | Statuses, the FX stream, the stickers, the phone layout |
| Spells as one-shot cards (they become actives) | The abilities engine (an active is an `AbilityDef` with a cooldown, which exists) |
| 15-card loadouts (they become builds) | Story mode, the tutorial (rewritten for the new turn), the Gallery |

## 5. Two ways to run the shop

**A. Deadlock-true (above).** Everything on sale always; builds as a guide.
Zero luck in the items; all the variance is the draft and the fight. Fairness
is then a pricing problem, which the sim can solve.

**B. Rotating offers.** Five items on sale each turn, drawn from the tiers you
can afford; reroll for a soul; lock one. Keeps a card game's "what did I get"
texture and makes two games differ. Costs clarity, and makes the AI's job and
the sim's gates noisier.

A is the recommendation: the complaint is that plans cannot be executed, and A
is the design where they always can.

## 6. The order to build it

0. **Now, in the current game (an afternoon):** the second player starts with
   2 souls; items stay on death; bounty is level + 1. Run the sim. These are
   the three cheapest fixes to the three worst numbers, and they survive the
   redesign.
1. **Economy and shop in the engine first, no UI:** `buy`, `sell`, `activate`
   as actions in `legality.ts` / `actions/`, actives as cooldown abilities,
   income in `turn.ts`, the catalogue priced from the table. The AI learns to
   shop (it enumerates legal actions, so buying is one more). The sim and the
   fuzz suite prove the pacing before a pixel is drawn.
2. **The shop sheet on the phone:** tabs, tiers, the build column, a buy. The
   turn spine on the board (income tick, shop step, act, end).
3. **The mid-boss** and the comeback souls.
4. **Pricing pass with the harness**, hero by hero, until the gates in §3.6
   hold.
5. **Hero kits**: second skills and ability points.

Each step ships on its own and the game is playable after every one.
