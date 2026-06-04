# Balance Model — design philosophy

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
- **attack = bullet, skill = spirit**, both usable once per turn — two damage
  avenues on every hero.
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
| Late | 8+ | Snowball — kill multiple, or consistently kill and survive to score the patron. |

**Durability target:** a fresh Lv1 hero takes **~3 turns** to kill under normal
play, **~2** if the opponent commits hard (skill + spell + attack). Exposed
squishies die faster — that's positioning, not a stat problem.

**How the curve is produced (not by special-casing turns):**
- **Low Lv1 offense.** Base BP is 1–2 and base skill damage 1–2 (a Lv1 caster
  can't one-shot a fresh hero). Souls ramp 1→10, so early turns afford few
  actions.
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

Only the **Active** hero attacks and soaks damage for the team (overflow → patron).
So a natural strategy is: park a **Vitality build** (high HP + regen, e.g. Abrams,
Mo & Krill) Active to absorb, while **Spirit builds** sit on the bench and cast.
This is strategy enabled by the rules, **not** a hard class — any hero can be put
in any seat.

## 5. Current stat anchors (V1)
- Patron HP **15**; lose at 0. Respawn 3 turns; a death chips 1 to your own patron
  and gives the opponent +1 soul.
- Base HP: squishy **4**, bruiser **6**, anchor tank **7**. Base BP: caster/support
  **1**, attacker/bruiser **2**, tank **1**.
- Base skill damage **1–2**; heals/shields flat (Spirit scales **damage** only).
- Leveling **+1/+1/+1** (HP/BP/Spirit) per level, cap Lv4.

## Open knobs for future passes
- HP floor 4 vs 5 for squishies (early swinginess).
- Mirage's Djinn's Mark burst (2/stack ×4) at the compressed scale.
- Whether heals/shields should also scale with Spirit (would give supports a
  spirit build path; currently they don't).
- Skill economy (one skill/player/turn today) — moving to one-per-hero (soul-gated)
  is the V2 lever if the late-game throughput feels too low.
