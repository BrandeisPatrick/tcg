# Balance Model — design philosophy

**Status, 2026-11-05.** The item numbers were set, or checked and left, by
reasoning on 2026-11-05, from the item budget in
[card-design.md](./card-design.md) §3; no sim ran. The sim gates
(`scripts/balance-sim.ts`: seat 50 ± 3, every hero 45–55, a mean of 8–10 own
turns, no item in over 40% of builds, the Mid-Boss contested) have not been run
against this 142-card catalogue. The testing round runs on request
([CLAUDE.md](../CLAUDE.md)).

**2026-11-15.** The lane's income went from 5 souls a turn to 2, and a kill
pays a bounty that grows with the rounds (§7). Both were set by reasoning; no
sim ran.

The north star for hero/card balance. Read this before tuning stats. Companion
docs: [stats-model.md](./stats-model.md) (status/duration mechanics),
[ultimate-design.md](./ultimate-design.md) (canon → ult effects).

## 1. No role caps — open builds

Heroes are **not** locked into an archetype. Like Deadlock proper (Weapon /
Spirit / Vitality itemization), each hero has a **natural lean** from its base
stats + signature, but the player develops it in any direction. **Abrams is
naturally a tank, yet can be itemized/leveled into a spirit caster.** Base stats
are a *bias, never a ceiling.*

Mechanically guaranteed by:
- **attack = bullet, skill = spirit** — two damage avenues on every hero. Each
  hero uses one ability a turn (its skill, an active item or its ultimate), and
  the Active also makes its side's one attack; a bench hero can only cast.
- **Every hero gains +1 HP / +1 BP / +1 Spirit per level** (`expSystem.ts`), and
  **every damaging skill *and* ultimate scales with the caster's Spirit** — so
  Spirit investment turns any hero into a caster (even passive/tank heroes, via
  their ult).
- Equipment provides Weapon / Spirit / Vitality build paths usable by anyone.

## 2. Phase curve (what the game should feel like)

| Phase | Turns | Feel |
|---|---|---|
| Early | 1–3 | Heroes are hard to kill; fights rarely resolve before ~turn 2–3. |
| Mid | 4–6 | Heroes trade and skirmish. |
| Late | 8+ | Snowball — kill multiple, or consistently kill and survive to push down the Patron. |

**Durability target:** a fresh Lv1 hero takes **~3 turns** to kill under normal
play, **~2** if the opponent commits hard (skill + spell + attack). Exposed
squishies die faster — that's positioning, not a stat problem.

