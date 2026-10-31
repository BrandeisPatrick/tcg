# Card Design — core rules

The rules every spell and piece of equipment follows. Read this before adding,
renaming or redesigning a card. Companion docs: [balance-model.md](./balance-model.md)
(stats and costs), [ultimate-design.md](./ultimate-design.md) (hero ultimates).

## 1. Active item = spell. Passive item = equipment. No exceptions.

Every spell and equipment card is a real Deadlock shop item, and its card type
comes from the main game:

| In Deadlock | In the TCG |
|---|---|
| **Active** item (you press a key to use it) | **Spell**: played from hand, resolves once, discarded |
| **Passive** item (always on once bought) | **Equipment**: attached to a hero, stays on |

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
- **Canon tier.** A card's tier and cost band follow the item's shop tier
  (800 / 1600 / 3200 / 6400 souls → T1 / T2 / T3 / T4) as far as the cost bands
  allow. Spells stop at the T3 band (5–6 souls), so a T4 active item is a 5–6
  soul spell. An early, cheap card comes from a cheap item.
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

Card art comes from `scripts/fetch_item_art.py`, which needs the deadlock-api
catalogue. Re-run it after a rename or a new card; until then a card without art
shows its fallback glyph, and a renamed card keeps the old item's picture.
