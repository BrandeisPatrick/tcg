# Art credits

The player-facing version of this list is in the game itself: System menu →
**Art credits**, or the Gallery's **Credits** tab (`?preview=1&tab=credits`).
Both are rendered from `src/art/credits.ts`; keep that file and this one in
step whenever a picture is added or replaced.

## Deadlock brand assets (Valve)

- `deadlock_wordmark_ink.png` — Valve's wordmark, from
  https://www.steamgriddb.com/logo/130957 (SteamGridDB, by user "Lovely"),
  flattened to solid ink from its own alpha for the title sheet's flat
  screen-print look. The source logo is not kept here; the link is.
- `menu_scene.jpg`, `menu_street.jpg` — official Deadlock screenshots from the
  Steam store page (https://store.steampowered.com/app/1422450/), downscaled.
  `menu_scene` is the blurred ground every screen floats on; `menu_street` is
  the street window on the title sheet.
- `menu_scene_ground.png` — `menu_scene.jpg` above, blurred, graded and shrunk
  by `scripts/art/bake_backdrop.sh`; it is what the screens actually draw.

SteamGridDB submissions by user **Lovely** (`/profile/76561197970889908`)
from their "Deadlock Graphical Library" collection.

## Hero, spell and item art

- Hero portraits (`public/heroes/hero_<id>_card.webp`) and the wide splashes
  (`hero_<id>_splash.webp`) are crops of Valve's official hero-select screens,
  taken from a community compilation posted to r/DeadlockTheGame ("A quick
  compilation of all the updated hero select screens"). The source frames are
  kept in `scripts/art/hero_sources/`; `scripts/crop_heroes.py` cuts the
  portraits from them. Rem has no updated select screen, so her portrait comes
  from the asset mirror below.
- The small hero icons (`_mm.webp`, `_sm.webp`) are the game's own icons,
  pulled from the community asset bucket at https://deadlock-api.com/
  (https://assets.deadlock-api.com/).
- Everything in `public/spells/` and `public/items/` is the game's own shop art
  for each item, one icon per card: the wiki's 200×200 shop icon from the
  Deadlock wiki's asset mirror (`https://cdn.deadlock.wiki/<Item_Name>.png`),
  encoded to WebP by `scripts/fetch_item_art.py`. The first set came through the
  asset bucket above; the 41 items added on 2026-11-05 (Monster Rounds through
  Spirit Burn, docs/card-design.md) and the six tier-5 items after them
  (Haunting Shot through Prism Blast) came from the wiki. See
  `public/ART_PIPELINE.md`.
- The status icons in `public/status/` (Stun, Silence, Sleep, Bleed,
  Immobilize, Rabbit Hex, Static Charge, Djinn's Mark, Fixation, the armours
  and their reduction icons, Barrier, Healing, the damage heart, Fire Rate,
  the sprint boot, Unstoppable, Warden's Last Stand, Dynamo's Singularity for
  a channel, and the item glyphs of Mystic Reverb, Siphon Bullets, Return
  Fire, Ethereal Shift and Ricochet for the statuses those grant) are the
  game's own HUD icons, fetched from the Deadlock wiki's asset mirror
  (`https://cdn.deadlock.wiki/<File_Name>.png`) and used as they are: white
  glyphs on transparency, painted in the chip's colour through an SVG filter.
- The map icons (`map_guardian.png`, `map_walker.png`, `map_patron.png`,
  `map_mid_boss.png`, `map_rejuvenator.png` in this folder) are the game's own
  pictures from the same mirror: the wiki's `Guardian.png` (the Lane Guardian;
  `Guardian Icon.png` redirects to it), `Walker Icon.png`, `Patron.png`
  (`Patron Icon.png` redirects to it), `Mid-Boss model.png` (the Midboss page's
  picture; the wiki has no Mid-Boss icon) and `Rejuvenator.png` (the buff's
  icon), downscaled to 128 px. They print on each side's structures strip, the
  Mid-Boss's pit, the Rejuvenator tag and the match-end tags.
  `scripts/art/fetch_map_icons.py` fetches them again (see
  `public/ART_PIPELINE.md`).

## Menu card bills

The painted posters on the title-screen cards were supplied by the project
owner:

- `bill_tutorial.webp` — the Tutorial card and the cover print on the Lessons
  sheet: "Deadlock in 'In Your Dreams!'", one of the fan-made "Deadlock title
  cards" by **Toasty Ghostey** (the "Presented with sound by Toasty Ghostey"
  badge in its corner), drawn in the style of a 1930s cartoon title card. The
  series is posted on Newgrounds
  (https://www.newgrounds.com/art/view/toastyghostey/deadlock-title-cards,
  27 Aug 2024: "Ol' Bully Bebop!", "Ya Urn'd It!", "Lucky Seven", with the
  note "just continuing on with em") and Tumblr
  (https://toastyghostey.tumblr.com/post/759938597611798528/); a later card,
  "Meanie Mina, Dynamo!", is on the artist's Bluesky (8 Nov 2025). This card's
  own post was not found on those feeds; it was supplied by the project owner
  from a Reddit post titled "In Your Dreams" (the file was named
  `in-your-dreams-v0-flzp0vykynld1`), re-encoded to 1200 px for the web.
  Artist links: https://linktr.ee/ToastyGhostey. Used here with credit; ask
  the artist before shipping this anywhere public, and replace it on request.
- `bill_decks.webp` ("Embrace the power from beyond!", a Fairfax Industries
  bill) and `bill_gallery.webp` ("Obscura Labrium") — two of the in-world
  advertising posters **Evgeniy Evstratiy** painted for Valve's Deadlock in
  2024, shown in his ArtStation set "deadlock (alpha) - posters"
  (https://www.artstation.com/artwork/kN9Bax, images 9 and 5; profile
  https://www.artstation.com/evstratiyart). Valve's art, under the same
  fair-use terms as the rest of this project; replaceable on request.
## Type

Bundled through Fontsource under the SIL Open Font License 1.1:

- **Saira** and **Saira Stencil One** — Omnibus-Type
  (https://github.com/Omnibus-Type/Saira). Body and display faces.
- **Caveat Brush** — Impallari Type (https://fonts.google.com/specimen/Caveat+Brush).
  The title sheet's brush-script lead-in.
- **Inter** — Rasmus Andersson (https://rsms.me/inter/). Loaded as the fallback
  face behind Saira.

## Original art in this project

The Story card's dusk skyline (`src/ui/start/cardScenes.tsx`) is hand-authored
SVG drawn for this project in the poster palette, with the campaign route
climbing the city. The level rings, the card icons, the unknown-status mark,
the fallback card glyphs, the title screen, draft lobby and match board are
likewise original.

## Disclaimer

Deadlock and all related assets © Valve Corporation. This is a non-commercial
fan project, used under fair use. Source code under MIT. If Valve or the asset
submitters request removal, replace with custom art or text.
