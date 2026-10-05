# Stats Model — durations, statuses & how to value them

This doc defines how status **durations** actually behave in the engine and the
authoring rules we use so card text matches real impact. Read this before
assigning any duration on a spell / equipment / ultimate.

Related: [ultimate-design.md](./ultimate-design.md) (canon → effect),
[engine-model.md](./engine-model.md) (where the rules live); card cost bands
live in `src/cards/*.ts` headers.

---

## 1. Turn structure & when statuses tick

Two players alternate. Each status is defined once, in `src/statuses/index.ts`:
what it **blocks** (a basic attack, a skill, a channel's pulse), whether it is
hard **crowd control** (`cc`: Stun, Silenced, Disarm, Sleep) and how a second
application **stacks**. Two clocks run on a unit's **own** turns only:

- **Start of its owner's turn** (`tickStartOfTurn`, `src/engine/statusOps.ts`):
  Bleed deals its damage; Charged, Djinn's Mark and Reverb go off if they are
  about to expire; then every status that is **not** crowd control drops by 1,
  and any at 0 is removed.
- **End of its owner's turn** (`tickEndOfTurnCC`): crowd control drops by 1
  (Sleep's wake-up burst goes off as it expires). So CC is stripped only after
  the unit has spent a turn under it.

A lockout is checked when the unit tries to act: `isBlocked(card, act)`
(`src/engine/query.ts`) reads each status's `blocks`, and the attack gate, the
skill gate, the channel pulse, the AI and the board all ask it.

---

## 2. What a stored duration buys

| You apply… | Realized on | Stored duration **N** → real effect |
|---|---|---|
| Hard CC on an enemy (stun, silenced, disarm, sleep) | the enemy's turns | **N** turns denied |
| A DoT on an enemy (bleed) | the enemy's turn starts | **N** ticks of damage |
| A stat debuff on an enemy (*_power_down, *_resist_down) | the enemy's turns | **N − 1** enemy turns covered |
| A defensive buff on your unit (unstoppable) | the opponent's turns | **N** turns covered |
| A stat buff on your unit (weapon_power, spirit_power) | your attacks and casts | until your **N**th turn start from now |

Why stat debuffs are the odd one out: they are not crowd control, so they tick
at the start of the enemy's turn — the first tick lands before the enemy acts.
"Weaken 2 for 2 turns" (Rusted Barrel) bites the enemy's next turn only.

Shield is applied with duration 999: a pool that is spent by damage, not a
timer.

---

## 3. Authoring rules

1. **Enemy CC is honest**: "Stun 1 turn" costs the enemy exactly one turn.
2. **Enemy stat debuffs lose their first turn**: store **N + 1** to cover N
   enemy turns, and word the card by the turns it really covers.
3. **Self buffs and DoTs are honest**: duration N = N covered turns / N ticks.
4. **Status text states the engine's numbers.** A status's `desc` and a card's
   text are read by players; when a number changes in `src/abilities`, change
   the words with it.
