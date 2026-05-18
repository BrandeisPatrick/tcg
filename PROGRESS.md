# Deadlock TCG — Polish Session Progress

## Live URLs

- **Game**: http://192.168.86.48:5173/
- **Preview gallery** (every card + status + animation showroom): http://192.168.86.48:5173/?preview=1

## Round 2 — Real hero artwork

After visual QA via Chrome MCP, swapped generated SVG portraits for **real Deadlock hero card art** sourced from `deadlock-api.com`'s public asset bucket. All 15 hero images (`card`/`mm`/`sm` variants, 45 files, ~720 KB total) live in `public/heroes/` and are served by Vite as static assets. `HeroPortrait` now renders an `<img>` with object-fit + radial mask + tint overlay so portraits unify with the frame. `HeroBadge` (small icon) uses the `mm` mini-map variant.

Other round-2 fixes:
- **CardFrame layout rewritten with flex** — name plate, body text, footer no longer overlap (the original absolute positioning collided at small heights).
- **`src/ui/Icons.tsx`** — `SwordIcon`, `HeartIcon`, `SpiritIcon`, `StatPill` SVG components replace the unicode `⚔` and `♥` characters that were falling back to "x" because Cinzel doesn't ship those glyphs.
- **Distinct spell glyphs** — 12 unique compositions (six-point star, crescent, eye, pyramid, chevrons, runic cross, diamonds, wave, sun, rings, fang) hashed by spell id so each spell looks different.
- **Distinct equipment glyphs** — 6 silhouettes (cartridge, chest plate, vial, gauntlet, boots, orb) similarly hashed, with tier dots.
- **Hand fanning + overlap math** retuned for mobile portrait — 4 cards no longer clip at the screen edges; 5+ cards fan with subtle rotation/lift.
- **Hero slot bottom fade** strengthened so stat numbers stay legible over busy portraits.

Verified live via Chrome MCP at 430×932:
- ✓ Real hero portraits in opponent + player areas (Abrams, Dynamo, Kelvin, Seven, Haze, Vindicta, Lash, Paige all recognizable)
- ✓ Hand fanning + tap-to-select + green pulsing valid targets + targeting prompt
- ✓ Long-press hero opens detail sheet with stats / statuses / skill / ult / equipment
- ✓ End-Turn animation: damage floaters (-4, -3), hero death dissolve, AI plays through, slot promotion from bench
- ✓ No console errors

## What landed this session

### Engine (Phase A)
- AI no longer suggests `useSkill(self)` for enemy-only skills (no more `invalid move` console spam).
- AI now short-circuits to `endTurn` when it sees lethal damage on the table.
- **Ultimates unlock at turn 5** — each starting hero's ult drops one copy into your hand once per match. Tracked via `PlayerState.ultsConsumed`.
- **Equipment now stays attached** to its hero (`CardInstance.attached[]`) instead of vanishing into the discard. When the hero dies, all attached equipment goes to discard with them.
- **Deck reshuffle + fatigue**: when your deck empties, the discard reshuffles back in. If both are empty, you take 1 Pure damage on every draw attempt (fatigue).

### Visual identity (Phase B)
- **Framer Motion** added for spring physics on every transition.
- **Web fonts**: Inter Variable (UI) + Cinzel (display, used on card names + section headers + banners).
- **Design tokens** (`src/ui/tokens.ts`) — single source of truth for palette, type ramp, shadow ramp, springs, rarity gem colors, type tints.
- **Hero color identities** for all 15 heroes — primary + accent + role + glyph (`src/cards/art/heroPalette.ts`).
- **Generated SVG hero portraits** — every hero has a unique geometric silhouette by role (tank/marksman/caster/healer/bruiser) with a glyph icon and grain overlay (`src/cards/art/heroArt.tsx`).
- **CardFrame** (`src/ui/CardFrame.tsx`) — shared chrome for hand cards, board slots, and full-size previews. Includes rarity gem, type ribbon (clipped corner), name plate, art window, body text, stat plate footer.
- **Status icons** — 19 hand-crafted inline SVG icons (no more emoji), color-categorized by buff/debuff/utility, with stacking value badges (`src/ui/StatusIcon.tsx`).
- **Glassy chrome** — backdrop-blur panels for player areas, middle bar, log sheet, card preview overlay.

### Motion (Phase C)
- **Layout transitions** on hand cards via `motion.div layout` + `AnimatePresence` — drawing/playing/discarding all morph smoothly.
- **Hero slot dissolve** — defeated heroes shrink, tilt, blur, and fade rather than snap-disappearing (`AnimatePresence mode="popLayout"` on the slot grid).
- **Attack lunge** — at end-of-turn, attacking heroes spring forward with a back-out easing.
- **Damage floaters** — every HP delta spawns a colored floating number that rises and fades. Color-coded by damage type (attack=white, spirit=violet, pure=cyan, heal=green, face dmg=red).
- **Turn banner** — phase flip sweeps a bordered "Your Turn" / "Opponent's Turn" banner across mid-screen with backdrop blur.
- **Skill-ready glint** — heroes with an unused skill get a subtle gold light-sweep across their portrait every few seconds.
- **Targetable glow** — slots that are valid targets pulse green (success-color) with a layered shadow.
- **Active hero indicator** — Active slot has an ally/enemy-tinted border + glow.

