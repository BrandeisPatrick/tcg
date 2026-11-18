import { poster } from '../poster';

/**
 * A printed number says what it scales with, by its colour.
 *
 *   purple  grows with Spirit Power   written `{sp:3}`
 *   brown   grows with Bullet Power   written `{bp:3}`
 *   ink     is flat                   written plain
 *
 * A damage number says its type the same way (Patrick, 2026-11-17: "deal 1
 * damage", the colour telling bullet from spirit, "so the words … less"). The
 * card data still names the type ("deal 3 spirit damage", "{sp:3} spirit
 * damage"); `parseMarkup` drops the word and marks the number: purple for
 * spirit damage, brown for bullet damage, whether it scales or not. A flat
 * typed number can also be written `{s:3}` / `{b:3}` (the hero sheet's lines).
 *
 * A card marks only the numbers the effect really adds the caster's power to
 * (`spi(source)`, `activeSpi`, `ultSpi`, a channel's pulse, ... in
 * src/abilities and src/engine/statusOps.ts): the text prints "3", never
 * "3+Sp". Two extensions of the markup, for the two shapes the rules have:
 *
 *   `{sp:1/2}`  half the power, rounded down. The number after the slash
 *               divides the stat; omitted it is 1. No card uses it since
 *               2026-11-18 (Patrick: halves are "too hard for player to
 *               understand"; CLAUDE.md), but the parser keeps it.
 *   `{sp:0}`    nothing but the power itself (Wraith's Mixed Bullets deal
 *               Spirit Power as spirit damage). With no live value to print
 *               it reads as the words "Spirit Power", never as a "0".
 *
 * Anything that does not match exactly (`{sp:}`, `{sp:x}`, `{sp:3`, `{xx:3}`,
 * `{sp:-3}`, `{sp:1/0}`) is left in the text as it was written.
 *
 * Pure and React-free: RuleText renders the tokens, the Explain popover shows
 * `explainNumber`'s words, and anything that reads card text as a string
 * (the draft dossier, the gallery search, the targeting banner, aria labels)
 * goes through `plainText`.
 */

export type ScaleKind = 'sp' | 'bp';

/** The two damage types a number can be, by colour: spirit purple, bullet brown. */
export type DamageType = 'bullet' | 'spirit';

/** The live figures a number is read against. */
export interface Scale {
  /** Spirit Power the number's owner has right now (a hero's `effectiveSpirit`). */
  spirit?: number;
  /** Bullet Power the owner has right now (a hero's `effectiveAtk`). */
  bullet?: number;
  /** Whose power it is, for the explanation: "Kelvin", "your Active". */
  who?: string;
  /** Print the card's own number and keep the live figure for the explanation
   *  alone: a spell in hand ("4", and "+ your Active's Spirit Power (2 now)"),
   *  an ultimate, a hero card nobody has put in play. Absent, a known figure
   *  is added in and the live total is what prints. */
  printed?: boolean;
  /** How many times the number counts the Spirit Power: 2 in a hero's own
   *  skill or passive (SKILL_SPIRIT_RATE, 2026-11-16), 1 (the default)
   *  everywhere else. Bullet Power always counts once. */
  rate?: number;
}

/** The numbers a mark can name and how each is drawn. */
export const KINDS: Record<ScaleKind, { name: string; ink: string; blurb: string }> = {
  sp: { name: 'Spirit Power', ink: poster.stat.spirit, blurb: 'Purple numbers grow with Spirit Power.' },
  bp: { name: 'Bullet Power', ink: poster.stat.bullet, blurb: 'Brown numbers grow with Bullet Power.' },
};

/** One scaling number as the text wrote it. */
export interface NumberSpec {
  kind: ScaleKind;
  base: number;
  /** The stat is divided by this (rounded down) before it is added. */
  per: number;
  /** It is damage of this type: the type word is dropped and the colour says it. */
  dmg?: DamageType;
  /** A flat number (it scales with nothing), printed only for its damage type. */
  flat?: boolean;
}

type Token =
  | { type: 'text'; text: string }
  | ({ type: 'num'; raw: string } & NumberSpec);

