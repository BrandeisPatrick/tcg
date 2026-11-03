/**
 * The pictograms a status wears. A status chip is a label on its class colour
 * with a small printed mark in front of it, and the FX layer slaps the same
 * mark above the sticker when the status lands. One drawing per mark, so a chip
 * and the sticker it began as always show the same picture:
 *
 *   Debuffs
 *   stun        three stars in an arc            silenced   a mouth, barred
 *   disarm      a pistol, barred                 sleep      a Z and a smaller z
 *   bleed       three drops, one leading         charged    a bolt in a ring
 *   djinns_mark a flame with a dot at its heart  reverb     three arcs opening right
 *   siphon_drain a cup tipped, a drip falling out
 *   weapon_power_down  a bullet, arrow down      spirit_power_down  a spark, arrow down
 *   bullet_resist_down a cracked plate           spirit_resist_down a cracked ward
 *   healing_boost_down a cross, barred
 *   fixation    a reticle (its stack count rides in the middle on the sticker)
 *   rooted      a stem splitting into roots      rabbit     a rabbit's head, ears up
 *
 *   Buffs and the rest
 *   bullet_resist a riveted plate                spirit_resist a ward, a ring in a ring
 *   shield      a shield                         unstoppable a raised fist
 *   weapon_power  a bullet, arrow up             spirit_power  a spark, arrow up
 *   healing_boost a cross                        extra_attack  two muzzle flashes
 *   casting / casting_light  a ring sending out three pulses
 *   return_fire a bullet and an arrow turning back on it
 *   siphon_gain a cup, a drip falling in         dome       a dome over a base line
 *   last_stand  a column of chevrons climbing    swift      a boot and speed lines
 *   ricochet    a shot bouncing off two walls
 *
 * Swift and Ricochet are drawn ahead of the registry listing them, so they
 * print the moment they land. An id with no drawing (a future id, a typo)
 * gets the diamond tag instead, so there is never a blank chip or sticker.
 *
 * Drawn on a 16-unit grid in `currentColor` line art: the chip prints it in
 * cream on its class colour, the sticker in the status ink over a wider ink
 * underlay (`outline`) so it reads on any art.
 */
import type { ReactNode } from 'react';
import type { StatusId } from '@/engine/types';
import { fonts } from '../tokens';

export type MarkKind =
  // Debuffs
  | 'stun' | 'silenced' | 'disarm' | 'sleep' | 'bleed' | 'charged' | 'djinns_mark' | 'reverb'
  | 'siphon_drain' | 'weapon_power_down' | 'spirit_power_down' | 'bullet_resist_down'
  | 'spirit_resist_down' | 'healing_boost_down' | 'fixation' | 'rooted' | 'rabbit'
  // Buffs and the rest
  | 'bullet_resist' | 'spirit_resist' | 'shield' | 'weapon_power' | 'spirit_power' | 'unstoppable'
  | 'healing_boost' | 'extra_attack' | 'casting' | 'return_fire' | 'siphon_gain' | 'dome' | 'last_stand'
  | 'swift' | 'ricochet'
  // An id with no drawing.
  | 'unknown';

/** The status ids that wear a drawing, and which. Every id wears its own,
 *  except the light channel, which wears the channel's ring. */
const MARK_OF: ReadonlyMap<string, MarkKind> = new Map<string, MarkKind>([
  ...([
    'stun', 'silenced', 'disarm', 'sleep', 'bleed', 'charged', 'djinns_mark', 'reverb',
    'siphon_drain', 'weapon_power_down', 'spirit_power_down', 'bullet_resist_down',
    'spirit_resist_down', 'healing_boost_down', 'fixation', 'rooted', 'rabbit',
    'bullet_resist', 'spirit_resist', 'shield', 'weapon_power', 'spirit_power', 'unstoppable',
    'healing_boost', 'extra_attack', 'casting', 'return_fire', 'siphon_gain', 'dome', 'last_stand',
    'swift', 'ricochet',
  ] as const).map((id): [string, MarkKind] => [id, id]),
  ['casting_light', 'casting'],
]);

/** Which mark a status wears: its own drawing, or the diamond tag for an id
 *  nothing has been drawn for (a future id, a typo). Never blank. */
export function markFor(id: StatusId): MarkKind {
  return MARK_OF.get(id) ?? 'unknown';
}

/** Every status id with a drawing of its own — the registry's and the ones
 *  drawn ahead of it (the Gallery lays them all out). */
export const MARKED_IDS: readonly string[] = [...MARK_OF.keys()];

// ---------------------------------------------------------------------------
// Path helpers, in grid units.
// ---------------------------------------------------------------------------

