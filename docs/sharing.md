# Sharing the game

Notes for taking the game public: the message for the one fan artist whose
work is on screen, and the post for r/DeadlockTheGame and the Deadlock
forums. Everything Valve-owned is covered by the fair-use posture in
`LICENSE` and `public/art/CREDITS.md`; the tutorial poster is the one piece
that needs a person's OK. Keep the game free, with no ads or donation links
on the site or in the post.

## Before posting

- [ ] Send the note below to Toasty Ghostey (Tumblr `@toastyghostey`,
      Bluesky `@toastyghostey.newgrounds.com`, or the Reddit account that
      posted "In Your Dreams"). Wait for an answer; if none comes, swap the
      Tutorial cover for original art before posting.
- [ ] Attach the trailer (see below) to the Reddit post, or upload it to
      YouTube, set it Public and paste the link into the post.
- [ ] Read r/DeadlockTheGame's rules and flairs on the day, and post as fan
      content. The official forums (forums.playdeadlock.com) have a fan
      content section and the Deadlock Discord has fan-project channels;
      both are friendlier to project links.
- [ ] Post from an account that does other things on the subreddit; Reddit's
      self-promotion norms apply.

## The link preview

Paste the game's link into a chat app, a forum or a feed and it shows a
picture, a title and a line (2026-11-18). Three things make that:

- **The tags** in `index.html`: Open Graph (`og:title`, `og:description`,
  `og:image` and its size) and the Twitter card (`summary_large_image`). A
  crawler runs no script, so they are plain HTML with whole addresses, and
  the one page answers every link into the game (`?screen=lessons` and
  `?lesson=3` show the same preview).
- **The picture**, `public/link-preview.jpg`: 1200 x 630, about 150 kB. It is
  the title sheet as one card: the lead-in over the wordmark, "A fan-made
  card game", "Not affiliated with Valve Corporation", the red seal and a fan
  of five of the game's own hero cards. What must be read sits in the middle
  square, because some apps crop the picture square. It uses no art that
  needs a person's OK: the tutorial's cover is not on it.
- **The page that draws it**, `?share=1` (`src/ui/share/LinkPreview.tsx`),
  made of the title sheet's and the cards' own components, so nothing is
  redrawn for it.

To bake it again (the title's look, the card frame or one of the five cards
changed):

```bash
npm run dev                                   # in another terminal
node scripts/art/bake_link_preview.mjs        # writes public/link-preview.jpg
```

Apps keep a link's picture for days. To make them fetch a new one at once,
give the file a new name in the bake script and in `index.html` (both tag
families); `tests/ui/link-preview.spec.ts` checks the tags against the file.
The tab icon, `public/favicon.svg`, is the title sheet's dial mark.

## The video

`deadlock-tcg-trailer.mp4` (2026-11-18): 56 s, 1920x1080 at 60 fps, H.264,
about 26 MB, no audio. It is filmed off the game itself, so everything in it is the real
build, and the words on it are captions laid over the page.

| At | Shot | Caption |
|---|---|---|
| 0:00 | The link preview's card, on the dark ground | |
| 0:03 | The hero draft: three picks, the rival's between them | Draft three heroes |
| 0:07 | The deck draft: two offers looked at, one taken | Then pick a deck |
| 0:10 | A whole Quick Match on Auto: the deal and first turns at 1.5x, the middle at 4x, the finish at 1.5x, the Victory sheet | Spend souls on items · One lane. Skills and ultimates. · Fell their Patron to win |
| 0:34 | Tutorial lesson 6, tap by tap: the level-up, the ultimate, the kill, "You learned" | Learn it in 8 short lessons |
| 0:44 | The Loadout, the Story sheet, the Gallery: 2.3 s each | Build your own deck · A story run across New York · 22 heroes · 150+ item cards |
| 0:51 | The card again, over the address | |

The match is one the game played by itself: Auto plays your seat, the AI the
rival's, and the speed-ups are in the filming. It is a win in twelve turns,
with Abrams knocked out and drawn back.

Not in it, on purpose: the title screen and the lessons list. The tutorial's
cover is on both, and it needs its artist's OK first (below).

**How it is made.** `scripts/film/` films the app on its virtual clock
(`?vtclock=1`): the page's time moves one sixtieth of a second, the frame is
photographed, and so on, so the video is smooth however slow the machine is.
`Math.random` is pinned to a seed, so the rival drafts the same heroes and
the same match plays each time. The captions are strings in `shoot.cjs`.

```bash
npm run dev                          # in another terminal
sh scripts/film/shoot-all.sh         # about ten minutes; writes deadlock-tcg-trailer.mp4
```

It needs Playwright and ffmpeg, which are not dependencies of the repo
(`scripts/film/lib.cjs` says where to get them). It films at 1600 x 900 at
1.2x, which is 1920 x 1080 pixels: at 1280 wide the wide board's patron lines
overlap their labels (a layout bug in small desktop windows, not yet fixed).

The two older files, `deadlock-tcg-tutorial.mp4` (the four-lesson tutorial)
and the 69 s trailer, show a game that has changed since: do not post them.

