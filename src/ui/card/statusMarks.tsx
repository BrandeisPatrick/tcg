/**
 * The pictograms a status wears. A status chip is a label on its class colour
 * with a small printed mark in front of it, and the FX layer slaps the same
 * mark above the sticker when the status lands. One picture per mark, so a
 * chip and the sticker it began as always show the same one.
 *
 * The pictures are Deadlock's own. Where the game's HUD has an icon for the
 * status, that icon is used as it is (`public/status/<mark>.png`, the white
 * glyphs from the deadlock.wiki asset mirror), painted in the mark's colour
 * through an SVG filter so the chip can print it in cream on its class colour
 * and the sticker in the status ink over an ink underlay (the same glyph,
 * dilated). A status an item grants wears the item's own glyph, the flat icon
 * the HUD prints for an item's buff (the mirror's `<Item>_v1.png`), painted
 * the same way, so every mark is one colour. Only the diamond tag for an id
 * with no picture is drawn here.
 *
 *   Debuffs
 *   stun  Status_Stun            silenced  Status_Silence        disarm  Status_Disarm
 *   sleep  Status_Sleep          bleed  Status_Bleed             rooted  Immobilize
 *   rabbit  Rabbit_Hex           charged  Static_Charge          djinns_mark  Djinn's_Mark
 *   fixation  Fixation (its stack count rides on her head on the sticker)
 *   reverb  Mystic_Reverb_v1     siphon_drain  Siphon_Bullets_v1, an arrow down
 *   weapon_power_down  Bullet_damage, an arrow down   spirit_power_down  Spirit_Icon, an arrow down
 *   bullet_resist_down  Bullet_Resist_Reduction_icon  spirit_resist_down  Spirit_Resist_Reduction_icon
 *   healing_boost_down  Damage_heart
 *
 *   Buffs and the rest
 *   bullet_resist  Bullet_Armor    spirit_resist  Spirit_Armor     shield  Barrier
 *   weapon_power  Bullet_damage    spirit_power  Spirit_Icon       healing_boost  Healing
 *   unstoppable  Status_Unstoppable   extra_attack  Fire_Rate      swift  Move_speed_sprint
 *   invulnerable  Status_Unstoppable, an arrow up (no crowd control, and no damage either)
 *   last_stand  Last_Stand (Warden)  return_fire  Return_Fire_v1   ricochet  Ricochet_v1
 *   dome  Ethereal_Shift_v1   siphon_gain  Siphon_Bullets_v1, an arrow up
 *   casting / casting_light  Singularity: Dynamo's channelled ultimate, the game's glyph for a channel
 *
 * An id with no picture (a future id, a typo) gets the diamond tag instead,
 * so there is never a blank chip or sticker.
 */
import { useId, type CSSProperties } from 'react';
import type { StatusId } from '@/engine/types';
import { fonts } from '../tokens';
import { poster } from '../poster';
import { BASE } from '@/art/assets';

type MarkKind =
  // Debuffs
  | 'stun' | 'silenced' | 'disarm' | 'sleep' | 'bleed' | 'charged' | 'djinns_mark' | 'reverb'
  | 'siphon_drain' | 'weapon_power_down' | 'spirit_power_down' | 'bullet_resist_down'
  | 'spirit_resist_down' | 'healing_boost_down' | 'fixation' | 'rooted' | 'rabbit'
  // Buffs and the rest
  | 'bullet_resist' | 'spirit_resist' | 'shield' | 'weapon_power' | 'spirit_power' | 'unstoppable' | 'invulnerable'
  | 'healing_boost' | 'extra_attack' | 'casting' | 'return_fire' | 'siphon_gain' | 'dome' | 'last_stand'
  | 'swift' | 'ricochet'
  // An id with no picture.
  | 'unknown';

/** The status ids that wear a picture, and which. Every id wears its own,
 *  except the light channel, which wears the channel's ring. */