const n = (v: number) => +v.toFixed(2);
type Pt = [number, number];
const poly = (list: Pt[]) => list.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + 'Z';

/** A star about (x, y): `points` tips at `r`, the notches between at `ri`,
 *  the first tip straight up (turned by `turn` radians). */
function star(x: number, y: number, r: number, ri: number, points: number, turn = 0): string {
  return poly(Array.from({ length: points * 2 }, (_, k): Pt => {
    const a = -Math.PI / 2 + turn + (k * Math.PI) / points;
    const at = k % 2 ? ri : r;
    return [x + Math.cos(a) * at, y + Math.sin(a) * at];
  }));
}

/** A four-point spark (the spirit's sign). */
const spark = (x: number, y: number, r: number) => star(x, y, r, r * 0.34, 4);

/** A drop, its round foot centred on (x, y) at radius `r`, its tip above. */
function drop(x: number, y: number, r: number): string {
  const tip = y - r * 2.25;
  return `M${n(x)} ${n(tip)}C${n(x + r * 0.3)} ${n(y - r * 1.5)} ${n(x + r)} ${n(y - r * 0.9)} ${n(x + r)} ${n(y)}`
    + `A${n(r)} ${n(r)} 0 0 1 ${n(x - r)} ${n(y)}`
    + `C${n(x - r)} ${n(y - r * 0.9)} ${n(x - r * 0.3)} ${n(y - r * 1.5)} ${n(x)} ${n(tip)}Z`;
}

/** A round standing on its base, nose up: `w` wide, from `top` to `bottom`. */
function bullet(x: number, top: number, w: number, bottom: number): string {
  const l = x - w / 2, r = x + w / 2, shoulder = top + w * 0.95;
  return `M${n(l)} ${n(bottom)}V${n(shoulder)}C${n(l)} ${n(top + w * 0.35)} ${n(x - w * 0.22)} ${n(top)} ${n(x)} ${n(top)}`
    + `C${n(x + w * 0.22)} ${n(top)} ${n(r)} ${n(top + w * 0.35)} ${n(r)} ${n(shoulder)}V${n(bottom)}Z`;
}

/** A small arrow up or down the column at `x`, between `top` and `bottom`. */
function arrow(x: number, top: number, bottom: number, up: boolean): string {
  const [from, to] = up ? [bottom, top] : [top, bottom];
  const back = up ? to + 2.5 : to - 2.5;
  return `M${n(x)} ${n(from)}V${n(to)}M${n(x - 2.3)} ${n(back)}L${n(x)} ${n(to)}L${n(x + 2.3)} ${n(back)}`;
}

/** An arc of radius `r` about (cx, cy), from angle `a0` to `a1` (degrees,
 *  0 = right, clockwise on screen). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number): Pt => [cx + Math.cos((a * Math.PI) / 180) * r, cy + Math.sin((a * Math.PI) / 180) * r];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${n(x0)} ${n(y0)}A${n(r)} ${n(r)} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${n(x1)} ${n(y1)}`;
}

// The shapes more than one mark is built from.
const PLATE = { x: 2.2, y: 2.2, width: 11.6, height: 11.6, rx: 2.8 };
const WARD = { cx: 8, cy: 8, r: 6.5 };
const CROSS = 'M6 1.8H10V6H14.2V10H10V14.2H6V10H1.8V6H6Z';
/** The bar through a mark that says "not": low left to high right, steeper
 *  than the diagonal so it never lies along what it crosses out. */
const BAR = 'M3.6 15L12.4 1';

/** The crack a broken plate or ward comes apart along, top to bottom; its
 *  ends are set by the shape. */
const CRACK: Pt[] = [[7.2, 5], [9.2, 8.4], [7.4, 11.6]];
/** How far each piece of a broken shape stands off the crack. */
const SPLIT = 1.35;
const crackFrom = (dx: number) => CRACK.map(([x, y]): Pt => [x + dx, y]);

/** A plate broken in two along the crack: the left piece and the right. */
function brokenPlate(): [string, string] {
  const top = 2.2, bottom = 13.8, l = 1.6, r = 14.4, k = 2.6;
  const side = (dx: number, edge: number) => {
    const [t, b] = [8.8 + dx, 8.4 + dx];
    const inward = [...crackFrom(dx)].reverse().map(([x, y]) => `L${n(x)} ${n(y)}`).join('');
    const out = edge < 8
      ? `H${n(edge + k)}Q${n(edge)} ${top} ${n(edge)} ${n(top + k)}V${n(bottom - k)}Q${n(edge)} ${bottom} ${n(edge + k)} ${bottom}H${n(b)}`
      : `H${n(edge - k)}Q${n(edge)} ${top} ${n(edge)} ${n(top + k)}V${n(bottom - k)}Q${n(edge)} ${bottom} ${n(edge - k)} ${bottom}H${n(b)}`;
    return `M${n(t)} ${top}${out}${inward}Z`;
  };
  return [side(-SPLIT, l), side(SPLIT, r)];
}