It has no soundtrack. Silent is fine, but if you want music, add it in
YouTube's editor from their free Audio Library — anything else risks a
copyright claim on a video whose whole job is to look above board.

### YouTube fields

**Title** (pick one, both under 100 characters):

- Deadlock as a card game: a free fan project you can play in your browser
- I made a Deadlock card game: draft heroes, build a deck from the item shop

**Description:**

> An unofficial, non-commercial fan project. Not affiliated with Valve.
>
> Play it free in your browser: https://brandeispatrick.github.io/tcg/
> Source (MIT): https://github.com/BrandeisPatrick/tcg
>
> A one-lane card game built on Valve's Deadlock, played against an AI.
> Draft three heroes, play a 16-card deck made of Deadlock's shop items,
> spend souls to gear your heroes up, and push the rival's Guardian, Walker
> and Patron down. There's an 8-lesson tutorial, a story run across a map of
> New York, a deck builder and a gallery of every card. No ads, no accounts,
> works on a phone.
>
> Everything Deadlock in it is Valve's: the hero art, the item art, and the
> in-world posters painted by Evgeniy Evstratiy. Full credits with links are
> in the game under System -> Art credits. Anything comes down on request.
>
> 0:00 Deadlock TCG
> 0:03 Draft three heroes
> 0:07 Pick a deck
> 0:10 A match
> 0:34 The tutorial
> 0:44 Deck builder, story, gallery
> 0:51 Play it

**Tags:** deadlock, deadlock valve, valve, fan game, card game, tcg,
browser game, trailer, indie, fan project

**Settings:** Category Gaming; "No, it's not made for kids"; Public. Leave
comments on — the feedback is the point.

## Message to Toasty Ghostey

Short enough for a DM. Fill in the two links.

> Hi! I'm making a free, unofficial Deadlock fan card game that runs in the
> browser: https://brandeispatrick.github.io/tcg/
>
> Your "In Your Dreams!" title card is the cover of its tutorial (the
> Tutorial card on the title screen and the top of the Lessons page). It's
> credited to you on the in-game credits, with links to your Newgrounds
> title-card series and your link page:
> https://brandeispatrick.github.io/tcg/?preview=1&tab=credits
>
> Before I share the game on r/DeadlockTheGame I wanted to ask whether
> you're okay with that. If you'd rather I didn't use it, or want a
> different credit or link, tell me and I'll change it straight away.
> Thanks for the cards, they're great.

## Reddit post

Drafted 2026-11-18 for the game as it is now. A video or image post with
this as its text, flair for fan content (the subreddit shows a "Fan Art"
flair). Attach the trailer above, or the link preview picture and a few
screenshots. Read the subreddit's self-promotion rules on the day.

Title, pick one:

- I made a free, unofficial Deadlock card game you can play in your browser
- Deadlock as a card game: draft three heroes, build a deck from the item
  shop (free fan project)

Body (Reddit markdown, paste as it is):

```
**Unofficial fan project, not affiliated with Valve.** Free, no ads, no accounts, nothing to install. Works on a phone.

**Play it:** https://brandeispatrick.github.io/tcg/

**Tutorial (8 short lessons):** https://brandeispatrick.github.io/tcg/?screen=lessons

## What it is

A one-lane card game built on Deadlock, played against an AI.

- Draft three heroes, then play a 16-card deck made of Deadlock's shop items. Active items are spells. Passive items are equipment you put on a hero.
- Souls are a bank: 2 each turn, plus a bounty for every kill. Save up or spend now.
- One hero fights in the lane and the rest wait on the bench. Skills are free on a cooldown, and ultimates unlock at level 3.
- Kills push the rival's Guardian, Walker and Patron. Take down the Patron to win.
- A dead hero is shuffled back into your deck and keeps its level and items.

## What's in it

- 22 heroes and 150+ item cards, each under its own name, shop tab and tier
- 8 ready-made decks, plus a deck builder laid out like the shop
- A step-by-step tutorial where every step is one tap
- A story mode: a roguelike run across a map of New York
- A gallery of every card

## Credits

Everything Deadlock in it belongs to Valve: the hero portraits, the item art and the in-game posters (painted by Evgeniy Evstratiy for Valve). The tutorial cover is Toasty Ghostey's "In Your Dreams!" title card, [used with their okay / credited, and coming down if they'd rather]. Full credits with links are in the game under System → Art credits. If anything should come down, tell me and it will.

The code is open source (MIT): https://github.com/BrandeisPatrick/tcg

It's still in playtest and the balance is rough. I'd love to hear where the tutorial lost you, and which hero or item felt unfair.
```

The bracket in the Credits paragraph is the one thing to fill in: it depends
on Toasty Ghostey's answer (above).

## Forum post

Same body. Title: "Deadlock TCG: a free, unofficial fan card game in the
browser".

## If someone asks "is this official?"

> No. It's a fan project by one person, free and non-commercial. Deadlock
> and all its art are Valve's; the credits in the game list every piece and
> where it came from, and anything comes down on request.
