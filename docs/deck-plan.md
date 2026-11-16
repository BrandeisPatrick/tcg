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

## Ready decks (2026-11-15; redesigned by reasoning 2026-11-16)

Patrick, 2026-11-15: "we need to have decks ready." Six decks head the Loadout, each a squad of
three heroes and its 16 items (`src/cards/readyDecks.ts`). "Use deck" saves the squad and the
deck together. When that would replace picks or a deck of the player's own, the button asks once
more.

Patrick, 2026-11-16: "redesign the deck based on reasoning." The six were rebuilt for the rules
of that day. Every number below is reasoned, none played or simulated.

### What the rules of 2026-11-16 reward

- **A second swing costs a Retreat.** An attack no longer ends the turn and each hero attacks once,
  so attack, Retreat, attack is two swings. The Retreat is the leaving hero's printed 0, 1 or 2
  souls, so it is the price of the second swing. A swing at Attack 1–3 with a bonus or two is 2 to
  4 damage, 2 to 4 points: more than any tier-1 card is worth in a turn.
  - So a Retreat made free is worth about one swing a turn. Six heroes print 0 (Vindicta, Wraith,
    Lash, Rem, Yamato, Mirage); Swift Striker and Sprint Boots take 1 off; Willpower, Fleetfoot,
    Majestic Leap and Healing Tempo make one Retreat free.
  - What a hero gets for stepping in is paid every turn the deck swaps: Kinetic Dash's +3 Bullet
    Power on the incoming swing is about 3 points a swap, against 4 souls once.
  - Root is the counter: a Rooted Active cannot Retreat, so it denies the rival's second swing
    (Mystic Slow, Slowing Bullets, Ground Strike, Grasping Hands).
- **The Cooldown items shorten every wait**, a charged skill's too. In a squad of three skills
  Compress Cooldown is a cast every few turns on whoever wears it; two copies find two of them.
- **Healing Tempo turns a heal into a swing.** A hero its wearer heals gets +2 Bullet Power and a
  free Retreat that turn. On Dynamo, Rejuvenating Aurora heals every hero, so the Active swings
  harder, retreats free, and the hero stepping in swings harder too.
- **Cheap spells count at their price.** Majestic Leap 2, Disarming Hex 3 and Knockdown 4 cost
  what they print, not their tier's 8.

### The recipe