/** A ward broken in two along the crack: the left piece and the right. */
function brokenWard(): [string, string] {
  const r = 5.8;
  const side = (dx: number, left: boolean) => {
    const cx = 8 + dx;
    const [tx, bx] = [8.8 + dx, 8.4 + dx];
    const ty = 8 - Math.sqrt(r * r - (tx - cx) ** 2);
    const by = 8 + Math.sqrt(r * r - (bx - cx) ** 2);
    const inward = [...crackFrom(dx)].reverse().map(([x, y]) => `L${n(x)} ${n(y)}`).join('');
    // The crack runs right of centre, so the left piece is the larger arc.
    return `M${n(tx)} ${n(ty)}A${r} ${r} 0 ${left ? '1 0' : '0 1'} ${n(bx)} ${n(by)}${inward}Z`;
  };
  return [side(-SPLIT, true), side(SPLIT, false)];
}
/** A tumbler, open at the top. */
const CUP = (top: number, bottom: number) =>
  `M3.2 ${n(top)}H12.8L11.6 ${n(bottom - 1.4)}Q11.4 ${n(bottom)} 10 ${n(bottom)}H6Q4.6 ${n(bottom)} 4.4 ${n(bottom - 1.4)}Z`;

// ---------------------------------------------------------------------------
// The drawings.
// ---------------------------------------------------------------------------

interface DrawProps {
  /** Draw the bare outline only (the ink laid under a mark): no tints, no
   *  dots inside a shape, no numbers. */
  ground: boolean;
  /** The closed shapes carry a tint of the mark's own colour, so a small mark
   *  reads as a thing and not as a scribble. Empty on the ground. */
  tint: { fill?: string; fillOpacity?: number };
  count?: number;
}

/** A solid dot; on the ground it is drawn as a stroked ring so the underlay
 *  covers it like any line. */
const dot = (cx: number, cy: number, r: number, ground: boolean) =>
  ground ? <circle cx={cx} cy={cy} r={r} /> : <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

