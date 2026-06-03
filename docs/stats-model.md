# Stats Model — durations, statuses & how to value them

This doc defines how status **durations** actually behave in the engine, why
"1 turn" effects are often worth less than they read, and the authoring rules we
use so card text matches real impact. Read this before assigning any duration on
a spell / equipment / ultimate.

Related: [ultimate-design.md](./ultimate-design.md) (canon → effect), card cost
bands live in `src/cards/*.ts` headers.

---

## 1. Turn structure & when statuses tick

Two players alternate. At the **start of a player's turn** (`onBegin`, `game.ts`),
the engine runs `tickStartOfTurn` (`statusOps.ts:94`) on **that player's own
board only**:

1. Bleed deals its damage.
2. Charged / Djinn's Mark detonate if about to expire.
3. **Every status on those units decrements by 1; any that hit 0 are removed.**

The unit then acts. Action-denying CC is checked when the unit tries to act
(`game.ts:428` — `stun` / `silenced` block skills/plays; `disarm` blocks attacks).

**Crucial consequence:** a unit's statuses are stripped *at the start of its own
turn, before it acts.* Only the owner's board ticks on the owner's turn.

---

## 2. The off-by-one (why "Stun 1 turn" does nothing)

Because a unit strips its own statuses **before acting**, anything you put on an
**enemy** loses its first turn:

| You apply on your turn | Enemy turn 1 (after their strip) | Enemy turn 2 | **Turns actually denied** |
|---|---|---|---|
| Stun, duration **1** | 1→0, removed → **acts freely** | — | **0** |
| Stun, duration **2** | 2→1, still stunned → denied | 1→0 → acts | **1** |
| Stun, duration **3** | 3→2 denied | 2→1 denied | **2** |

> **Enemy CC: effective denied turns = stored duration − 1.**

Self/ally buffs do **not** lose a turn, because the value lands on the
*opponent's* turn (before your next strip):

| You apply to your own unit | Covered opponent turns |
|---|---|
| Unstoppable / Shield, duration **1** | **1** |
| Unstoppable / Shield, duration **2** | **2** |

> **Self buff: covered turns = stored duration.**

DoTs (Bleed) get full value — damage is dealt *during* the tick, so duration N =
N hits.

---

## 3. Value table (by status family)

| Family | Examples | Realized on | Stored-duration → real effect |
|---|---|---|---|
| Hard CC (enemy) | stun, silenced, disarm | enemy's turn | **N − 1** turns denied |
| DoT (enemy) | bleed | enemy's turn-start | **N** ticks of damage |
| Defensive buff (self) | unstoppable, shield | opponent's turn | **N** turns covered |
| Stat buff (self) | weapon_power, spirit_power | your attacks | helps until your next turn-start |
| Stat debuff (enemy) | *_resist_down, *_power_down | enemy's turn | **N − 1** effective (same as CC) |

Shield note: `shield` is applied with duration 999 (a pool that's spent, not a
timer) — it doesn't decay per turn, it's consumed by damage.

---

## 4. Authoring rules

1. **Never ship enemy CC at duration 1.** It denies nothing. Minimum meaningful
   enemy CC is **duration 2** (= 1 real denied turn).
2. **Card text should read the *real* effect.** If a card is meant to cost the
   enemy one turn, store duration 2 and either (a) print "Stun 1 turn" — accepting
   text≠stored — or (b) adopt the engine fix in §5 so text == stored. Pick one
   project-wide; do not mix.
3. **Self buffs are honest** — duration N = N covered turns. "Unstoppable 1 turn"
   is the floor (covers exactly the next enemy swing); use 2 when you want it to
   span a full round-trip.
4. **DoTs are honest** — Bleed N for D turns = N×D damage over D of the enemy's
   turns.
5. Stat debuffs on enemies follow the CC off-by-one — budget them like CC.

---

## 5. Recommended engine fix (open decision)

The off-by-one is a footgun: every designer will expect "Stun 1 turn = enemy
loses their next turn." Two ways to make text intuitive:

- **(A) Authoring convention only** — keep the engine; enemy CC is authored at
  `desiredDeniedTurns + 1`. Zero code change; permanent text-vs-stored mismatch.
- **(B) Engine fix (recommended)** — strip **action-denying CC** (stun / silenced
  / disarm) at the *end* of the afflicted unit's turn instead of the start, while
  buffs and DoTs keep ticking at start. Then duration N = N denied turns, text ==
  stored, and the model is symmetric. Requires re-auditing existing CC durations
  (Wraith ult stun 2→ would become 2 real turns, Knockdown/Slowing Hex stun/silence
  1 would start working, etc.).

**Until this is decided, follow rule §4.1** (no duration-1 enemy CC).

---

## 6. Impact on current content

Cards relying on duration-1 enemy CC are currently dead weight on that component:

- `Slowing Hex` — Silence 1 → **0** real turns. Needs duration 2 (or fix B).
- `Knockdown` — Stun 1 (+ Disarm 3) → stun denies **0**; only the disarm works.
- New ultimate riders that read "Stun enemy Active 1t" (Abrams, Lash, Viscous,
  Mo & Krill, Rem, Dynamo) deny **0** turns as written — they must be **Stun 2t**
  to actually cost the enemy a turn, or fix B must land first. This is why a
  1-turn enemy stun should never be priced as if it does something.

Self-buff durations in the ult set (Yamato/Viscous/Kelvin/Mirage Unstoppable,
Yamato heal, shields) are fine as authored.
