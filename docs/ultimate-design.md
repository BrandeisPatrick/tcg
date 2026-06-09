# Ultimate Design — Canon → TCG Translation

Each ultimate is anchored to its **canonical Deadlock ability** (the in-game "4"),
then translated to a TCG effect and costed. Source for canon: the official
Deadlock wiki (https://deadlock.wiki).

## Cost model
Ultimates are hero-locked finishers, so they get their **own** band (not the
rarity-4 = 7+ rule that equipment uses). They spread **5–10** by power, with
**Mirage's Traveler a 2-cost escape outlier**. Costs run slightly inflated
(premium finishers). No strict magnitude→cost formula — judgment within the band.

## Damage type rule
Ability damage = **spirit**; only literal gunfire = **bullet**. So every damaging
ult is spirit *except* **Haze · Bullet Dance** (she fires her gun).

## Status/duration notes
- CC ticks at end of the afflicted turn, so "Stun N turns" = N real denied turns
  (see [stats-model.md](./stats-model.md)). 1-turn stuns now land.
- **Unstoppable = full damage immunity** (not just CC immunity) — kept short
  (1t self) and never team-wide.
- **Sleep** = stun that any damage clears; its status `value` is a wake-up burst
  dealt when it ends (hit or expiry). Used by Rem.
- Self-referencing effects name the hero ("Yamato gains…", "Warden heals…").

---

## Final set

| Cost | Hero | Ult (canon) | TCG effect |
|---|---|---|---|
| 2 | Mirage | Traveler — teleport to safety | Mirage retreats to the bench (free) and gains Shield 3 |
| 5 | Shiv | Killing Blow — leap execute | Deal 5 spirit to enemy Active; execute if below half HP |
| 5 | Vindicta | Assassinate — execute snipe | Deal 5 spirit to any enemy; 9 if it's below half HP |
| 6 | Yamato | undying transform | Yamato gains +3 Bullet Power (2t) & Unstoppable (1t), heals 5 |
| 6 | Lady Geist | Soul Exchange — HP swap | Swap HP totals with enemy Active |
| 6 | Mo & Krill | Combo — channel lock + drain | Stun enemy Active 1t; Mo & Krill drains 6 HP (heals itself) |
| 7 | Rem | Naptime — sleep + wake burst | Sleep enemy Active 2t; 6 spirit when it wakes |
| 7 | Wraith | Telekinesis — airborne lock | Deal 4 spirit to enemy Active + Stun 1t |
| 8 | Seven | Storm Cloud — escalating AoE channel | **Channels 3t** (locked out): escalating 2→3→4 spirit to all enemies each end of turn |
| 7 | Haze | Bullet Dance — gun flurry | Deal 3 **bullet** to every enemy |
| 8 | Drifter | Eternal Night — isolate 2 | Silence enemy Active + 1 bench hero for 2t |
| 8 | Viscous | Goo Ball — ball + impact | Viscous gains Unstoppable 1t; 3 spirit to all + Stun Active 1t |
| 8 | Abrams | Seismic Impact — slam + stun | Deal 4 spirit to all enemies + Stun Active 1t |
| 8 | Kelvin | Frozen Shelter — dome heal | Heal all allies 7 |
| 9 | Sinclair | Audience Participation — copy ult | Copy enemy Active hero's ultimate into hand (costs 0) |
| 9 | Lash | Death Slam — multi grab-slam | Deal 5 spirit to all enemies + Stun Active 1t |
| 9 | Dynamo | Singularity — vortex channel | **Channels 3t** (locked out, no attack/skill): 3 spirit to all enemies each end of turn. Stun/Sleep interrupts a pulse |
| 9 | Warden | Last Stand — drain channel | **Channels 3t** (mobile — still attacks/skills): 2 spirit to all enemies each end of turn, heals half the total |
| 10 | Paige | Rallying Charge — wave | Heal all allies 4 + 4 spirit to all enemies |

**Spread:** 2 ×1 · 5 ×2 · 6 ×3 · 7 ×3 · 8 ×5 · 9 ×4 · 10 ×1.

## Channeled board-wipe ultimates (Dynamo · Seven · Warden)
A `casting` (heavy lockout) / `casting_light` (mobile) self-status turns these
three into channeled win conditions: instead of a one-shot effect, the caster
deals AoE spirit to all enemies at the end of each of their turns over a 3-turn
channel (`tickCastingPulses` in `statusOps.ts`, fired from `turn.onEnd` before
the attack phase). `casting` is added to the attack gate (`util.ts`) and skill
gate (`game.ts`) so heavy channelers (Dynamo, Seven) are locked out; Warden's
`casting_light` opts out of both. Stun/Sleep on the caster skips that turn's
pulse (channels are interruptible). Seven's value escalates +1 per pulse.
Damage scales with the caster's live Spirit each tick. See
[the multi-attack + casting memory] and `tests/engine/archetypes.spec.ts`.

## Engine work this required
- **Sleep status** (`statuses/`, `game.ts` skill gate, `util.ts` attack gate,
  `damage.ts` wake hook, `statusOps.ts` expiry burst).
- **Per-instance `costOverride`** (`types.ts`, `game.ts` playCard) for Sinclair's
  free copy.
- Sinclair mints a 0-cost copy of the enemy ult into hand via `nextIid`.
- Mirage performs a free Active↔bench swap inline.

## Lowest-confidence / deviations
- **Mo & Krill** — canon Combo is an over-time channel drain; implemented as an
  **instant** 6-drain (+ stun) to avoid a new drain-over-time status. Revisit if
  we want the channel feel.
- **Sinclair** — copying resolves the enemy ult from your side; a copied *self/ally*
  ult (e.g. Yamato's) buffs your hero ("you stole their power"). If the enemy
  Active has no linked ult, it fizzles with a log line.
- **Yamato** — canon ult name unconfirmed; mechanic (undying transform) matches.
