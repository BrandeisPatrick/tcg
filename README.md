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
- **Active hero KO flow:** corpse stays in slot greyed-out with a rotating
  brass clock ring + countdown; on death the player is prompted to choose a
  bench hero to step up.
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
