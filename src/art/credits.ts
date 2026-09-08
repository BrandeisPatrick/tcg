/**
 * Art credits — every picture and typeface the game shows that was not
 * drawn for it: what it is, where the game puts it, who made it, where it
 * came from and on what terms. One list feeds the in-game Credits page
 * (System menu → Art credits) and the Gallery's Credits tab; the
 * repository's long-form companion is public/art/CREDITS.md.
 *
 * Keep the two in step: anything added to public/art, public/heroes,
 * public/spells or public/items belongs here too.
 */
import { fonts } from '@/ui/tokens';
import { poster } from '@/ui/poster';

const BASE = import.meta.env.BASE_URL ?? '/';

export interface CreditLink {
  label: string;
  href: string;
}

/** What the row shows beside its text: a print of the piece itself, or a
 *  type specimen set in the face being credited. */
export type CreditThumb =
  | { kind: 'image'; src: string; position?: string; fit?: 'cover' | 'contain'; ground?: string }
  | { kind: 'type'; family: string; sample: string };

export interface ArtCredit {
  id: string;
  /** The piece, named the way a player would name it. */
  title: string;
  /** Who made it, and where it was published. */
  by: string;
  /** Where the game shows it. */
  where: string;
  /** Where to find the original. Empty when there is nothing to link to. */
  links: CreditLink[];
  /** The terms it is used under here. */
  terms: string;
  thumb: CreditThumb;
}

export interface CreditGroup {
  id: string;
  title: string;
  blurb: string;
  items: ArtCredit[];
}

const VALVE = '© Valve Corporation. Non-commercial fan use; taken down on request.';
const FAN = 'Used with credit. Ask the artist before reusing it; replaced at their request.';
const OFL = 'SIL Open Font License 1.1, bundled through Fontsource.';

const STEAM: CreditLink = { label: 'Deadlock on Steam', href: 'https://store.steampowered.com/app/1422450/' };
const DL_API: CreditLink = { label: 'deadlock-api.com', href: 'https://deadlock-api.com/' };
const DL_BUCKET: CreditLink = { label: 'Assets API', href: 'https://assets.deadlock-api.com/' };
const FONTSOURCE: CreditLink = { label: 'Fontsource', href: 'https://fontsource.org/' };

