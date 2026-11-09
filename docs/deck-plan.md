# Deck and Draw — requirements

Status, 2026-11-09: **Patrick said build it** ("could you build it and let me test play it?").
Branch `deck-and-heroes`, stacked on `draft-page-trim` (PR #2). Visual version:
[Deck and Draw Plan](https://claude.ai/artifact/WDLNDpGunGhw5rSLz8Wopp). Hero rules live in
[hero-design.md](hero-design.md).

Patrick, 2026-11-08: "the shopping phase is a bad design... going back to the old one, we still have
the deck. Deck is still very important." The core rules copy the Pokémon TCG Pocket.

## Base

Start from today's game, not the old deck version. Today's game already has item spells on a
cooldown, souls that pile up, the 140 item cards and their art, the shop screen and the map. Bring
the deck, the draw and the hand back from the old version (commit `6e803f4`, before the shop
redesign merged in PR #1; see `git log 6e803f4..40a838b`). The result plays as Patrick described,
with less to rebuild.

## Before the match

- You build your deck on a screen that looks like today's shop: Weapon, Vitality and Spirit tabs, rows by tier, and the item icons. Tap an item to add a copy.
- A deck has 16 items, with at most 4 copies of any one item. Any tier can go in.
- A player with no saved deck gets one built from their drafted heroes' builds (the per-hero builds the game has today).
- You draft 4 heroes as now. They are shuffled into your deck, with an animation, so the deck has 20 cards.

## Start of the match

- You draw 5 cards, and at least one of them is always a hero (the Pocket rule).
  - If the 5 hold no hero, swap a random non-hero in the hand for a random hero from the deck.
- You put one hero from your hand in the lane as your Active. That is your only hero on the board for now. The others come as you draw them.

## Each turn

- Draw 1 card and gain 5 souls. Souls pile up from turn to turn.
  - Souls come only from these 5 a turn.
  - Knockouts and objectives still push the map and give exp, but pay no souls, so the side ahead can't snowball.
- Put heroes from your hand on the bench (up to 3). It's free.
- Put an item from your hand on a hero by paying its price: 2, 4, 8, 16 or 24 souls by tier, as today.
- Retreat, skills, ultimates and the attack work as today until the hero rules land. After that, skills and ultimates cost souls (see [hero-design.md](hero-design.md)).
- Your hand holds up to 10 cards. When it is full, further draws are skipped.
- The shop phase is gone: no buying, no selling, no market.
- When your deck is empty you stop drawing. Nothing else happens.

## The draw cards

Deadlock's three cooldown items become the draw engine. A hero wears one, casts it like any item
spell, and then it waits 2 turns. Casting is free; you pay only to put the item on.

| Card | Tier | Price | Spell | Net cards |
|---|---|---|---|---|
| Compress Cooldown (`improved_cooldown`) | 2 | 4 souls | Draw 2, discard 1 | +1 |
| Superior Cooldown | 3 | 8 souls | Draw 4, discard 2 | +2 |
| Transcendent Cooldown | 4 | 16 souls | Draw 8, discard 4 | +4 |

- You can discard any cards in your hand, not only the new ones.
- Each step doubles both the price and the cards you keep, so a soul buys the same at every tier.

## Upgrades

- When you play an item that Deadlock upgrades into a bigger one (cards carry `upgradesFrom`), the bigger card is made and shuffled into your deck. You see it appear and fly into the deck.
  - Examples: Compress Cooldown → Superior Cooldown → Transcendent Cooldown; Extended Magazine → Titanic Magazine; Extra Health → Fortitude or Colossus.
  - 46 such links exist between cards we have.
- Where Deadlock has more than one upgrade, you pick which one is made.
- Each copy you play makes one upgrade.
- **Upgrades evolve:** play an upgrade on the hero who wears its lower item and it replaces that item, like evolving a Pokémon.
  - You pay only the difference, as in Deadlock: Superior Cooldown over Compress Cooldown costs 4, not 8.
  - On any other hero, the upgrade costs its normal price.

## A fallen hero

A fallen hero goes to your hand after 2 of your turns and keeps its level (Patrick, 2026-11-09).
- The wait is one constant (`RESPAWN_TURNS = 2`), so it can change after play. 0 means straight to hand.
- It replaces today's respawn-by-round for heroes. Bosses keep their own respawn.

## Rival AI

- Its deck is made from its heroes' builds in today's game.
- It plays the same rules: it benches heroes from its hand, puts items on heroes, casts draw cards and evolves upgrades.

## Animations (a Fable agent builds these)

- At the start, the drafted heroes are shuffled into the deck.
- An upgrade card appears and flies into the deck.
- Cards fly from the deck to the hand, and from the hand to the discard pile.
- The deck and the discard pile sit on the board with their counts.

## Kept from today

The map (Guardian → Walker → Patron), rounds, exp and levels, the 140 items and their effects, item
spells on cooldowns, the draft, story mode and the tutorial. Story and tutorial must keep working;
where a lesson teaches the shop, change it to teach the deck.