**How the curve is produced (not by special-casing turns):**
- **Low Lv1 offense.** Base BP is 1–2 and base skill damage 1–2 (a Lv1 caster
  can't one-shot a fresh hero). Souls come 2 a turn (§7); since prices halved
  (§12) a tier 1 is half a turn's income, a tier 2 one turn's, a tier 3 two
  and a tier 4 four, less what kills pay.
- **Scaling outpaces HP late.** +1 BP / +1 Spirit per level plus Spirit/Weapon
  items push damage past the +1 HP/level growth, so TTK falls to ~1 and a leveled
  hero's attack **and** skill can kill two targets.

## 3. Damage types & counterplay

- **Bullet** (attacks) is countered by **Bullet Resist**; **Spirit** (skills/most
  ults) by **Spirit Resist**. Stacking one resist is a real counter, so **mixed
  damage teams/builds are rewarded.**
- **Wraith** is the intentional hybrid — attacks split bullet/spirit to pierce a
  single-type resist.
- Resist is a build axis too (Vitality): a tank stacking the matching resist hard-
  counters a mono-damage attacker.

## 4. Lanes — front tank / back caster (emergent, not enforced)

Only the **Active** hero attacks and soaks damage for the team (a fallen hero pays
the killer's side the round's bounty and pushes its level + 1 into its side's
structures; damage past 0 HP is not spilled).
So a natural strategy is: park a **Vitality build** (high HP + regen, e.g. Abrams,
Mo & Krill) Active to absorb, while **Spirit builds** sit on the bench and cast.
This is strategy enabled by the rules, **not** a hard class — any hero can be put
in any seat.

## 5. Current stat anchors (V1)
- Each side's track: Guardian **4** → Walker **6** → Patron **8**; the Patron
  falling loses. A death pays the killer's side the round's bounty, **1 to 6**
  souls (§7), and pushes the victim's **level + 1** into the victim's track
  (doubled from round 9); the fallen hero goes back to the hand after **2** own
  turns.
- **Earn it in the lane:** the Active earns 2 exp at the end of its turn, a
  bench hero 1; +1 on equip, +2 on a kill blow (5 / 7 / 9 to level). A hero's
  ultimate unlocks at Level 3 (Level 2 until 2026-11-16, §11) — the
  front-liner earns it first, a bench caster late — so ults arrive one at a time.
- Base HP: squishy **4**, bruiser **6**, anchor tank **7**. Base BP: caster/support
  **1**, attacker/bruiser **2**, tank **1**.
- Base skill damage **1–2**; heals/shields flat (Spirit scales **damage** only).
- Leveling **+1/+1/+1** (HP/BP/Spirit) per level, cap Lv4.

## 6. Tier 5 in the item budget

The item budget ([card-design.md](./card-design.md) §3, 2026-11-05) wears an
item 8 / 6 / 4 / 3 own turns at tiers 1–4. A tier-5 item (24 souls) is worn for
about 2 own turns, so a permanent +1 stat is worth 1.4 there; a tier-5 card has
to earn its 24 with an effect that decides a late match (a second attack, a
revive, a wipe of statuses, a structure push), not with stats.

## 7. The bank (2026-11-15)

Patrick, 2026-11-14 and 15: each turn pays one unit, as Pokémon TCG Pocket
gives one Energy a turn; souls are a bank ("you can choose to spend it or not
spend it"); a kill is "not worth much at the very beginning and worth a lot at
the very later"; "keep it simple using simple numbers". No sim ran.

**The lane pays 2 souls a turn** (`LANE_INCOME`; it was 5): the price of one
tier-1 item. Every printed price stays: items 2 / 4 / 8 / 16 / 24 (halved
on 2026-11-16, §12), skills 2 or
3, ultimates 4 / 8 / 12, Retreat 0–2. A side may still play as many cards in a
turn as its souls pay for.

- **The bank asks a question now.** The decks dealt from builds for five
  sample squads cost 50–76 souls for their 16 items. By own turn 9 a side has
  drawn 13 of the 19 cards behind its first Active, about 11 items and about
  41 souls of them. At 5 a turn the lane had paid 45 by then, so nearly every
  item drawn was bought. At 2 a turn it pays 18, and four kills (rounds 3, 5,
  6 and 8) about 12 more: about 30 against the same 41, with skills and
  ultimates on top.
- **Items land when the item budget assumes.** The budget wears an item
  8 / 6 / 4 / 3 / 2 own turns at tiers 1–5 ([card-design.md](./card-design.md)
  §3), which in a 9–10-turn match is a purchase around turn 1–2, 3–4, 5–6, 6–7
  and 8. The first turn a side that saves everything can pay for one item:

  | Tier | Price | At 5 a turn | At 2, lane only | At 2, with kills |
  |---|---|---|---|---|
  | 1 | 2 | 1 | 1 | 1 |
  | 2 | 4 | 1 | 2 | 2 |
  | 3 | 8 | 2 | 4 | 3–4 |
  | 4 | 16 | 4 | 8 | 6–7 |
  | 5 | 24 | 5 | 12 | 9–10 |

  At 5 a turn a tier-4 item could land on turn 4 and be worn twice the three
  turns it is priced for.
- **What souls buy.** The deck's cards and a Retreat, nothing else: since §8
  (the same day) a skill and an ultimate cost no souls. Before §8 a skill's 2
  or 3 souls were a whole turn of the lane or more and an ultimate's 4 / 8 /
  12 were two, four or six turns of it; §8's waits start from those figures.

**A kill pays a bounty** (`KILL_BOUNTY_STEP_ROUNDS`; `bountyAtRound`,
rounds.ts): 1 soul, and 1 more every two rounds.

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A kill pays | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 6 |

- **The shape is Deadlock's.** Its bounty is 200 souls plus 50 a minute, to
  2,200 at 40 minutes ([mechanics-survey.md](./mechanics-survey.md) §3): a
  quarter of a tier-1 item at the start, 2¾ at the cap. Here it is half a
  tier-1 item in rounds 1–2 and three in rounds 11–12. It equals a turn of
  the lane in rounds 3–4 and passes it from round 5.
- **It is the round's, not the victim's.** One number, printed on the bank
  sheet. There is no bonus for the richest hero. It goes to the side the hero
  fell to, whatever dealt the blow; a kill the Rejuvenator undoes still pays;
  a fall to the Mid-Boss pays nothing.
- **It reverses 2026-11-08's "kills pay none, so the side ahead cannot
  snowball".** The early bounty is small on purpose. The late one is the
  phase curve's snowball (§2), on top of the pushes that double from round 9.
- **Expected souls by own turn 9**, the lane's 18 included: a side with kills
  in rounds 3, 5, 6, 8 and 9 has earned 35; a side with kills in rounds 4, 7
  and 9 has earned 29. Each had 45 before.

**The bank sheet** (`bankForecast`, bank.ts; `SoulsCounter`): a tap on your
souls, or a mouse over them, shows what the next turn pays, what you will hold
then with nothing spent, and what a kill pays now.

**Story.** The opponent's war chest is 1 soul a depth, +2 for an elite and +3
for a boss (it was 2 a depth, +4, +8): the same share of a fight's lane
income, ×2⁄5 rounded to whole souls. Supply purses stay 4 / 8 / 12; each is
priced as the item tier it stands in for.

**The AI saves** (`savingGoal`, `savingCost`, src/ai/heuristic.ts; Patrick,
2026-11-15: "the AI does not save… this needs to be solved"). At 2 souls a
turn a one-ply look always finds something small to spend them on, so a
dearer card was never reached, nor the upgrades its play makes.
- **The goal** is the card of the highest tier in its hand, tier 2 or more,
  that a hero of its can take and that it can pay for within 3 turns of
  income (an upgrade onto the hero wearing its component counts at the
  difference). The higher tier comes first because the item budget gives it
  more for each soul and turn worn: 2 points over 8 turns at tier 1, 4 over 6
  at tier 2, 8 over 4 at tier 3, 16 over 3 at tier 4.
- **A spend that pushes the goal's turn back is marked down by 12** in the
  AI's evaluation, once, however many turns it costs. That is above an
  ordinary spend (a tier-1 card is worth 2 to 6 there) and below a decisive
  one (a kill is 25 or more). So it holds its souls against cheap cards and
  Retreats, and still pays for a Retreat that wins a kill. Skills and
  ultimates cost no souls (§8), so saving never holds them back.
- **Tier 1 is not saved for**: it is one turn's income. With no tier-2 or
  dearer card in reach the AI spends as the look says.

**Left for a testing round.**
- How the saving AI plays over many matches: how often it reaches tier 3 and
  4.
- Everything in §8: the waits, the charges and the charged ultimates' 10 and
  8 are reasoned, not played.
- Golden Goose Egg's 2 souls a use was a whole turn of the lane every other
  turn. (Since 2026-11-16 it draws 2 cards instead: card-design.md.)
- Match length. The one seeded AI match the tests replay (seed 12) ended in
  round 7 where it ran to the round cap before. That is one match, not a
  measurement.
- Deck copies stay at 4. Pocket's rule is 2; it is Patrick's call.

## 8. Kits cost no souls: waits, charges, one ultimate a turn (2026-11-15)

Patrick, 2026-11-15: "Spell and equipment both have cost. Ultimate does not
have cost, and only one ultimate can be played per turn. Skills have CD. Some
skills can be charged: they have CD, but multiple charges."

So souls buy the deck's cards and a Retreat, and a hero's kit is paid for in
turns. Every number below is set by reasoning from what the kit cost in souls
the same morning (§7). None has been played or simulated.

| | Before (§7) | Now |
|---|---|---|
| Skill | 2 or 3 souls, ready next turn | no souls; waits 3 or 4 turns |
| Charged skill | none | 2 uses; the wait returns one at a time |
| Ultimate | 4 / 8 / 12 souls, waits 3 | no souls; waits 4 / 6 / 8, from turn 1 too; one a turn for a side |
| Charged ultimate | 20 or 16 souls, 1 less a damage | no souls; ready at 10 taken (Victor) or 8 dealt (Silver), then waits 6 |

**Skills** (`SKILL_COOLDOWN` 3; `cooldown: 4` on five).
- **The wait is the old price plus 1.** The ten skills that cost 2 souls wait
  3 turns. The five that cost 3 (The Cube, Ground Strike, Kinetic Pulse (Rejuvenating Aurora since 2026-11-16), Frost
  Grenade, Rabbit Hex: area damage with a rider, or a turn denied) wait 4.
- **Why that holds the rate.** At 2 souls a turn a 2-soul skill took a whole
  turn of the lane, so a side that bought nothing cast one skill a turn at
  the most. A squad has about three skill heroes (15 of the 21 heroes have a
  skill). Three skills on a wait of 3 are three casts in three turns: the same
  one a turn. The one turn over the price in turns of income is for the items
  the casts no longer compete with.
- **What it adds.** A hero casts on its turns 1, 4, 7 and 10 (wait 3) or 1, 5
  and 9 (wait 4). A skill is worth 2 to 4.5 points
  ([hero-design.md](./hero-design.md) §4), so 3 to 4 casts are 6 to 13 points
  a match for no souls, about a tier-3 item on every skill hero. Both sides
  get it, so it shortens matches; it does not favour a seat by itself.
- **The burst.** A wait limits a hero, not a side: four heroes whose skills
  are all ready may cast four in a turn. Heroes come out of the deck over the
  first turns, so their waits start apart, and a side has to hold skills back
  to line them up, as it had to bank souls before.

**Charged skills** (`AbilityDef.charges`; `CardInstance.chargesSpent`). A
charged skill holds 2 uses. Each use spends one, and the wait brings them
back one at a time, the next wait starting when the last ends. The hero still
uses one ability a turn, so two charges are two turns running, not two casts
in a turn.
- **Which.** The skills of this roster that hold charges in Deadlock
  (deadlock-api `v1/assets/items/by-type/ability`, read 2026-11-15). Three
  since the counters change of the same day: Seven's skill became Static
  Charge, which holds none, so Lightning Ball's row is history:

  | Skill | Hero | In Deadlock | Here |
  |---|---|---|---|
  | Serrated Knives | Shiv | 2 charges from the first point | 2 charges, 3 turns each |
  | Frost Grenade | Kelvin | 2 charges from the first point | 2 charges, 4 turns each |
  | Lightning Ball | Seven | +1 charge at its first upgrade | (2 charges, 3 turns each, until Static Charge replaced it) |
  | Kinetic Pulse | Dynamo | +1 charge at its first upgrade | (2 charges, 4 turns each, until Rejuvenating Aurora, which holds none, replaced it on 2026-11-16) |
  | Assassinate | Vindicta | 2 charges, her longest cooldown | 2 charges, 5 turns each (her skill since 2026-11-16; it was her ultimate) |

  Yamato's Flying Slash gains a charge only at its third upgrade, so it is
  not charged here. Vindicta's Assassinate has 2 charges and is an ultimate:
  one ultimate a turn already paces it.
- **What a charge is worth.** Over a match the rate is the same one cast a
  wait. The second charge is one extra cast, early, and the choice of when:
  the skill's own 2 to 4.5 points once. These skills keep their text and
  numbers; the extra cast is the charge's whole price.

**The charge items** (Patrick, 2026-11-15: "only these kind of items can
allow charged skills to get faster"). Extra Charge (Spirit T1) gives the
bearer's charged skill 1 more charge. Rapid Recharge (Spirit T3, built from
it) gives 2 more and brings each back 1 turn sooner. Nothing else adds a
charge. Since 2026-11-16 the Cooldown family (equipment again) shortens a
charged skill's wait as it does any other, its turns off added to Rapid
Recharge's (Patrick: charges "also regenerate based on CD"). The cards and their budget are in
[card-design.md](./card-design.md) ("Added 2026-11-15: the charge items").

**Ultimates** (`ULT_WAIT`: small 4, medium 6, large 8; `G.ultUsed`).
- **The wait is the old price in turns of the lane, plus 2.** 4 / 8 / 12
  souls were 2 / 4 / 6 turns of income with nothing else bought. Two more
  turns stand for the items the same souls had to buy: a side that kept
  buying could not reach a large ultimate before turn 8 or so.
- **It opens the match on its wait**, as an active item starts on its
  cooldown. A small ultimate is first ready on its side's turn 4, a medium one
  on turn 6 and a large one on turn 8, with its hero at Level 2
  (`ULT_UNLOCK_LEVEL`). Without the opening wait Seven's Storm Cloud (5 spirit
  damage to every enemy) would be free on the turn Seven reached Level 2.
  Large ultimates arrive with the late game's doubled pushes (round 9, §2).
- **Uses in a 9–10-turn match:** small twice (turns 4 and 8), medium once
  (turn 6; again on 12, past the cap), large once (turn 8). At their §4 worth
  (small 4–6, medium 8–12, large 12–18) that is 8–12, 8–12 and 12–18 points a
  match: the sizes stay in order.
- **One ultimate a turn for a side** is Patrick's rule. Four heroes at Level
  2 on turn 6 would otherwise fire four medium ultimates at once, which souls
  used to forbid. With it they come one a turn, turns 6 to 9.

**Charged ultimates** (`UltimateCard.charged`).
- **The damage needed is half the old soul price:** Victor 10 taken (was 20
  souls), Silver 8 dealt (was 16). The old price fell 1 a damage and the
  budget priced these at twice their worth, so half the price was the point
  where the damage had paid for it.
- Victor has 9 HP at Level 2 and his Aura of Suffering deals him 1 a turn: 10
  taken is his first life and a turn of the Aura. He rises on half HP, which
  is under 10, so a second rising needs healing in between.
- Silver hits for 2 at Level 1 and 4 at Level 2: 8 dealt is her turn 3 or 4,
  where a small or medium ultimate first comes.
- **No opening wait; after a use, the size's wait.** Both are medium (6
  turns). The wolf hits for 7, so her two wolf turns deal the next 8 by
  themselves; without the wait she would never leave the form.

