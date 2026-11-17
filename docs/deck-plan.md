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
- A deck may hold any item, upgrades too (Patrick, 2026-11-15: upgrades are played "regularly" from the hand for less; see Upgrades). From 2026-11-09 until then a deck held base items only and an upgrade reached it when its component was played.
- A player with no saved deck gets one built from their drafted heroes' builds (the per-hero builds the game has today), read across as they are, upgrades included.
- You draft 3 heroes (Patrick, 2026-11-16; it was 4). They are shuffled into your deck, with an animation, so the deck has 19 cards. The board keeps its 4 spots, so a full squad leaves one for a unit ([hero-design.md](hero-design.md), "Units").

## Ready decks (2026-11-15; rebuilt 2026-11-16: seven archetypes)

Patrick, 2026-11-16: "For all the decks, we want them to have very different play styles …
they have their own archetypes: bullet single target, bullet multi target, single burst
spirit, multi-target spirit, CC … Graves is a special one … tank, shield is more like support.
… The max duplicate per deck should be 4." Then: "you decide." A hero may be in only one
ready deck, and there are 22: seven decks of three use 21 (Mirage is in none). The picks
below are reasoned; nothing was played or simulated. The archetype map, with the styles from
other card games not built as ready decks (Rush, Snipe, Pivot, Voltron, Berserker, Combo turn),
is the artifact "Deck Archetype Map".

### The recipe

- **16 items at most 28 souls** at the prices they print, **at most two over 2 souls** (the
  payoffs). The lane pays 2 a turn ([balance-model.md](balance-model.md) §12): a whole deck
  lists at about what a side has by turn 7, so everything drawn is played. In practice a deck
  is eight 1-soul cards, six 2-soul cards and two payoffs of 4, or one payoff of 8.
- **Up to 4 copies** (MAX_COPIES): the engine card of an archetype comes 4 times (Headshot
  Booster, Split Shot, Extra Spirit, Extra Health).
- **One Golden Goose Egg** in every deck: running out of cards loses since 2026-11-16, so a
  second Egg is a turn off its own clock (§13).
- **An upgrade beside its component**, **a counter** (Knockdown, Debuff Reducer, Counterspell
  or Dispel Magic), **at most 8 spells**, listed by tier.

| Deck | Archetype | Squad (first Active first) | Payoffs |
|---|---|---|---|
| Headshot | Bullet, one target | Drifter, Vindicta, Wraith | Headhunter, Express Shot |
| Spray | Bullet, every target | Warden, Haze, Silver | Tesla Bullets |
| Nuke | Spirit burst, one target | Lady Geist, Shiv, Yamato | Tankbuster, Infuser |
| Storm | Spirit, area | Kelvin, Lash, Seven | Greater Expansion, Torment Pulse |
| Lockdown | Crowd control | Mo & Krill, Sinclair, Viscous | Superior Duration, Silence Wave |
| Graveyard | Mill and grind | Abrams, Graves, Rem | Fortitude, Healing Nova |
| Aurora | Tank and support | Victor, Dynamo, Paige | Healing Tempo |

### Each deck

**Headshot** (Drifter, Vindicta, Wraith). One gun at a time on one target, a bonus for every
state of its HP: Headshot Booster ×4 (+2 at full HP), Opening Rounds ×2 (+2 above half),
Drifter's Bloodscent (+2 below half). Headhunter evolves the Booster; Express Shot fires again
while the target is above half. Kinetic Dash and Vindicta's free Retreat make the second
swing land hard; Extra Stamina, its component since 2026-11-17, gives that Retreat back (it was
Kinetic Dash ×2). Extended Magazine ×2 → Titanic Magazine, Restorative Shot, Knockdown, the Egg.

**Spray** (Warden, Haze, Silver). Every swing hits every enemy. Split Shot ×4 (Ricochet 2 this
turn, 2 souls) carries the swing's on-hit debuffs to all; Stalker ×2 makes each of them Bleed
and lose Bullet Resist; Tesla Bullets chains to the bench. Warden holds the lane; Haze's Bullet
Dance is the finish. Extended Magazine ×3 → Titanic Magazine, Extra Stamina → Kinetic Dash
(2026-11-17: Kinetic Dash is built from it; a fourth Magazine made room), Restorative Shot,
Knockdown, the Egg.