const MARK_OF: ReadonlyMap<string, MarkKind> = new Map<string, MarkKind>([
  ...([
    'stun', 'silenced', 'disarm', 'sleep', 'bleed', 'charged', 'djinns_mark', 'reverb',
    'siphon_drain', 'weapon_power_down', 'spirit_power_down', 'bullet_resist_down',
    'spirit_resist_down', 'healing_boost_down', 'fixation', 'rooted', 'rabbit',
    'bullet_resist', 'spirit_resist', 'shield', 'weapon_power', 'spirit_power', 'unstoppable', 'invulnerable',
    'healing_boost', 'extra_attack', 'casting', 'return_fire', 'siphon_gain', 'dome', 'last_stand',
    'swift', 'ricochet',
  ] as const).map((id): [string, MarkKind] => [id, id]),
  ['casting_light', 'casting'],
]);

/** Which mark a status wears: its own picture, or the diamond tag for an id
 *  nothing has been set aside for (a future id, a typo). Never blank. */
export function markFor(id: StatusId): MarkKind {
  return MARK_OF.get(id) ?? 'unknown';
}

/** Every status id with a picture of its own — the registry's and the ones
 *  given one ahead of it (the Gallery lays them all out). */
export const MARKED_IDS: readonly string[] = [...MARK_OF.keys()];

// ---------------------------------------------------------------------------
// Where each mark's picture comes from.
// ---------------------------------------------------------------------------

/** A small arrow in the mark's corner, for a status the game has no icon of
 *  its own for but whose opposite it has: the drop of a stat, a transfer — or
 *  one a step past it (Invulnerable is Unstoppable that takes no damage too). */
type Badge = 'down' | 'up';

/** A glyph file's size in pixels, and the box inside it its picture fills
 *  (x, y, width, height): the wiki files carry margins of their own, and a
 *  mark fits the picture, not the file. */
type GlyphBox = { px: [number, number]; box: [number, number, number, number] };

type Source =
  /** The game's HUD icon for the status, or for the item that grants it: a
   *  white glyph on transparency in `public/status/`, painted in the mark's
   *  colour. */
  | ({ kind: 'glyph'; file: string; badge?: Badge } & GlyphBox)
  /** Drawn here. */
  | { kind: 'drawn' };

/** Each glyph file's size, and the box its picture fills (measured: alpha above 24). */
const GLYPH_BOX = {
  bleed: { px: [60, 60], box: [11, 2, 38, 56] },
  bullet_resist: { px: [128, 128], box: [2, 4, 122, 122] },
  bullet_resist_down: { px: [60, 60], box: [3, 6, 51, 47] },
  casting: { px: [137, 137], box: [0, 0, 137, 137] },
  charged: { px: [137, 137], box: [4, 0, 133, 137] },
  disarm: { px: [128, 128], box: [4, 5, 120, 119] },
  djinns_mark: { px: [137, 137], box: [0, 17, 137, 109] },
  ethereal_shift: { px: [128, 128], box: [7, 14, 114, 114] },
  extra_attack: { px: [128, 128], box: [11, 29, 112, 70] },
  fixation: { px: [137, 137], box: [16, 3, 118, 133] },
  healing_boost: { px: [128, 128], box: [8, 9, 112, 110] },
  healing_boost_down: { px: [128, 128], box: [8, 9, 112, 110] },
  last_stand: { px: [137, 137], box: [3, 2, 131, 126] },
  mystic_reverb: { px: [128, 128], box: [9, 17, 108, 94] },
  rabbit: { px: [137, 137], box: [17, 10, 106, 117] },
  return_fire: { px: [128, 128], box: [4, 2, 120, 124] },
  ricochet: { px: [128, 128], box: [8, 20, 112, 100] },
  rooted: { px: [128, 128], box: [13, 6, 102, 116] },
  shield: { px: [128, 128], box: [15, 8, 98, 112] },
  silenced: { px: [128, 128], box: [5, 4, 116, 122] },
  siphon_bullets: { px: [128, 128], box: [0, 0, 128, 128] },
  sleep: { px: [128, 128], box: [2, 4, 120, 122] },
  spirit_power: { px: [48, 46], box: [0, 0, 48, 46] },
  spirit_resist: { px: [128, 128], box: [2, 4, 122, 122] },
  spirit_resist_down: { px: [60, 60], box: [3, 6, 51, 47] },
  stun: { px: [128, 128], box: [8, 21, 112, 86] },
  swift: { px: [128, 128], box: [0, 2, 128, 123] },
  unstoppable: { px: [128, 128], box: [1, 3, 126, 122] },
  weapon_power: { px: [128, 128], box: [4, 9, 119, 110] },
} satisfies Record<string, GlyphBox>;

