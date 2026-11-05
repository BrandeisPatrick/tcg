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
[deadlock-api.com](https://deadlock-api.com/) shop list
(`https://api.deadlock-api.com/v1/assets/items/by-type/upgrade`; skip entries
that are `disabled` or not `shopable`), or the item's page on the
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
  3200 / 6400 / 9999 souls → T1 / T2 / T3 / T4 / T5), and its price is the
  tier's: `PRICE` = 2 / 4 / 8 / 16 / 24 souls (an upgrade bought while its
  component is on your side costs the difference). Tiers 1–4 are 2 × cost ÷
  800; tier 5 is 24 rather than 25, 1.5 × tier 4 as 9,999 is 1.56 × 6,400, so
  an upgrade over a tier-4 component costs a whole 8 and a half-price sale
  refunds a whole 12. An early, cheap card comes from a cheap item.
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
| Suppressor *fix* | Spirit T2 | 4 | +1 Spirit Power, its canon spirit | 0.9 → + 0.7 × 6 = 4.2 → **5.0** |
| Cold Front *fix* | Spirit T2 · active | 4 | {sp:4} → {sp:2} | (4 + 1.5) × 3 = 16.5 → (2 + 1.5) × 3 → **10.5**. Kept above the band on purpose: it is Kelvin's signature and the tutorial's card, so it keeps a little of its bite ({sp:1} would read 7.5) |
| Superior Duration *fix* | Spirit T3 | 8 | Buffs last 1 → 2 turns longer | 0.6 × 1 × 4 = 2.4 → **5.0** |
| Spirit Snatch *fix* | Spirit T3 | 8 | +1 HP, its canon health | 1.7 → + 0.7 × 4 = 2.8 → **4.5** |
| Reactive Barrier *fix* | Vitality T2 | 4 | Shield 3 → 4 on hard CC | 0.2 × 3 × 0.5 × 0.9 × 6 = 1.6 → **2.0** |
| Healing Nova *fix* | Vitality T3 · active | 8 | Heal all allies 3 → 5 | 3.2 × 3 × 0.5 × 0.4 × 1.33 = 2.6 → **4.5** |
| Dispel Magic *fix* | Vitality T3 · active | 8 | Shield 2 → 4; heal 3 → 4 | (0.9 + 1.1) × 1.33 = 2.7 → (1.8 + 1.3) × 1.33 → **4.0** |
| Healing Tempo *fix* | Vitality T4 | 16 | +2 → +3 Bullet Power | 4.2 + 1.8 = 6.0 → **8.0** |
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
  Extra Charge, Rapid Recharge, Recharging Rush.
- **Range and radius** (test 1; targets here are slots): Mystic Expansion,
  Greater Expansion.
- **Cultist Sacrifice** (test 1): it consumes an NPC for souls.
- **Witchmail** (test 1): it cuts cooldowns, and what is left is a stat stick.
- **Trophy Collector** (tests 1 and 3): souls and sprint.
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
  - Omnicharge Signet: ability charges.
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
| Dynamo | Compress Cooldown (passive, Spirit T2) | Rescue Beam (active, Vitality T3) | Compress Cooldown → Rescue Beam → Healing Booster → Duration Extender → Superior Cooldown → Transcendent Cooldown |
| Haze | Active Reload (passive, Weapon T2) | Burst Fire (passive, Weapon T3) | Active Reload → Burst Fire → Titanic Magazine → Intensifying Magazine → Toxic Bullets → Infinite Rounds |
| Kelvin | Cold Front (active, Spirit T2) | Knockdown (active, Spirit T3) | Cold Front → Knockdown → Improved Spirit → Spirit Shielding → Silence Wave → Arctic Blast |
| Lady Geist | Mystic Vulnerability (passive, Spirit T2) | Spirit Snatch (passive, Spirit T3) | Mystic Vulnerability → Spirit Snatch → Improved Spirit → Spirit Lifesteal → Decay → Escalating Exposure |
| Lash | Mystic Slow (passive, Spirit T2) | Tankbuster (passive, Spirit T3) | Mystic Slow → Tankbuster → Improved Spirit → Suppressor → Decay → Lightning Scroll |
| Mirage | Fleetfoot (active, Weapon T2) | Tesla Bullets (passive, Weapon T3) | Fleetfoot → Tesla Bullets → Active Reload → Spirit Shredder → Toxic Bullets → Ricochet |
| Mo & Krill | Spirit Lifesteal (passive, Vitality T2) | Bullet Resilience (passive, Vitality T3) | Spirit Lifesteal → Bullet Resilience → Guardian Ward → Weapon Shielding → Metal Skin → Plated Armor |
| Paige | Guardian Ward (active, Vitality T2) | Dispel Magic (active, Vitality T3) | Guardian Ward → Dispel Magic → Healing Booster → Restorative Locket → Healing Nova → Divine Barrier |
| Rem | Extra Spirit (passive, Spirit T1) | Healing Nova (active, Vitality T3) | Extra Spirit → Healing Nova → Improved Spirit → Healing Booster → Superior Duration → Boundless Spirit |
| Seven | Spirit Sap (active, Spirit T2) | Surge of Power (passive, Spirit T3) | Spirit Sap → Surge of Power → Compress Cooldown → Improved Spirit → Superior Cooldown → Focus Lens |
| Shiv | Slowing Bullets (passive, Weapon T2) | Berserker (passive, Weapon T3) | Slowing Bullets → Berserker → Active Reload → Titanic Magazine → Weighted Shots → Crippling Headshot |
| Sinclair | Slowing Hex (active, Spirit T2) | Disarming Hex (active, Spirit T3) | Slowing Hex → Disarming Hex → Improved Spirit → Mystic Vulnerability → Silence Wave → Vortex Web |
| Vindicta | Long Range (passive, Weapon T2) | Sharpshooter (passive, Weapon T3) | Long Range → Sharpshooter → Titanic Magazine → Opening Rounds → Toxic Bullets → Crippling Headshot |
| Viscous | Reactive Barrier (passive, Vitality T2) | Spirit Resilience (passive, Vitality T3) | Reactive Barrier → Spirit Resilience → Debuff Reducer → Improved Spirit → Fortitude → Indomitable |
| Warden | Weapon Shielding (passive, Vitality T2) | Metal Skin (active, Vitality T3) | Weapon Shielding → Metal Skin → Bullet Lifesteal → Enduring Speed → Fortitude → Juggernaut |
| Wraith | Spirit Strike (passive, Spirit T1) | Spiritual Overflow (passive, Weapon T4) | Spirit Strike → Spiritual Overflow → Mystic Shot → Spirit Lifesteal → Spirit Snatch → Haunting Shot |
| Yamato | Extended Magazine (passive, Weapon T1) | Shadow Weave (active, Weapon T3) | Extended Magazine → Shadow Weave → Titanic Magazine → Kinetic Dash → Heroic Aura → Glass Cannon |
