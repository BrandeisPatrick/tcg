# Deadlock TCG

A fan-made, turn-based card game set in **Valve's Deadlock**: build a deck of
Deadlock's items, draft four heroes into it, draw, pay souls to put items on
your heroes, fight in one lane and push down the rival's Patron. One player
against an AI, as a single-page React app.

**Live demo:** https://brandeispatrick.github.io/tcg/ (GitHub Pages, deployed
from `main` on every push by `.github/workflows/deploy.yml`)

> **Fan project.** Not affiliated with Valve. See [LICENSE](./LICENSE) for the
> art-attribution disclaimer.

---

## How a match plays

The title screen offers Quick Match, the Tutorial (five lessons), Story (a
roguelike run over a map of New York), Loadout (your squad, your deck and your
builds) and the Gallery. A Quick Match goes like this.

### Your deck

- Five **ready decks** head the Loadout screen: Gunline, Spirit Storm,
  Bulwark, Ambush and Lockdown. Each is a squad of four heroes and its 16
  items; "Use deck" saves both, and the match is ready to play. Each holds 8
  tier-1, 6 tier-2 and 2 tier-3 items (56 souls), at most 2 copies of one, with
  an upgrade beside the item it is built from and a counter (Counterspell,
  Debuff Reducer, Dispel Magic or Knockdown)
  ([`docs/deck-plan.md`](./docs/deck-plan.md), "Ready decks").
- Or build your own below them, on a deck builder that looks like Deadlock's
  shop: Weapon, Vitality and Spirit tabs, rows by tier, the item icons. Tap an
  item to add a copy; tap one in the deck to take a copy out.
- A deck is 16 items, any tier, at most 4 copies of one.
- Any item may be in a deck, upgrades too. An upgrade's tile says which item
  it evolves ("Evolves Extra Spirit for the difference").
- No saved deck (or one short of 16)? You are dealt one made from your drafted
  heroes' builds: every hero's first build item, then every hero's second, and
  so on until 16. The rival's deck is always made this way.

### The draft

- 21 heroes from Deadlock's roster, each built from its Deadlock role
  ([`docs/hero-design.md`](./docs/hero-design.md)): HP 4 + its tank score and
  Attack 1 (2 for a gun or melee hero), moved a point by its curve (early,
  mid, late); a Retreat price of 0–2 souls; either a skill (fifteen heroes)
  or a passive (six: Abrams, Haze, Vindicta, Drifter, Mirage, Victor); and an
  ultimate, a button printed on the card with the hero's own Deadlock
  ultimate icon. No hero has a Weakness.
- Two ultimates are **charged**: Victor's Shocking Reanimation is ready once
  he has taken 10 damage, Silver's Lycan Curse once she has dealt 8. The
  count starts over when one is used, and the button shows it ("7 / 10").
  Victor's Aura of Suffering hurts
  every enemy and Victor himself at the start of your turn, which charges it.
  Silver's turns her into a wolf for 2 turns (+3 Attack, Shield 6), and her
  card shows Deadlock's wolf-form art while it lasts.
- A snake draft, four heroes each. Your four are shuffled into your deck: 20
  cards.
- The pie rule: you draft first, and the rival moves first. Its first turn has
  no attack.

### The opening

- Each side draws 5 cards, at least one of them a hero that can stand in the
  lane (the Pokémon TCG Pocket rule: a hand with none swaps a random item for a
  random hero from the deck).
- You choose one hero from your hand as your Active. It is your only hero on
  the board; the others come as you draw them.

### Souls

- Souls are a bank. Nothing refills, and nothing is lost at the end of a turn:
  what you do not spend stays.