- **16 items, at most 28 souls at the prices they print, and at most two of them over 2 souls:**
  the deck's payoffs, up to 8 each (56, 4 and 16 until prices halved on 2026-11-16,
  [balance-model.md](balance-model.md) §12). The lane pays 2 a turn (§7): by its turn 9 a side has
  about 30 souls (18 from the lane, about 12 in bounties) and has drawn about 11 of its 16 items,
  13 with its Golden Goose Egg. A whole deck lists at about what a side has by turn 7, so
  everything drawn is played, and a payoff of 4 lands on turn 2.
  Until this redesign the recipe counted tiers (8 tier-1, 6 tier-2, 2 tier-3). That priced
  Majestic Leap at 8 for a card that costs 2, and left no room for a deck to be built around one
  tier-4 card (Aurora's Healing Tempo: 16, the same as two tier-3s).
- **At most 2 copies of one** (Pocket's rule, inside this game's cap of 4).
- **One upgrade line beside the item it is built from**, never an upgrade without its component
  (played onto the hero wearing it, the upgrade costs the difference).
- **A counter:** Counterspell, Debuff Reducer, Dispel Magic or Knockdown. Knockdown is the
  aggressive decks' (4 souls, a Stun that also breaks a channel), Debuff Reducer the slow decks'
  (it stays).
- **One draw card, Golden Goose Egg** (draw 2 for 2 souls, worth 2.8): a deck holds two heroes
  behind its first Active, and a draw finds one sooner. Graveyard carries two, to find its Ghouls.
- **Mostly equipment:** spells are played once, so at most half the deck. Lockdown carries the
  most (7), because a denial is a spell.
- **A squad has a front, a carry and a helper**, and no hero is in two decks. Four heroes are in
  none: Abrams, Rem, Shiv and Paige.

| Deck | Squad | How it wins | Payoffs | Souls (halved 2026-11-16) |
|---|---|---|---|---|
| Gunline | Warden, Vindicta, Haze | Two shots a turn | Burst Fire, Toxic Bullets | 28 |
| Spirit Storm | Lash, Seven, Kelvin | Area skills cast more often | Torment Pulse, Superior Cooldown | 28 |
| Aurora | Victor, Dynamo, Drifter | Heal into a free Retreat, finish the wounded | Healing Tempo | 28 |
| Ambush | Silver, Yamato, Mirage | Every hero that steps in hits for 3 more | Tesla Bullets, Burst Fire | 28 |
| Lockdown | Mo & Krill, Sinclair, Wraith | Deny every turn, then two shots | Superior Cooldown, Burst Fire | 28 |
| Graveyard | Viscous, Graves, Lady Geist | Ghouls mill them; Roots deny their swaps | Torment Pulse, Decay | 28 |

### Each deck

**Gunline** (Warden, Vindicta, Haze). Warden holds the lane and shoots; a free Retreat brings in
Vindicta or Haze for a second shot every turn.
- 2 Swift Striker (4): +1 Bullet Power and Retreat −1. On Warden and Haze (Retreat 1) the second
  swing is free every turn; Vindicta's is 0 already.
- Kinetic Dash (4): +3 on the hero stepping in. Titanic Magazine over 2 Extended Magazine (+1, then
  +2 for 2 more souls); 2 Headshot Booster (+2 on the first swing at a fresh Active, the swing a
  kill leaves); 2 Restorative Shot (a heal a swing, two swings a turn).
- Compress Cooldown (4): Willpower 3 → 2 (its Swift is a free Retreat too), Assassinate's charges
  5 → 4.
- Knockdown (4) is the counter; Grit and Golden Goose Egg.
- Payoffs: Burst Fire (an Extra Attack every turn on its wearer) and Toxic Bullets (Bleed that
  stacks twice as fast with two swings).
- Out: Long Range, Fleetfoot and Debuff Reducer (Swift Striker makes the Retreat free every turn,
  which Fleetfoot did once).

**Spirit Storm** (Lash, Seven, Kelvin). Three skills that hit the Active or every enemy; the deck
casts them more often and makes each cast hit harder.
- 2 Compress Cooldown, then Superior Cooldown (a payoff): Ground Strike and Static Charge 4 → 3,
  Frost Grenade's charges 4 → 3, and with Superior the ultimates 2 sooner (Death Slam stuns every
  enemy). Extra Charge (2): a third Frost Grenade charge.
- Improved Spirit over 2 Extra Spirit: every skill's spirit number grows.
- 2 Mystic Burst (1 spirit damage on every skill cast), Mystic Vulnerability (Spirit Resist −1 on
  what a skill hits), Mystic Regeneration and Healing Rite for the casters' small HP.
- Knockdown (4) counter; Torment Pulse, the other payoff (1 to the Active and the first bench hero
  every turn); Golden Goose Egg.
- Out: Cold Front, Spirit Strike and Spirit Lifesteal: the skills do the damage and a third cast is
  worth more than a spell.

**Aurora** (Victor, Dynamo, Drifter), new. It replaces Bulwark (Abrams, Victor, Rem), whose heals
and shields took no part in the second swing. It is the deck Patrick named: "Dynamo with Healing
Tempo can do a rearrange and attack combo."
- Victor leads: his Aura of Suffering deals 1 spirit damage to every enemy each turn (and to
  himself, which charges his revive), so enemies drop below half, and Drifter's Bloodscent hits a
  hero below half for 2 more.
