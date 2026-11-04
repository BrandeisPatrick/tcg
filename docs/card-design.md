# Card Design — core rules

The rules every spell and piece of equipment follows. Read this before adding,
renaming or redesigning a card. Companion docs: [balance-model.md](./balance-model.md)
(stats and costs), [ultimate-design.md](./ultimate-design.md) (hero ultimates).

## 1. Active item = spell. Passive item = equipment. No exceptions.

Every spell and equipment card is a real Deadlock shop item, and its card type
comes from the main game:

| In Deadlock | In the TCG |
|---|---|
| **Active** item (you press a key to use it) | **Spell** (an active item): bought into the hand, played onto a hero, then used from that hero's sheet as its ability of the turn, on a cooldown (hard crowd control: two charges a match) |
| **Passive** item (always on once bought) | **Equipment** (a passive item): bought into the hand, played onto a hero, always on while worn |

The source of truth is the item's `is_active_item` flag in the
[deadlock-api.com](https://deadlock-api.com/) catalogue
(`https://assets.deadlock-api.com/v2/items`), or the item's page on the
[Deadlock wiki](https://deadlock.wiki/Items) when the API is unreachable. If
the game moves an item between active and passive, the card changes type with it.

A good effect never justifies breaking this. If a passive item has an effect
that only works as a one-shot, pick a different item, or translate the passive
into something that stays on.

## 2. Keep the flavor of the main game

A Deadlock player should recognise every card on sight.

- **Canon name.** Use the item's current in-game name. No invented items, and
  no items the game has removed or renamed.
- **Canon verb.** The effect translates what the item *does* in Deadlock, scaled
  to the board: Cold Front blasts, Warp Stone teleports, Knockdown stuns, Healbane
  cuts healing. Pick the item whose verb fits the effect, never the reverse.
- **Canon slot.** The item's shop slot sets its lean: **Weapon** items work through
  attacks and Bullet Power, **Spirit** items through skills and spirit damage,
  **Vitality** items through HP, healing, shields and resists.
- **Canon tier.** A card's tier follows the item's shop tier (800 / 1600 /
  3200 / 6400 souls → T1 / T2 / T3 / T4), and its price is the tier's:
  `PRICE` = 2 / 4 / 8 / 16 souls (an upgrade bought while its component is on
  your side costs the difference). An early, cheap card comes from a cheap item.
- **Families stay families.** Upgrade lines (Extra Spirit → Improved Spirit →
  Boundless Spirit, the Cooldown line, the Lifesteal line into Leech) keep their
  order: the higher tier is the stronger, costlier card.
- **Heroes and ultimates** follow the hero's canon kit; see
  [ultimate-design.md](./ultimate-design.md).

## 3. Audit — 2026-10-30

Every card was checked against its item's own page on the Deadlock wiki (the
API was unreachable). These were fixed:

| Card | Was | Now |
|---|---|---|
| Healbane | Spell | Equipment (passive, Vitality T2) |
| Active Reload | Spell | Equipment (passive, Weapon T2) |
| Colossus | Equipment | Spell (active, Vitality T4) |
| Debuff Remover | Old name | **Dispel Magic** (active, Vitality T3) |
| Silence Glyph | Old name | **Silence Wave** (active, Spirit T3) |
| Curse | Old name | **Cursed Relic** (active, Spirit T4) |
| Improved Cooldown | Old name | **Compress Cooldown** (passive, Spirit T2) |
| Improved Burst | Old name | **Tankbuster** (passive, Spirit T3) |
| Improved Bullet / Spirit Armor | Merged into the Resilience items in Deadlock | Retired; saved decks get Bullet / Spirit Resilience instead |
| Echo Shard, Mystic Burst, Spirit Resilience, Crippling Headshot | Wrong tier | Moved to their Deadlock tier |

A renamed card keeps its old id (`debuff_remover`, `silence_glyph`, `curse`,
`improved_cooldown`, `improved_burst`) so saved decks still load; only the
printed name changes. A retired card is listed in `RETIRED_CARDS`
(`src/cards/index.ts`), which `migrateCardIds` uses to update old saves.

### Added 2026-10-30

Twenty-two more canon items, each on the side its `is_active_item` flag puts it.
Spells follow the cost bands (a T4 active sits at 5–6); Blood Tribute is the
one under its band, at 2 souls, because the rest of its price is paid in HP.

| Card | Type | Slot | Tier |
|---|---|---|---|
| Golden Goose Egg | Spell | Spirit | T1 |
| Grit | Spell | Vitality | T1 |
| Return Fire | Spell | Vitality | T2 |
| Fleetfoot | Spell | Weapon | T2 |
| Split Shot | Spell | Weapon | T2 |
| Blood Tribute | Spell | Weapon | T3 |
| Healing Nova | Spell | Vitality | T3 |
| Rescue Beam | Spell | Vitality | T3 |
| Fury Trance | Spell | Vitality | T3 |
| Alchemical Fire | Spell | Weapon | T3 |
| Heroic Aura | Spell | Weapon | T3 |
| Shadow Weave | Spell | Weapon | T3 |
| Infuser | Spell | Vitality | T4 |
| Arctic Blast | Spell | Spirit | T4 |
| Headshot Booster | Equipment | Weapon | T1 |
| Spirit Strike | Equipment | Spirit | T1 |
| Mystic Vulnerability | Equipment | Spirit | T2 |
| Mystic Slow | Equipment | Spirit | T2 |
| Slowing Bullets | Equipment | Weapon | T2 |
| Debuff Reducer | Equipment | Vitality | T2 |
| Spirit Snatch | Equipment | Spirit | T3 |
| Spiritual Overflow | Equipment | Weapon | T4 |

Two rules came with them: the **Return Fire** status (an enemy swing that lands
on the bearer costs the attacker bullet damage) and the `debuffDuration` hook
(Debuff Reducer), the debuff twin of `buffDuration`. In the same pass Crippling
Headshot gained +1 Bullet Power and Warp Stone went from 5 to 6 souls.

### Added 2026-11-03

Attacks became per hero (every hero may attack once a turn while it stands in
the Active slot; see [engine-model.md](./engine-model.md)), so the swap after
the swing is a play of its own. Four canon mobility items came with it, each
on the side its `is_active_item` flag puts it, and the **Ricochet** keyword
reworked two weapon cards (marked *rework*):

| Card | Type | Slot | Tier |
|---|---|---|---|
| Sprint Boots | Equipment | Vitality | T1 |
| Enduring Speed | Equipment | Vitality | T2 |
| Kinetic Dash | Equipment | Weapon | T2 |
| Majestic Leap | Spell | Vitality | T3 |
| Ricochet *rework* | Equipment | Weapon | T4 |
| Split Shot *rework* | Spell | Weapon | T2 |

Majestic Leap sits under its band, at 4 souls: it is a free Retreat and
nothing more (Warp Stone, at 6, adds Bullet Resist). Three rules came with
them: the `retreatDiscount` hook (Sprint Boots, Enduring Speed: a soul off the
bearer's Retreat, summed by `retreatCost`), the `resists` hook (Enduring Speed
cannot be Rooted: `addStatus` turns the status away), and the
`onBearerStepIn` trigger (Kinetic Dash: +1 Bullet Power for the hero a Retreat
or a swap brings in). In the same pass **Fleetfoot** lost its un-Root and
gained the **Swift** status — its Active gets Extra Attack 1 and a free
Retreat this turn, so it can swing and then sprint out for the ally behind it.
Ricochet N (every other enemy hero takes N bullet damage and the swing's
on-hit debuffs, each swing that lands; see engine-model.md) replaced the
Ricochet item's bench damage (it is now Ricochet 2 while worn, at the same 7
souls) and Split Shot's half-a-swing volley (now "Your Active gains Ricochet 2
this turn", at the same 3).