- Each of your turns opens with 2 souls of income, the price of one tier-1
  item (Pokémon TCG Pocket's one Energy a turn).
- A kill pays your side a bounty: 1 soul in rounds 1–2, and 1 more every two
  rounds, up to 6 in rounds 11–12. Little early, a lot late. A structure's
  fall pays nothing. (One item, Golden Goose Egg, pays 2 a use.)
- Tap your souls (or hover them with a mouse) for the bank sheet: what the
  next turn pays, what you will hold then, and what a kill pays now.
- You may play as many cards in a turn as your souls pay for.

### The scene

The match screen is laid out like Pokémon TCG Pocket's battle screen, in our
own look: one portrait stage (`src/ui/board/BoardTable.tsx`, 390 × 844) scaled
to whatever the screen is, so a phone fills it edge to edge and a desktop shows
it centred at full height with the scene either side.

- **The table** is a drawn city plan seen from straight above: a faint street
  grid, each half tinted in its side's patron
  colour (the rival's Sapphire Flame blue above, your Amber Hand gold below,
  at equal weight) and marked with that patron's sigil, meeting at the small
  centre emblem. You are always the Amber Hand; red is kept for damage and
  danger. Empty spots are quiet dashed outlines that light up only when a card
  can go there. Settings has a "Tilted table" switch, off by default, that
  leans the table away by 10 degrees; nothing is cropped and a far-bench card
  stays over 90% as wide as a near one. Which view is the default is one line:
  `DEFAULT_TILTED_TABLE` in `src/storage/settings.ts`.
- **Heroes** run down the middle: the rival's bench, the rival's Active, your
  Active, your bench, the same card sizes on both sides. A hero on the board
  is its art and three things: a health strip across the top (level ring,
  one green segment per HP, Shield as its own pale segments, the number), the
  attack number under it, and worn items as small category-tinted tiles in the
  card's foot, with a "+n" tile when there are more than fit. Statuses hang in
  the gutter at the card's left edge. A knocked-out hero waiting to come back
  keeps its art, greyed, under a "Back in N" or "Next turn" tag. Names, rules
  text and Retreat live in the action view (tap the hero): a short header
  (portrait, name, level, HP), then one row per action with a single number at
  its right: the souls price, the attack's damage, or the one reason it cannot
  be used. The "i" opens the full card.
- **Decks** lie beside the Actives (the rival's at the left, yours at the
  right) as whole card-back stacks, each with its count chip and its discard
  pile next to it. Tap a discard pile to list it.
- **Top strip** is a scoreboard: your side at the left (the Amber crown, your
  three structures, the front one's HP), the turn number in the centre, and
  the rival's souls, hand count and structures at the right beside the
  Sapphire hand. Tap it for both sides' Guardian, Walker and Patron HP, souls,
  hand and deck.
- **The lane** between the two Actives is where the game speaks: whose turn it
  is, what a picked-up card needs as its target, why a tap did nothing.
- **Turn row and hand**: under your bench, the menu button (match log and
  Settings) and the Auto switch sit at the left, your souls and End Turn at
  the right, under the right thumb. Your souls are a button: it opens the
  bank sheet above it. Below that the hand owns the full width: a
  centred fan of card faces, each with its cost on a seal in the top-left
  corner (souls for an item, HP for a hero). Up to five cards all show their
  names; from six the fan overlaps and only the front card does. A card you
  cannot pay for goes grey and prints its price in red.
- **Souls** are Deadlock's soul mark and a mint number everywhere; health is
  the segmented green bar everywhere; item tiles are tinted by category
  (Weapon orange, Vitality green, Spirit purple).

### The turn: Income, Act, End

A banner says whose turn it is as each one begins. Income is automatic: 2 souls
arrive, you draw a card, every cooldown ticks down one, and a fallen hero whose
wait is over goes back to your hand.

**The hand.** It holds heroes and items, up to 10 cards; a draw into a full
hand is skipped, and an empty deck simply draws nothing.

- Tap a hero to put it on the bench (up to 3), for free, or into the lane when
  it is empty.
- Tap an item, then a hero, to put it on that hero for its price: 2 / 4 / 8 /
  16 / 24 souls by tier. Any hero of yours takes it, bench and fallen heroes
  included, until the turn's attack.
- A hero wears 3 items, or 4 once your side has felled the rival's Walker.
  Items stay on through death. Tap an item onto a full hero and a sheet asks
  which of the items it wears to discard: that one goes to your discard pile,
  the new one goes on for its price. Cancel backs out with nothing paid. A
  riding Rem is no item: she takes no slot and is never offered.
- Upgrades evolve: equipment played onto the hero wearing the equipment it is
  built from takes that item's place and costs the difference (Titanic
  Magazine over Extended Magazine costs 2, not 4). The old item goes to the
  discard pile. On any other hero, an upgrade costs its full price. Nothing is
  made or shuffled into your deck when you play a card: an upgrade is a card
  you draw and play like any other.
- A spell (an active item) is played once: pay its price, it resolves on the
  target its text names, and it goes to your discard pile. It is never worn,
  takes no slot, and spends no hero's ability. A spell always costs its price.
- Three items from one tab on one hero give that tab's category spike: +1
  Bullet Power (Weapon), +1 Spirit Power (Spirit) or +1 max HP (Vitality).
- Your deck and your discard pile sit at the ends of your hand with their
  counts (the rival's beside its hand). Tap the discard pile to list it.

**The draw cards.** Deadlock's three Cooldown items are the draw engine:
actives worn on a hero and cast from its sheet (free), then they wait 2 turns.

| Card | Tier | Price | Cast | Cards kept |
|---|---|---|---|---|
| Compress Cooldown | 2 | 4 | draw 2, discard 1 | +1 |
| Superior Cooldown | 3 | 8 | draw 4, discard 2 | +2 |
| Transcendent Cooldown | 4 | 16 | draw 8, discard 4 | +4 |

You choose the discards from anywhere in your hand.

**Act.**

- Each hero, bench included, may use one ability a turn: its skill or its
  ultimate. Neither costs souls: souls buy the cards in your hand and a
  Retreat. Waits count your own turns.
- A skill waits 3 turns after a use (4 for the heavier ones). Three skills are
  charged, as in Deadlock: Serrated Knives, Frost Grenade and Kinetic Pulse
  hold 2 uses, and the wait brings them back one at a time.
  Only the charge items change that: Extra Charge adds a charge, and Rapid
  Recharge adds 2 and brings each back a turn sooner.
- The ultimate is a button on the hero card, from Level 2. Your side uses
  one ultimate a turn. It waits 4, 6 or 8 turns by its size (small, medium,
  large), after each use and from the match's first turn: a large one is
  first ready on your turn 8.
- Big effects leave a turn to answer them. A Charged hero (Seven's Static
  Charge) is Stunned only after its next turn: Dispel Magic or Debuff Reducer
  takes the Charge off first. A channel (Seven's Storm Cloud, 2 turns) ends
  the moment its caster is Stunned: Knockdown. Counterspell is a spell you
  cast on one of your heroes: for 2 turns the next enemy spell, skill or
  ultimate that would hit it does nothing, once.
- Every move is shown in two phases: its activation, then its effect on the
  board. A card from the hand, yours or the rival's, is shown mid-screen for
  about 0.6 s first; a skill lifts and flares its hero's own tile; an ultimate
  drops its name plate. Tap to skip a card's reveal.
- Your Active makes one basic attack a turn: at the rival's Active (any enemy
  hero, with reach). The attack ends the
  Act, and the turn then ends on its own. Extra swings come only from cards
  that grant Extra Attack.
- Retreat: the leaving hero's printed price (0 for the mobile, 1 for most, 2
  for the slow and heavy; Sprint Boots and Swift lower it), once a turn,
  before the attack. A bench hero steps into the Active slot and may make the
  attack.

**Trigger prompts.** Some cards say you *may* use them when something happens
— "When Victor falls, you may use this" — and that moment often comes on the
rival's turn. When it does, and you can use the card (the right level, not
waiting, souls enough), the game pauses and asks: the card, the moment and the
price ("Use Shocking Reanimation for 7 souls?"), Use or Pass. Nothing else
happens until you answer. If you could not use it, nothing is asked. The rival
AI is asked the same way and answers on its own. Used, Victor gets back up
where he fell with half his HP: no knockout, no push, no wait. Passed, he falls
as any hero does.