const MARK = /\{(sp|bp|s|b):(\d+)(?:\/(\d+))?\}/g;
/** What follows a scaling number that is damage: " spirit damage", " more bullet damage". */
const TYPE_AFTER = /^(\s+more)?\s+(bullet|spirit)\s+damage/;
/** A plain number that is damage: "3 spirit damage", "+2 bullet damage", "1 more spirit damage". */
const FLAT_DAMAGE = /(?<![\w.])(\d+)(\s+more)?\s+(bullet|spirit)\s+damage/g;

/** Split card text into plain runs and numbers: scaling numbers, and damage
 *  numbers typed by their colour (the type word dropped). Text with no markup
 *  and no damage comes back as one run. */
export function parseMarkup(text: string): Token[] {
  const raw: Token[] = [];
  let at = 0;
  for (const m of text.matchAll(MARK)) {
    const per = m[3] === undefined ? 1 : Number(m[3]);
    if (per < 1) continue; // `{sp:1/0}` is malformed: it stays as written
    const start = m.index ?? 0;
    if (start > at) raw.push({ type: 'text', text: text.slice(at, start) });
    const typed = m[1] === 's' || m[1] === 'b';
    raw.push(typed
      ? { type: 'num', raw: m[0], kind: m[1] === 's' ? 'sp' : 'bp', base: Number(m[2]), per: 1, dmg: m[1] === 's' ? 'spirit' : 'bullet', flat: true }
      : { type: 'num', raw: m[0], kind: m[1] as ScaleKind, base: Number(m[2]), per });
    at = start + m[0].length;
  }
  if (at < text.length || raw.length === 0) raw.push({ type: 'text', text: text.slice(at) });
  // A scaling number that is damage: its type word goes, its colour stays.
  for (let i = 0; i < raw.length - 1; i++) {
    const t = raw[i], next = raw[i + 1];
    if (t.type !== 'num' || t.flat || next.type !== 'text') continue;
    const m = TYPE_AFTER.exec(next.text);
    if (!m) continue;
    t.dmg = m[2] as DamageType;
    next.text = `${m[1] ?? ''} damage${next.text.slice(m[0].length)}`;
  }
  // A plain number that is damage: typed and coloured, flat.
  const out: Token[] = [];
  for (const t of raw) {
    if (t.type !== 'text') { out.push(t); continue; }
    let from = 0;
    for (const m of t.text.matchAll(FLAT_DAMAGE)) {
      const start = m.index ?? 0;
      if (start > from) out.push({ type: 'text', text: t.text.slice(from, start) });
      const dmg = m[3] as DamageType;
      out.push({ type: 'num', raw: m[1], kind: dmg === 'spirit' ? 'sp' : 'bp', base: Number(m[1]), per: 1, dmg, flat: true });
      out.push({ type: 'text', text: `${m[2] ?? ''} damage` });
      from = start + m[0].length;
    }
    if (from === 0) { out.push(t); continue; }
    if (from < t.text.length) out.push({ type: 'text', text: t.text.slice(from) });
  }
  const kept = out.filter((t) => t.type !== 'text' || t.text !== '');
  return kept.length > 0 ? kept : [{ type: 'text', text: '' }];
}

/** Is this number nothing but the stat itself (`{sp:0}`)? */
const isBareStat = (n: NumberSpec): boolean => n.base === 0 && n.per === 1;

/** The stat a number reads, from the figures at hand (a flat number reads none). */
function statOf(n: NumberSpec, scale?: Scale): number | undefined {
  if (n.flat) return undefined;
  return n.kind === 'sp' ? scale?.spirit : scale?.bullet;
}

/** How many times this number counts its stat: a skill's Spirit twice. */
function rateOf(n: NumberSpec, scale?: Scale): number {
  return n.kind === 'sp' ? scale?.rate ?? 1 : 1;
}

/** The live total — base plus the stat (counted `rate` times; halved, rounded
 *  down, for `/2`) — when the stat is known; otherwise undefined. */
export function liveTotal(n: NumberSpec, scale?: Scale): number | undefined {
  const stat = statOf(n, scale);
  return stat === undefined ? undefined : n.base + Math.floor(Math.max(0, stat) * rateOf(n, scale) / n.per);
}

