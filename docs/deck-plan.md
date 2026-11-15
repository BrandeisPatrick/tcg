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
- A deck holds base items only (Patrick, 2026-11-09: "this card is a upgrade, should not appear in the starting deck"). An upgrade, an item whose card has `upgradesFrom`, reaches a deck only when its component is played (see Upgrades).
- A player with no saved deck gets one built from their drafted heroes' builds (the per-hero builds the game has today), each upgrade a build names counted as its base item.
- You draft 4 heroes as now. They are shuffled into your deck, with an animation, so the deck has 20 cards.

## Ready decks (2026-11-15)

Patrick, 2026-11-15: "we need to have decks ready." Five decks head the Loadout, each a squad of
four heroes and its 16 items (`src/cards/readyDecks.ts`). "Use deck" saves the squad and the deck
together. When that would replace picks or a deck of the player's own, the button asks once more.

The recipe, the same for all five. No sim ran.

- **Base items only, at most 2 copies of one.** Pocket's rule, inside this game's cap of 4, so a
  ready deck holds at least 8 different items.
- **8 tier-1, 6 tier-2, 2 tier-3: 56 souls.** The lane pays 2 a turn
  ([balance-model.md](balance-model.md) §7): by own turn 9 a side has earned about 30 souls and
  drawn about 11 items. At 3.5 souls an item, those 11 cost about 38, so most of what is drawn can
  be played and a skill or two paid for. A deck dealt from builds costs 50 to 76.
- **No tier-4 base item.** The dear tiers arrive as upgrades: playing a base item shuffles what it
  builds into the deck, and the upgrade evolves for the difference.
- **Two Compress Cooldown in every deck.** The draw card (draw 2, discard 1), as every Pocket deck
  carries its two Professor's Research.
- **The rest from the squad's own builds**, read as base items, so each hero finds its items.
- **A squad has a front, a carry and a helper.** No hero is in two decks; Shiv is in none.

| Deck | Squad | Tier 1 (two of each) | Tier 2 | Tier 3 |
|---|---|---|---|---|
| Gunline | Warden, Vindicta, Haze, Paige | Extended Magazine, Headshot Booster, Restorative Shot, Grit | 2 Compress Cooldown, 2 Active Reload, Long Range, Opening Rounds | Burst Fire, Toxic Bullets |
| Spirit Storm | Lady Geist, Seven, Lash, Kelvin | Extra Spirit, Mystic Burst, Mystic Regeneration, Spirit Strike | 2 Compress Cooldown, 2 Cold Front, Mystic Vulnerability, Spirit Lifesteal | Knockdown, Torment Pulse |
| Bulwark | Abrams, Viscous, Victor, Rem | Extra Health, Extra Regen, Grit, Healing Rite | 2 Compress Cooldown, 2 Bullet Lifesteal, Healing Booster, Battle Vest | Bullet Resilience, Torment Pulse |
| Ambush | Silver, Yamato, Mirage, Drifter | Sprint Boots, Extended Magazine, Restorative Shot, Headshot Booster | 2 Compress Cooldown, 2 Kinetic Dash, Fleetfoot, Swift Striker | Tesla Bullets, Berserker |
| Lockdown | Mo & Krill, Sinclair, Dynamo, Wraith | Rusted Barrel, Spirit Strike, Extra Spirit (two of each), Healing Rite, Extra Health | 2 Compress Cooldown, 2 Slowing Hex, Mystic Shot, Spirit Lifesteal | Knockdown, Silence Wave |

How each wins:

- **Gunline** out-guns the lane: Warden holds it, Vindicta and Haze shoot, Paige shields.
- **Spirit Storm** casts skills that hit every enemy, with items that trigger on a skill's hit.
  Cold Front gives spirit damage that costs no souls to use.
- **Bulwark** outlasts: heals, shields and lifesteal, with Victor's aura and Torment Pulse for
  damage.
- **Ambush** swaps: cheap Retreats, Kinetic Dash for the hero that steps in, Fleetfoot for the
  second swing.
- **Lockdown** denies: Slowing Hex, Rusted Barrel, Knockdown and Silence Wave are free to use once
  worn, so its souls go to items and Wraith's gun finishes.

## Start of the match

Patrick, 2026-11-09: "the player at beginning of the game, player should decide which hero to draw
at turn 1, it is like rotation selection so it also fits a small screen like mobile."

