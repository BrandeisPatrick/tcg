# Deadlock TCG

A fan-made, turn-based card game set in **Valve's Deadlock**: draft four
heroes, earn souls, buy Deadlock's items, fight in one lane and push down the
rival's Patron. One player against an AI, as a single-page React app.

**Live demo:** https://brandeispatrick.github.io/tcg/ (GitHub Pages, deployed
from `main` on every push by `.github/workflows/deploy.yml`)

> **Fan project.** Not affiliated with Valve. See [LICENSE](./LICENSE) for the
> art-attribution disclaimer.

---

## How a match plays

The title screen offers Quick Match, the Tutorial (five lessons), Story (a
roguelike run over a map of New York), Loadout (your builds) and the Gallery.
A Quick Match goes like this.

### The draft

- 19 heroes from Deadlock's roster. Each has an ultimate, and either a skill
  (eleven heroes) or a passive (eight).
- A snake draft, four heroes each: one Active in the lane, three on the bench.
- The pie rule: you draft first, and the rival moves first. Its first turn has
  no attack.

### Souls

- Souls accumulate. Nothing refills, and nothing is lost at the end of a turn.
- Each of your turns opens with 4 souls of income.
- The comeback: if your net worth (souls, plus the list price of every item
  your heroes wear and every card in your hand) trails the rival's by 8 or
  more, income pays 1 more; by 16 or more, 2 more.
- A kill pays the killer's side the victim's level + 1, and 2 more if it was
  the richest hero on the board. A felled Guardian pays 2, the Mid-Boss 4.

### The turn: Income, Shop, Act, End

The dial under the turn number lights each step. Income is automatic: souls
arrive, and every cooldown and respawn timer ticks down one.

**Shop.** The turn opens on the shop sheet: Weapon, Vitality and Spirit tabs,
tier rows priced 2 / 4 / 8 / 16 / 24 souls.

- Buying puts the card in your hand. No hero is chosen at the shop.
- Play a card from the hand onto any of your heroes, bench and fallen heroes
  included. Playing is free, and works in the shop and in the act until the
  turn's attack.
- A hero wears 3 items, or 4 once your side has felled the rival's Walker.
  Items stay on through death.
- Upgrades: buy an item while its component is on your side (worn, or in the
  hand) and you pay the difference. Playing it consumes the component.
- Sell from the hand or off a hero: all you paid on the turn you bought it,
  half its price (rounded down) after.
- Move a worn item to another of your heroes. Its cooldown or charges move with
  it.
- Three items from one tab on one hero give that tab's category spike: +1
  Bullet Power (Weapon), +1 Spirit Power (Spirit) or +1 max HP (Vitality).
- The market is fixed for the match: every tier-1 item; a slice drawn from the
  match seed before the draft (per tab, two each of tiers 2 and 3 and one each
  of tiers 4 and 5); and, as each hero is drafted on either side, its two
  signature items and every item of its build.
- The sheet shows your heroes' builds with the next affordable item lit. A
  build is six items per hero, in order, set on the Loadout screen.

Buying, selling and moving are shop-only. Close the shop to move on to the Act.

**Act.**

- Each hero, bench included, may use one ability a turn: its skill, an active
  item it wears, or its ultimate. Abilities cost nothing and run on cooldowns
  counted in your own turns.
- A skill is ready every turn unless its hero says otherwise. The ultimate is
  part of the kit: it unlocks at Level 2, then cools down 3 turns after each
  use.
- An active item is used from its hero's sheet. It cools down 2 turns (tiers
  1–2) or 3 (tier 3 and up), and starts on cooldown when it is played. Hard
  crowd control (stun, silence, root, …) has 2 charges a match instead.
- Your Active makes one basic attack a turn: at the rival's Active (any enemy
  hero, with reach), or at the Mid-Boss while it stands. The attack ends the
  Act, and the turn then ends on its own. Extra swings come only from cards
  that grant Extra Attack and from Haze's passive at Level 3.
- Retreat: 1 soul, once a turn, before the attack. A bench hero steps into the
  Active slot and may make the attack.

