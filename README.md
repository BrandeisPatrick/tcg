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

- Built on the Loadout screen, which looks like Deadlock's shop: Weapon,
  Vitality and Spirit tabs, rows by tier, the item icons. Tap an item to add a
  copy; tap one in the deck to take a copy out.
- A deck is 16 items, any tier, at most 4 copies of one.
- A deck holds base items only. An upgrade (Improved Spirit, Superior and
  Transcendent Cooldown, Fortitude…) never starts in a deck: it comes only
  from playing the item it is built from. The deck builder shows upgrades
  greyed, with "Comes from playing Extra Spirit" on the tile.
- No saved deck (or one short of 16)? You are dealt one made from your drafted
  heroes' builds: every hero's first build item, then every hero's second, and
  so on until 16, each upgrade a build names counted as its base item (Improved
  Spirit brings Extra Spirit). The rival's deck is always made this way.

### The draft

- 21 heroes from Deadlock's roster, each built from its Deadlock role
  ([`docs/hero-design.md`](./docs/hero-design.md)): HP 4 + its tank score and
  Attack 1 (2 for a gun or melee hero), moved a point by its curve (early,
  mid, late); a Retreat price of 0–2 souls; either a skill (fifteen heroes)
  or a passive (six: Abrams, Haze, Vindicta, Drifter, Mirage, Victor); and an
  ultimate, a button printed on the card with the hero's own Deadlock
  ultimate icon. No hero has a Weakness.
- Two ultimates are **charged**: Victor's Shocking Reanimation (20 souls) and
  Silver's Lycan Curse (16) cost 1 less for each damage he takes or she deals,
  down to free, and the count starts over when one is used. The button shows
  the price coming down ("20 → 7 souls"). Victor's Aura of Suffering hurts
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

- Souls accumulate. Nothing refills, and nothing is lost at the end of a turn.
- Each of your turns opens with 5 souls of income. That is the only way to get
  souls: kills and the Guardian push the map and give exp, and pay none, so
  the side ahead cannot snowball. (One item, Golden Goose Egg,
  still pays 2.)

### The turn: Income, Act, End

A banner says whose turn it is as each one begins. Income is automatic: 5 souls
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
- Upgrades evolve: an item played onto the hero wearing the item it is built
  from takes that item's place and costs the difference (Superior Cooldown over
  Compress Cooldown costs 4, not 8). The old item goes to the discard pile. On
  any other hero, an upgrade costs its full price.
- Playing an item that Deadlock builds into a bigger one makes that upgrade and
  shuffles it into your deck. Where there are several (Extra Health → Fortitude
  or Colossus), you pick. Each copy played makes one.
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

- Each hero, bench included, may use one ability a turn: its skill, an active
  item it wears, or its ultimate. Skills and ultimates are paid in souls, out
  of the same 5 a turn that buy items; cooldowns count your own turns.
- A skill costs 1–3 souls (printed on its plate) and is ready again on your
  next turn. The ultimate is a button on the hero card: from Level 2 it costs
  4, 8 or 12 souls by its size (small, medium, large), then waits 3 turns.
- An active item is used from its hero's sheet. It cools down 2 turns (tiers
  1–2) or 3 (tier 3 and up), and starts on cooldown when it is played. Hard
  crowd control (stun, silence, root, …) has 2 charges a match instead.
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
items on the heroes whose builds list them, evolves upgrades, casts its draw
cards (discarding what it wants least) and picks the upgrade its builds name.
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

140 item cards, each a current Deadlock shop item under its own name, tab and
tier. An active item is always a spell and a passive item always equipment
([`docs/card-design.md`](./docs/card-design.md) §1), with one exception: the
Cooldown family, passives in Deadlock, are the deck's draw cards here, so they
are actives ([`docs/deck-plan.md`](./docs/deck-plan.md)). Cells read passives ·
actives; the column heads give the price.

| Tab | T1 · 2 | T2 · 4 | T3 · 8 | T4 · 16 | T5 · 24 | All |
|---|---|---|---|---|---|---|
| Weapon | 4 · 0 | 12 · 2 | 13 · 4 | 8 · 1 | 2 · 0 | 46 |
| Vitality | 3 · 2 | 11 · 3 | 4 · 7 | 10 · 6 | 0 · 1 | 47 |
| Spirit | 4 · 2 | 8 · 4 | 6 · 5 | 6 · 9 | 1 · 2 | 47 |
| All | 15 | 40 | 39 | 40 | 6 | 140 |

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
- **The Cube every turn.** The Cube costs 3 souls and, like every skill, is
  ready again on Viscous's next turn, so for 3 of the 5 souls a turn one hero
  can take no damage on any rival turn. The hero doc prices it that way; play
  will show whether it needs a longer wait (docs/hero-design.md, As built).
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
