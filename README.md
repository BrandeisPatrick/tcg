# Deadlock TCG

A fan-made trading-card game that mashes up **Valve's Deadlock** (MOBA setting,
heroes, items) with **Pokémon TCG-style** turn-based card battling. Built as a
single-page React app.

**Live demo:** https://brandeispatrick.github.io/tcg/

> **Fan project.** Not affiliated with Valve. See [LICENSE](./LICENSE) for the
> art-attribution disclaimer.

---

## What's in the box

- **15 heroes** drawn from Deadlock's roster (Abrams, Haze, Vindicta, Lash,
  Paige, Dynamo, Kelvin, Seven, Sinclair, …) each with ATK / HP / skill / passive / ultimate.
- **15 spells** (active items) and **26 equipment** (passive items) mapped 1:1
  to canon Deadlock items, verified against the `is_active_item` field of the
  [deadlock-api.com](https://deadlock-api.com/) catalogue.
- **Refill soul economy** (Hearthstone-style): your pool refills 1→7 over the
  first seven turns. No hoarding across turns. KO bounty (+1 capped at 7).
- **Turn phases:** a turn runs Prepare → Battle → Prepare → End Turn. One
  button walks it — Enter Battle (the two Actives trade blows), then End Turn —
  so cards, a skill or a retreat can go before the battle or after it. The
  dial between the Actives prints the phase. Turn 1 has no battle.
- **Active hero KO flow:** corpse stays in slot greyed-out with a rotating
  brass clock ring + countdown; on death the player is prompted to choose a
  bench hero to step up.
- **Board FX:** every resolved effect is animated on the cards, with depth —
  the table is seen from above and effects have height. A caster's card lifts
  and gathers power, its bolt arcs over the board with a shadow under it;
  gunfire throws muzzle flashes, tracers and brass casings that bounce on the
  table; struck cards rock in 3D, sparks and chads of the print fly up and
  fall back; a pure hit tears the card in two; a kill breaks the card itself
  into shards. Plus a unique lead-in per signature effect (Djinn's Mark
  detonating, Mystic Reverb echoing, Naptime waking, Killing Blow slashing,
  Ricochet, Tesla, channelled ultimates) and stickers slammed on for
  statuses, shields, immunity, revives and level-ups. Every hit prints its
  amount in stencil digits; a calm mode (reduced motion) keeps the beats and
  the numbers but nothing flies. See
  [`docs/fx-model.md`](./docs/fx-model.md).
- **One-skill-per-turn** rule (Improved Cooldown equipment bypasses).
- **41 bitmap card-art assets** pulled from the community asset bucket; SVG
  fallback glyphs for cards that don't have canon art yet.
- **AI opponent** with a heuristic move enumerator (lethal short-circuit,
  on-attach equipment, forced promotion when active dies).
- **79 engine tests** covering souls, statuses, abilities, respawn rules,
  combat planner/resolver parity.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle into dist/
npm run test       # vitest
npx tsc --noEmit   # type-check
```

## Re-fetching card art

```bash
python3 scripts/fetch_item_art.py              # all 41 cards
python3 scripts/fetch_item_art.py curse        # one card
```

Edit the `EQ_MAP` / `SP_MAP` dicts in `scripts/fetch_item_art.py` to add new
cards. See [`public/ART_PIPELINE.md`](./public/ART_PIPELINE.md) for the full
workflow + gotchas (canon item renames, active/passive validation, etc.).

## Filming the animations

`scripts/qa/` drives headless Chrome over CDP against the dev server with the
app's virtual clock (`?vtclock=1`) so any frame of an animation can be
captured: `fx-gallery.mjs` fires every effect on the Gallery's showroom
(`?preview=1&tab=combat`) — basic attacks included, walked by the real combat
choreographer — and `fx-match.mjs` plays a real match (draft, a skill, the
rival's turn, combat); both write contact sheets to look at. Any showroom
button can be named as a "demo", so listing `Calm motion: off` first films
the demos after it under reduced motion, and `OFFSETS=80,160,240,…` samples
an effect more finely. `tutorial.mjs` walks the tutorial lessons end to end
with real clicks on whatever the coach has lit, and fails unless each one is
won. `match.mjs` drafts a match, switches Auto on and lets the AI play both
seats to the result sheet, reporting every state the turn flow reached and
failing if the match ever sits still. Set `DEV_URL` when the dev server is
not on `http://localhost:5173`.

## Architecture

```
src/
├── engine/      boardgame.io game state, damage, combat, statuses, respawn
├── cards/       hero / spell / equipment / ultimate data + portrait SVGs
├── abilities/   60+ effect handlers (onPlay, startOfTurn, activate, etc.)
├── decks/       Starter Aggro + Control 20-card lists
├── ai/          Heuristic move enumerator + scorer
├── ui/          React components (Board, HeroSlot, CardFrame, side panel,
│                hero detail sheet, mulligan, promotion overlay, …)
│   └── effects/fx/  the board-FX player (timeline scheduler, animation families,
│                    and stage/ — the canvas particle world with height)
└── statuses/    Status taxonomy + display metadata
public/
├── heroes/      Hero portrait .webp (3 sizes each)
├── items/       Equipment shop-tile .webp
└── spells/      Active-item shop-tile .webp
```

## Disclaimer

Deadlock and all related assets © Valve Corporation. This is a non-commercial
fan project. Source code under MIT; art is property of Valve. See
[LICENSE](./LICENSE) for details.
