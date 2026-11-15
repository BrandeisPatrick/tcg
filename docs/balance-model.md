# Balance Model — design philosophy

**Status, 2026-11-05.** The item numbers were set, or checked and left, by
reasoning on 2026-11-05, from the item budget in
[card-design.md](./card-design.md) §3; no sim ran. The sim gates
(`scripts/balance-sim.ts`: seat 50 ± 3, every hero 45–55, a mean of 8–10 own
turns, no item in over 40% of builds, the Mid-Boss contested) have not been run
against this 140-card catalogue. The testing round runs on request
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
  can't one-shot a fresh hero). Souls come 2 a turn (§7), so the first items
  are small: a tier 1 is a turn's income, a tier 2 two turns', a tier 3 four
  and a tier 4 eight, less what kills pay.
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
  ultimate unlocks at Level 2 — the front-liner earns it first, a bench caster
  late — so ults arrive one at a time.
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
tier-1 item. Every printed price stays: items 2 / 4 / 8 / 16 / 24, skills 2 or
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
- **What it costs.** A skill (2 or 3 souls) is a whole turn of the lane or
  more, so a side casts about one a turn where it could cast four, close to
  Pocket's one Supporter a turn. An ultimate (4 / 8 / 12) is two, four or six
  turns of the lane. Heroes use their kits less than at 5 a turn.

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

**Left for a testing round.**
- The AI values a point of souls in hand at 0.3, so it spends as soon as a
  play gains anything and does not save for a higher tier.
- Golden Goose Egg's 2 souls a use is now a whole turn of the lane every
  other turn. Its budget in points is unchanged (16.4, already listed as over
  in card-design.md §3).
- Match length. The one seeded AI match the tests replay (seed 12) ended in
  round 7 where it ran to the round cap before. That is one match, not a
  measurement.
- Deck copies stay at 4. Pocket's rule is 2; it is Patrick's call.

## Open knobs for future passes
- HP floor 4 vs 5 for squishies (early swinginess).
- Mirage's Djinn's Mark burst (2/stack ×4) at the compressed scale.
- Whether heals/shields should also scale with Spirit (would give supports a
  spirit build path; currently they don't).
- Ability economy: one ability per hero per turn, free on a cooldown, and the
  Active may still attack. If a full bench casting every turn makes the late game
  too swingy, the cooldowns are the lever.