const DRAW: Record<MarkKind, (p: DrawProps) => ReactNode> = {
  // ----- Debuffs -----
  stun: ({ tint }) => (
    <>
      <path d={star(3.3, 10.6, 2.9, 1.25, 5)} {...tint} />
      <path d={star(8, 4.6, 3.4, 1.45, 5)} {...tint} />
      <path d={star(12.7, 10.6, 2.9, 1.25, 5)} {...tint} />
    </>
  ),
  silenced: ({ tint }) => (
    <>
      <path d="M1.6 8.6C3 6.4 4.8 4.8 6.2 5.2C7 5.4 7.6 6 8 6.6C8.4 6 9 5.4 9.8 5.2C11.2 4.8 13 6.4 14.4 8.6C12.6 11.6 3.4 11.6 1.6 8.6Z" {...tint} />
      <path d="M1.6 8.6H14.4" />
      <path d={BAR} />
    </>
  ),
  disarm: ({ tint, ground }) => (
    <>
      <path d="M1.6 4H14.4V7.3H7.6L6.6 13.6H2.8L3.6 7.3H1.6Z" {...tint} />
      {!ground && <path d="M10 7.3Q10 10.2 7.1 10.2" />}
      <path d={BAR} />
    </>
  ),
  sleep: () => (
    <>
      <path d="M1.8 8.4H8.2L1.8 14.6H8.2" />
      <path d="M9.6 1.4H14.4L9.6 6.4H14.4" />
    </>
  ),
  bleed: ({ tint }) => (
    <>
      <path d={drop(3.3, 6.5, 1.9)} {...tint} />
      <path d={drop(12.7, 6.5, 1.9)} {...tint} />
      <path d={drop(8, 11.7, 2.9)} {...tint} />
    </>
  ),
  charged: () => (
    <>
      <circle {...WARD} />
      <path d="M9.4 3.6L6 8.4H10L6.6 12.6" />
    </>
  ),
  djinns_mark: ({ tint, ground }) => (
    <>
      <path d="M8 1.2C8.6 3.8 12.8 5.8 12.8 10A4.8 4.8 0 0 1 3.2 10C3.2 7.6 4.6 6.4 5.4 4.8C6.2 6 6.4 6.8 6.4 7.8C7.6 6.2 8.4 4.2 8 1.2Z" {...tint} />
      {!ground && dot(8, 10.3, 1.4, false)}
    </>
  ),
  reverb: ({ ground }) => (
    <>
      <path d={arc(14.2, 8, 3.4, 140, 220)} />
      <path d={arc(14.2, 8, 6.8, 140, 220)} opacity={ground ? undefined : 0.8} />
      <path d={arc(14.2, 8, 10.2, 140, 220)} opacity={ground ? undefined : 0.6} />
    </>
  ),
  siphon_drain: ({ tint }) => (
    <>
      <path d={CUP(1.4, 9.6)} transform="rotate(38 7 7) translate(-1.6 0)" {...tint} />
      <path d={drop(12.4, 12.8, 1.6)} {...tint} />
    </>
  ),
  weapon_power_down: ({ tint }) => (
    <>
      <path d={bullet(5, 1.6, 5.2, 14.4)} {...tint} />
      <path d="M2.4 10H7.6" />
      <path d={arrow(12.2, 3.4, 12.6, false)} />
    </>
  ),
  spirit_power_down: ({ tint }) => (
    <>
      <path d={spark(5.4, 8, 4.9)} {...tint} />
      <path d={arrow(12.6, 3.4, 12.6, false)} />
    </>
  ),
  bullet_resist_down: ({ tint }) => brokenPlate().map((d) => <path key={d} d={d} {...tint} />),
  spirit_resist_down: ({ tint }) => brokenWard().map((d) => <path key={d} d={d} {...tint} />),
  healing_boost_down: ({ tint }) => (
    <>
      <path d={CROSS} {...tint} />
      <path d={BAR} />
    </>
  ),
  fixation: ({ ground, count }) => (
    <>
      <circle cx="8" cy="8" r="4.7" />
      <path d="M8 0.9V4M8 12V15.1M0.9 8H4M12 8H15.1" />
      {!ground && (count === undefined
        ? dot(8, 8, 0.9, false)
        : (
          <text x="8" y="10.3" textAnchor="middle" fontSize="6.6" fontFamily={fonts.display} fill="currentColor" stroke="none">{count}</text>
        ))}
    </>
  ),
  rooted: () => (
    <>
      <path d="M8 1.4V6" />
      <path d="M8 6C8 8.6 4.6 9.2 3.2 14.6" />
      <path d="M8 6V15" />
      <path d="M8 6C8 8.6 11.4 9.2 12.8 14.6" />
    </>
  ),
  rabbit: ({ tint, ground }) => (
    <>
      <ellipse cx="5.7" cy="4.2" rx="1.6" ry="3.3" {...tint} />
      <ellipse cx="10.3" cy="4.2" rx="1.6" ry="3.3" {...tint} />
      <circle cx="8" cy="10.7" r="4.3" {...tint} />
      {!ground && (
        <>
          {dot(6.5, 10.2, 0.75, false)}
          {dot(9.5, 10.2, 0.75, false)}
          {dot(8, 12.2, 0.7, false)}
        </>
      )}
    </>
  ),

  // ----- Buffs and the rest -----
  bullet_resist: ({ tint, ground }) => (
    <>
      <rect {...PLATE} {...tint} />
      {!ground && <rect x="5.4" y="5.4" width="5.2" height="5.2" rx="1" />}
    </>
  ),
  spirit_resist: ({ tint, ground }) => (
    <>
      <circle {...WARD} {...tint} />
      {!ground && <circle cx="8" cy="8" r="2.6" />}
    </>
  ),
  shield: ({ tint, ground }) => (
    <>
      <path d="M8 1.3L13.8 3.3V8C13.8 11.4 11.4 13.6 8 14.8C4.6 13.6 2.2 11.4 2.2 8V3.3Z" {...tint} />
      {!ground && <path d="M8 4V11.8" opacity={0.7} />}
    </>
  ),
  weapon_power: ({ tint }) => (
    <>
      <path d={bullet(5, 1.6, 5.2, 14.4)} {...tint} />
      <path d="M2.4 10H7.6" />
      <path d={arrow(12.2, 3.4, 12.6, true)} />
    </>
  ),
  spirit_power: ({ tint }) => (
    <>
      <path d={spark(5.4, 8, 4.9)} {...tint} />
      <path d={arrow(12.6, 3.4, 12.6, true)} />
    </>
  ),
  unstoppable: ({ tint, ground }) => (
    <>
      <path d="M5 11.2V14.8H11V11.2" {...tint} />
      <path d="M2.6 9V4A1.35 1.35 0 0 1 5.3 4A1.35 1.35 0 0 1 8 4A1.35 1.35 0 0 1 10.7 4A1.35 1.35 0 0 1 13.4 4V8.8Q13.4 11.2 11 11.2H5Q2.6 11.2 2.6 9Z" {...tint} />
      {!ground && <path d="M5.3 4V5.8M8 4V5.8M10.7 4V5.8M2.6 7.4H8.2Q9.4 7.4 9.4 8.6" />}
    </>
  ),
  healing_boost: ({ tint }) => <path d={CROSS} {...tint} />,
  extra_attack: ({ tint }) => (
    <>
      <path d={star(5.2, 5.2, 4.6, 1.7, 6, Math.PI / 12)} {...tint} />
      <path d={star(11.2, 11.1, 4, 1.5, 6, -Math.PI / 12)} {...tint} />
    </>
  ),
  casting: ({ tint }) => (
    <>
      <circle cx="8" cy="10" r="3.4" {...tint} />
      <path d="M8 4.4V2.2M3.3 7.2L1.4 6.1M12.7 7.2L14.6 6.1" />
    </>
  ),
  return_fire: ({ tint }) => (
    <>
      <path d="M1.6 9.4H5.2C6.8 9.4 8.2 10.4 8.8 11.6C8.2 12.8 6.8 13.8 5.2 13.8H1.6Z" {...tint} />
      <path d="M11 11.6C15.4 11.6 15.4 4.4 11 4.4H4.8M7.3 1.9L4.8 4.4L7.3 6.9" />
    </>
  ),
  siphon_gain: ({ tint }) => (
    <>
      <path d={drop(8, 3.5, 1.45)} {...tint} />
      <path d={CUP(6.8, 14.6)} {...tint} />
    </>
  ),
  dome: ({ tint, ground }) => (
    <>
      <path d="M2.1 11.6A5.9 5.9 0 0 1 13.9 11.6Z" {...tint} />
      <path d="M0.9 13.6H15.1" />
      {!ground && <path d="M4.5 10A3.8 3.8 0 0 1 7.2 7.2" />}
    </>
  ),
  last_stand: () => (
    <>
      <path d="M3.2 14.2L8 9.8L12.8 14.2" opacity="0.5" />
      <path d="M3.2 9.6L8 5.2L12.8 9.6" opacity="0.78" />
      <path d="M3.2 5L8 0.9L12.8 5" />
    </>
  ),
  swift: ({ tint }) => (
    <>
      <path d="M6.6 1.8H10.6V8.2L13.2 9.2Q14.8 9.8 14.8 11.6V13.8H6.6Z" {...tint} />
      <path d="M1.6 5.4H4.2M1.2 8.6H4.2M1.6 11.8H4.2" />
    </>
  ),
  ricochet: ({ ground }) => (
    <>
      <path d="M1.2 1.6V14.4M14.8 1.6V14.4" />
      <path d="M6 14.6L12.6 10.4L3.4 5.8L8.8 3" />
      {dot(10.4, 2.2, 1.5, ground)}
    </>
  ),

  unknown: ({ tint, ground }) => (
    <>
      <path d="M8 1.4L14.6 8L8 14.6L1.4 8Z" {...tint} />
      {!ground && dot(8, 8, 1, false)}
    </>
  ),
};