### Interaction (Phase D)
- **Drag-to-target** — drag any hand card and drop it on a valid target to play instantly. Tap-then-tap still works (each card snaps back to hand on miss).
- **Tap-and-hold preview** — long-press (~400ms) any hand card to open a 280×392 full-size preview.
- **Hero detail sheet** — long-press any hero (yours or AI's) to open a bottom sheet showing portrait, full stats, every active status with description and turns remaining, the hero's skill (with target type and ready/used state), the linked ultimate, and attached equipment chips.
- **Hand fanning** — when the hand grows, cards fan with subtle rotation and offset; the selected card lifts above the fan.

### Card data (Phase E)
- **Flavor text** filled in for the 6 stub heroes (Lady Geist, Mo & Krill, Shiv, Sinclair, Viscous, Yamato).
- **`tests/engine/abilities.spec.ts`** — every spell, equipment, hero skill, and ultimate is asserted to map to a registered ability and execute without throwing. Plus an ult-unlock no-double-issuance test.

## Tests

```
$ npx vitest run
 ✓ tests/engine/abilities.spec.ts (6 tests)
 ✓ tests/engine/smoke.spec.ts (5 tests)
 Tests  11 passed (11)
```

## Build

```
$ npm run build
dist/assets/index-…js   484.52 kB │ gzip: 150.87 kB
✓ built in 621ms
```

## Visual checklist — what to look at on phone

Open http://192.168.86.48:5173/?preview=1 first to scan everything in seconds:

1. **15 hero portraits** — each one looks distinct (color + role silhouette + glyph), not a blob of the same shape
2. **22 equipment** — the 2 mythic Tier 3s (Divine Barrier, Titanic Magazine) glow gold
3. **15 ultimates** — gold border, faint hero portrait behind a giant "ULT" mark
4. **19 status icons** — clean SVG, badge values legible, color-coded
5. **"Play sequence"** button at the top of the gallery → triggers banner + damage + heal floaters

Then http://192.168.86.48:5173/ for the live game:

6. **Type** — Cinzel on card names (serif, all-caps), Inter elsewhere
7. **Tap a hand card** — it lifts, glows, valid targets pulse green
8. **Drag a hand card** onto an opponent → plays instantly with arc
9. **Long-press a hand card** → full-size preview overlay
10. **Long-press a hero on board** → detail sheet bottom-up with skill text, statuses, ult, equipment
11. **End turn** → banner sweeps, AI plays after ~800ms with visible card motion
12. **Damage** → floating numbers over heroes
13. **Defeated hero** → dissolves with blur + tilt, never snap-vanishes
14. **Turn 5** → unlock log entries appear, ult cards drop in your hand with gold border

## Deferred (would be next)

- **Targeting line** — explicit SVG curve from selected card to cursor (drag visual already covers most of this).
- **Better hero swap UI** — the `moveHero` move exists but no UI to invoke it from board (long-press could open a swap option in the sheet).
- **Match clock** — turn timer countdown.
- **Replay viewer** — scroll back through turns.
- **Screenshots** — I can't take screenshots from this CLI. The preview gallery is the closest substitute.

## Known minor issues

- Healing on a hero already at full HP shows no floater (correct behavior — heal returned 0 — but might feel like nothing happened). Could add a "+0 IMM" indicator if it bothers you.
- AI's hand size is shown but content stays hidden (intended).
- After the deck reshuffles, statuses on cards are cleared (intentional — they re-enter clean).

## Files touched this session

**New:**
- `src/ui/tokens.ts`, `src/ui/CardFrame.tsx`, `src/ui/StatusIcon.tsx`
- `src/ui/DamageFloater.tsx`, `src/ui/TurnBanner.tsx`, `src/ui/CardPreview.tsx`, `src/ui/HeroDetailSheet.tsx`
- `src/ui/PreviewGallery.tsx`
- `src/cards/art/heroPalette.ts`, `src/cards/art/heroArt.tsx`
- `tests/engine/abilities.spec.ts`

**Rewritten:**
- `src/ui/Board.tsx`, `src/ui/Hand.tsx`, `src/ui/HeroSlot.tsx`, `src/ui/PlayerArea.tsx`
- `src/ui/Log.tsx`, `src/ui/TargetingOverlay.tsx`, `src/ui/styles.css`
- `src/main.tsx` (font imports + preview routing)
- `src/engine/game.ts` (ult unlock, reshuffle, equip attach)
- `src/engine/types.ts` (`attached`, `ultsConsumed`)
- `src/engine/damage.ts` (`reapDead` discards attached)
- `src/ai/heuristic.ts` (target filtering + lethal short-circuit)

**Dependencies added:** `framer-motion`, `@fontsource-variable/inter`, `@fontsource/cinzel`