**Unchanged.** A hero uses one ability a turn (skill, ultimate or active
item). Retreat costs the hero's printed souls. Only the charge items touch a
charged skill's charges. (Until 2026-11-16 no card shortened a wait and the
Cooldown family were the draw cards; since then they are equipment that takes
turns off the bearer's skill and ultimate waits, card-design.md.) Echo Shard's repeat of a skill spends no charge and
starts no wait. Refresher resets waits and sets a charged skill back to full.

**Left for testing** (only when asked by name):
- Match length with free kits.
- Whether four skills held for one turn is a burst the game wants.
- Whether a wait of 3 leaves The Cube, Rabbit Hex and the other denials at 4
  far enough apart.
- Victor's 10 and Silver's 8.
- Rapid Recharge on a charged skill: a cast every turn while it is worn.

## 9. The turn goes on after an attack (2026-11-16)

Patrick: "The turn should not end with the attack: allow attack, retreat,
attack." Each hero attacks once a turn from the Active slot, and with the one
Retreat a turn a side swings at most twice. "An extra attack = 2 × the attack
it doubles" still prices a card that grants one; the second swing this rule
allows is not free: it costs the turn's Retreat (the leaving hero's 0, 1 or 2
souls) and puts the incoming hero in the lane for the rival's turn. Nothing has
been simulated; the knobs it touches (the Retreat prices, Swift, the 0-Retreat
heroes) are in [card-design.md](./card-design.md), "Changed 2026-11-16: the
turn goes on after an attack".