**End.** Statuses tick. If the rival has no standing hero, your Active pushes
into the empty lane for its bullet power (an empty lane is easy to come by
early, when a side has one hero on the board). Heroes earn exp for the turn: 2
for the Active, 1 for the bench.

**Levels.** Exp also comes the first time a hero wears an item (1) and from a
kill (2). Level 2 takes 5 exp, level 3 7 more and level 4, the cap, 9 more.
Each level adds the hero's own growth: its curve's points (2 a level early, 3
mid, 4 late) split between Bullet Power, HP and Spirit Power — guns into
Attack, casters into Spirit, tanks into HP. All three curves are even at
Level 2.

### The map

- Each side has a track: Guardian (4 HP), Walker (6), Patron (8). A push hits
  the front standing structure, and what is left carries on to the next.
- Every kill of an enemy hero, Active or bench, pushes the victim's level + 1.
  An empty lane pushes the Active's bullet power. From round 9 (both players'
  ninth turns) pushes deal double.
- A fallen Walker gives every hero of the side that felled it a fourth item
  slot. A fallen Patron loses the match. No fall pays souls.
- The Mid-Boss is off for now (`MID_BOSS_ENABLED` in
  `src/engine/constants.ts`, Patrick 2026-11-09): nothing rises in the pit and
  nothing counts down to it. All its code is kept; turned on, it works as
  before: it rises in the pit at the start of round 4 with 10 HP, only basic
  attacks hurt it, and when it falls the side that dealt it more damage takes
  it (a tie goes to the side behind on net worth, then to the last hit): the
  Rejuvenator, 2 revives good through the end of the second round after. It
  rises again 4 rounds after the round it fell in.
