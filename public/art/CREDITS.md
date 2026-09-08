# Art credits

The player-facing version of this list is in the game itself: System menu →
**Art credits**, or the Gallery's **Credits** tab (`?preview=1&tab=credits`).
Both are rendered from `src/art/credits.ts`; keep that file and this one in
step whenever a picture is added or replaced.

## Deadlock brand assets (Valve)

- `deadlock_wordmark.png` — https://www.steamgriddb.com/logo/130957 (SteamGridDB,
  by user "Lovely"). Kept as the source for the derived file below; not shown
  itself.
- `deadlock_wordmark_ink.png` — the wordmark above, flattened to solid ink from
  its own alpha for the title sheet's flat screen-print look.
- `menu_scene.jpg`, `menu_street.jpg` — official Deadlock screenshots from the
  Steam store page (https://store.steampowered.com/app/1422450/), downscaled.
  `menu_scene` is the blurred ground every screen floats on; `menu_street` is
  the street window on the title sheet.

SteamGridDB submissions by user **Lovely** (`/profile/76561197970889908`)
from their "Deadlock Graphical Library" collection.

## Hero, spell and item art

- Hero portraits (`public/heroes/hero_<id>_card.webp`) and the wide splashes
  (`hero_<id>_splash.webp`) are crops of Valve's official hero-select screens,
  taken from a community compilation posted to r/DeadlockTheGame ("A quick
  compilation of all the updated hero select screens"). The source frames are
  kept in `public/_audit/hero_sources/`; `scripts/crop_heroes.py` cuts the
  portraits from them. Rem has no updated select screen, so her portrait comes
  from the asset mirror below.
- The small hero icons (`_mm.webp`, `_sm.webp`) and everything in
  `public/spells/` and `public/items/` are the game's own icons and shop art,
  pulled from the community asset bucket at https://deadlock-api.com/
  (https://assets.deadlock-api.com/). See `public/ART_PIPELINE.md`.

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
- `bill_heroes.webp` — "Deadlock Vindicta Fan Art Poster Design" by **Dsgnmon**,
  published at https://dribbble.com/shots/25066548-Deadlock-Vindicta-Fan-Art-Poster-Design
  and marked "Fan art by © Dsgnmon 2024. All rights reserved." It fronted the
  Tutorial card until the poster above replaced it and is not on any screen
  now; it stays in the folder under the same terms (ask Dsgnmon before
  shipping it anywhere public, replace on request) in case a card needs it
  again.

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
climbing the city. The level rings, status and card icons, the fallback card
glyphs, the title screen, draft lobby and match board are likewise original.

## Disclaimer

Deadlock and all related assets © Valve Corporation. This is a non-commercial
fan project, used under fair use. Source code under MIT. If Valve or the asset
submitters request removal, replace with custom art or text.
