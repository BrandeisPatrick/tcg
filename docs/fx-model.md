# Board FX model

How the match screen animates what the engine resolves. Companion to the
poster-idiom notes in `src/ui/poster.ts`; the code lives in
`src/engine/fx.ts` (emitter) and `src/ui/effects/fx/` (player).

## The stream

Every visible consequence the engine resolves is pushed onto `G.fx` as one
event (`FxEvent` in `src/engine/types.ts`), with a monotonic `seq`:

| kind      | when                                             | carries                                   |
|-----------|--------------------------------------------------|-------------------------------------------|
| `cast`    | a skill / spell / ult / equipment goes off        | caster iid, card, target — pushed FIRST   |
| `swing`   | one swing of the turn's attack begins            | attacker, target, `index`, `raw` power, `label`, target HP |
| `hit`     | damage landed (post-resist, post-shield)          | type, amount, KO, cast kind, source, tag  |
| `heal`    | HP restored                                      | amount, tag, `from` (lifesteal victim)     |
| `status`  | a status landed                                  | resulting value, class, tag               |
| `shield`  | a Shield ate some / all of a hit                 | absorbed, broken, cast kind               |
| `immune`  | Unstoppable shrugged off damage or CC            | what, cast kind (for damage)              |
| `revive`  | a corpse came back                               |                                           |
| `levelup` | a hero reached a new level                       | level                                     |

Rules the FX layer relies on (pinned by `tests/engine/fx-events.spec.ts`):

- **The engine reports everything it does, the basic swing included.** Each
  swing of the turn's attack pushes a `swing` BEFORE its damage (`index` 0 is
  the primary, 1.. the Extra Attacks; `raw` is the attack power it was made
  with, `label` is `Extra Attack` or a bonus's own — Frenzy's — and
  `targetHp` the target's HP as it begins). The hit, Shield absorb or
  Unstoppable shrug of that swing follow, filed `cast: 'attack'`. What the
  swing sets off keeps its own cast and tag — a Tesla / Ricochet hit or a
  Djinn's Mark detonation is a `proc` — and, being a reaction pushed from
  inside the damage, lands in the stream ahead of the swing's own hit.
- **The board does not play the swing twice.** The combat choreographer walks
  the basic attack from the forecast BEFORE the engine makes it, so the
  match screen drops `swing` events and the `hit` / `shield` carrying cast
  `attack` (`walkedByChoreographer` in `fxTimeline.ts`, the one place that
  decides; Board's fresh batch, the timeline, the FX layer and the final-blow
  check all go through it). An Unstoppable shrug is not dropped — the walk has
  no beat for it.
- **The forecast is the same stream.** `forecastAttack` (`engine/forecast.ts`)
  runs the real attack on a copy of the game (`simulate`) and reads these
  events back: a step per `swing`, its `finalDamage` and `shieldAbsorbed` from
  the `attack`-cast hit and absorb, its HP after from the next swing's
  `targetHp` (the last from the state the run leaves). So what the choreographer
  walks cannot differ from what the engine then reports
  (`tests/engine/forecast.spec.ts`).
- A `cast` precedes its effects, so a batch reads "this caster did these".
- Within one damage call the engine pushes a Shield's absorb, then the
  reactions to the hit (procs, statuses), then the hit itself — so a Shield
  and the hit it let past are not adjacent; the FX layer pairs them by card
  and damage type (`shieldSpilled`), not by `seq`.
- `G.fx` is flushed at every turn start (`beginTurn`, in the same reducer call
  that ends the previous turn): effects pushed at the END of a turn — a channel
  pulse, Naptime's wake, an end-of-turn level-up — are flushed before the UI
  sees them (a known gap). `seq` keeps climbing (it comes from `G.counters`), so the UI's
  high-water mark never replays old hits after a remount.
- Unique effects carry an `FxTag`: `djinns_mark`, `bleed`, `reverb`,
  `naptime`, `discharge`, `execute`, `life_drain`, `lifesteal`,
  `mixed_bullets`, `ricochet`, `tesla`, `burst`, `channel`, `regen`, `combo`,
  `siphon`. Call sites pass them through `damageUnit` / `healUnit` /
  `addStatus`'s trailing options argument.

## The player

`Board.tsx` derives the **fresh batch** (events past its high-water mark,
minus what the choreographer walked) during render, runs it through `buildFxTimeline` (pure, `fxTimeline.ts`) and
hands both to:

- `FxTimingContext` — `HeroSlot` reads the per-card impact delay and holds
  HP / BP / Shield / status chips / the corpse look (`useDelayedValue`) until
  the bolt lands, so the number drops with the impact, not before it.
- `FxLayer` — measures every card on the table (at its rest box, so a card
  mid-kick cannot skew the anchor), plays the batch, and unmounts it when the
  timeline ends. Batches overlap freely. A batch plays three ways at once:
  **prints on the cards** (fixed-position DOM overlays: washes, holes,
  stickers, numerals), **things in the air** (the FX stage, below) and **the
  cards themselves moving** (impulses, below).