/** The shapes of a mark, in the 16-unit box. Strokes are set by the caller. */
function Shapes({ kind, count, ground = false }: { kind: MarkKind; count?: number; ground?: boolean }) {
  const tint = ground ? {} : { fill: 'currentColor', fillOpacity: 0.4 };
  return <>{DRAW[kind]({ ground, tint, count })}</>;
}

/** A status's mark at `size` px. */
export function StatusMark({ id, color, outline, size, count }: {
  id: StatusId;
  color: string;
  /** An ink drawn wider underneath, so the mark reads on any ground. */
  outline?: string;
  size: number;
  /** A number to print in the mark where it has room (the reticle's stack). */
  count?: number;
}) {
  const kind = markFor(id);
  // On a chip the line is as thin as it can be and still print; over art, with
  // its ink underlay, it is a little heavier.
  const weight = outline ? 2 : 1.7;
  const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg
      viewBox="0 0 16 16" width={size} height={size} aria-hidden data-mark={kind}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      {outline && (
        <g color={outline} stroke="currentColor" {...line} strokeWidth={weight + 2}>
          <Shapes kind={kind} ground />
        </g>
      )}
      <g color={color} stroke="currentColor" {...line} strokeWidth={weight}>
        <Shapes kind={kind} count={count} />
      </g>
    </svg>
  );
}