- A fallen hero waits in its slot for 2 of its side's turns (`RESPAWN_TURNS`
  in `src/engine/constants.ts`; 0 sends it straight to the hand), then goes
  back to your hand at full HP with its level and items, to be benched again.
- The round cap: after round 12, the side with more structure HP wins, then
  the side with more net worth, then the second mover.

### The rival AI

The rival picks only from the engine's legal moves and plays your rules: its
deck is made from its heroes' builds, it benches the heroes it draws, puts
items on the heroes whose builds list them, evolves upgrades and plays its
spells at the targets it values most.
On a full hero it lets go only the hero's least valuable item, and only for a
card a tier up or more.
It weighs each move by playing it on a copy of the game. Every match plays
Normal for now; the engine keeps three strengths for the sims, and no screen
sets them:

- **Easy:** Normal with seeded noise in its choices.
- **Normal:** the default.
- **Hard:** plays every line out to the turn's attack at each target it could
  aim at, and retreats only when that shows a gain.


## The items

142 item cards, each a current Deadlock shop item under its own name, tab and
tier. An active item is always a spell and a passive item always equipment
([`docs/card-design.md`](./docs/card-design.md) §1), with two exceptions, both
Patrick's calls: Counterspell, a passive in Deadlock, is a spell here, and the
Cooldown family, passives in Deadlock, are the deck's draw cards here, so they
are actives ([`docs/deck-plan.md`](./docs/deck-plan.md)); what becomes of them
is open ([`docs/card-design.md`](./docs/card-design.md), "Open: the Cooldown
family"). One card prints a price of its own: Rusted Barrel, 1 soul. Cells read
passives · actives; the column heads give the tier's price.

| Tab | T1 · 2 | T2 · 4 | T3 · 8 | T4 · 16 | T5 · 24 | All |
|---|---|---|---|---|---|---|
| Weapon | 4 · 0 | 11 · 2 | 13 · 4 | 8 · 1 | 2 · 0 | 45 |
| Vitality | 3 · 2 | 11 · 3 | 4 · 8 | 10 · 6 | 0 · 1 | 48 |
| Spirit | 5 · 2 | 8 · 4 | 7 · 5 | 6 · 9 | 1 · 2 | 49 |
| All | 16 | 40 | 40 | 40 | 6 | 142 |

The prices follow Deadlock's 1 : 2 : 4 : 8 ladder (800 to 6,400 souls there),
with 24 for tier 5 (9,999 there). An item became a card only if it passed
three tests:

1. **Expressible:** its real verb is a board effect the existing ability
   families can carry.
2. **Distinct:** no two cards in one tab and tier share an effect and a number.
3. **Meaningful in 5–10 own turns:** movement, stamina, ammo or regen counts
   only through a board verb (a cheaper Retreat, stepping in, the bench); at
   tier 5 the verb must carry its 24 souls in about two turns worn.

The cards added or fixed on 2026-11-05 took their numbers by reasoning from an
item budget, with no sim run. That audit, with the budget's rates, each card's
budget line and the items folded or skipped, is
[`docs/card-design.md`](./docs/card-design.md) §3; §4 lists each hero's
signature items and default build. [`docs/balance-model.md`](./docs/balance-model.md)
says where the sim gates stand.

## Under the hood

- **One rulebook.** Every rule lives in one engine function that the moves, the
  board, the AI and the attack preview all ask; the preview is the real attack
  run on a copy. See [`docs/engine-model.md`](./docs/engine-model.md).
- **Board FX.** Every resolved effect is animated on the cards, from muzzle
  flashes and tracers to a card that breaks into shards on a kill. A calm mode
  (reduced motion) keeps the beats and the numbers. See
  [`docs/fx-model.md`](./docs/fx-model.md).
- **The game's own art.** Item cards wear their shop icons, heroes their
  portraits, statuses their HUD icons, and the map the wiki's own pictures of
  the structures, the Mid-Boss and the Rejuvenator. `public/art/CREDITS.md`
  says where each piece came from; SVG fallback glyphs cover a card that has
  none.
- **Trigger prompts.** Optional "may" effects are declared on the card and
  asked by one system (`src/engine/prompts.ts`), which pauses the game in a
  boardgame.io respond stage until the seat asked answers; built so chains and
  an auto/on/off setting can come later (docs/engine-model.md, "Trigger
  prompts").
- **About 1,450 tests** (vitest), including a seeded fuzz suite that plays
  hundreds of games (the real AI, random legal play and malformed moves) and
  checks the state after every move.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173 (binds 0.0.0.0, so a phone on the LAN can play)
npm run build      # type-check and production bundle into dist/
npm run test       # vitest
npx tsc --noEmit   # type-check
```

## Balance and QA scripts

Per [CLAUDE.md](./CLAUDE.md), the balance sim, restricted play and the browser
QA scripts run only when that testing is asked for by name; `tsc`, the build
and vitest always run.

- `npx vite-node scripts/balance-sim.ts [games=2500]`: seat-mirrored AI-vs-AI
  games under Normal and Hard, judged against the gates (seat 50 ± 3, every
  hero 45–55, 8–10 own turns, no item in over 40% of builds, the Mid-Boss
  contested). Writes `sim-reports/latest.md` and `.json` (gitignored).
- `npx vite-node scripts/eval/restricted.ts <itemId…>`: an item's value by
  restricted play.
- `npx vite-node scripts/eval/budget.ts`: every item priced at the budget's
  rates, beside its price (see Known follow-ups).
- `npx vite-node scripts/replay-trace.ts record | compare`: proves an engine
  change altered only what it meant to.
- `scripts/qa/*.mjs` drive headless Chrome, for example
  `node scripts/qa/match.mjs OUT_DIR [PORT] [desktop|mobile]` (each script's
  header gives its arguments). All but `perf.mjs` run against the dev server
  (`DEV_URL` when it is not on `http://localhost:5173`), on the app's virtual
  clock (`?vtclock=1`) where animations matter: `match.mjs` lets the AI play
  both seats to the result, `tutorial.mjs` walks the lessons, `legality.mjs`
  stages rare boards and checks each refusal, `story.mjs` plays the campaign
  map, and `fx-match.mjs` and `fx-gallery.mjs` film the effects. `perf.mjs`
  serves a production build itself and profiles it on a throttled phone.
  `match.mjs`, `tutorial.mjs` and `legality.mjs` fail on any console error or
  React warning.

## Re-fetching card art

```bash
python3 scripts/fetch_item_art.py              # every item card
python3 scripts/fetch_item_art.py curse        # one card
```

The script reads the card files, so a new card gets its icon by its canon
name. See [`public/ART_PIPELINE.md`](./public/ART_PIPELINE.md) for the full
workflow, the WebP encoder and the gotchas.

## Architecture

```
src/
├── engine/      boardgame.io game state and every rule: the turn, the deck and the hand, the map, combat
├── cards/       heroes, items (spells.ts, equipment.ts), ultimates, default builds, deck rules (decks.ts), hero art
├── abilities/   every effect as an AbilityDef (skills, passives, ultimates, items)
├── ai/          the heuristic AI and its difficulty dial
├── story/       the campaign: the route, its stops and their fights
├── tutorial/    the lessons the coach walks
├── storage/     what persists between matches (the deck, builds, the AI dial, match config)
├── art/         asset URL bases and the credits table the Gallery renders
├── qa/          the virtual clock the QA films run on (?vtclock=1)
├── ui/          React components: the board and its map strip, the hand and the card piles
│                (board/CardPiles.tsx), the discard, upgrade, opening and trigger-prompt
│                sheets (overlays/),
│                the deck builder and build editor (collection/), item tiles and tooltips
│                (shop/), the draft and hero sheets, the story map, …
│   └── effects/fx/  the board-FX player (timeline scheduler, animation families,
│                    and stage/ — the canvas particle world with height)
└── statuses/    Status taxonomy + display metadata
public/
├── heroes/      Hero portraits .webp (card, mini and small, plus a wide splash)
├── items/       Passive items' shop icons .webp
├── spells/      Active items' shop icons .webp
├── ult/         Each hero's Deadlock ultimate icon .webp (the button on its card)
├── status/      The game's HUD icons for statuses, painted in code
└── art/         Title posters, the backdrop, the wordmark, the map's icons; CREDITS.md
scripts/
├── qa/          Headless-Chrome films and checks against the dev server (above)
├── eval/        AI-vs-AI harness, restricted play, the budget script, win-rate reports
│                (docs/testing-model.md)
├── art/, geo/   Bakes (backdrop, paper mottle, the story map's geometry), the map-icon
│                fetch and the hero crop sources
├── fetch_item_art.py, crop_heroes.py    The art pipeline (public/ART_PIPELINE.md)
└── balance-sim.ts, replay-trace.ts      The balance sim; the engine-change replay trace
docs/            Design and model notes: cards, engine, stats, balance, ultimates, FX, testing, sharing,
                 playability (the redesign) and the mechanics survey that tests it
```

## Known follow-ups

- **The deck game's scripts.** `scripts/balance-sim.ts`, `scripts/replay-trace.ts`,
  `scripts/eval/*` and `scripts/qa/legality.mjs` still drive the shop's moves
  (buy, closeShop, the market). They are outside `tsc`'s include and are not
  run during design work; port them to the hand's moves before the next
  testing round.
- **Early empty lanes.** A side opens with one hero on the board, and a hero
  that falls is out for two turns and then back in the hand. Until more heroes
  are drawn, one kill can empty a lane, and the End's push into an empty lane
  then lands every turn; AI-vs-AI games ended in rounds 3–9. The numbers are
  the hero rules' to set (docs/hero-design.md).

- **Trigger prompts, first version.** One answer per moment: no chains (the
  rival cannot answer back) and no auto/on/off setting yet; how to add both is
  in docs/engine-model.md. A hero felled in the End step (Torment Pulse, the
  Mid-Boss's blow) is asked as the next turn opens, after its start (income,
  draw), because boardgame.io cannot hold a turn open in its end hook.
- **The scripts and the respond moves.** `scripts/balance-sim.ts`,
  `scripts/replay-trace.ts`, `scripts/eval/*` and `scripts/qa/*` know nothing of
  `useTrigger` / `passTrigger`; port them with the hand's moves.
- **Free kits are reasoned, not played.** Skills and ultimates cost no souls
  since 2026-11-15; their waits, the three charged skills and the charged
  ultimates' 10 and 8 damage are set by reasoning
  (docs/balance-model.md §8). Play will show match length.
- **One-play spells, counters and the ready decks are reasoned, not played**
  (2026-11-15; docs/card-design.md, "Changed 2026-11-15"). No sim or play
  test has run on them. Ten spells sit under half their price as one play and
  wait on a decision, and so do the three draw cards.
- **Machinery no card uses.** Since the hero rebuild no hero opens a channel
  (`casting` / `casting_light`, `tickCastingPulses`) or puts on Charged, the
  FX layer's Naptime wake-up tag has no burst to play, and since Rem stands in
  the lane (2026-11-09) no hero is bench-only (`flags.benchOnly`). Each still
  works and is still tested with its state set by hand; remove it, or give it
  to a card, in a cleanup pass. (The old merge machinery — `remMergeTurnsLeft`,
  `tickRemMerges`, `returnRemToBench` — is Rem's Tag Along ride again.)
- **`scripts/qa/legality.mjs`** still checks Sinclair's borrowed ultimate, which
  is gone (Audience Participation casts the copy at once). Not run during
  design work; fix it with the scripts' port to the hand.
- **The fuzz oracle.** `tests/engine/fuzz/invariants.spec.ts` allow-lists one
  violation as KNOWN (`revive-spend@endTurn`, seed 40155): an End step that
  ends the match revives a hero and then lets the Rejuvenator lapse, both
  legal, and the oracle counts the lapse as a second credit spent. The oracle
  needs a real fix (a test-logic change) in the testing round.
- **The budget script.** `scripts/eval/budget.ts` has no entry for the 47 cards
  the full shop added (41 at tiers 1–4, six at tier 5), so it stops with
  "BUDGET is out of step with ITEMS" until they are added. Its tier-5 pace (a
  first purchase on own turn 7) is an estimate. Add both when it next runs.
- **The WebP encoder.** The Mac that fetched the 47 new item icons had no WebP
  encoder, so they were encoded through a headless-Chrome stand-in for ffmpeg
  kept outside the repository. Install one (`brew install webp`) before the
  next fetch; see `public/ART_PIPELINE.md`.

## Disclaimer

Deadlock and all related assets © Valve Corporation. This is a non-commercial
fan project. Source code under MIT; art is property of Valve. See
[LICENSE](./LICENSE) for details.