export const ART_CREDITS: CreditGroup[] = [
  {
    id: 'valve',
    title: 'Deadlock, by Valve',
    blurb: 'The game this one is a tribute to. Its heroes, its items and its city are Valve\'s; these pieces are shown as they are, or cropped to fit.',
    items: [
      {
        id: 'wordmark',
        title: 'Deadlock wordmark',
        by: 'Valve\'s logo, as submitted to SteamGridDB by Lovely.',
        where: 'The lettering on the title sheet, flattened to solid ink.',
        links: [
          { label: 'SteamGridDB logo', href: 'https://www.steamgriddb.com/logo/130957' },
          { label: 'Lovely\'s library', href: 'https://www.steamgriddb.com/profile/76561197970889908' },
        ],
        terms: VALVE,
        thumb: { kind: 'image', src: `${BASE}art/deadlock_wordmark_ink.png`, fit: 'contain', ground: poster.paper },
      },
      {
        id: 'scene',
        title: 'Night scene',
        by: 'Official Deadlock screenshot, from the Steam store page.',
        where: 'The blurred ground every sheet floats on.',
        links: [STEAM],
        terms: VALVE,
        thumb: { kind: 'image', src: `${BASE}art/menu_scene.jpg`, position: '50% 45%' },
      },
      {
        id: 'street',
        title: 'Old New York street',
        by: 'Official Deadlock screenshot, from the Steam store page.',
        where: 'The window beside the title lettering.',
        links: [STEAM],
        terms: VALVE,
        thumb: { kind: 'image', src: `${BASE}art/menu_street.jpg`, position: '55% 60%' },
      },
      {
        id: 'hero-select',
        title: 'Hero portraits and splashes',
        by: 'Valve\'s hero-select screens, cropped from a community compilation posted to r/DeadlockTheGame ("A quick compilation of all the updated hero select screens").',
        where: 'Every hero card and its wide preview: the draft, the Quick Match card, the lessons, the match-end sheet.',
        links: [STEAM],
        terms: `${VALVE} Cropped and downscaled for the web.`,
        thumb: { kind: 'image', src: `${BASE}heroes/hero_abrams_splash.webp`, position: '50% 18%' },
      },
      {
        id: 'hero-icons',
        title: 'Hero badges',
        by: 'The game\'s own hero icons, through the community-run Deadlock Assets API.',
        where: 'The small hero marks in the match log, on the story map and on the merge badge. Rem\'s portrait comes from the same mirror.',
        links: [DL_API, DL_BUCKET],
        terms: VALVE,
        thumb: { kind: 'image', src: `${BASE}heroes/hero_abrams_mm.webp`, position: '50% 30%' },
      },
      {
        id: 'items',
        title: 'Spell and item art',
        by: 'The game\'s shop art for each item, through the Deadlock Assets API.',
        where: 'The picture on every spell and equipment card, and the round icons on the table.',
        links: [DL_API, DL_BUCKET],
        terms: VALVE,
        thumb: { kind: 'image', src: `${BASE}spells/cold_front.webp`, position: '50% 40%' },
      },
    ],
  },
  {
    id: 'posters',
    title: 'Fan posters',
    blurb: 'The painted bills on the menu cards are other artists\' fan work, shown with credit. Each comes down the moment its artist asks.',
    items: [
      {
        id: 'bill-tutorial',
        title: 'Deadlock in "In Your Dreams!"',
        by: 'Toasty Ghostey — a fan poster in the manner of a 1930s cartoon title card, signed in its corner.',
        where: 'The Tutorial card, and the cover print on the Lessons sheet.',
        links: [],
        terms: `${FAN} Re-encoded to 1200 px for the web.`,
        thumb: { kind: 'image', src: `${BASE}art/bill_tutorial.webp`, position: '38% 42%' },
      },
      {
        id: 'bill-decks',
        title: '"Embrace the power from beyond!"',
        by: 'Artist unknown — a Deadlock-universe advertising bill. If you know who painted it, say so and they will be named here.',
        where: 'The Loadout card.',
        links: [],
        terms: `${VALVE} Replaced on request.`,
        thumb: { kind: 'image', src: `${BASE}art/bill_decks.webp`, position: '50% 34%' },
      },
      {
        id: 'bill-gallery',
        title: '"Obscura Labrium"',
        by: 'Artist unknown — a Deadlock-universe advertising bill. If you know who painted it, say so and they will be named here.',
        where: 'The Gallery card.',
        links: [],
        terms: `${VALVE} Replaced on request.`,
        thumb: { kind: 'image', src: `${BASE}art/bill_gallery.webp`, position: '50% 40%' },
      },
    ],
  },
  {
    id: 'type',
    title: 'Type',
    blurb: 'Set in open typefaces, served from the game itself rather than a font network.',
    items: [
      {
        id: 'saira',
        title: 'Saira',
        by: 'Omnibus-Type (Héctor Gatti and team).',
        where: 'Body text, labels, numbers — anything read as a sentence.',
        links: [
          { label: 'Google Fonts', href: 'https://fonts.google.com/specimen/Saira' },
          { label: 'Source', href: 'https://github.com/Omnibus-Type/Saira' },
          FONTSOURCE,
        ],
        terms: OFL,
        thumb: { kind: 'type', family: fonts.ui, sample: 'Aa' },
      },
      {
        id: 'saira-stencil',
        title: 'Saira Stencil One',
        by: 'Omnibus-Type.',
        where: 'Titles, plates, stickers and buttons — anything stamped.',
        links: [
          { label: 'Google Fonts', href: 'https://fonts.google.com/specimen/Saira+Stencil+One' },
          { label: 'Source', href: 'https://github.com/Omnibus-Type/Saira' },
          FONTSOURCE,
        ],
        terms: OFL,
        thumb: { kind: 'type', family: fonts.display, sample: 'Aa' },
      },
      {
        id: 'caveat-brush',
        title: 'Caveat Brush',
        by: 'Impallari Type (Pablo Impallari).',
        where: 'The hand-lettered lead-in on the title sheet, and the starburst seal.',
        links: [
          { label: 'Google Fonts', href: 'https://fonts.google.com/specimen/Caveat+Brush' },
          FONTSOURCE,
        ],
        terms: OFL,
        thumb: { kind: 'type', family: fonts.script, sample: 'Aa' },
      },
      {
        id: 'inter',
        title: 'Inter',
        by: 'Rasmus Andersson.',
        where: 'Loaded as the fallback face behind Saira.',
        links: [
          { label: 'rsms.me/inter', href: 'https://rsms.me/inter/' },
          FONTSOURCE,
        ],
        terms: OFL,
        thumb: { kind: 'type', family: '"Inter Variable", Inter, sans-serif', sample: 'Aa' },
      },
    ],
  },
];

/** Everything on screen that is not in the list above. */
export const ORIGINAL_ART_NOTE =
  'Everything else — the Story skyline, the level rings, the status and card icons, the fallback card glyphs, the sheets and the table itself — was drawn for this game.';

export const ART_DISCLAIMER =
  'Deadlock and all related assets © Valve Corporation. A non-commercial fan project, not affiliated with Valve. The source code is MIT; the art stays its owners\'. Any piece is removed or replaced on request.';
