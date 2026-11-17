# Card Design — core rules

The rules every spell and piece of equipment follows. Read this before adding,
renaming or redesigning a card. Companion docs: [balance-model.md](./balance-model.md)
(stats and costs), [ultimate-design.md](./ultimate-design.md) (hero ultimates).

## 1. Active item = spell. Passive item = equipment. No exceptions.

Every spell and equipment card is a real Deadlock shop item, and its card type
comes from the main game:

| In Deadlock | In the TCG |
|---|---|
| **Active** item (you press a key to use it) | **Spell**: a card of the deck, played from the hand for its price on the target its text names (or on nothing). It resolves at once, what it leaves behind lasts a turn or two, and the card goes to the discard pile. It is never worn and takes no slot. |
| **Passive** item (always on once bought) | **Equipment**: a card of the deck, played from the hand onto one of your heroes, always on while worn |

Until 2026-11-15 an active was worn like equipment and used again on a cooldown.
Patrick that day: "Active cards are spells. They have a cost, they play, and
they are active for 1 or 2 turns." What that changed is in "Changed 2026-11-15"
below.

The source of truth is the item's `is_active_item` flag in the
[deadlock-api.com](https://deadlock-api.com/) shop list
(`https://api.deadlock-api.com/v1/assets/items/by-type/upgrade`; skip entries
that are `disabled` or not `shopable`), or the item's page on the
[Deadlock wiki](https://deadlock.wiki/Items) when the API is unreachable. If
the game moves an item between active and passive, the card changes type with it.

One card is Patrick's own exception, a passive in Deadlock and a spell here:
Counterspell (2026-11-15). Nothing else is. The Cooldown family was the other
(the draw cards, 2026-11-15) until 2026-11-16, when Patrick made it equipment
again (see "Changed 2026-11-16: the Cooldown family is equipment").

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
  3200 / 6400 / 9999 souls → T1 / T2 / T3 / T4 / T5), and its price is the
  tier's: `PRICE` = 1 / 2 / 4 / 8 / 12 souls (2 / 4 / 8 / 16 / 24 until
  2026-11-16; see "Changed 2026-11-16: cards cost half"). Equipment played onto the hero
  wearing the equipment it is built from costs the difference; a spell always
  costs its price. A card may print a price of its own under its tier's where
  Patrick sets one: Rusted Barrel costs 1 (2026-11-15), and a spell whose one
  play is worth under half its tier's price costs about what that play is
  worth instead of gaining effects (2026-11-16: "a spell should have the
  benefit of costing less"; the eleven are in "Changed 2026-11-16: spells
  priced for one play"). The tier stays the item's. Tiers 1–4 are cost ÷ 800
  (2 × cost ÷ 800 until prices halved); tier 5 is 12, 1.5 × tier 4 as 9,999 is
  1.56 × 6,400, so an upgrade over a tier-4 component costs a whole 4 and a
  half-price sale refunds a whole 6. An early, cheap card comes from a cheap item.
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
| Improved Bullet / Spirit Armor | Merged into the Resilience items in Deadlock | Retired; saved builds get Bullet / Spirit Resilience instead |
| Echo Shard, Mystic Burst, Spirit Resilience, Crippling Headshot | Wrong tier | Moved to their Deadlock tier |

A renamed card keeps its old id (`debuff_remover`, `silence_glyph`, `curse`,
`improved_cooldown`, `improved_burst`) so saved builds still load; only the
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

Card art comes from `scripts/fetch_item_art.py`, which downloads each card's
shop icon from the Deadlock wiki's asset mirror (public/ART_PIPELINE.md). Re-run
it after a rename or a new card; until then a card without art shows its
fallback glyph, and a renamed card keeps the old item's picture.

### Added 2026-11-05

Every item in Deadlock's current shop now has a card, unless it failed one of the
three tests for a suitable card. The source is the deadlock-api's shop list
(`/v1/assets/items/by-type/upgrade`, 2026-11-05), which matches the wiki item
for item. It has 156 items at tiers 1–4. All 93 cards were still in it, under
their names, tabs and tiers, so none retired. The other 63 items were tested:

1. **Expressible.** The item's real verb is a board effect the existing ability
   families can carry. A verb that would move a cooldown, a charge or a soul
   fails here, because the rules (and the fuzz oracle) own those.
2. **Distinct.** No two cards in one tab and tier share an effect and a number.
   Items that collapse into one effect are folded into the best-known of them.
3. **Meaningful in 5–10 own turns.** An item whose whole value is movement,
   stamina, sprint, ammo or out-of-combat regen gets a card only through a board
   verb: a cheaper Retreat, a bench swap (stepping in), or the bench.

41 became cards (36 passives, 5 actives), 6 were folded and 16 skipped. The 17
items of the shop's tier 5 waited on a decision (see the next section).

| Tab | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| Weapon | 3 · 0 → 4 · 0 | 5 · 2 → 12 · 2 | 4 · 4 → 13 · 4 | 5 · 0 → 8 · 1 |
| Vitality | 3 · 2 → 3 · 2 | 9 · 2 → 11 · 3 | 3 · 7 → 4 · 7 | 5 · 5 → 10 · 6 |
| Spirit | 4 · 2 → 4 · 2 | 6 · 3 → 9 · 3 | 5 · 4 → 7 · 4 | 4 · 6 → 7 · 8 |

Cells read passives · actives, before → after. 93 cards became 134.

**The budget.** Every number was set by reasoning, with no test run, using
[balance-model.md](./balance-model.md) as the
[survey](./mechanics-survey.md) §3 corrects it:

- **Values:** 1 damage = 1.0; 1 heal, Shield or point of damage prevented = 0.5;
  a permanent +1 stat (Bullet Power, Spirit Power, max HP) = 0.7 for each own
  turn it is worn.
- **Crowd control:** a turn of Stun on the enemy Active = 2.0; a Silence or a
  Disarm alone on it = 1.0, and a Silence on a bench hero = 1.0; a Root = 0.4
  (0.1 on the bench).
- **Extra attacks and grain:** an extra attack = 2 × the 2.5 it doubles = 5.0;
  the grain is 0.5.
- **Turns worn:** 8 at T1, 6 at T2, 4 at T3, 3 at T4.
- **Uses of an active:** turns worn ÷ cooldown (it starts on cooldown), so
  4 / 3 / 1.33 / 1; a hard crowd-control active gets its 2 charges.
- **Band:** a new card's value lands within half a tier step of its price, ¾ to
  1½ × price (T1 1.5–3, T2 3–6, T3 6–12, T4 12–24).

Rates, per own turn worn:

| Rate | Value | What it counts |
|---|---|---|
| Swings | 0.7 | The rate the stat rule implies for Bullet Power. |
| Spirit hits | 0.7 | A spirit item's bearer's skill, item or ultimate damaging an enemy. |
| Skills | 0.6 | Skill uses. |
| Ultimates | 0.25 | Ultimate uses. |
| Hits taken | 0.5 bullet, 0.5 spirit | Hits landing on the bearer. |
| Hard CC | 0.2 | Hard crowd control landing on the bearer. |
| Steps in | 0.2 | The bearer stepping into the Active slot. |
| Retreat | 0.225 | A soul off the bearer's Retreat (0.15 Retreats, each worth its soul and its swap, 1.5). |

Shares:

| Share | Value |
|---|---|
| A swing at an enemy at full HP | 0.35 |
| A swing at an enemy above half HP | 0.5 |
| The bearer below half HP | 0.3 |
| The bearer above half HP | 0.7 |
| The bearer on the bench at its turn start | 0.5 |
| A target still the enemy Active next turn | 0.5 |
| A this-turn swing buff gets swung | 0.85 |
| An extra swing finds its target standing | 0.65 |
| Living enemy bench heroes | 2.2 (every enemy is 3.2) |

Heals that fire on their own land 0.6, aimed heals 0.8, team heals 0.4,
Shields 0.9. A resist of 1 / 2 / 3 takes 1 / 1.8 / 2.4 off a bullet hit, and
1 / 1.9 / 2.6 off a spirit hit. An active's `{sp:}` adds the Active's Spirit
Power, taken as 1.5.

| Card | Tab · tier | Price | Effect | Budget (souls) |
|---|---|---|---|---|
| Monster Rounds | Weapon T1 | 2 | +1 against the Mid-Boss; heal 1 on the bench | 0.05 boss swings × 8 = 0.4; 1 × 0.5 × 0.5 bench × 0.6 × 8 = 1.2 → **1.5** |
| Intensifying Magazine | Weapon T2 | 4 | Each swing adds +1 Bullet Power, up to +2 | 0.7 swings × about 1.2 bonus × 6 → **5.0** |
| Mystic Shot | Weapon T2 | 4 | Each swing's target takes 1 spirit damage | 0.7 × 1 × 6 = 4.2 → **4.0** |
| Opening Rounds | Weapon T2 | 4 | +2 against an enemy above half HP | 2 × 0.7 × 0.5 × 6 = 4.2 → **4.0** |
| Spirit Shredder | Weapon T2 | 4 | Swings: Spirit Resist −2; spirit damage there heals 1 | 2 × 0.7 × 0.5 × 1.0 × 6 = 4.2; 1 × 0.7 × 0.5 × 0.5 × 0.6 × 6 = 0.6 → **5.0** |
| Stalker | Weapon T2 | 4 | Swings: Bleed 1 and Bullet Resist −1 | Bleed 1 × 0.75 ticks × 0.7 × 6 = 3.2; 1 × 0.5 × 0.7 × 0.7 × 6 = 1.5 → **4.5** |
| Swift Striker | Weapon T2 | 4 | +1 Bullet Power; Retreat costs 1 less | 0.7 × 6 = 4.2; 0.225 × 6 = 1.35 → **5.5** |
| Weakening Headshot | Weapon T2 | 4 | +1 HP; full-HP targets get Bullet Resist −2 | 0.7 × 6 = 4.2; 2 × 0.7 × 0.35 × 0.5 × 0.7 × 6 = 1.0 → **5.0** |
| Ballistic Enchantment | Weapon T3 | 8 | Each enemy its ability hits: +2 Bullet Power, to +4 | 0.7 × about 2.2 bonus × 4 = 6.2 → **6.0** |
| Escalating Resilience | Weapon T3 | 8 | +2 Bullet Power; each swing adds Bullet Resist, to 3 | 2 × 0.7 × 4 = 5.6; 1.6 off a swing × 0.86 × 0.7 × 0.7 × 0.5 × 4 = 1.3 → **7.0** |
| Express Shot | Weapon T3 | 8 | +1 Bullet Power; once an attack, fires again above half | 0.7 × 4 = 2.8; 0.7 × 0.4 × 5 × 4 = 5.6 → **8.5** |
| Headhunter | Weapon T3 | 8 | +1 HP; +3 at full HP, healing 2 | 2.8; 3 × 0.7 × 0.35 × 4 = 2.9; 2 × 0.7 × 0.35 × 0.5 × 0.6 × 4 = 0.6 → **6.5** |
| Hollow Point | Weapon T3 | 8 | +1 HP; above half HP: +2, Bullet Resist −1 | 2.8; 2 × 0.7 × 0.7 × 4 = 3.9; 0.7 × 0.7 × 0.35 × 4 = 0.7 → **7.5** |
| Hunter's Aura | Weapon T3 | 8 | +1 HP; every enemy: Bullet Resist −1, Bullet Power −1 | 2.8; (0.96 swings + 0.86 × 0.5) × 4 = 5.6 → **8.5** |
| Sharpshooter | Weapon T3 | 8 | +1 Bullet Power; reach; +3 to a bench hero | 2.8; reach 0.35 × 4 = 1.4; 3 × 0.7 × 0.3 × 4 = 2.5 → **6.5** |
| Spirit Rend | Weapon T3 | 8 | +1 HP; Spirit Resist −1 stacking to 3; drain 2 | 2.8; 1.8 × 0.7 × 0.5 × 1.0 × 4 = 2.5; 2 × 0.7 × 0.5 × 0.5 × 0.6 × 4 = 0.8 → **6.0** |
| Weighted Shots | Weapon T3 | 8 | +2 Bullet Power; swings Root the target | 5.6; 0.7 × 0.5 × 0.4 × 4 = 0.6 → **6.0** |
| Armor Piercer | Weapon T4 | 16 | +2 Bullet Power; swings ignore armour, pierce to the bench | 2 × 0.7 × 3 = 4.2; 0.8 × 0.7 × 3 = 1.7; about 4.5 × 0.7 × 3 = 9.5 → **15.5** |
| Capacitor | Weapon T4 · active, hard CC | 16 | Shock the Active, chain 2 to the bench, Root all | (2 + 1.5) + 2 × 2.2 + 0.4 + 0.1 × 2.2 = 8.5 a charge × 2 → **17.0** |
| Silencer | Weapon T4 | 16 | +5 Bullet Power, Spirit Resist 2; swings Silence 2 turns | 5 × 0.7 × 3 = 10.5; 0.5 × 1.9 × 0.5 × 3 = 1.4; 0.78 × 0.7 × 3 = 1.6 → **13.5** |
| Spellslinger | Weapon T4 | 16 | +3 Bullet Power; a skill or ultimate gives Extra Attack 1 | 6.3; (0.6 + 0.25) × 0.7 × 5 × 0.65 × 3 = 5.8 → **12.0** |
| Battle Vest | Vitality T2 | 4 | Bullet Resist 1; +1 Bullet Power above half HP | 0.5 × 1 × 0.5 × 6 = 1.5; 0.7 × 0.7 × 6 = 2.9 → **4.5** |
| Enchanter's Emblem | Vitality T2 | 4 | Spirit Resist 1; +1 Spirit Power above half HP | 1.5; 0.7 × 0.7 × 6 = 2.9 → **4.5** |
| Restorative Locket | Vitality T2 · active | 4 | Heal an ally 1 per stored enemy cooldown; free Retreat | (heal about 3 × 0.5 × 0.8 = 1.2; free Retreat 0.3) × 3 uses → **4.5** |
| Veil Walker | Vitality T3 | 8 | +2 HP; stepping in: heal 2 and Dome | 2 × 0.7 × 4 = 5.6; 0.2 × (2 × 0.5 × 0.6 + 1.0) × 4 = 1.3 → **7.0** |
| Cheat Death | Vitality T4 | 16 | +4 HP, Bullet Resist 2; a lethal hit leaves 1 HP | 4 × 0.7 × 3 = 8.4; 0.5 × 1.8 × 0.5 × 3 = 1.35; 0.25 saves × 3 × 3 = 2.25 → **12.0** |
| Indomitable | Vitality T4 | 16 | +4 HP, both Resists 2; hard CC cleansed, Shield 4 | 8.4; (0.9 + 0.95) × 0.5 × 3 = 2.8; 0.2 × 1.2 × 3 = 0.7; 0.2 × 4 × 0.45 × 3 = 1.1 → **13.0** |
| Juggernaut | Vitality T4 | 16 | +4 HP, no Root, cheaper Retreat, regen 2, shooters −2 | 8.4; 0.1; 0.225 × 3 = 0.7; 2 × 0.5 × 0.6 × 3 = 1.8; 0.5 × 0.6 × 2 × 0.5 × 3 = 0.9 → **12.0** |
| Plated Armor | Vitality T4 | 16 | +5 HP, Bullet Resist 3 | 5 × 0.7 × 3 = 10.5; 0.5 × 2.4 × 0.5 × 3 = 1.8 → **12.5** |
| Spellbreaker | Vitality T4 | 16 | +5 HP, Spirit Resist 2; shorter debuffs; big spirit hits halved | 10.5; 1.4; debuffs 0.3 × 3 = 0.9; 0.3 × 1.5 × 0.5 × 3 = 0.7 → **13.5** |
| Vampiric Burst | Vitality T4 · active | 16 | Active heals 4; Extra Attack 2; +3 Bullet Power | One use: 4 × 0.5 × 0.8 = 1.6; 5 × (0.65 + 0.45) × 0.85 = 4.7; 3 × 2.1 × 0.85 = 5.4; 3 × 0.7 × 0.5 = 1.05 → **12.5** |
| Arcane Surge | Spirit T2 | 4 | Retreat costs 1 less; stepping in: +3 Spirit Power | 0.225 × 6 = 1.35; 0.2 × 0.7 × 3 × 6 = 2.5 → **4.0** |
| Duration Extender | Spirit T2 | 4 | Buffs of 2+ turns on the bearer last 1 longer | 0.5 such buffs × 1.0 × 6 → **3.0** |
| Quicksilver Reload | Spirit T2 | 4 | After a skill: 1 spirit damage, +1 Bullet Power | 0.6 × 1 × 6 = 3.6; 0.6 × 0.7 × 0.85 × 6 = 2.1 → **5.5** |
| Radiant Regeneration | Spirit T3 | 8 | +2 HP; heal 2 after a skill or ultimate | 2 × 0.7 × 4 = 5.6; 0.85 × 2 × 0.5 × 0.6 × 4 = 2.0 → **7.5** |
| Torment Pulse | Spirit T3 | 8 | End of turn: 1 spirit to two enemies | 2 × 1 × 4 → **8.0** |
| Focus Lens | Spirit T4 · active, hard CC | 16 | Silence 2 turns, Spirit Resist −2, a Reverb of 2 | Silence 1.7; resist 2.2; Reverb 4 × 0.65 = 2.6; 6.5 a charge × 2 → **13.0** |
| Lightning Scroll | Spirit T4 | 16 | +2 HP; after an ultimate: 3 to all, Stun the Active | 2 × 0.7 × 3 = 4.2; 0.25 × (3 × 3.2 + 2.0) × 3 = 8.7 → **13.0** |
| Mercurial Magnum | Spirit T4 | 16 | +3 Spirit Power; skills hit 2, swings 1 spirit | 3 × 0.7 × 3 = 6.3; 0.6 × 2 × 3 = 3.6; 0.7 × 1 × 3 = 2.1 → **12.0** |
| Scourge | Spirit T4 · active | 16 | Cleanse an ally, Spirit Resist 3; every enemy takes {sp:2} | One use: (2 + 1.5) × 3.2 = 11.2; 2.6 × 1.5 × 0.5 = 2.0; cleanse 0.5 → **13.5** |
| Spirit Burn | Spirit T4 | 16 | +3 Spirit Power; 3+ hits burn: 3, Bleed 2, no heals | 6.3; 0.42 a turn × (3 + 1.5 + 0.2) × 3 = 5.9 → **12.0** |
| Split Shot *fix* | Weapon T2 · active | 4 | Ricochet 2 → 1 this turn | 2 × 2.2 × 1.1 × 0.85 × 3 uses = 12.3 → **6.0** |
| Kinetic Dash *fix* | Weapon T2 | 4 | Step-in Bullet Power +1 → +3 | 0.2 × 0.85 × 1 × 6 = 1.0 → **3.0** |
| Toxic Bullets *fix* | Weapon T3 | 8 | Bleed 1 → 2 a swing | 1 × 0.75 × 0.7 × 4 = 2.1 → **4.0** |
| Tesla Bullets *fix* | Weapon T3 | 8 | Chain 1 → 2 | 1 × 0.7 × 4 = 2.8 → **5.5** |
| Berserker *fix* | Weapon T3 | 8 | +1 → +2 Bullet Power a hit taken (max +4) | average +1 → +1.8 on its swings: 0.7 × 1 × 4 = 2.8 → **5.0** |
| Heroic Aura *fix* | Weapon T3 · active | 8 | +1 → +2 Bullet Power for every ally | (1.63 + 0.8) × 1.33 = 3.2 → (3.26 + 0.8) × 1.33 → **5.5** |
| Crippling Headshot *fix* | Weapon T4 | 16 | +1 → +2 Bullet Power | 2.1 + 4.2 = 6.3 → **8.5** |
| Frenzy *fix* | Weapon T4 | 16 | +3 HP, its canon health | 2.5 → + 3 × 0.7 × 3 = 6.3 → **9.0** |
| Spiritual Overflow *fix* | Weapon T4 | 16 | +3 Spirit Power, its canon spirit | 1.8 → + 6.3 → **8.0** |
| Bullet Resist Shredder *fix* | Spirit T2 | 4 | Bullet Resist −1 for 1 → 2 turns | 0.7 × 0.15 × 6 = 0.6 → 0.7 × (0.15 + 0.35) × 6 → **2.0** |
| Bullet Resist Shredder *canon verb* (2026-11-17) | Spirit T2 | 4 | Procs on the bearer's skill / spell / ult damage, not its attacks | Deadlock's item: spirit damage lowers Bullet Resist, so a support opens the target for the team's gun. A support's damaging skill or spell lands about every 2 turns: 3 procs in 6 worn turns, each +1 on about 1.1 ally swings → **3.3**. It was 2.0 on the bearer's own swings, a Spirit item that only paid on a gun. Kelvin and Sinclair carry it in place of Spirit Shielding and Mystic Vulnerability |
| Suppressor *fix* | Spirit T2 | 4 | +1 Spirit Power, its canon spirit | 0.9 → + 0.7 × 6 = 4.2 → **5.0** |
| Cold Front *fix* | Spirit T2 · active | 4 | {sp:4} → {sp:2} | (4 + 1.5) × 3 = 16.5 → (2 + 1.5) × 3 → **10.5**. Kept above the band on purpose: it is Kelvin's signature and the tutorial's card, so it keeps a little of its bite ({sp:1} would read 7.5) |
| Superior Duration *fix* | Spirit T3 | 8 | Buffs last 1 → 2 turns longer | 0.6 × 1 × 4 = 2.4 → **5.0** |
| Spirit Snatch *fix* | Spirit T3 | 8 | +1 HP, its canon health | 1.7 → + 0.7 × 4 = 2.8 → **4.5** |
| Reactive Barrier *fix* | Vitality T2 | 4 | Shield 3 → 4 on hard CC | 0.2 × 3 × 0.5 × 0.9 × 6 = 1.6 → **2.0** |
| Healing Nova *fix* | Vitality T3 · active | 8 | Heal all allies 3 → 5 | 3.2 × 3 × 0.5 × 0.4 × 1.33 = 2.6 → **4.5** |
| Dispel Magic *fix* | Vitality T3 · active | 8 | Shield 2 → 4; heal 3 → 4 | (0.9 + 1.1) × 1.33 = 2.7 → (1.8 + 1.3) × 1.33 → **4.0** |
| Healing Tempo *fix* | Vitality T4 | 16 | +2 → +3 Bullet Power | 4.2 + 1.8 = 6.0 → **8.0** (12.6 with its tempo since 2026-11-16) |
| Leech *fix* | Vitality T4 | 16 | +3 HP, its canon health | 2.5 → + 6.3 → **9.0** |
| Inhibitor *fix* | Vitality T4 | 16 | +4 HP, its canon health | 1.0 → + 8.4 → **9.5** |

A *fix* is an existing card the arithmetic put more than a whole tier step off
its price (outside ½–2 × price). One number on it, or a stat line its Deadlock
item has, brings it back within a step.

**Left as they are, though plainly off.**

- **Over:**
  - Extended Magazine and Extra Spirit, 5.6 each.
  - Extra Health, 11.2.
  - Mystic Burst, 4.8.
  - Fleetfoot, 13.7.
  - Golden Goose Egg, 16.4: the fuzz oracle mirrors its 2-soul payout.

  These already sit at the smallest step their number takes.
- **Under:**
  - Disarming Hex 3.0, Metal Skin 2.1, Majestic Leap 2.0.
  - Healbane 0.8, Mystic Slow 0.8, Slowing Bullets 1.1.
  - Enduring Speed 1.6.
  - Bullet Resilience 2.0 and Spirit Resilience 2.0.
  - The single-use tier-4 actives: Echo Shard 2.0, Unstoppable 3.1, Divine
    Barrier 2.3, Ethereal Shift 1.8, Refresher 3.3, Infuser 3.3.
  - Diviner's Kevlar 2.7, Mystic Reverb 1.4, Escalating Exposure 2.8, Siphon
    Bullets 1.5.

  No number on this board's scale reaches half their price. The tier-4 pace,
  three turns worn and one use, prices tier 4 at about 5 souls a turn, and it
  is left for a testing round.

**Folded** (test 2):
- Close Quarters, High-Velocity Rounds and Rapid Rounds into Extended Magazine.
  Close-range damage, +8% weapon damage and +9% fire rate all read "+1 Bullet
  Power" here.
- Point Blank into Weighted Shots: close range is the lane, so it reads "+2,
  Root".
- Lucky Shot into Glass Cannon: a crit with no dice is a damage stat.
- Extra Stamina into Sprint Boots: stamina is the Retreat.

**Skipped:**
- **Melee** (test 1; the board's one attack is the gun): Melee Charge, Crushing
  Fists, Melee Lifesteal, Lifestrike.
- **Parry** (test 1): Rebuttal, Counterspell.
- **Ability charges** (test 1; only hard crowd control has charges, two a match):
  Extra Charge, Rapid Recharge, Recharging Rush. (Since 2026-11-15 four skills
  hold charges: Extra Charge and Rapid Recharge are cards, and Recharging Rush
  is still out. See "Added 2026-11-15: the charge items".)
- **Range and radius** (test 1; targets here are slots): Mystic Expansion,
  Greater Expansion. Cards since 2026-11-16: Patrick gave them a board verb,
  the radius as the board's own neighbours ("Added 2026-11-16: effects from
  the archetype review").
- **Cultist Sacrifice** (test 1): it consumes an NPC for souls. A card since
  2026-11-16 (same section): souls next turn.
- **Witchmail** (test 1): it cuts cooldowns, and what is left is a stat stick.
  A card since 2026-11-16: the Cooldown family made a wait a thing a card may
  move (next section).
- **Trophy Collector** (tests 1 and 3): souls and sprint. A card since
  2026-11-16 (same section): souls each turn while worn.
- **Stamina Mastery** (test 3): stamina and air dashes.
- **Magic Carpet** (test 3): an escape whose board verb, the free Retreat, is
  Majestic Leap's.

**Tier 5** was left for a decision here, and decided in the next section.

**Upgrade chains.**
- New:
  - Sharpshooter ← Long Range
  - Spirit Rend ← Spirit Shredder
  - Weighted Shots ← Slowing Bullets
  - Escalating Resilience ← Extended Magazine
  - Headhunter ← Headshot Booster
  - Capacitor ← Tesla Bullets
  - Radiant Regeneration ← Mystic Regeneration
  - Focus Lens ← Spirit Sap
  - Lightning Scroll ← Mystic Slow
  - Mercurial Magnum ← Quicksilver Reload
  - Indomitable ← Reactive Barrier
  - Juggernaut ← Enduring Speed
  - Spellbreaker ← Debuff Reducer
  - Vampiric Burst ← Bullet Lifesteal
- Existing cards that gained one:
  - Crippling Headshot ← Weakening Headshot
  - Superior Duration ← Duration Extender

No hook, status or targeting rule was added. A swing now tells the attacker's
on-hit gear the damage it dealt (`amount`), so Weakening Headshot and Headhunter
can tell a hit that found its target at full HP.

### Added 2026-11-05: tier 5

The decision: add every suitable item, tier 5 included. The same shop list
carries 17 items at tier 5 and 9,999 souls (the wiki files all 17 under Street
Brawl). The rung is in §2: `PRICE[5]` is 24. The market's random slice draws one
tier-5 item a tab. A tier-5 active cools down 3 own turns, and hard crowd
control keeps its two charges. No tier-5 item has a component, so none has a
chain.

**The budget at tier 5.** A tier-5 item is worn about 2 own turns
([balance-model.md](./balance-model.md) §6).
- **Values:** a permanent +1 stat is worth 1.4. An active that cools down gets
  ⅔ of a use, since it starts on its 3-turn cooldown. A hard crowd-control
  active gets its 2 charges.
- **The card:** it has to earn its 24 with an effect that can decide a late
  match, not with stats: about 12 souls a turn worn. The band is the rule's ¾
  to 1½ × price, 18–36. The other rates are those above.
- **Test 3 at tier 5:** the verb has to carry the price in those two turns, at
  some number on this board's scale. A verb that cannot fails the test.

6 became cards (3 passives, 3 actives) and 11 were skipped.

| Tab | T5 |
|---|---|
| Weapon | 0 · 0 → 2 · 0 |
| Vitality | 0 · 0 → 0 · 1 |
| Spirit | 0 · 0 → 1 · 2 |

134 cards became 140 (95 passives, 45 actives).

| Card | Tab · tier | Price | Effect | Budget (souls) |
|---|---|---|---|---|
| Haunting Shot | Weapon T5 | 24 | Each swing: every enemy loses a third of its HP, crippled | a third of about 9 HP on 3.2 enemies = 9.6; −2 and −2 on their next turn 0.7 + 1.9; no healing 0.6; Root 0.6 → 13.4 a swing × 0.7 × 2 → **19.0** |
| Infinite Rounds | Weapon T5 | 24 | Extra Attack 3 each turn; every swing pierces as Armor Piercer's | extra swings 5 × (0.65 + 0.45 + 0.3) × 0.7 = 4.9; 2.5 into the bench and 0.8 of armour on 0.7 × 2.4 swings = 5.5 → 10.4 a turn × 2 → **21.0** |
| Nullification Burst | Vitality T5 · active, hard CC | 24 | Every enemy: buffs stripped, {sp:1}, no healing, Rooted 2 turns | a charge: buffs about 1 a hero × 3.2 = 3.2; (1 + 1.5) × 3.2 = 8.0; no healing 0.6; Root (0.4 + 0.22) × 2 = 1.2 → 13.0 × 2 charges → **26.0** |
| Frostbite Charm | Spirit T5 | 24 | +4 Spirit Power; its ability hits freeze: Stun, 7 more | 4 × 1.4 = 5.6; 0.7 hits × 2 turns × (7 + Stun 2.0) = 12.6 → **18.0** |
| Mystical Piano | Spirit T5 · active, hard CC | 24 | Stun and Root every enemy hero for 2 turns | a charge: Stun 2 × (2.0 + 1.0 × 2.2) = 8.4; Root 1.2 → 9.6 × 2 charges → **19.5** |
| Prism Blast | Spirit T5 · active | 24 | Your Active turns Unstoppable; {sp:7} to every enemy | a use: (7 + 1.5) × 3.2 = 27.2; Unstoppable 3.1 → 30.3 × ⅔ of a use → **20.0** |

Infinite Rounds pierces as Armor Piercer does. Worn beside Armor Piercer, it
leaves the piercing to that card, so a swing pierces once.

**Skipped:**
- **Test 1** (expressible):
  - Runed Gauntlets: a heavy melee, and its cooldown cut is the Cooldown family's.
  - Shadow Strike: its payoff is a melee attack from stealth.
  - Omnicharge Signet: ability charges. (Since 2026-11-15 charges are a rule,
    and it fails test 3 instead: see "Added 2026-11-15: the charge items".)
  - Eternal Gift: random stats need dice, and its respawn cut is the rules'.
  - Unstable Concoction: a death that cuts its own respawn; without the cut,
    the death hands the rival a kill and a push.
- **Test 3** (meaningful at tier 5):
  - Celestial Blessing: a team heal and cleanse is about 8 a use (a heal is
    half a soul an HP), so about 5 at ⅔ of a use.
  - Cloak of Opportunity: it fires when hard CC lands on the bearer, 0.2 a
    turn, so about 3 in two turns; Indomitable carries its verb at tier 4.
  - Electric Slippers: sliding is movement; its board verb, the step-in, comes
    0.2 a turn.
  - Seraphim Wings: airborne has no board meaning; always on, it is a stat line.
  - Shrink Ray: size and speed; its board verb, Fleetfoot's swing and sprint,
    is about 3.
- **Tests 1 and 3:** Mystic Conduit. Its cooldown and range cuts fail test 1,
  and what is left is a Spirit Power aura, a stat line.

**Builds.** Haze takes Infinite Rounds and Wraith Haunting Shot as the sixth
item, in place of Ricochet. The casters keep the tier-4 upgrade of their
signature as theirs: an upgrade takes no new slot, and a tier-5 card needs one.

### Added 2026-11-15: the charge items

Patrick, 2026-11-15: "Only these kind of items can allow charged skills to get
faster." Four skills held 2 charges that day, three since the counters change
later the same day (Seven's skill is Static Charge, which has no charges in
Deadlock; the budgets below still stand, the three left average 3.6). Skills hold charges since then
([balance-model.md](./balance-model.md) §8), so "a charge" is a board verb now
and the charge items pass test 1. The fuzz oracle mirrors them from their
printed text.

**The rule.** Only the charge items add a charge to a skill. Since 2026-11-16
the Cooldown family brings charges back sooner too (Patrick: "cooldown should
also work for charged skills, because they also regenerate based on CD"): its
turns off add to Rapid Recharge's, never under a wait of 1. Refresher, whose
verb is the reset, still sets a charged skill back to full with the cooldowns
it clears.

Source: the deadlock-api's shop list (`/v1/assets/items/by-type/upgrade`, read
2026-11-15). Both are passive Spirit items, so both are equipment.

| In Deadlock | Extra Charge | Rapid Recharge |
|---|---|---|
| Tab · tier · cost | Spirit T1, 800 | Spirit T3, 3,200, built from Extra Charge |
| Bonus ability charges | +1 | +2 |
| Faster time between charges | none | 30% |
| Cooldown reduction for charged abilities | none | 14% |
| Spirit Power for charged abilities | +7 | +14 |

| Card | Tab · tier | Price | Effect | Budget (souls) |
|---|---|---|---|---|
| Extra Charge | Spirit T1 | 2 | The bearer's charged skill holds 1 more charge | one more cast, once: the four charged skills are worth 2.5 / 3.2 / 4.0 / 4.2, mean 3.5 × 0.85 (some turns the hero's one ability is its ultimate or an item) → **3.0** |
| Rapid Recharge | Spirit T3 | 8 | 2 more charges, and each comes back 1 turn sooner | over its 4 turns worn the hero can cast every turn (2 ready charges, what it held, and one back every 2 or 3 turns) against about 1.8 casts without it (1.3 from the wait, 0.5 held): 2.2 casts × 3.5 × 0.85 → **6.5** |

- **The four skills' worth**, by the rates above: Serrated Knives 1 + Bleed 1 ×
  2 turns × 0.75 = 2.5; Lightning Ball 1 × 3.2 enemies = 3.2; Frost Grenade
  3.2 + a team heal of 1 × 4 heroes × 0.5 × 0.4 = 4.0; Kinetic Pulse 3.2 + a
  Disarm 1.0 = 4.2. (Since 2026-11-17 Frost Grenade is 3✦ on the enemy Active
  and a heal of 3✦ on Kelvin, 3.75 (hero-design.md, Kelvin): the mean moves
  little and the prices stand.)
- **Bands.** Tier 1 is 1.5–3 and Extra Charge sits at its top; tier 3 is 6–12
  and Rapid Recharge sits at its bottom. Both are worth nothing on a hero
  whose skill holds no charges, as in Deadlock, so neither is given more.
- **"1 turn sooner"** is Deadlock's 30% off a wait of 3 or 4 turns: 3 → 2
  (Serrated Knives, Lightning Ball), 4 → 3 (Frost Grenade, Kinetic Pulse). A
  wait never goes under 1.
- **Since 2026-11-16** Kinetic Pulse is history as Lightning Ball is: Dynamo's
  skill is Rejuvenating Aurora, which holds no charges. The charged skills are
  Serrated Knives, Frost Grenade and Assassinate; the prices stand (the mean of
  the skills they serve moves little).
- **A charge an item adds comes ready**, and goes when the item goes. The
  hero records the charges it has spent, so what is left is always what it
  holds less those.
- **Two on one hero do not add up**: the larger applies. Played onto the hero
  wearing Extra Charge, Rapid Recharge costs the difference (6) and takes its
  place.
- **One ability a turn still holds**, so more charges are more turns running,
  never two casts in a turn.
- **The AI** counts a charge item at its budget (3 and 6) on a hero whose
  skill holds charges and at nothing on any other, so it does not put one
  where it does nothing.
- **Left out:** the Spirit Power for charged abilities. A +1 Spirit Power is
  worth 5.6 at tier 1, which would put Extra Charge at three times its price.

**Still skipped.**
- **Recharging Rush** (Weapon T2; "dealing significant weapon damage
  replenishes a charge for each of your charged abilities", on a 25-second
  cooldown). Test 1 now passes: a swing brings a charge back. At one charge a
  swing it gives the Active about 0.5 more casts a turn: 0.5 × 3.5 × 0.85 × 6
  turns worn = 9, over twice its price of 4. Holding it to every other swing
  needs a cooldown on a passive item, which no passive has. It would also be a
  third card that brings charges back. Patrick's call.
- **Omnicharge Signet** (Spirit T5; charges for skills that have none, and 70%
  faster). Test 3 at tier 5: worn 2 turns with one ability a turn, its charges
  are one more cast, about 3.5 against a band of 18–36.

140 cards became 142 (97 passives, 45 actives).

### Changed 2026-11-15: one-play spells, upgrades in the deck, counters

Patrick's review of the whole card list. Four changes, in the order they were
made. Every number was set by reasoning from the budget above; nothing was run
through the sim.

**1. A spell is played once.** An active item is a deck card: played from the
hand for its price, it resolves at once and goes to the discard pile.
- The side's standing Active casts it (its gear reacts to the spell's damage);
  with no Active standing, the first standing bench hero does; with no hero
  standing, no spell can be played.