- Each side chooses its starting hero from its 4 drafted heroes, not from whatever the deal
  happened to bring. The chosen hero goes straight to the Active slot.
  - You choose on a carousel that fits a phone: one large hero card in the middle (the real
    card: stats, skill, ultimate), its neighbours peeking in at the sides; swipe, tap the arrows
    or a neighbour, or use the keyboard's arrows; one button confirms ("Start with Warden").
  - The rival AI picks its own, with its own valuation; its choice stays hidden until you confirm.
- Then each side draws 4 cards from the rest of its deck (the other 3 heroes and the 16 items).
  That is 5 cards dealt, as before: the hero and the 4.
  - The Pocket hero guarantee is not needed here: every side opens with a hero in the lane.
- That is your only hero on the board for now. The others come as you draw them.
- The opening plays in this order: both sides choose; both Actives fly to their lanes (yours from
  the picker's card, the rival's face down, turning over as it lands); the remaining heroes
  shuffle into each deck, with the riffle; each side is dealt its 4.

## Each turn

- Draw 1 card and gain 2 souls, the price of a tier-1 item. Souls pile up from turn to turn.
  - Changed 2026-11-15 (Patrick: the lane pays one unit a turn, as Pocket gives one Energy; "keep
    it simple using simple numbers"). It was 5 a turn. The reasoning is in
    [balance-model.md](balance-model.md) §7.
  - A kill pays a bounty: 1 soul in rounds 1–2, 1 more every two rounds, 6 in rounds 11–12
    (Patrick: "not worth much at the very beginning and worth a lot at the very later"). Until
    2026-11-15 kills paid nothing.
  - Objectives still push the map and give exp, and pay no souls.
  - Your souls are a button on the board: the bank sheet shows what the next turn pays, what you
    will hold then, and what a kill pays now.
- The Mid-Boss is off for now (Patrick, 2026-11-09: "remove the mid boss mechanics for now").
- Put heroes from your hand on the bench (up to 3). It's free.
- Put an item from your hand on a hero by paying its price: 2, 4, 8, 16 or 24 souls by tier, as today.
- A hero wears 3 items. Played onto a full hero, a card goes on in place of one it wears: a sheet asks which goes to the discard pile (Patrick, 2026-11-09: "when I click equip it should ask me which equipment to discard"). Cancel backs out with nothing paid.
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

## As built (2026-11-09)

Built on `deck-and-heroes`. Where the build reads the plan one way of several:

- A fallen hero waits as a corpse in its slot for `RESPAWN_TURNS`, then goes to
  the hand with its level and its items still on it. Benched again, it brings them.
- A returning hero goes to the hand even when it is full (the cap of 10 limits draws).
- An empty lane (a fallen Active gone to the hand) can take a hero straight from
  the hand. A hero benched while the lane is open steps up, as a promotion.
- The hero guarantee asks for a hero that can stand in the lane. Every hero can since Rem
  stands in the lane (2026-11-09); the rule stays for a bench-only card.
- The Cooldown items are actives now (they were passives in Deadlock and here),
  so they leave the cooldown-cut rule behind. Their icons moved to `public/spells`.
- A draw card owes no more discards than the hand holds.
- Golden Goose Egg still pays its 2 souls: it is an item's own effect.
- Story fights keep their rosters on the board and deal from a deck of items
  (the saved deck, or the builds'). Lessons name their decks; most have none.
- 45 upgrade links exist in the catalogue (the plan counted 46).
- The animations live in `src/ui/motion/`, driven by the engine's `deck` FX
  events (never state diffs): `planDeckMotion` turns a batch into flights,
  pile ticks and riffles (pure, tested in `tests/ui/deck-motion.spec.ts`);
  `DeckMotionLayer` flies the real card art over the table (your draws turn
  face up, the rival's stay backs), each batch once (`admitBatch`: the layer
  mounts on the opening's batch, and StrictMode replays a mount's effects in
  development); `useTickedCount` makes the piles' counts
  tick as cards leave and land. Under reduced motion nothing flies and
  everything just updates.
- The opening (2026-11-09): the draft's last pick stocks each deck unseen and
  holds its turn; the carousel (`OpeningPicker`) offers your drafted heroes
  from the deck (`openingCandidates`; Rem can lead since 2026-11-09); `chooseActive` puts
  yours in the lane, makes the AI's pick (most HP, then attack), shuffles
  both decks and deals `OPENING_DRAW` (4), then ends the draft's turn so turn 1
  opens on a dealt board. `dealOpeningHand` and its guarantee stay for scripted
  matches only. The opening batch plans, per side: the `place` flight (after
  the lead), the three other heroes into the deck, the riffle, the deal —
  both sides at once, ~2.3 s. A drafted match has no `BoardIntro` deal-in
  (`enabled` false), so nothing lands a tile early.
- Placing a hero (2026-11-09): a tap on a hero in your hand picks it up (it
  lifts; the free bench wells, and the lane when it is open, glow; the banner
  says "Choose a spot for Mirage"); a tap on a lit well places it there — that
  tap is the confirmation — and a tap on the card again, or on the table, puts
  it back. `placeHero` takes an optional bench `slot` (1-3; a taken or
  out-of-range one is refused: `slotTaken`, `badSlot`); without one it is
  first-free as before, which is what the AI plays. Every placement — yours,
  the rival's, the first Actives — is a `place` deck FX event, flown by the
  motion layer from the hand card (the rival's as a back that turns over) to
  the slot, the real tile hidden until it lands; the AI's next move waits for
  the rival's flight plus `PLACE_SETTLE_MS` (500), not at all under reduced
  motion. The coach's gate steps aside while a hero is picked up.
- Upgrades never start in a deck (2026-11-09). A legal deck holds base items
  only (`deckProblem`'s `'upgrade'`, cards/decks.ts; `isBaseItem`,
  `baseItem` walks `upgradesFrom` down). The deck made from builds — the
  player's From builds and every AI deck — reads the builds across as before,
  each upgrade standing for its base item (`buildsAcross`): Rem's Improved and
  Boundless Spirit bring Extra Spirit, which the 4-copy cap then holds to 4,
  the next base items of the builds taking the places it turns away. The deck
  builder shows the upgrades greyed: a tile's name and tooltip say "Comes from
  playing X" (its `upgradesFrom`), and a tap is refused with it. The save is
  at version 5: a saved deck's upgrades become their base items, and each
  copy the cap then turns away is made up from the squad's builds read across
  (the preferred heroes' saved builds, else their defaults; `rebaseDeck`); no
  squad, and the deck stays short until it is filled again. The story's and
  the lessons' decks hold none (a lesson names its own; the story deals from
  the saved deck or the builds). A Story supply reward may still be an
  upgrade: it is dealt to the hand by the story's own script, never to a deck.
- A full hero swaps (2026-11-09). `playCard` takes an optional `replaceIid`:
  the worn item a card played onto a full hero takes the place of. Legality
  refuses a full hero without one (`'full'`) and a `replaceIid` it cannot use
  (`'replace'`: the hero has room, the card evolves an item it wears, or the
  hero wears no item of that iid — a riding Rem is no item, takes no slot and
  is never offered). The named item goes to the discard pile through
  `toDiscard`, so the motion layer flies it from the hero to the pile; the card
  costs its full price. Evolving an upgrade onto its component on a full hero
  needs no discard. The board lights a full hero as a target
  (`playBlockedAny`); a tap on it opens the sheet (`ReplacePicker`, through
  Board's one hook `useReplacePick`): the worn items with their art and text
  beside the new card, tap one to mark it, the red button discards it; when
  the card makes several upgrades the upgrade picker follows. The AI lets go
  only a full hero's least valuable item (the cheapest, then one its build
  does not name) and only for a card at least twice its price (a tier up);
  the lookahead then weighs the swap like any play.
- The Mid-Boss is off (2026-11-09): `MID_BOSS_ENABLED = false`
  (engine/constants.ts) sets `GameState.midBoss`, which `riseBoss` reads, so
  no boss rises, no swing is offered at the pit, and no boss event, log line
  or Rejuvenator follows. Every line of it is kept: the constant on (or a
  setup's `midBoss`, a match config's `midBoss`) brings it back, and its tests
  turn it on for themselves (`midBossOn`). The board's countdown reads
  `bossDue`, null with no Mid-Boss, and the pit hides. Lesson 5 (The Map)
  dropped its Mid-Boss part: after the kill no rival stands and there is
  nothing to attack, so the player ends the turn and the End's empty-lane
  push fells the Patron; its boss steps stay behind `mapLesson`'s `midBoss`
  switch. Monster Rounds still prints "+1 to the Mid-Boss": that half of the
  card does nothing while the boss is off.