**Nuke** (Lady Geist, Shiv, Yamato). Every skill is a kill shot: Essence Bomb, Serrated Knives
(Shiv's Killing Blow knocks out what is below half), Flying Slash at any enemy. Mystic Burst ×3
→ Tankbuster add to each cast; Mystic Vulnerability ×2 lowers Spirit Resist; Echo Shard ×2
casts a skill again for 1 soul; Infuser makes the nukes heal their caster (Lady Geist pays HP
for hers). Extra Spirit ×2 → Improved Spirit ×2 (a skill counts Spirit twice), Spirit
Lifesteal, Knockdown, the Egg.

**Storm** (Kelvin, Lash, Seven). One-target skills the range items widen: Frost Grenade (3✦ on the Active since 2026-11-17, and Kelvin heals as much). Lash (since 2026-11-17)
swings, slips out and Grapples back in for a second swing with 3✦ more, and on him Greater Expansion
makes Death Slam lift the whole enemy side back to the hand. Greater Expansion turns Seven's one-target Static Charge into a storm (Mystic Expansion ×2
first, a neighbour's 1). Mystic Vulnerability ×2 and Mystic Slow land on everything an area
skill hits; Torment Pulse chips two a turn. Extra Spirit ×4 → Improved Spirit ×2, Extra Charge
for Kelvin's grenade, Knockdown, the Egg.

**Lockdown** (Mo & Krill, Sinclair, Viscous). The rival does not get to play: Knockdown ×2,
Disarming Hex (from Rusted Barrel), Slowing Hex, Silence Wave (no spells for 2 turns), the
squad's Disarm, Rabbit and Cube, and Duration Extender ×2 → Superior Duration, which make each
a turn longer. It wins on the clock: Extra Health ×4 and Extra Regen ×2 keep it standing until
the rival's deck runs out (or round 20). The Egg.

**Graveyard** (Abrams, Graves, Rem). Grind them out: Graves shuffles Ghouls into his own deck
(his deck lasts longer) and every Ghoul that falls mills the rival's; Rem's Naptime sleeps their
carry; Abrams holds the lane and heals. Extra Health ×4 → Fortitude, Extra Regen ×2, Weapon and
Spirit Shielding, Healing Rite → Healing Nova, Mystic Slow ×2 (Graves's Root spreads), Healbane
against their heals, Debuff Reducer, the Egg.

**Aurora** (Victor, Dynamo, Paige). Heal and shield every turn. Victor's Aura wounds every enemy
from the lane; Dynamo's Rejuvenating Aurora and Paige's Plot Armor keep the side up; Healing
Tempo (from Healing Booster ×2) turns each heal into +2 Bullet Power and a free Retreat.
Healing Rite ×2, Restorative Locket, Sprint Boots → Enduring Speed, Extra Health ×3, Extra
Regen, Restorative Shot, Extended Magazine, Debuff Reducer, the Egg.

**Left for testing** (only when Patrick asks by name): whether Spray's four Split Shots make
every match a race; whether Lockdown can reach the rival's deck-out before its own; whether
Graveyard's own Ghouls outlast the rival's clock; whether Storm's Greater Expansion on Seven is
the strongest single card in the set.

## Start of the match

Patrick, 2026-11-09: "the player at beginning of the game, player should decide which hero to draw
at turn 1, it is like rotation selection so it also fits a small screen like mobile."

- Each side chooses its starting hero from its 3 drafted heroes, not from whatever the deal
  happened to bring. The chosen hero goes straight to the Active slot.
  - You choose from their faces alone (Patrick, 2026-11-16: "too much text, the player already
    knows their hero"): the draft's own team cards, splash art and name, three across so they
    fit a phone. Tap one (it lifts in gold) or use the keyboard's arrows; one button confirms
    ("Start with Warden").
  - The rival AI picks its own, with its own valuation; its choice stays hidden until you confirm.
- Then each side draws 4 cards from the rest of its deck (the other 2 heroes and the 16 items).
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
  - A kill pays a bounty: 1 soul in rounds 1–2, 1 more every two rounds, 10 in rounds 19–20 (6 in rounds 11–12 under the old cap of 12)
    (Patrick: "not worth much at the very beginning and worth a lot at the very later"). Until
    2026-11-15 kills paid nothing.
  - Objectives still push the map and give exp, and pay no souls.
  - Your souls are a button on the board: the bank sheet shows what the next turn pays, what you
    will hold then, and what a kill pays now.
- The Mid-Boss is off for now (Patrick, 2026-11-09: "remove the mid boss mechanics for now").
- Put heroes from your hand on the bench (up to 3). It's free.
- Put an item from your hand on a hero by paying its price: 1, 2, 4, 8 or 12 souls by tier (2, 4, 8, 16 or 24 until 2026-11-16).
- A hero wears 3 items. Played onto a full hero, a card goes on in place of one it wears: a sheet asks which goes to the discard pile (Patrick, 2026-11-09: "when I click equip it should ask me which equipment to discard"). Cancel backs out with nothing paid.
- Retreat, skills, ultimates and the attack work as today until the hero rules land. After that, skills and ultimates cost souls (see [hero-design.md](hero-design.md)); since 2026-11-15 they cost none and wait instead ([balance-model.md](balance-model.md) §8).
- Your hand holds up to 10 cards. When it is full, further draws are skipped.
- The shop phase is gone: no buying, no selling, no market.
- When your deck is empty you stop drawing. Nothing else happens.

## The draw card

Golden Goose Egg is the draw card (Patrick, 2026-11-16: "Goose Egg now should be draw 2"): a
tier-1 spell, 2 souls, "Draw 2 cards." It is worth 2.8 against its 2 (a card drawn is worth 1.4,
[card-design.md](card-design.md), "Changed 2026-11-16: the Cooldown family is equipment").

Until 2026-11-16 Deadlock's three cooldown items were the draw cards (draw x, discard y; Patrick,
2026-11-15). They are equipment again, as in Deadlock, and shorten the bearer's waits instead.
Nothing makes a side discard now; the engine keeps the discard step for a card that may want it.

## Upgrades

Changed 2026-11-15 (Patrick: "instead of spawning another card when you play one, you just play
them regularly; an upgrade costs much less").

- An upgrade is a deck card like any other. Nothing is made or shuffled into the deck when a card is
  played, and any item may be in a deck (the deck builder says "Evolves Extended Magazine for the
  difference" on an upgrade's tile).
- **Upgrades evolve:** play an upgrade on the hero who wears the item it is built from and it
  replaces that item, like evolving a Pokémon.
  - You pay only the difference, as in Deadlock: Titanic Magazine over Extended Magazine costs 1,
    not 2. The old item goes to the discard pile.
  - On any other hero, the upgrade costs its normal price.
- The rule is for equipment built from equipment. A spell (an active item) always costs its price,
  and equipment built from a spell evolves nothing.

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
  holds its turn; the picker (`OpeningPicker`) offers your drafted heroes
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
- (History, 2026-11-09 to 2026-11-15; an upgrade is a deck card since —
  `deckProblem` has no `'upgrade'` answer, `evolvesFrom` names the equipment
  an upgrade evolves, and builds are read across as they are.) Upgrades never
  start in a deck. A legal deck holds base items
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