- Dynamo wears Healing Booster (4), then Healing Tempo over it (12 more; the payoff). Rejuvenating
  Aurora heals every hero 5 + Spirit, so each one healed gets +2 Bullet Power and a free Retreat:
  Victor (Retreat 2) swings, retreats for nothing, and Drifter steps in with Kinetic Dash (+3),
  Healing Tempo's +2 and Bloodscent's +2.
- Compress Cooldown on Dynamo: the Aurora every 3 turns instead of 4.
- Sprint Boots (Victor's Retreat 2 → 1 on the turns without a heal); 2 Extra Health (the front);
  2 Extended Magazine, Bullet Lifesteal and Restorative Shot on Drifter.
- 2 Healing Rite and Grit: a Healing Rite cast by Dynamo in the lane counts for Healing Tempo too.
- Debuff Reducer is the counter (it stays on the front); Golden Goose Egg.

**Ambush** (Silver, Yamato, Mirage). Swap in, strike, swap again: Yamato and Mirage retreat for
nothing, Silver for 0 with Swift Striker.
- 2 Kinetic Dash: +3 on every hero that steps in. Majestic Leap (2): a free swap for Silver's turn.
- Titanic Magazine over 2 Extended Magazine; 2 Headshot Booster; Restorative Shot.
- Compress Cooldown: Boot Kick and Flying Slash 3 → 2.
- Knockdown counter; Grit; Golden Goose Egg.
- Payoffs: Tesla Bullets (2 to a bench hero after every swing: two a turn) and Burst Fire.
- Out: Sprint Boots and Fleetfoot (the squad's Retreats are free already), Dispel Magic (Knockdown
  is the cheaper counter).

**Lockdown** (Mo & Krill, Sinclair, Wraith). Disarm, silence and hex every turn; Wraith (Retreat
0) gets two shots behind it.
- 2 Disarming Hex (3 each now): Disarm any enemy 2 turns. Slowing Hex (4): Silence 2 turns.
  Rusted Barrel (1). Knockdown (4) is the counter and a third denial.
- 2 Compress Cooldown, then Superior Cooldown: Sand Blast 3 → 2, Rabbit Hex 4 → 3, Full Auto 3 → 2,
  and with Superior the ultimates 2 sooner (Combo and Telekinesis both stun).
- Headshot Booster over 2 Extended Magazine and Burst Fire for Wraith (it was Titanic Magazine
  until prices halved: two Disarming Hex at 2 each put the deck at 29); 2 Extra Health for Mo &
  Krill in front; Grit; Golden Goose Egg.
- Out: Silence Wave (8) for two Disarming Hex (6), and Spirit Strike, Extra Spirit, Mystic Shot and
  Spirit Lifesteal: the squad's damage is Wraith's gun.

**Graveyard** (Viscous, Graves, Lady Geist). Grasping Hands shuffles two Ghouls into Graves's deck;
every Ghoul that falls discards the top of the rival's.
- 2 Compress Cooldown: Grasping Hands and The Cube 4 → 3, Essence Bomb 3 → 2.
- Mystic Slow: what a skill hits is Rooted 1 turn. Essence Bomb hits the enemy Active (one
  target since 2026-11-16), so it cannot Retreat for the rival's second swing.
- 2 Golden Goose Egg (find the Ghouls and the heroes); Improved Spirit over 2 Extra Spirit; Mystic
  Burst; Spirit Lifesteal, Mystic Regeneration, Healing Rite and Extra Health for Lady Geist, who
  pays HP for her bomb.
- Debuff Reducer counter; payoffs Torment Pulse and Decay.
- Out: Reactive Barrier (the Cube already guards).

**Left for testing** (only when Patrick asks by name): whether two Kinetic Dash in Ambush and two
Swift Striker in Gunline make the second swing too cheap; whether Aurora's Healing Tempo lands by
turn 6–7 as the curve says; whether Lockdown's seven spells leave it short of items late.

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
  - A kill pays a bounty: 1 soul in rounds 1–2, 1 more every two rounds, 6 in rounds 11–12
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