## 10. A skill counts Spirit twice (2026-11-16)

Patrick: "I do feel like Warden is pretty strong, and spirits are pretty weak
for some reason … and Lady Geist's bomb should just be a single target: she
just bombed the Active."

**Why Spirit fell behind.** Two rules of the last two days, neither aimed at it:
- Skills wait 3 or 4 turns (§8). Before, a skill cost 2–3 souls and could go
  off every turn or two, and the item budget counts a Spirit item's bearer
  landing 0.7 spirit hits a turn ([card-design.md](./card-design.md), rates).
  Now a skill goes off once in 3 or 4 turns.
- The second swing (§9). A bench gun hero retreats in and swings too; a
  spirit hero's swing is 1 (Attack 1, no Attack growth), so the second swing
  is worth nothing to it.

A level's point put into Attack adds 1 to every swing: 0.7 a turn or more. Put
into Spirit, it added 1 to each cast: 0.25–0.33 a turn on one target. The
growth rule ([hero-design.md](./hero-design.md) §2) makes the two equal ("all
three curves are even at Level 2"); on the board Spirit was worth a third to a
half of Attack.

**The rule.** A hero's own skill or passive counts its Spirit Power twice
(`SKILL_SPIRIT_RATE`): a `{sp:N}` there is N + 2 × Spirit, and the purple
number on the hero's sheet prints that total. A point of Spirit then pays
0.67 a turn in a skill that waits 3 and 0.5 in one that waits 4, on one
target: back at the 0.7 Spirit Power was priced at, and close to a point of
Attack. Heals and Shields in a skill count it twice too (Rejuvenating Aurora,
Tag Along, Plot Armor, Frost Grenade's heal): a support's levels go into Spirit
and pay only when its skill goes off, as a caster's do.

**What counts it once.** An ultimate (`ultSpi`) and a spell (`activeSpi`):
their pace did not change (an ultimate waited 3 and cost 4–12 souls; it waits
4–8 for nothing now; a spell is bought each time). Item procs with flat
numbers (Mystic Burst) are as they were.

**What it does, at Level 2** (all curves even), damage a turn while Active,
skills spread over their wait, riders left out:

| Hero | Before | Now |
|---|---|---|
| Haze (gun): Attack 4, Fixation +1 | 5 | 5 |
| Seven: Static Charge, Spirit 3, waits 4 | 1 + 4 ÷ 4 = 2.0 | 1 + 7 ÷ 4 = 2.75 |
| Lady Geist: Essence Bomb, Spirit 2, waits 3 | 1 + 3 on every enemy (7.5) ÷ 3 = 3.5 | 1 + 8 ÷ 3 = 3.7, on the Active |
| Lash: Ground Strike, Spirit 2, waits 4 | 1 + 3 on every enemy (7.5) ÷ 4 = 2.9 | 1 + 5 on every enemy (12.5) ÷ 4 = 4.1 |

A caster still deals less a turn than a gun carry in the lane, but it deals it
from the bench too, and in one burst that can finish a hero.

**Items.** Extra Spirit (+1) adds 2 to its bearer's skill: about Extended
Magazine's +1 a swing over a match. Boundless Spirit (+5) adds 10: a Level 3
Seven with it bombs for 23. The Spirit tier 4s come late, when the curve
wants kills.

**Lady Geist's Essence Bomb** hits the enemy Active alone, as Deadlock's does,
and harder (Patrick: "she should deal more damage"): 4✦, she pays 2 HP, it
waits 3. 4 − 2 × 0.5 (the HP at the heal rate) = 3.0, the top of a wait-3
skill's 2–3 ([hero-design.md](./hero-design.md) §4); the area bomb was 1✦ on
every enemy for 1 HP, 2.5 − 0.5 = 2.0. Her reach becomes one. More targets are
the range items' to give (card-design.md, "Range and radius").

**Warden's Willpower** is Shield 2 and Swift (it was Shield 3). Since the
second swing Swift is a free Retreat, worth its soul and its swap (1.5), so
Shield 3 (1.8) put the skill at 3.3, over a wait-3 skill's 2–3; Shield 2 (1.2)
brings it to 2.7. HP 7 and Attack 2 stay: the rules set them. The Spirit rule
is a check on him too: every spirit skill aimed at him hits harder.

**Left for testing** (only when Patrick asks by name):
- Lash's Ground Strike at Level 3: 9 to every enemy every 4 turns.
- Boundless Spirit and the other Spirit tier 4s on a caster's skill.
- Supports' heals at Level 3 (Rejuvenating Aurora 13 each).
- Whether Warden at Shield 2 still holds the lane too long early; if so, the
  next lever is his HP (tank 1: HP 6).

## 11. The ultimate unlocks at Level 3 (2026-11-16)

Patrick: "I think ultimate should be Level 3 unlock." It was Level 2
(`ULT_UNLOCK_LEVEL`). Level 3 takes 12 exp (5 + 7); nothing else changed.

**When a hero gets there.** The Active earns 2 exp a turn, a bench hero 1
(since 2026-11-17 the bench shares that 1, §14), and a hero 1 the first time it
wears an item and 2 for a kill blow.

| Hero | Level 2 (before) | Level 3 (now) |
|---|---|---|
| Lane hero, Active every turn | end of own turn 3 | end of own turn 6; turn 5 with two items worn |
| Bench hero, never Active | turn 5 | turn 12, past a 9–10-turn match; turn 9–10 with two or three items |

**What it does to the ultimates.** The opening wait (small 4, medium 6, large
8, §8) was what held the lane hero back before; now the level holds it as long
or longer:
- **Small** (Naptime, Flight, Traveler, Borrowed Decree): first ready on turn
  6 or 7, not 4; once or twice a match, not twice.
- **Medium** (most): turn 6 or 7, as before for the lane hero.
- **Large** (Bullet Dance, Death Slam, Storm Cloud, Singularity): turn 8, as
  before.
- **Charged** (Victor's revive, Silver's wolf) have no opening wait, so the
  level is now their gate: Silver's 8 dealt comes by turn 3 or 4 and her wolf
  waits for Level 3; Victor revives only from Level 3 (12 HP there).
- **A bench hero's ultimate** mostly does not come unless the hero spends
  turns in the lane or wears items: the second swing (§9) puts bench heroes in
  the lane more often, and each turn ended there earns 2.

So an ultimate is a late, earned moment for the hero that holds the lane, and
the lane is where the exp is.

**Left for testing** (only when Patrick asks by name): whether bench casters'
ultimates come often enough (the knob is the bench's 1 exp a turn); whether
small ultimates still need their opening wait of 4 now that Level 3 gates them.

## 12. Cards cost half (2026-11-16)

Patrick: "We should make all the cards cost cheaper, like for real … for
equipment and spells, they're too expensive. And for Retreat, probably should
be cheaper … or maybe there are some cards that reduce its cost, so we don't
need it to cost low for now."

**What it was.** The lane pays 2 souls a turn (`LANE_INCOME`) and a kill 1 to
6. A tier-3 item cost 8, four turns of the lane; a tier 4 cost 16, eight. A
ready deck's 16 items listed at up to 56 souls against about 30 earned by turn
9, so about half of what a side drew waited in its hand.

**Now.** `PRICE` is 1 / 2 / 4 / 8 / 12 (it was 2 / 4 / 8 / 16 / 24), Deadlock's
1 : 2 : 4 : 8 ladder kept at cost ÷ 800. A tier-1 item is half a turn of the
lane, a tier 2 one turn, a tier 3 two, a tier 4 four. A ready deck lists at 28
souls at most, about what a side has earned by its turn 7, so by turn 9 it can
play every item it has drawn.

**The budget is unchanged in points.** A card's value still lands on its
tier's 2 / 4 / 8 / 16 / 24 points ([card-design.md](./card-design.md) §3); a
soul now buys two of them (`SOUL_POINTS`). No card's effect changed: no card is
stronger, each comes out sooner.

**Spells priced for one play** print their value ÷ 2, to the whole soul, a
line still dearer than the spell it is built from (card-design.md, "Changed
2026-11-16: cards cost half"). Rusted Barrel's own 1 is now its tier's.

**What stays.**
- **Retreat**: 0, 1 or 2 souls by hero, Patrick's call for now. Sprint Boots
  (now 1), Swift Striker (2), Enduring Speed (2) and Swift take it down (Majestic
  Leap did, as a free swap, until it became a hero draw on 2026-11-18), and with items cheap a deck that wants free Retreats has them
  early.
- The lane's 2 and the kill bounty; units' printed prices.

**What it changes.**
- **Souls stop being the limit by the middle of a match; the draw is.** A
  draw (Golden Goose Egg) is worth more, and which cards came matters more
  than in which order they are paid for.
- **A Retreat is dearer next to an item**: 2 souls is a tier-2 item now, where
  it was a tier 1. If Retreat still feels heavy, that is the next lever
  (Retreat 0 / 1 / 1, or the lane at 3).
- **The AI** reads an item's price as its designed worth, so its weights per
  soul double (`SOUL_POINTS`): it values each item as before. It saves only
  for a tier 3 or more, since a tier 2 is a turn's income.
- **Net worth** (the round cap's tie-break) counts items at the new prices.

**Left for testing** (only when Patrick asks by name): whether a side buys
everything by turn 6 and souls have nothing left to decide; whether Retreat
should come down too.

## 13. Deck-out ends the match; the round cap is 20 (2026-11-16)

Patrick: "Running out of cards is end of game. Round limit to be 20."

**The rules.** A side whose deck is empty when its turn's draw comes loses,
as in the Pokémon TCG (`G.deckOut`, on in every match set up to play; a
scripted lesson that names its decks plays without it). The round cap goes
from 12 to 20 (`ROUND_CAP`); what stands still decides a match that reaches
it.

**When a deck runs out.** A side has 16 items and its 3 heroes: one hero
opens in the lane, 4 cards are dealt, so 14 are left, and it draws 1 on each
own turn. Its deck is empty after own turn 14 and it loses at own turn 15's
draw. Each card a draw card draws takes a turn off that; a draw skipped into
a full hand (10 cards) puts one back, and so does a hero that falls (it
shuffles back into the deck) or one discarded.

Since 2026-11-18 every deck carries one of each of four draw cards:

| Draw cards played | Cards drawn | Loses at its own turn |
|---|---|---|
| none | 0 | 15 |
| Warp Stone | 1 | 14 |
| Golden Goose Egg | 2 | 13 |
| Cultist Sacrifice | 4 | 11 |
| Egg and Cultist Sacrifice | 6 | 9 |
| all four (Majestic Leap draws 2 heroes) | 9 | 6 |

Fewer when the hero draws find fewer than they ask for: a squad has 3 heroes,
and one opens in the lane.

So **deck-out, not round 20, ends a long match**: it comes in round 15 at the
latest, and the cap only matters if a deck grows (Graves's Ghouls shuffle into
their own deck). Under the old cap of 12 a match ended before any deck ran out.

**What it changes.**
- **The first mover runs out first.** With equal decks it reaches its own
  turn 15 one engine turn before the second mover does, so a match that goes
  the distance is the second mover's, unless the first mover's deck is
  bigger or it drew less. (The pie rule's other dial,
  `SECOND_MOVER_FIRST_INCOME_BONUS`, is 0.)
- **Mill wins now.** Graveyard's Ghouls discard the top of the rival's deck as
  they fall; each one is a turn off the rival's clock.
- **A draw card has a cost.** All four of a deck's draw 9 cards and lose the
  match at own turn 6 unless it is won by then. A turbo deck has to win early;
  a deck that wins on the clock holds them back.
- **The bounty climbs to 10** (1 more every two rounds, rounds 19–20), so a
  kill late is worth a tier-4 item and more.
- **The AI** never draws itself empty and prizes emptying the rival's deck
  (`DECK_OUT` in its evaluation, just short of a win).

**Left for testing** (only when Patrick asks by name): how often a match
reaches deck-out; whether the first mover needs a dial for it; whether four
draw cards a deck (2026-11-18) run decks out too soon.

## 14. The bench shares its exp (2026-11-17)

Patrick: exp should go to fewer heroes the more there are on the board, "like a
soft punishment to have too many heroes on board". He proposed a random hero
each turn; the dilution is kept and the dice are not. Random exp is luck on
the one resource a player plans around (when the ultimate comes), it can land
on a hero about to fall or at the cap, and it would pay a hero hiding on the
bench as much as the one taking the hits.

**The rule.** At the end of its owner's turn the Active earns 2, as before. The
bench shares 1 (`EXP_PER_TURN_BENCH`), and it goes to the bench hero that has
earned the least in all (`benchExpTaker`, the leftmost on a tie), skipping a
hero at the cap, a corpse and a unit. Kills (+2) and a first equip (+1) still go
to the hero that earned them. It is Deadlock's lane: allies who share a lane
share its souls.

| Heroes on the board | Before: Active / each bench hero | Now: Active / each bench hero | Board total a turn |
|---|---|---|---|
| 1 | 2 | 2 | 2 → 2 |
| 2 | 2 / 1 | 2 / 1 | 3 → 3 |
| 3 | 2 / 1 | 2 / ½ | 4 → 3 |
| 4 (full) | 2 / 1 | 2 / ⅓ | 5 → 3 |

**What it changes.**
- **The lane hero is untouched:** Level 3 at the end of own turn 6, as §11.
- **A bench of one is untouched.** A full bench levels a third as fast: a hero
  that never stands in the lane reaches Level 2 around turn 13, not 5, and its
  ultimate mostly never comes. A bench caster's level now comes from the lane
  (the second swing puts it there, §9) and from its items.
- **Going wide costs.** Before, each extra hero on the board was +1 exp a turn
  on top of its body and its skill; now the board earns 3 at most. A narrow
  board of two levels both heroes as before.
- **Late heroes want a narrow board.** A hero whose curve is late (docs/hero-design.md
  "By curve") wants to stand in the lane or to share the bench with one other.

**Left for testing** (only when Patrick asks by name): whether full-bench
squads now see too few ultimates; whether the bench's share should be 2 (one
more knob: `EXP_PER_TURN_BENCH`).

## Open knobs for future passes
- HP floor 4 vs 5 for squishies (early swinginess).
- Mirage's Djinn's Mark burst (2/stack ×4) at the compressed scale.
- Ability economy: one ability per hero per turn, free on a cooldown, and the
  Active may still attack. If a full bench casting every turn makes the late game
  too swingy, the cooldowns are the lever.