- It spends no hero's ability, so a hero may still use its skill that turn, and
  a Stun or Silence on the caster does not stop a spell.
- No cooldown, no charges, no slot. The `activate` move is gone: a spell is
  `playCard`.

**2. An upgrade is a deck card like any other.** Playing a card no longer makes
another card and shuffles it into the deck.
- Any item may be in a deck, upgrades too.
- Equipment played onto the hero wearing the **equipment** it is built from
  costs the difference and takes that item's place. Anywhere else it costs its
  price.
- The rule does not reach actives (Patrick): a spell costs its price, and
  equipment built from a spell evolves nothing (Colossus beside Extra Health
  costs 16; Weapon Shielding, built from Grit, costs 4).

**3. Counters.** Patrick: "We want a lot of effects or stuns that resolve after
a turn, so there is room for cards like Counterspell and Debuff Remover."
The principle: a big effect leaves the other side one turn in which to answer
it. Three kinds of effect do, and each has its answer.

| What waits | Example | Answered by |
|---|---|---|
| A delayed debuff: put on now, it goes off after the bearer's next turn | Charged (Seven's Static Charge): Stun 1 turn | Dispel Magic takes it off; Debuff Reducer may; the hero can retreat, and takes the Stun on the bench |
| A channel: an ultimate that pulses over several of its caster's turns | Storm Cloud: 2 turns | A Stun, a Sleep or a hex on the caster ends it at once: Knockdown |
| A card aimed at a hero | any spell, skill or ultimate | Counterspell on that hero: the card does nothing |