Card art comes from `scripts/fetch_item_art.py`, which needs the deadlock-api
catalogue. Re-run it after a rename or a new card; until then a card without art
shows its fallback glyph, and a renamed card keeps the old item's picture.

## 4. Signature items and default builds

Every hero has two **signature items** (`HeroCard.signature`), chosen to fit its
kit — gun heroes lean Weapon, casters Spirit, tanks Vitality — one of them tier
1 or 2. Both go on sale in any match the hero is drafted into, and so does every
item of its build: the player's saved build for a hero they drafted, the
default build below for the AI's (`src/cards/builds.ts`), so a build set up
before the match can always be bought. A default build starts with the
signatures, then two tier 2, one tier 3 and one tier 4 that fit the kit, six
items for three slots: the later ones go on as upgrades of the earlier where
Deadlock builds them so, or into a slot that opens.

| Hero | Signature 1 | Signature 2 | Default build (in order) |
|---|---|---|---|
| Abrams | Healing Booster (passive, Vitality T2) | Fortitude (passive, Vitality T3) | Healing Booster → Fortitude → Bullet Lifesteal → Spirit Shielding → Bullet Resilience → Healing Tempo |
| Drifter | Restorative Shot (passive, Weapon T1) | Frenzy (passive, Weapon T4) | Restorative Shot → Frenzy → Bullet Lifesteal → Kinetic Dash → Berserker → Leech |
| Dynamo | Compress Cooldown (passive, Spirit T2) | Rescue Beam (active, Vitality T3) | Compress Cooldown → Rescue Beam → Healing Booster → Guardian Ward → Superior Cooldown → Transcendent Cooldown |
| Haze | Active Reload (passive, Weapon T2) | Burst Fire (passive, Weapon T3) | Active Reload → Burst Fire → Titanic Magazine → Kinetic Dash → Toxic Bullets → Ricochet |
| Kelvin | Cold Front (active, Spirit T2) | Knockdown (active, Spirit T3) | Cold Front → Knockdown → Improved Spirit → Spirit Shielding → Silence Wave → Arctic Blast |
| Lady Geist | Mystic Vulnerability (passive, Spirit T2) | Spirit Snatch (passive, Spirit T3) | Mystic Vulnerability → Spirit Snatch → Improved Spirit → Spirit Lifesteal → Decay → Escalating Exposure |
| Lash | Mystic Slow (passive, Spirit T2) | Tankbuster (passive, Spirit T3) | Mystic Slow → Tankbuster → Improved Spirit → Suppressor → Decay → Boundless Spirit |
| Mirage | Fleetfoot (active, Weapon T2) | Tesla Bullets (passive, Weapon T3) | Fleetfoot → Tesla Bullets → Active Reload → Slowing Bullets → Toxic Bullets → Ricochet |
| Mo & Krill | Spirit Lifesteal (passive, Vitality T2) | Bullet Resilience (passive, Vitality T3) | Spirit Lifesteal → Bullet Resilience → Guardian Ward → Weapon Shielding → Metal Skin → Infuser |
| Paige | Guardian Ward (active, Vitality T2) | Dispel Magic (active, Vitality T3) | Guardian Ward → Dispel Magic → Healing Booster → Return Fire → Healing Nova → Divine Barrier |
| Rem | Extra Spirit (passive, Spirit T1) | Healing Nova (active, Vitality T3) | Extra Spirit → Healing Nova → Improved Spirit → Healing Booster → Superior Duration → Boundless Spirit |
| Seven | Spirit Sap (active, Spirit T2) | Surge of Power (passive, Spirit T3) | Spirit Sap → Surge of Power → Compress Cooldown → Improved Spirit → Superior Cooldown → Boundless Spirit |
| Shiv | Slowing Bullets (passive, Weapon T2) | Berserker (passive, Weapon T3) | Slowing Bullets → Berserker → Active Reload → Titanic Magazine → Toxic Bullets → Crippling Headshot |
| Sinclair | Slowing Hex (active, Spirit T2) | Disarming Hex (active, Spirit T3) | Slowing Hex → Disarming Hex → Improved Spirit → Mystic Vulnerability → Silence Wave → Vortex Web |
| Vindicta | Long Range (passive, Weapon T2) | Toxic Bullets (passive, Weapon T3) | Long Range → Toxic Bullets → Titanic Magazine → Split Shot → Tesla Bullets → Crippling Headshot |
| Viscous | Reactive Barrier (passive, Vitality T2) | Spirit Resilience (passive, Vitality T3) | Reactive Barrier → Spirit Resilience → Debuff Reducer → Improved Spirit → Fortitude → Unstoppable |
| Warden | Weapon Shielding (passive, Vitality T2) | Metal Skin (active, Vitality T3) | Weapon Shielding → Metal Skin → Bullet Lifesteal → Enduring Speed → Fortitude → Leech |
| Wraith | Spirit Strike (passive, Spirit T1) | Spiritual Overflow (passive, Weapon T4) | Spirit Strike → Spiritual Overflow → Split Shot → Spirit Lifesteal → Spirit Snatch → Ricochet |
| Yamato | Extended Magazine (passive, Weapon T1) | Shadow Weave (active, Weapon T3) | Extended Magazine → Shadow Weave → Titanic Magazine → Kinetic Dash → Heroic Aura → Glass Cannon |
