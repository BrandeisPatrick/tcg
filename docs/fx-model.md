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
| `hit`     | damage landed (post-resist, post-shield)          | type, amount, KO, cast kind, source, tag  |
| `heal`    | HP restored                                      | amount, tag, `from` (lifesteal victim)     |
| `status`  | a status landed                                  | resulting value, class, tag               |
| `shield`  | a Shield ate some / all of a hit                 | absorbed, broken                          |
| `immune`  | Unstoppable shrugged off damage or CC            | what                                      |
| `revive`  | a corpse came back                               |                                           |
| `levelup` | a hero reached a new level                       | level                                     |

Rules the FX layer relies on (pinned by `tests/engine/fx-events.spec.ts`):

- The **basic swing is never in the stream.** The combat choreographer
  animates it before the engine resolves. Anything riding on a swing (Tesla,
  Ricochet, a Djinn's Mark detonation) carries a tag and is kept as a `proc`.
- A `cast` precedes its effects, so a batch reads "this caster did these".
- `G.fx` is flushed at every turn start; `seq` keeps climbing, so the UI's
  high-water mark never replays old hits after a remount.
- Unique effects carry an `FxTag`: `djinns_mark`, `bleed`, `reverb`,
  `naptime`, `discharge`, `execute`, `life_drain`, `lifesteal`,
  `mixed_bullets`, `ricochet`, `tesla`, `burst`, `channel`, `regen`, `combo`,
  `siphon`. Call sites pass them through `damageUnit` / `healUnit` /
  `addStatus`'s trailing options argument.

## The player

`Board.tsx` derives the **fresh batch** (events past its high-water mark)
during render, runs it through `buildFxTimeline` (pure, `fxTimeline.ts`) and
hands both to:

- `FxTimingContext` — `HeroSlot` reads the per-card impact delay and holds
  HP / BP / Shield / status chips / the corpse look (`useDelayedValue`) until
  the bolt lands, so the number drops with the impact, not before it.
- `FxLayer` — measures the cards involved, plays the batch as fixed-position
  overlays, and unmounts it when the timeline ends. Batches overlap freely.

The beat (`fxCatalog.ts` holds every number):

```
cast flare on the caster ─▶ bolt (420 ms) ─▶ impact on the target
                                              ├─ status stamps queue behind the hit (200 ms, then 240 ms each)
                                              └─ lifesteal motes stream home (320 ms) ─▶ heal glow
ultimates wait 600 ms for their name plate first; AoE impacts ripple by 90 ms per target
```

Animation families (`hits.tsx`, `support.tsx`, `primitives.tsx`):

- **bullet** — gunfire: muzzle flash, tracer volley in the owner's ink, holes
  punched into the print one by one, sparks off the far side.
- **spirit** — plum overprint, concentric rings, the spirit rune, star motes.
- **pure** — teal overprint with a tear drawn across the card; **Bleed**
  instead runs red down the print with a `BLEED N` sticker.
- **KO** — cracks from the impact point, a wine vignette, shards falling
  away, the `K.O.` sticker charging gold. The corpse look lands after.
- **tags** — Djinn's Mark stacks ring the card, spin inward and detonate
  amber; Reverb's dashed rings converge; Naptime's letters float off before
  the burst; Killing Blow slashes twice; Ricochet arcs in gold; Tesla arcs
  in lightning; a channel sends a shockwave with spokes (Seven's storm rains
  lightning instead).
- **support** — cast flare with the ability plate; heal glow with rising
  crosses; status stickers with a glyph or flourish (stars for Stun, letters
  for Sleep, mark pips, a channel ring); shield deflect with its tally;
  Unstoppable in gold; revive rays; level-up burst; equip glint.

The Gallery (`?preview=1&tab=combat`) has a showroom that fires every one of
these through the real `FxLayer`, `HeroSlot` and timing context.