| Card | Tab · tier | Price | Effect | Budget (souls) |
|---|---|---|---|---|
| Counterspell *new* | Vitality T3 · spell (Patrick's call) | 8 | One of your heroes gains Counterspell for 2 turns: the next enemy spell, skill or ultimate that would hit it does nothing to it, and it heals 4. It triggers once | one play. The rival sees the shield and spends its cheapest card on it, a skill (about 3) more often than a spell: 3.5, at 0.9 (it is up for two of the rival's turns); heal 4 × 0.5 × 0.9 = 1.8; the turns the rival aims elsewhere instead 0.5 → 5.5, rounded to the band's floor → **6.0** |
| Debuff Reducer *changed* | Vitality T2 · passive | 4 | At the start of your turn: remove 1 random debuff from the bearer | worn 6 turns, a debuff is on the bearer at 0.45 of its turn starts (hard crowd control 0.2, the rest Bleed and resist drops) and the one it removes is worth about 1.5 (a Stun 2.0, a Bleed tick or a resist drop about 1) → 0.45 × 1.5 × 6 → **4.0** |
| Dispel Magic *text* | Vitality T3 · active | 8 | Remove every debuff from one of your heroes, delayed ones too; Shield 4; heal 4 if any was removed | one play: debuffs removed about 2.5 (a Stun 2.0, or a Charge before it goes off, or Bleed 3 for a turn); Shield 4 × 0.5 × 0.9 = 1.8; heal 4 × 0.5 × 0.8 = 1.6 → **6.0** |
| Knockdown *text* | Spirit T3 · active | 8 | Stun enemy Active for 1 turn. A Stun ends a channel | one play: Stun 2.0; against a channel it also takes the rest of the ultimate (Storm Cloud's second pulse is about 11), at 0.2 of plays → 2.2 → **4.0**. Under the band on purpose, see below |

- **Counterspell is a spell by Patrick's call** (2026-11-15: "Counterspell is a
  spell; cast, it applies a magic shield that counters, lasts x turns, and can
  only be triggered once"). It is a passive item in Deadlock (Vitality T3:
  "your next parry protects you from the damage and effects of enemy abilities
  and items", with a heal on a parried spell; deadlock-api, read 2026-11-15),
  so it is an exception to §1 (the only one since the Cooldown family went
  back to equipment on 2026-11-16). It was built
  as equipment first, the same day, and flipped.
  - x is 2: put up on your turn, the shield covers the rival's next two turns
    and is gone as your second turn after begins. One turn would let the rival
    simply wait it out; three adds little, since a rival that can pop it does
    so on the first.
  - The heal is 4 (it was 2 on the equipment, which came back): the heal is
    what lifts a single play to the band.
  - A card aimed at the shielded hero is paid for and wasted, and a card that
    hits every enemy does nothing to that hero and lands on the rest. A swing,
    a proc, a status ticking and a channel's pulse are not cards and pass. Its
    own side's cards pass.
- **Debuff Reducer** shortened debuffs as they landed until this day. Patrick:
  "just remove one of the debuffs randomly." The pick is from the match's own
  random stream, so a game replays. Spellbreaker carries the same line.
- **A channel ends on a Stun**, not only skips a pulse: the rest of the
  ultimate is lost and its wait has started. Silence, Disarm and Root do not
  end one.
- **Seven** is the first hero built to this ([hero-design.md](./hero-design.md)
  §3, §8): Static Charge and a channelled Storm Cloud.
- **Next candidates**, not built: Dynamo's Singularity and Warden's Last Stand
  as channels again; Lash's Death Slam and the Stun spells as delayed Stuns.
  Patrick's call which.

**4. The budget for one play.** Tier-1 and tier-2 actives were priced for 4 and
3 uses, tier-3 for 1.33, and hard crowd control for 2 charges. As one play
they fell under their price, so their numbers went up. Only numbers changed:
no card gained an effect. A card is retuned when one play is worth less than
half its price; the target is the band (¾ to 1½ × price).

| Card | Tab · tier | Price | Was → now | One play (souls) |
|---|---|---|---|---|
| Rusted Barrel | Spirit T1 | **1** | Bullet Power −2 → −1, 2 turns; price 2 → 1 (Patrick) | 1 × 0.5 × (0.85 + 0.85 × 0.5 swings) = 0.64 → **0.5**, half its price: the cheap answer |
| Healing Rite | Vitality T1 | 2 | Heal 2 → 5 | 5 × 0.5 × 0.8 → **2.0** |
| Grit | Vitality T1 | 2 | Shield 2 → 4 | 4 × 0.5 × 0.9 → **2.0** |
| Guardian Ward | Vitality T2 | 4 | Shield 3 → 7 | 7 × 0.5 × 0.9 = 3.15 → **3.0** |
| Split Shot | Weapon T2 | 4 | Ricochet 1 → 2 | 2 × 2.2 bench × 0.85 → **3.5** |
| Slowing Hex | Spirit T2 | 4 | Silence 1 → 2 turns | 1.0 a turn × 2 → **2.0**, half price; 3 turns would shut a hero's whole kit for 4 souls |
| Restorative Locket | Vitality T2 | 4 | Heal 1 + 1 → 2 + 2 a waiting enemy skill | about 2.5 skills wait: 7 × 0.5 × 0.8 = 2.8; free Retreat 0.3 → **3.0** |
| Metal Skin | Vitality T3 | 8 | Bullet Resist 5, 2 turns → 6, 3 turns | a late swing of 5.5 stopped whole: 5.5 × 0.5 × 0.85 × 3 → **7.0** |
| Warp Stone | Vitality T3 | 8 | Bullet Resist 3, 2 turns → 4, 3 turns | swap 1.5; 3.5 off a swing × 0.5 × 0.85 × 3 = 4.5 → **6.0** |
| Blood Tribute | Weapon T3 | 8 | +1 → +3 Bullet Power this turn | Extra Attack 5 × 0.65 × 0.85 = 2.8; +3 on two swings 3 × (0.85 + 0.55) = 4.2; 3 HP paid −1.5 → **5.5** |
| Rescue Beam | Vitality T3 | 8 | The rescued hero heals 4 → 10 | swap 1.5; 10 × 0.5 × 0.8 = 4.0 → **5.5** |
| Fury Trance | Vitality T3 | 8 | Extra Attack 1 → 2; Silenced 2 → 1 turn | 5 × (0.65 + 0.45) × 0.85 = 4.7; Spirit Resist 3 for 2 turns 1.3; its own skill lost a turn −0.6 → **5.5** |
| Colossus | Vitality T4 | 16 | Resists 4 / 4, 2 turns → 5 / 5, 3 turns | (a swing 3.5 × 0.5 × 0.85 + a spirit hit 4 × 0.5 × 0.5) × 3 = 7.5; Root 0.4; was 2 charges → **8.0**, half price |
| Phantom Strike | Vitality T4 | 16 | {sp:2} → {sp:5} | pull 2.0; 5 + 1.5 = 6.5; Disarm 1.0 → **9.5** |
| Focus Lens | Spirit T4 | 16 | Spirit Resist −2 → −3; Reverb 2 → 5 | Silence 2 turns 1.7; −3 on 0.7 spirit hits a turn × 2 × 0.75 = 3.2; Reverb 5 × 0.9 = 4.5 → **9.5** |

- **Left as they are, in the band as one play:** Cold Front 3.5 (it was kept
  above the band at 3 uses), Spirit Sap 2.1, Return Fire 2.5, Fleetfoot 3.5,
  Decay 4.5, Silence Wave 5.0, Dispel Magic 6.0, Healing Nova 4.0, Alchemical
  Fire 10.5, Heroic Aura 4.3, Shadow Weave 4.9, and every tier-4 and tier-5
  active budgeted above for one use (Vampiric Burst, Scourge, Arctic Blast,
  Vortex Web, Capacitor 8.5, Refresher, Prism Blast, Nullification Burst).
- **Golden Goose Egg** was unchanged here: 2 souls back for its 2, and +1 max
  HP for good. Since 2026-11-16 it is the draw card instead (see "Changed
  2026-11-16: the Cooldown family is equipment").
- **Under half their price, and a number alone did not fix them:**
  Knockdown 4.0 of 8, Disarming Hex 2.5 of 8, Majestic Leap 1.5 of 8, Cursed
  Relic 6 of 16, Mystical Piano 9.6 of 24, and the ones that were under before
  this change too: Echo Shard, Ethereal Shift, Divine Barrier, Infuser,
  Unstoppable. On 2026-11-16 each was priced for its one play instead (see
  "Changed 2026-11-16: spells priced for one play" below).

**Removed.** Active Reload (Patrick: "Active Reload may not make too much
sense right now"). Its reload has no board verb; its card was +1 Bullet Power
and a heal of 1 after an attack, which Restorative Shot already is. Haze, Shiv
and Mirage's builds take Swift Striker, Stalker and Mystic Shot in its place,
and Swift Striker is Haze's first signature.

**The Cooldown family: draw x, discard y** — history: equipment again since
2026-11-16 (see "Changed 2026-11-16: the Cooldown family is equipment").
(Patrick, 2026-11-15: "Cooldown
cards are all draw x discard y effect"). Compress, Superior and Transcendent
Cooldown are passive items in Deadlock and spells here, Patrick's exception to
§1: they are the deck's draw cards. Played once now, their old numbers (2 / 1,
4 / 2, 8 / 4, set for a card worn and cast every 2 turns) were under their
price, so x and y are set for one play.

- **What a card is worth: 1.4.** Cards are priced at their value, so a card
  drawn is not worth its price; it is worth what having it changes. Three
  parts: the average card returns about 1.1 × its 3.5 souls, a surplus of 0.4;
  a larger hand lets the souls go to the card that fits the turn, 0.5; and 4
  of a deck's 20 cards are heroes, which cost nothing and are worth far more
  than an item, found a turn or two sooner, 0.5.
- **What a discard costs: 0.3.** The card let go is the worst of the hand, one
  the side would not have had the souls for.

| Card | Tab · tier | Price | Was → now | One play (souls) |
|---|---|---|---|---|
| Compress Cooldown | Spirit T2 | 4 | Draw 2, discard 1 → draw 3, discard 1 | 3 × 1.4 − 0.3 → **4.0** |
| Superior Cooldown | Spirit T3 | 8 | Draw 4, discard 2 → draw 5, discard 1 | 5 × 1.4 − 0.3 = 6.7 → **6.5** |
| Transcendent Cooldown | Spirit T4 | 16 | Draw 8, discard 4 → draw 8, discard 2 | 8 × 1.4 − 0.6 = 10.6 → **10.5**, under its band (12–24) |

- Compress and Superior keep a card for every 2 souls (2 for 4, 4 for 8).
  Transcendent cannot follow: a hand holds 10, so a draw of more than 8 is
  mostly lost, and it keeps 6. Worth 10.5 as one play, it prints a price of
  its own since 2026-11-16, 11 (it was its tier's 16): still the family's top
  end, and still dearer than Superior.
- The ready decks still carry none: at 2 souls a turn their 16 slots do more
  as cards that are played than as cards that find cards. A deck built for a
  long game, or one that needs its heroes early, wants a Compress or two.

142 cards stay 142: Counterspell in, Active Reload out (96 passives, 46
actives, counting Counterspell with the actives it plays as).

### Changed 2026-11-16: spells priced for one play

Patrick, 2026-11-16, on the ten spells worth under half their price as one
play: "They should have reduced cost. Spell should have the benefit of cost
less." So a spell that one play cannot pay for costs less; it does not do
more. (Riders were tried the same day and taken back.)

**The rule.** A spell whose one play is worth under half its tier's price
prints a price of its own: what that play is worth, to the whole soul. Its
tier stays the item's, so the shop still files it where Deadlock does. Two
guards:
- A spell line keeps its order: the later spell still costs more than the
  spell it is built from (Rusted Barrel 1 → Disarming Hex 3, Guardian Ward 4
  → Divine Barrier 5, Superior 8 → Transcendent 11). A spell is never built
  from equipment on the board, so a spell's price is not held against the
  equipment Deadlock builds it from (Debuff Reducer 4 and Unstoppable 3,
  Spirit Lifesteal 4 and Infuser 5).
- Only a number may move with the price, to keep a line in order: Divine
  Barrier's Shield is its component Guardian Ward's 7 (it was 4).

The values are the one-play values above, from the budget in §3; nothing was
played or simulated.

| Card | Tab · tier | Was | Now | One play (souls) |
|---|---|---|---|---|
| Majestic Leap | Vitality T3 | 8 | **2** | a free swap: 1.5 |
| Disarming Hex | Spirit T3 | 8 | **3** | Disarm 2 turns on any enemy: 2.5 |
| Knockdown | Spirit T3 | 8 | **4** | Stun 2.0; a channel it ends, 0.2 × 11 = 2.2 → 4.0 (it was under the band on purpose; now it is priced at it) |
| Echo Shard | Spirit T4 | 16 | **3** | a skill again, about 3.3 (2 to 4.5, [hero-design.md](./hero-design.md) §4) × 0.75 that the Active has one to repeat, and its gear's on-skill proc 0.2 → 2.7 |
| Ethereal Shift | Spirit T4 | 16 | **3** | Dome on the Active: the rival's swing 3.5 × 0.5 = 1.75; +1 Spirit Power × 0.7 × 2 turns = 1.4 → 3.2 |
| Unstoppable | Vitality T4 | 16 | **3** | Unstoppable and Invulnerable for 1 turn: 3.1, as in Prism Blast's row |
| Divine Barrier | Vitality T4 | 16 | **5** | the cleanse but a Stun, 1.5; Shield 7 × 0.5 × 0.9 = 3.2 → 4.7 |
| Infuser | Vitality T4 | 16 | **5** | +3 Spirit Power × 0.7 × 2 turns = 4.2; heal 3 × 0.5 × 0.8 = 1.2 → 5.4 |
| Cursed Relic | Spirit T4 | 16 | **6** | Silence and Disarm 3 turns: 6.0 |
| Mystical Piano | Spirit T5 | 24 | **10** | Stun every enemy hero 2 turns, Root 2: 9.6 |
| Transcendent Cooldown | Spirit T4 | 16 | **11** | draw 8, discard 2: 8 × 1.4 − 0.6 = 10.6 |

- **What it means at the table.** A tier-4 spell can now be played as early
  as a tier-2 card: Echo Shard, Ethereal Shift and Unstoppable at 3 come out
  on the second turn of income. Mystical Piano at 10 lands around turn 5
  instead of turn 12.
- **The ready decks** keep their 8 / 6 / 2 by tier, 56 souls at the tiers'
  prices; one with Knockdown in it (Spirit Storm, Lockdown) costs 4 less.
- **Left at their tier's price:** the spells worth half their price or more
  as one play, Slowing Hex (2.0 of 4) and Colossus (8.0 of 16) at exactly
  half included.

### Changed 2026-11-16: the turn goes on after an attack; Healing Tempo

Patrick: "Healing Tempo should make a hero healed this turn have bonus attack
and zero retreat cost, so Dynamo with Healing Tempo can do a rearrange and
attack combo. Also the turn should not end with the attack: allow attack,
retreat, attack."

**The rule.** Each hero makes one attack a turn, from the Active slot
(`G.attackers`), and the turn goes on after it: abilities, cards from the hand
and the one Retreat are all still open, and the turn ends on the turn button.
With one Retreat a turn a side swings at most twice: attack, Retreat, attack.
The engine, the AI, the board and the fuzz oracle read it the same way
(docs/engine-model.md).
- **What it does to the budget.** A Retreat after the attack now buys the
  incoming hero's swing, so the Retreat's price (0, 1 or 2 souls) is the
  price of a second attack, and what makes a Retreat free (Swift: Fleetfoot,
  Willpower, Healing Tempo; Sprint Boots, Enduring Speed) is worth that much
  more. Their prices are left as they are until Patrick asks for the testing.
- **Left for testing:** match length with two swings a turn; the heroes whose
  printed Retreat is 0 (Wraith, Lash), who make the second swing free every
  turn.

**Healing Tempo** (Vitality T4, 16, built from Healing Booster). Deadlock's
item: "Applying heal to yourself or an ally grants the target bonus fire rate
and bonus move speed. Does not apply on innate Regen or passive Lifesteals."
So it is worn by the healer, and the hero it heals gets the tempo: Dynamo
wears it, and Rejuvenating Aurora hands every hero it heals the turn's swing
and a free Retreat.

| | Was | Now |
|---|---|---|
| Text | +3 Bullet Power. Healing Boost 4. | +3 Bullet Power. Healing Boost 4. A hero the bearer's skill, ultimate or spell heals gets +2 Bullet Power and Swift this turn. |
| Worth | 6.3 + 1.8 = 8.1 | 6.3 + 1.8 + 4.5 = **12.6** |

- **+2 Bullet Power** is the fire rate (35% in Deadlock): +2 on the turn's
  swing, 2.0. **Swift** is the move speed: the hero's next Retreat is free,
  about 1 soul, and with the rule above it is the second swing for nothing.
  A healed turn is worth about 3.0 on the hero it lands on.
- **How often.** On a healer it lands on about half its bearer's own turns
  (Rejuvenating Aurora every 4, Rescue Beam, Healing Rite, Frost Grenade):
  3.0 × 0.5 × the 3 turns a tier-4 item is worn = 4.5. The aurora heals the
  whole side, so on its turn both heroes that swing have the +2.
- **Band.** 12.6 against 16 is inside ¾–1½ × price (12–24), at its bottom;
  the old 8.1 was the half the 2026-11-05 audit put it at.
- **Never on regen, lifesteal or a worn item's heal**, as the item says: only
  a heal the bearer's skill, ultimate or spell made (`onBearerHeals`, fired by
  `healUnit` in a skill, ultimate or spell frame), and only one that restored
  HP. The buff is a status put on for 1, so it lasts until its side's next
  turn begins: a heal on the bearer's own turn is that turn's.
- **Dynamo's default build** takes it in the tier-4 slot (Transcendent
  Cooldown was there): Healing Booster, already in the build, evolves into it.

### Changed 2026-11-16: the Cooldown family is equipment; Golden Goose Egg draws

Patrick: "Cooldown should not be draw cards; they should be equipment to
reduce CD. Goose Egg now should be draw 2."

**The Cooldown family** is Deadlock's passives again, so equipment (§1 has one
exception left, Counterspell). In Deadlock Compress Cooldown takes 18% off one
ability's cooldown, Superior Cooldown 20% off every ability's and Transcendent
Cooldown 25% off abilities and items. Here a wait is 3 or 4 turns for a skill and
4, 6 or 8 for an ultimate, so a share of it is a turn or two:

| Card | Tab · tier | Price | Effect | Worth |
|---|---|---|---|---|
| Compress Cooldown | Spirit T2 | 4 | The bearer's skill waits 1 turn less | **3.0** |
| Superior Cooldown (from Compress) | Spirit T3 | 8 | Skill 1 less, ultimate 2 less | **6.5** |
| Transcendent Cooldown (from Superior) | Spirit T4 | 16 | Skill 2 less, ultimate 3 less | **12** |

- **How it is worth that.** A skill cast is 2–4.5 points (hero-design.md §4),
  about 3; an ultimate cast about 10 (small 4–6 to large 12–18). A tier-2 item
  is worn about 6 own turns, tier 3 about 4, tier 4 about 3.
  - Compress: a wait of 3 → 2 casts 3 times in 6 turns instead of 2: one more
    cast, 3.0 (a wait of 4 → 3 gains less, so it sits at the band's floor, 3).
  - Superior: over 4 turns a skill a turn sooner is about half a cast (1.5),
    and an ultimate 2 turns sooner about half a cast (5): 6.5, inside 6–12.
  - Transcendent: over 3 turns a skill 2 sooner is a cast nearly every turn
    (+1.5 casts, 4.5) and an ultimate 3 sooner most of a cast (7.5): 12, the
    bottom of 12–24. On a small ultimate (4 → 1) it is an ultimate every turn,
    one a turn for the side as always.
- **A charged skill's wait too** (Patrick, the same day: "cooldown should also
  work for charged skills, because they also regenerate based on CD"). A
  charge comes back on the skill's wait, so the turns off bring each charge
  back sooner, and they add to Rapid Recharge's turn sooner (Kelvin's Frost
  Grenade: 4, 3 with Superior, 2 with Rapid Recharge as well). On a charged
  skill an extra charge back is an extra cast, as on any other, so the worth
  above holds; with Rapid Recharge as well it is a cast nearly every turn,
  which is left for testing with the rest.
- **One at a time.** Two on one hero do not add up: the larger applies
  (`cooldownCut` takes the largest), as for the charge items. A wait never goes
  under 1. The ultimate's opening wait at the match's start is the size's: no
  one wears anything yet.
- **Transcendent's price** is its tier's 16 again: the printed 11 was for a
  spell played once (above, "spells priced for one play"); equipment is priced
  by its tier.
- **Left for testing:** an ultimate every turn with Transcendent on a small
  ultimate; whether Compress at a tier-2 price is bought over a stat item.

**Golden Goose Egg** (Spirit T1 spell, 2): "Draw 2 cards." It was 2 souls back
and +1 max HP. A card drawn is worth 1.4 (above, "The Cooldown family"), so 2.8
against its price of 2, the top of its band (1.5–3). Deadlock's egg is an active
(you hatch it), so it stays a spell. Nothing makes a side discard now; the
engine's discard step stays for a card that may want it.

**The ready decks** each carry one Golden Goose Egg (Graveyard two) in a tier-1
slot, and keep Compress Cooldown where at least two of the squad's skills are
shortened by it (docs/deck-plan.md).

### Changed 2026-11-16: a skill counts Spirit twice

The rates above count a Spirit item's bearer landing 0.7 spirit hits a turn,
from when a skill cost souls and could go off every turn or two. Since skills
wait 3 or 4 turns a hero's skill lands about 0.3, so a +1 Spirit Power paid
half what a +1 Bullet Power did. A hero's own skill or passive now counts its
Spirit twice ([balance-model.md](./balance-model.md) §10), which puts a point
of Spirit back near the 0.7 the stat items are priced at. No item's price or
text changes; ultimates and spells (`{sp:}` on a spell adds your Active's
Spirit) count it once.

### Changed 2026-11-16: cards cost half

Patrick: "equipment and spells, they're too expensive." `PRICE` halves to
1 / 2 / 4 / 8 / 12 souls by tier ([balance-model.md](./balance-model.md) §12).
Every budget above is in points and stays: a tier's budget is 2 / 4 / 8 / 16
/ 24 points, and a soul buys two (`SOUL_POINTS`). The tiers stay canon.

The spells priced for one play print their one-play value ÷ 2, to the whole
soul, a spell line still dearer than the spell it is built from:

| Card | Tab · tier | One play (points) | Was | Now |
|---|---|---|---|---|
| Rusted Barrel | Spirit T1 | — | 1 | **1** (its tier's) |
| Majestic Leap | Vitality T3 | 1.5 | 2 | **1** |
| Echo Shard | Spirit T4 | 2.7 | 3 | **1** |
| Disarming Hex | Spirit T3 | 2.5 | 3 | **2** (1.25, but above Rusted Barrel's 1) |
| Knockdown | Spirit T3 | 4.0 | 4 | **2** |
| Ethereal Shift | Spirit T4 | 3.2 | 3 | **2** |
| Unstoppable | Vitality T4 | 3.1 | 3 | **2** |
| Cursed Relic | Spirit T4 | 6.0 | 6 | **3** |
| Divine Barrier | Vitality T4 | 4.7 | 5 | **3** (above Guardian Ward's 2) |
| Infuser | Vitality T4 | 5.4 | 5 | **3** |
| Mystical Piano | Spirit T5 | 9.6 | 10 | **5** |

The ready decks' recipe halves with it: 16 items at most 28 souls, at most two
over 2 (tier 3 and up at its tier's price), none over 8
([deck-plan.md](./deck-plan.md)).

### Changed 2026-11-16: the Duration items stretch crowd control

Patrick: "We should have some items that extend the duration of CC, like
Duration Extender … so we can have a control deck." In Deadlock both items
lengthen everything an ability does, its stuns and roots included; here they
now stretch the crowd control (Stun, Sleep, Root, Silence, Disarm, Rabbit)
their bearer casts on an enemy: from its skill, its ultimate or a spell it
casts. An attack's or an item proc's is not stretched. Debuff Reducer on the
target still takes a turn off after.

| Card | Tab · tier | Price | Text | Value (points) |
|---|---|---|---|---|
| Duration Extender | Spirit T2 | 2 | Buffs on the bearer, and crowd control it casts on an enemy, last 1 turn longer if they last 2 turns or more. | buffs 3.0 as before; the 2-turn kinds (Disarming Hex, Cursed Relic, Mystical Piano, Naptime, Frozen Shelter) about once while worn, the turn added worth 1.0 (Disarm), 2.0 (Sleep, Stun) or 0.4 (Root): 1.2 → **4.2**, its tier's 4 |
| Superior Duration | Spirit T3 | 4 | Buffs on the bearer last 2 turns longer, and crowd control it casts on an enemy 1 turn longer. | buffs 5.0 as before (under its band); a control hero casts crowd control about 1.5 times in its 4 turns worn, each turn added worth about 1.3 (a Stun's 2.0, a Disarm's 1.0, a Root's 0.4): 2.0 → **7.0**, in its band (6–12) |

A 1-turn Stun made 2 is the strongest use: Knockdown, Static Charge, Goo Ball,
Telekinesis, Combo and Singularity on a bearer with Superior Duration. That is
the control deck's payoff and is left for testing.

### Added 2026-11-16: effects from the archetype review

The deck archetypes (Patrick, 2026-11-16) were checked against every card for
the effects they lack; Patrick picked these. None was simulated.

| Card | Tab · tier | Price | Text | Value (points) |
|---|---|---|---|---|
| Mystic Expansion | Spirit T1 (new) | 1 | When the bearer's skill deals damage to one enemy, each enemy next to it on the board takes 1 spirit damage. Lash's Death Slam lifts them too (2026-11-17). | about 2.7 one-enemy damaging casts in its 8 turns worn × 0.8 that a neighbour stands × 1 = **2.2**, its tier's 2 |
| Greater Expansion | Spirit T3 (new, built from it) | 4 | When the bearer's skill deals damage to one enemy, every other enemy takes the same damage. Lash's Death Slam lifts every enemy hero (2026-11-17). | 1.3 casts in 4 turns × 2.2 other enemies standing × about 4 (a Level 2 skill, Spirit counted twice) = **11.4**, the top of its band (6–12) |
| Trophy Collector | Vitality T2 (new) | 2 | Your lane pays 1 more soul a turn while it is worn. Two do not add up. | 6 souls in its 6 turns worn less its 2 = 4 net; souls stop being the limit by mid-match (balance-model.md §12), so about half buys something: 4 × 2 × 0.5 = **4.0** |
| Cultist Sacrifice | Weapon T3 spell (new) | 4 | At the start of your next turn, gain 8 souls. | 8 less its 4 = 4 net; one turn later most of a burst is spent (0.8): 4 × 2 × 0.8 = **6.4**, in its band |
| Silence Wave | Spirit T3 spell | 4 | Deal {sp:2} spirit damage to the enemy Active. The rival plays no spells on its next 2 turns. | 2; a side plays about 0.6 spells a turn at about 3 points: 2 × 0.6 × 3 = 3.6 → **5.6**, half its 8 or more, so its tier's price |
| Vortex Web | Spirit T4 spell | 3 | Pull an enemy bench hero into their Active slot, deal {sp:2} spirit damage to it and Root it for 1 turn. | the pull 2.0 ([hero-design.md](./hero-design.md) §4); the kill it sets up, 3 × 0.5 = 1.5; 2; the Root 0.4 → **5.9**, under half its 16, so it prints 3 (value ÷ 2, above Slowing Hex's 2, the spell it is built from) |

- **Witchmail** (Vitality T4, 8; Patrick: "you have not implemented
  Witchmail"): "+3 Spirit Power. Spirit Resist 3. The bearer's skill waits 1
  turn less, and each spirit hit of 3 or more on it brings the skill back 1
  turn sooner." Canon: Spirit Power, Spirit Resist, a passive cooldown cut, and
  heavy spirit hits cut a cooldown. Worn 3 turns: +3 Spirit Power 3 × 0.7 × 3 =
  6.3; Spirit Resist 3, 2.6 off a spirit hit × 0.5 hits a turn × 3 = 3.9; the
  wait 1 less, Compress Cooldown's verb, 1.5 over 3 turns; about one heavy hit
  in 3 turns, a third of a cast, 1.0 → **12.7**, the bottom of its band
  (12–24). The cut never takes a wait past its last turn, so the turn's tick
  still readies the skill (and returns a charge). Cheat Death was already a
  card (Vitality T4, 2026-11-05).
- **Cheat Death** (Vitality T4, 8; changed 2026-11-16, Patrick: "like a
  Victor ultimate sort of thing, but by cooldown"): "+4 HP. Bullet Resist 2.
  A hit that would fell the bearer leaves it at 1 HP; then Cheat Death waits
  3 turns." It saved from every lethal hit taken at 2 HP or more, so a healer
  could keep its bearer up forever; Deadlock's has a 90-second cooldown. Worn
  3 turns: +4 HP 4 × 0.7 × 3 = 8.4; Bullet Resist 2, 1.8 × 0.5 × 3 = 2.7; a
  front-liner wearing it would fall about once in those turns (0.7), and a
  fall denied is its push (level + 1, about 3) and the bounty (about 3):
  0.7 × 6 = 4.2 → **15.3**, its tier's 16. It is the first item with a wait
  of its own (`AbilityDef.itemWait`, kept on the worn item and counted down
  with its owner's turns); its tile wears the wait as the skills' dial, with
  no number (`ItemWaitDial`).
- **Toxic Bullets** (Weapon T3, 4; changed 2026-11-16, Patrick: "Toxic
  Bullets lets you build up and deal delayed damage … like Mirage's Djinn's
  Mark … the damage should scale with Bullet Power"): "Each attack adds a
  Toxin to the target. The third bursts for {bp:4} bullet damage." Canon:
  bullets build up toxicity, and a full build-up makes the target bleed. The
  Toxin is a build-up status (`burst`): its token draws a circle that fills a
  segment a stack, with no number, as Djinn's Mark's now does. Worn 4 turns:
  about 2.8 swings, so 0.93 bursts × (4 + about 3 Bullet Power) = **6.5**, in
  its band (6–12). (It was Bleed 2 a swing, stacking to 3.)
- **Items carry the heroes' mechanics** (Patrick, 2026-11-16: "items should
  cover the heroes' utility … so if we don't pick that hero we can still build
  that direction"). From the review of every hero kit against the items:
  - **Infuser** (Vitality T4 spell, 4; it was 3): "Your Active gains +3 Spirit
    Power for 2 turns, and its spirit damage in those turns heals it that
    much." Canon: Spirit Power and spirit lifesteal. Mo & Krill's and Warden's
    drains, for anyone. The Infused status heals the Active the spirit damage
    its skill, spell or ultimate deals. One play: +3 Spirit 3 × 0.7 × 2 = 4.2;
    about 7 healed in 2 turns at an aimed heal's 0.8 × 0.5 = 2.8 → 7.0, under
    half its 16, so it prints 4 (its value ÷ 2, rounded up). It was a flat heal
    of 3.
  - **Magic Carpet** (Spirit T4 spell, 3, new): "Your Active is Flying for 2
    turns." Canon: summon a carpet and fly away. Vindicta's Flight for anyone:
    1 hit in 3 on it misses, and its attacks add 1 spirit damage plus its
    Spirit. One play: a third of about 2 hits a rival turn of 3.5 over 2 turns,
    4.7 prevented × 0.5 = 2.3; 2 × 0.85 swings × 2 turns = 3.4 → 5.7, so it
    prints 3.
  - **Not yet** (Patrick): Close Quarters for a bonus on low-HP targets
    (Drifter's Bloodscent, Haze's Fixation).
- **Next to on the board** (Mystic Expansion): the board as it is drawn. A
  side's bench is a row of three slots; its Active stands in the lane in the
  column of one of them (the human seat's under its bench slot 2, the other
  seat's over its slot 0). A hero's neighbours are the slots touching it.
  Where a side puts a hero next to its Active is now a choice.
- **Silence Wave** silenced a hero before (2 turns); it now silences the
  side, Pokémon's item lock. **Vortex Web** hit and rooted every enemy before;
  it is now the cheap pull, Pokémon's Boss's Orders (Phantom Strike does the
  same for 8, with a 5-damage hit).
- **Not built:** Monster Rounds as structure damage. Patrick's version, +1 to
  the structure on every attack, is about 0.7 swings × 8 turns = 5.6
  structure HP for 1 soul; a kill pushes 2 to 4, so it would be worth several
  kills. It waits, as Patrick said structure damage is not needed now.
- **Left for testing** (only when Patrick asks by name): Greater Expansion on
  a high-Spirit caster; two Trophy Collectors' worth of tempo in a deck that
  also runs Cultist Sacrifice; Silence Wave chained 4 times.

### Added 2026-11-17: the step-in items (from the Lash discussion)

Patrick, of five drafts made for Lash's in-and-out play: "I like those". Deadlock's
stamina is its dashes; here the dash is the step into the Active (a Retreat or a
swap, as Kinetic Dash, Arcane Surge and Veil Walker already read it). Two are the
shop's Stamina line; three are Street Brawl items (tier 5 in Deadlock's data, not in
its main shop), each a dash item.

| Card | Tab · tier | Price | Text | Value (points) |
|---|---|---|---|---|
| Extra Stamina | Vitality T1 (new) | 1 | Once every 3 turns, when the bearer steps into the Active slot by a Retreat or a swap: your Retreat is ready again. | a Retreat is a swap, 2; worn about 8 turns with a 3-turn wait, about 2 uses, half of them worth taking: **2**, its tier's |
| Stamina Mastery | Vitality T3 (new, built from it) | 4 | +1 HP. Once a turn, when the bearer steps into the Active slot by a Retreat or a swap: your Retreat is ready again. | +1 HP × 0.7 × 6 turns = 4.2; the Retreat back about one turn in three of 6 worn × 2 = 4: **8.2**, its tier's 8 |
| Seraphim Wings | Vitality T5 (Street Brawl) | 12 | +3 HP. When the bearer steps into the Active slot by a Retreat or a swap: +2 Bullet Power, Bullet Resist 2 and Spirit Resist 2 for 1 turn. | +3 HP × 0.7 × 4 turns = 8.4; about 1 step-in a turn on a hero built for it × (2 on its swing + about 2 kept off two hits) × 4 turns = 16: **24**, a T5's |
| Electric Slippers | Vitality T5 (Street Brawl) | 12 | Once a turn, when the bearer steps into the Active slot by a Retreat or a swap: deal 3 spirit damage to every enemy. | 3 to every enemy (2.5 a point) = 7.5 × about 0.8 step-ins a turn × 4 turns: **24** |
| Shadow Strike | Vitality T5 (Street Brawl) | 12 | +3 HP. When the bearer steps into the Active slot by a Retreat or a swap: it is Shadowed for 1 turn (no attack, spell, skill or ultimate can be aimed at it). | +3 HP 8.4; a rival turn with nothing aimed at it (its swing and a skill, about 4) × 0.8 × 4 turns = 12.8: **21**, under a T5's 24 |

- **The Retreat comes back only if it was spent**, and the item waits only when it
  gives it back. "Once a turn" and "once every 3 turns" are item waits, drawn on the
  item's tile as Cheat Death's is.
- **Electric Slippers waits a turn** so a hero that steps in twice (a Retreat, then
  Lash's Grapple) does not hit everyone twice.
- **Shadowed** is a new status: no enemy attack, spell, skill or ultimate can pick
  the hero. What hits every enemy, or the enemy Active without aiming, still lands.
- **Kinetic Dash and Arcane Surge are built from Extra Stamina**, as in Deadlock. The
  upgrade is what it was (its text unchanged); built onto a hero wearing Extra
  Stamina it costs the difference, 1 soul. The Headshot and Spray decks carry one
  Extra Stamina beside their Kinetic Dash.
- **With Lash** (Grapple: "Leap in from the bench; attack again"): attack, retreat,
  leap, attack, and with Extra Stamina, retreat once more. Echo Shard recasts Grapple
  from the Active: no leap, but his attack is ready again, a third swing with
  Ground Strike's 3✦ (Patrick: "combo with Echo Shard can be even more crazy").
  Left for testing.

## 4. Signature items and default builds

Every hero has two **signature items** (`HeroCard.signature`), chosen to fit its
kit — gun heroes lean Weapon, casters Spirit, tanks Vitality — one of them tier
1 or 2. Both go on sale in any match the hero is drafted into, and so does every
item of its build: the player's saved build for a hero they drafted, the
default build below for the AI's (`src/cards/builds.ts`), so a build set up
before the match can always be bought. A default build starts with the
signatures, then two tier 2, one tier 3 and one tier 4 that fit the kit (a
tier-5 card in place of the tier 4 for a hero whose kit wants a late spike),
six items for three slots: the later ones go on as upgrades of the earlier
where Deadlock builds them so, or into a slot that opens.

| Hero | Signature 1 | Signature 2 | Default build (in order) |
|---|---|---|---|
| Abrams | Healing Booster (passive, Vitality T2) | Fortitude (passive, Vitality T3) | Healing Booster → Fortitude → Bullet Lifesteal → Spirit Shielding → Bullet Resilience → Cheat Death |
| Drifter | Restorative Shot (passive, Weapon T1) | Frenzy (passive, Weapon T4) | Restorative Shot → Frenzy → Bullet Lifesteal → Stalker → Berserker → Leech |
| Dynamo | Compress Cooldown (passive, Spirit T2) | Rescue Beam (active, Vitality T3) | Compress Cooldown → Rescue Beam → Healing Booster → Duration Extender → Superior Cooldown → Healing Tempo (was Transcendent Cooldown until 2026-11-16) |
| Haze | Swift Striker (passive, Weapon T2) | Burst Fire (passive, Weapon T3) | Swift Striker → Burst Fire → Titanic Magazine → Intensifying Magazine → Toxic Bullets → Infinite Rounds |
| Kelvin | Cold Front (active, Spirit T2) | Knockdown (active, Spirit T3) | Cold Front → Knockdown → Improved Spirit → Bullet Resist Shredder → Silence Wave → Arctic Blast |
| Lady Geist | Mystic Vulnerability (passive, Spirit T2) | Spirit Snatch (passive, Spirit T3) | Mystic Vulnerability → Spirit Snatch → Improved Spirit → Spirit Lifesteal → Decay → Escalating Exposure |
| Lash | Kinetic Dash (passive, Weapon T2) | Arcane Surge (passive, Spirit T2) | Kinetic Dash → Arcane Surge → Improved Spirit → Enduring Speed → Veil Walker → Boundless Spirit (2026-11-17: his damage is the swing the turn he steps in, so the step-in items; it was Mystic Slow → Tankbuster → Improved Spirit → Suppressor → Decay → Lightning Scroll, for a skill hit he no longer deals) |
| Mirage | Fleetfoot (active, Weapon T2) | Tesla Bullets (passive, Weapon T3) | Fleetfoot → Tesla Bullets → Mystic Shot → Spirit Shredder → Toxic Bullets → Ricochet |
| Mo & Krill | Spirit Lifesteal (passive, Vitality T2) | Bullet Resilience (passive, Vitality T3) | Spirit Lifesteal → Bullet Resilience → Guardian Ward → Weapon Shielding → Metal Skin → Plated Armor |
| Paige | Guardian Ward (active, Vitality T2) | Dispel Magic (active, Vitality T3) | Guardian Ward → Dispel Magic → Healing Booster → Restorative Locket → Healing Nova → Divine Barrier |
| Rem | Extra Spirit (passive, Spirit T1) | Healing Nova (active, Vitality T3) | Extra Spirit → Healing Nova → Improved Spirit → Healing Booster → Superior Duration → Boundless Spirit |
| Seven | Spirit Sap (active, Spirit T2) | Surge of Power (passive, Spirit T3) | Spirit Sap → Surge of Power → Compress Cooldown → Improved Spirit → Superior Cooldown → Focus Lens |
| Shiv | Slowing Bullets (passive, Weapon T2) | Berserker (passive, Weapon T3) | Slowing Bullets → Berserker → Stalker → Titanic Magazine → Weighted Shots → Crippling Headshot |
| Silver | Monster Rounds (passive, Weapon T1) | Bullet Lifesteal (passive, Vitality T2) | Monster Rounds → Bullet Lifesteal → Swift Striker → Kinetic Dash → Berserker → Frenzy |
| Sinclair | Slowing Hex (active, Spirit T2) | Disarming Hex (active, Spirit T3) | Slowing Hex → Disarming Hex → Improved Spirit → Bullet Resist Shredder → Silence Wave → Vortex Web |
| Victor | Extra Health (passive, Vitality T1) | Torment Pulse (passive, Spirit T3) | Extra Health → Torment Pulse → Spirit Lifesteal → Spirit Shielding → Fortitude → Leech |
| Vindicta | Long Range (passive, Weapon T2) | Sharpshooter (passive, Weapon T3) | Long Range → Sharpshooter → Titanic Magazine → Opening Rounds → Toxic Bullets → Crippling Headshot |
| Viscous | Reactive Barrier (passive, Vitality T2) | Spirit Resilience (passive, Vitality T3) | Reactive Barrier → Spirit Resilience → Debuff Reducer → Improved Spirit → Fortitude → Indomitable |
| Warden | Weapon Shielding (passive, Vitality T2) | Metal Skin (active, Vitality T3) | Weapon Shielding → Metal Skin → Bullet Lifesteal → Enduring Speed → Fortitude → Juggernaut |
| Wraith | Spirit Strike (passive, Spirit T1) | Spiritual Overflow (passive, Weapon T4) | Spirit Strike → Spiritual Overflow → Mystic Shot → Spirit Lifesteal → Spirit Snatch → Haunting Shot |
| Yamato | Extended Magazine (passive, Weapon T1) | Shadow Weave (active, Weapon T3) | Extended Magazine → Shadow Weave → Titanic Magazine → Kinetic Dash → Heroic Aura → Glass Cannon |