/** What the number prints as: the live total, or the card's own base number
 *  (`scale.printed`, or no figure known). A bare `{sp:0}` with nothing to add
 *  up reads as the stat's name. */
export function shownNumber(n: NumberSpec, scale?: Scale): string {
  const live = scale?.printed ? undefined : liveTotal(n, scale);
  if (live !== undefined) return String(live);
  if (isBareStat(n) && !n.flat) return KINDS[n.kind].name;
  return String(n.base);
}

/** A damage type's colour on the cream paper (the scaling inks: Deadlock's
 *  spirit purple, its bullet brown). */
export const DAMAGE_INK: Record<DamageType, string> = { spirit: poster.stat.spirit, bullet: poster.stat.bullet };

/** The ink a number prints in: its damage type's, else what it scales with. */
export function numberInk(n: NumberSpec): string {
  return n.dmg ? DAMAGE_INK[n.dmg] : KINDS[n.kind].ink;
}

/** Card text as a bare string: `{sp:3}` becomes `3`, `{sp:0}` the stat's name,
 *  "3 spirit damage" "3 damage" as it prints. For every place card text is
 *  read, not drawn — the gallery search, the targeting banner, aria labels.
 *  `typed` keeps the type word ("3 spirit damage"), for a search or a voice
 *  that cannot see the colour. */
export function plainText(text: string | undefined, opts: { typed?: boolean } = {}): string {
  if (!text) return '';
  return parseMarkup(text).map((t) => (t.type === 'text' ? t.text
    : opts.typed && t.dmg ? `${shownNumber(t)} ${t.dmg}` : shownNumber(t))).join('');
}

/** What the popover says about a number. */
interface NumberExplanation {
  title: string;
  /** The ink the number is printed in: the popover's accent. */
  accent: string;
  /** The sum, in words: "3 + Warden's Spirit Power 2 = 5". */
  lead: string;
  /** The rule of the colour. */
  lines: string[];
}

const possessive = (who: string) => `${who}'s`;

/** "3 + Spirit Power", "1 + Kelvin's Spirit Power 2 = 3", "4 + your Active's
 *  Spirit Power (2 now)": the number's arithmetic for whoever it belongs to. */
export function explainNumber(n: NumberSpec, scale?: Scale): NumberExplanation {
  const typeLine = 'Purple numbers are spirit damage, brown numbers bullet damage.';
  if (n.flat && n.dmg) {
    return { title: n.dmg === 'spirit' ? 'Spirit damage' : 'Bullet damage', accent: DAMAGE_INK[n.dmg], lead: `${n.base} ${n.dmg} damage`, lines: [typeLine] };
  }
  const { name, blurb } = KINDS[n.kind];
  const ink = numberInk(n);
  const stat = statOf(n, scale);
  const owner = scale?.who ? `${possessive(scale.who)} ` : '';
  const rate = rateOf(n, scale);
  const times = rate === 1 ? '' : rate === 2 ? 'twice ' : `${rate} × `;
  const power = n.per === 1 ? `${times}${owner}${name}`
    : n.per === 2 ? `half of ${times}${owner}${name}`
    : `${times}${owner}${name} divided by ${n.per}`;
  const rounding = n.per === 1 ? '' : ', rounded down';
  let lead: string;
  if (scale?.printed || stat === undefined) {
    const now = stat === undefined ? '' : ` (${stat} now)`;
    lead = isBareStat(n) ? `${owner}${name}${now}` : `${n.base} + ${power}${now}`;
  } else {
    const total = liveTotal(n, scale)!;
    lead = isBareStat(n)
      ? `${owner}${name} ${stat}`
      : n.per === 1 && rate === 1
        ? `${n.base} + ${owner}${name} ${stat} = ${total}`
        : `${n.base} + ${power} ${stat}${rounding} = ${total}`;
  }
  const lines = [blurb, ...(rate === 2 ? ['A skill or passive counts Spirit Power twice.'] : []), ...(n.dmg ? [`It is ${n.dmg} damage.`] : [])];
  return { title: name, accent: ink, lead, lines };
}