const glyph = (name: keyof typeof GLYPH_BOX, badge?: Badge): Source => ({ kind: 'glyph', file: `status/${name}.png`, badge, ...GLYPH_BOX[name] });
const drawn: Source = { kind: 'drawn' };

const SOURCE: Record<MarkKind, Source> = {
  // Debuffs
  stun: glyph('stun'),
  silenced: glyph('silenced'),
  disarm: glyph('disarm'),
  sleep: glyph('sleep'),
  bleed: glyph('bleed'),
  charged: glyph('charged'),
  djinns_mark: glyph('djinns_mark'),
  reverb: glyph('mystic_reverb'),
  siphon_drain: glyph('siphon_bullets', 'down'),
  weapon_power_down: glyph('weapon_power', 'down'),
  spirit_power_down: glyph('spirit_power', 'down'),
  bullet_resist_down: glyph('bullet_resist_down'),
  spirit_resist_down: glyph('spirit_resist_down'),
  healing_boost_down: glyph('healing_boost_down'),
  fixation: glyph('fixation'),
  rooted: glyph('rooted'),
  rabbit: glyph('rabbit'),
  // Buffs and the rest
  bullet_resist: glyph('bullet_resist'),
  spirit_resist: glyph('spirit_resist'),
  shield: glyph('shield'),
  weapon_power: glyph('weapon_power'),
  spirit_power: glyph('spirit_power'),
  unstoppable: glyph('unstoppable'),
  invulnerable: glyph('unstoppable', 'up'),
  healing_boost: glyph('healing_boost'),
  extra_attack: glyph('extra_attack'),
  casting: glyph('casting'),
  return_fire: glyph('return_fire'),
  siphon_gain: glyph('siphon_bullets', 'up'),
  dome: glyph('ethereal_shift'),
  last_stand: glyph('last_stand'),
  swift: glyph('swift'),
  ricochet: glyph('ricochet'),
  unknown: drawn,
};

/** The URL of a picture under `public/`, wherever the app is served from. */
const urlOf = (file: string) => `${BASE}${file}`;

// ---------------------------------------------------------------------------
// The pieces a mark is put together from.
// ---------------------------------------------------------------------------

/** How wide the ink underlay stands out round a mark over art, in px. */
const edgeOf = (size: number) => Math.max(1, Math.round(size / 18));

const fill: CSSProperties = { position: 'absolute', inset: 0 };
const lineCaps = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** The game's glyph, its picture fitted to the box and painted in `color`
 *  through its own alpha; over art, the same glyph grown by the underlay's
 *  width in the ink, underneath. Both are SVG filters on the image itself, so
 *  the ink is a true dilation and the glyph stays the file's. */