**End.** Statuses tick. If the rival has no standing hero, your Active pushes
into the empty lane for its bullet power. The Mid-Boss hits the hero that
attacked it for 2. Heroes earn exp for the turn: 2 for the Active, 1 for the
bench.

**Levels.** Exp also comes the first time a hero wears an item (1) and from a
kill (2). Level 2 takes 5 exp, level 3 7 more and level 4, the cap, 9 more.
Each level gives +1 HP, +1 Bullet Power and +1 Spirit Power.

### The map

- Each side has a track: Guardian (4 HP), Walker (6), Patron (8). A push hits
  the front standing structure, and what is left carries on to the next.
- Every kill of an enemy hero, Active or bench, pushes the victim's level + 1.
  An empty lane pushes the Active's bullet power. From round 9 (both players'
  ninth turns) pushes deal double.
- A fallen Guardian pays 2 souls. A fallen Walker gives every hero of the side
  that felled it a fourth item slot. A fallen Patron loses the match.
- The Mid-Boss rises in the pit at the start of round 4. It has 10 HP, and only
  basic attacks hurt it. When it falls, the side that dealt it more damage
  takes it (a tie goes to the side behind on net worth, then to the last hit):
  4 souls and the Rejuvenator. It rises again 4 rounds after the round it fell
  in.
- The Rejuvenator holds 2 revives, good through the end of the second round
  after the one it was taken in. A credited hero that falls still pays and
  pushes, then revives in place at full HP.
- Respawn: a fallen hero waits 1 of its side's turns in rounds 1–4, 2 in rounds
  5–8 and 3 from round 9, plus 1 if it was the richest hero on the board. It
  comes back with its items and level.
- The round cap: after round 12, the side with more structure HP wins, then
  the side with more net worth, then the second mover.

### The rival AI

The rival picks only from the engine's legal moves. It shops its build by rule
and weighs everything else by playing it on a copy of the game. Every match
plays Normal for now; the engine keeps three strengths for the sims, and no
screen sets them:

- **Easy:** Normal with seeded noise in its choices; it buys the first
  affordable build item and never saves.
- **Normal:** the default. It saves when its Active's next build item is a turn
  or two of income away.
- **Hard:** plays every line out to the turn's attack at each target it could
  aim at, and retreats only when that shows a gain.


## The items

140 item cards, each a current Deadlock shop item under its own name, tab and
tier. An active item is always a spell and a passive item always equipment
([`docs/card-design.md`](./docs/card-design.md) §1). Cells read passives ·
actives; the column heads give the price.

| Tab | T1 · 2 | T2 · 4 | T3 · 8 | T4 · 16 | T5 · 24 | All |
|---|---|---|---|---|---|---|
| Weapon | 4 · 0 | 12 · 2 | 13 · 4 | 8 · 1 | 2 · 0 | 46 |
| Vitality | 3 · 2 | 11 · 3 | 4 · 7 | 10 · 6 | 0 · 1 | 47 |
| Spirit | 4 · 2 | 9 · 3 | 7 · 4 | 7 · 8 | 1 · 2 | 47 |
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
- **About 1,400 tests** (vitest), including a seeded fuzz suite that plays
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
├── engine/      boardgame.io game state and every rule: the turn, the shop, the map, combat
├── cards/       heroes, items (spells.ts, equipment.ts), ultimates, default builds, hero art
├── abilities/   every effect as an AbilityDef (skills, passives, ultimates, items)
├── ai/          the heuristic AI and its difficulty dial
├── story/       the campaign: the route, its stops and their fights
├── tutorial/    the lessons the coach walks
├── storage/     what persists between matches (builds, the AI dial, match config)
├── art/         asset URL bases and the credits table the Gallery renders
├── qa/          the virtual clock the QA films run on (?vtclock=1)
├── ui/          React components: the board and its map strip, the shop sheet (shop/),
│                the build editor (collection/), the draft and hero sheets, the story map, …
│   └── effects/fx/  the board-FX player (timeline scheduler, animation families,
│                    and stage/ — the canvas particle world with height)
└── statuses/    Status taxonomy + display metadata
public/
├── heroes/      Hero portraits .webp (card, mini and small, plus a wide splash)
├── items/       Passive items' shop icons .webp
├── spells/      Active items' shop icons .webp
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