- `FxStageProvider` (`stage/FxStage.tsx`) — the FX stage: one canvas over the
  viewport and a small particle world with *height*. `stage/sim.ts` is the
  world (pure): x / y are viewport pixels on the table, z is height above it,
  and a camera hung over the middle of the board projects it — so a spark
  thrown upward grows and slides outward as it climbs, falls, skips off the
  table and drags its shadow across the paper. `stage/draw.ts` paints it
  (stains and shockwaves on the table, then shadows, then bodies lowest
  first), `stage/emitters.ts` holds the seeded bursts (sparks, paper chads,
  glass, embers, ink drops that leave splats, brass casings, smoke,
  shockwaves, arcing bolts, tracers) and the recipes built from them. FX
  components stay declarative: they book cues with `useStage` ("sparks at the
  impact, the shatter 300 ms later") and unmounting cancels what has not
  fired. The loop runs only while something is alive and clears only what it
  drew.
- `FxImpulseContext` (`FxImpulse.ts`) — how the cards move. The tiles are
  cards lying on a table, so at each beat the layer (and the combat
  choreographer, for basic swings) emits an impulse per card and the
  `HeroSlot` listening on that iid moves like one: a **hit** shoves it along
  the shot and rocks the far edge up off the paper (`rotateX` / `rotateY`
  under a perspective, with the drop shadow falling away as it lifts), a
  **kill** rocks further and twists, a **shooter** comes up and kicks back
  with every round, a **caster** lifts while it gathers power and slaps back
  down, a **shockwave** bobs every card it passes under (nearer = sooner and
  harder), a **sticker** slammed on lands with a thud. `kickFor` is pure;
  `tests/ui/fx-impulse.spec.ts` pins the shapes. The overlays printed on a
  card ride the same kick (`FxCardContext` → `Fixed`), so a wash or a bullet
  hole stays on the card as it tips.
- `FxCalmContext` (`FxMotionContext.ts`) — calm motion, on when the system
  menu's reduced-motion setting or the OS preference is set. The stage books
  nothing, rings and arcs render nothing, the tiles do not move and stickers
  land without the slam; washes, stickers, plates and the numerals still tell
  the whole story on the same beats.

The beat (`fxCatalog.ts` holds every number):

```
caster lifts, motes wind in (240 ms) ─▶ bolt arcs over the table ─▶ impact on the target (560 ms)
                                              ├─ status stickers queue behind the hit (200 ms, then 240 ms each)
                                              └─ lifesteal orbs stream home (320 ms) ─▶ heal
a kill: impact ─▶ cracks ─▶ the card breaks (300 ms) ─▶ K.O. sticker slammed on (470 ms) ─▶ corpse look under the backing (650 ms)
gunfire without a cast waits 300 ms for its volley to fly
ultimates wait 600 ms for their name plate first; AoE impacts ripple by 90 ms per target
```

Animation families (`hits.tsx`, `support.tsx`, `shatter.tsx`, `primitives.tsx`):

- **the amount** — every hit prints `−N` in stencil digits (a shade brighter
  than its type's wash, paper keyline, hard ink drop); heals print `+N`. The
  digits fall onto the card from the viewer's side, bounce once, then drift
  up. Several hits on one card in a batch fan out and land a beat apart so
  `−2` then `−3` never reads as `−23`.
- **stickers** — every sticker (status, tag, `Damaged`, `K.O.`) is slammed
  down from above the table: large and tipped toward the viewer with its
  shadow far below, landing with a squash.
- **bullet** — gunfire: per round a muzzle flash stabbing down the line of
  the shot, smoke, a brass casing thrown clear that bounces on the table, and
  a tracer with its shadow under it; holes punched into the print one by one,
  sparks carrying on past them, chads of the card flung up.
- **spirit** — a bloom of the type ink, a shockwave along the table and a
  halo lifting off the card, the rune swinging up out of it, embers winding
  toward the viewer, crystal splinters.
- **pure** — the print is torn across: its two halves (clones of the live
  tile) part and curl up over a dark gap, glass thrown off either side;
  **Bleed** instead runs red down the print under a `BLEED` sticker and
  drips onto the paper, leaving splats.
- **KO** — cracks race out from the impact, then the card itself breaks:
  `planShatter` (`shatterPlan.ts`, pure, pinned by `fx-shatter.spec.ts`) cuts
  it into shards that tile the rect exactly, each a clone of the live tile
  clipped to its piece and thrown off the table in 3D. A dark backing stands
  in for the emptied frame while the tile turns corpse underneath; the
  `K.O.` sticker is slammed onto it and every other card on the table jumps.
- **tags** — Djinn's Mark stacks ring the card, spin inward and detonate
  amber; Reverb's dashed rings converge; Naptime's letters float off before
  the burst; Killing Blow slashes twice, throwing sparks along each cut;
  Ricochet arcs in gold; Tesla arcs in lightning and scorches where it
  grounds; a channel rolls a shockwave out with a low bolt to each target
  (Seven's storm rains lightning instead).
- **support** — a cast draws motes down into the caster, flares, swings the
  ability plate up and lets go with a shockwave; healing lifts green crosses
  off the card toward the viewer; status stickers with a glyph or flourish
  (stars orbiting for Stun, letters for Sleep, mark pips, a channel ring);
  the shield swinging up with its tally and sparks skidding off; Unstoppable
  in gold; a revive or level-up winding a column of glints up off the card;
  equip glint.
- **the basic attack** (`CombatChoreographer.tsx`) — the same gunfire family
  walked beat by beat from the forecast before the engine resolves; a card that breaks stays
  under a grey veil until the engine turns it for real.
- **the ultimate** (`UltMomentFlash.tsx`) — the name plate is dropped onto
  the table from above; where it lands every card bobs, a shockwave rolls
  out and speed lines burst from behind it.

When the move that decides the match comes with a cast or a kill, `Board`
keeps the table up until that batch has played (capped at 2.8 s, input
sealed) before handing over to the result sheet — the final blow is seen
landing.

The Gallery (`?preview=1&tab=combat`) has a showroom that fires every one of
these through the real `FxLayer`, FX stage, `HeroSlot`, timing context and
impulse bus — and walks basic attacks through the real choreographer — with
a `Calm motion` toggle to preview what reduced-motion players see.