function Glyph({ url, px, box, color, outline, size }: { url: string; color: string; outline?: string; size: number } & GlyphBox) {
  const id = useId();
  const paint = `${id}p`, ink = `${id}i`;
  const edge = outline ? edgeOf(size) : 0;
  // Fit the picture's box into the mark, a hair inside it so the ink fits too.
  const inner = size - 2 * edge;
  const [bx, by, bw, bh] = box;
  const s = (inner * 0.96) / Math.max(bw, bh);
  const x = (size - bw * s) / 2 - bx * s, y = (size - bh * s) / 2 - by * s;
  const image = { href: url, x, y, width: px[0] * s, height: px[1] * s, preserveAspectRatio: 'none' } as const;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ ...fill, overflow: 'visible' }}>
      <defs>
        <filter id={paint} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feFlood floodColor={color} result="c" />
          <feComposite in="c" in2="SourceAlpha" operator="in" />
        </filter>
        {outline && (
          <filter id={ink} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius={edge} result="fat" />
            <feFlood floodColor={outline} result="c" />
            <feComposite in="c" in2="fat" operator="in" />
          </filter>
        )}
      </defs>
      {outline && <image {...image} filter={`url(#${ink})`} />}
      <image {...image} filter={`url(#${paint})`} />
    </svg>
  );
}

/** The one mark of our own: the diamond tag for an id with no picture. Line
 *  art on a 16-unit grid, the ink laid wider underneath over art. */
function Drawn({ color, outline, size }: { color: string; outline?: string; size: number }) {
  const diamond = 'M8 1.4L14.6 8L8 14.6L1.4 8Z';
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} style={{ ...fill, overflow: 'visible' }}>
      {outline && (
        <g stroke={outline} strokeWidth={4} {...lineCaps}>
          <path d={diamond} />
          <circle cx={8} cy={8} r={1} />
        </g>
      )}
      <g stroke={color} strokeWidth={2} {...lineCaps}>
        <path d={diamond} />
        <circle cx={8} cy={8} r={1} fill={color} stroke="none" />
      </g>
    </svg>
  );
}

/** The arrow in a mark's bottom right corner: down for the drop of a stat or
 *  a drain, up for a gain. Set off from the picture by the ink underlay over
 *  art, and by a shade of ink on a chip. */
function BadgeMark({ dir, color, outline, size }: { dir: Badge; color: string; outline?: string; size: number }) {
  const px = Math.round(size * 0.5);
  const d = dir === 'down' ? 'M5 1.2V8.8M1.6 5.4L5 8.8L8.4 5.4' : 'M5 8.8V1.2M1.6 4.6L5 1.2L8.4 4.6';
  const off = -Math.round(size * 0.06);
  return (
    <svg
      viewBox="0 0 10 10" width={px} height={px} data-badge={dir}
      style={{ position: 'absolute', right: off, bottom: off, overflow: 'visible' }}
    >
      <path d={d} stroke={outline ?? poster.inkDim} strokeWidth={5.2} {...lineCaps} />
      <path d={d} stroke={color} strokeWidth={2.6} {...lineCaps} />
    </svg>
  );
}

/** A status's mark at `size` px. */
export function StatusMark({ id, color, outline, size, count }: {
  id: StatusId;
  color: string;
  /** An ink laid wider underneath, so the mark reads on any ground. */
  outline?: string;
  size: number;
  /** A number to print on the mark where it has room (Fixation's stack, on
   *  Haze's head) — over art only; a chip's pill carries it. */
  count?: number;
}) {
  const kind = markFor(id);
  const src = SOURCE[kind];
  return (
    <span aria-hidden data-mark={kind} style={{ display: 'block', position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {src.kind === 'glyph' && <Glyph url={urlOf(src.file)} px={src.px} box={src.box} color={color} outline={outline} size={size} />}
      {src.kind === 'drawn' && <Drawn color={color} outline={outline} size={size} />}
      {src.kind === 'glyph' && src.badge && <BadgeMark dir={src.badge} color={color} outline={outline} size={size} />}
      {count !== undefined && outline && (
        <span
          data-count={count}
          style={{
            position: 'absolute', left: '47%', top: '52%', transform: 'translate(-50%, -50%)',
            font: `700 ${Math.round(size * 0.42)}px/1 ${fonts.display}`, color: outline, letterSpacing: 0,
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
}
