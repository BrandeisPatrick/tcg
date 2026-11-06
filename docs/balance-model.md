# Balance Model — design philosophy

**Status, 2026-11-05.** The item numbers were set, or checked and left, by
reasoning on 2026-11-05, from the item budget in
[card-design.md](./card-design.md) §3; no sim ran. The sim gates
(`scripts/balance-sim.ts`: seat 50 ± 3, every hero 45–55, a mean of 8–10 own
turns, no item in over 40% of builds, the Mid-Boss contested) have not been run
against this 140-card catalogue. The testing round runs on request
([CLAUDE.md](../CLAUDE.md)).

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
  can't one-shot a fresh hero). Souls come 4 a turn, so the first items are
  small: a tier 3 is two turns' income, a tier 4 four.
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
the killer its level + 1 and pushes the same into its side's structures; damage
past 0 HP is not spilled).
So a natural strategy is: park a **Vitality build** (high HP + regen, e.g. Abrams,
Mo & Krill) Active to absorb, while **Spirit builds** sit on the bench and cast.
This is strategy enabled by the rules, **not** a hard class — any hero can be put
in any seat.

## 5. Current stat anchors (V1)
- Each side's track: Guardian **4** → Walker **6** → Patron **8**; the Patron
  falling loses. A death pays the killer's side the victim's **level + 1** (+2
  for the richest hero on the board) and pushes the same into the victim's
  track; respawn takes 1 / 2 / 3 own turns by round.
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

## Open knobs for future passes
- HP floor 4 vs 5 for squishies (early swinginess).
- Mirage's Djinn's Mark burst (2/stack ×4) at the compressed scale.
- Whether heals/shields should also scale with Spirit (would give supports a
  spirit build path; currently they don't).
- Ability economy: one ability per hero per turn, free on a cooldown, and the
  Active may still attack. If a full bench casting every turn makes the late game
  too swingy, the cooldowns are the lever.
