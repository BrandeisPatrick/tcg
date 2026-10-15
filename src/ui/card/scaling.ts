import { poster } from '../poster';

/**
 * A printed number says what it scales with, by its colour.
 *
 *   purple  grows with Spirit Power   written `{sp:3}`
 *   brown   grows with Bullet Power   written `{bp:3}`
 *   ink     is flat                   written plain
 *
 * A card marks only the numbers the effect really adds the caster's power to
 * (`spi(source)`, `activeSpi`, `ultSpi`, a channel's pulse, ... in
 * src/abilities and src/engine/statusOps.ts): the text prints "3", never
 * "3+Sp". Two extensions of the markup, for the two shapes the rules have:
 *
 *   `{sp:1/2}`  half the power, rounded down: Dynamo's and Paige's skills add
 *               1 + floor(Spirit / 2). The number after the slash divides the
 *               stat; omitted it is 1.
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
}

export type Token =
  | { type: 'text'; text: string }
  | ({ type: 'num'; raw: string } & NumberSpec);

const MARK = /\{(sp|bp):(\d+)(?:\/(\d+))?\}/g;

/** Split card text into plain runs and scaling numbers. Text with no markup
 *  comes back as one run. */
export function parseMarkup(text: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  for (const m of text.matchAll(MARK)) {
    const per = m[3] === undefined ? 1 : Number(m[3]);
    if (per < 1) continue; // `{sp:1/0}` is malformed: it stays as written
    const start = m.index ?? 0;
    if (start > at) out.push({ type: 'text', text: text.slice(at, start) });
    out.push({ type: 'num', raw: m[0], kind: m[1] as ScaleKind, base: Number(m[2]), per });
    at = start + m[0].length;
  }
  if (at < text.length || out.length === 0) out.push({ type: 'text', text: text.slice(at) });
  return out;
}

/** Is this number nothing but the stat itself (`{sp:0}`)? */
export const isBareStat = (n: NumberSpec): boolean => n.base === 0 && n.per === 1;

/** The stat a number reads, from the figures at hand. */
function statOf(n: NumberSpec, scale?: Scale): number | undefined {
  return n.kind === 'sp' ? scale?.spirit : scale?.bullet;
}

/** The live total — base plus the stat (halved, rounded down, for `/2`) — when
 *  the stat is known; otherwise undefined. */
export function liveTotal(n: NumberSpec, scale?: Scale): number | undefined {
  const stat = statOf(n, scale);
  return stat === undefined ? undefined : n.base + Math.floor(Math.max(0, stat) / n.per);
}

/** What the number prints as: the live total, or the card's own base number
 *  (`scale.printed`, or no figure known). A bare `{sp:0}` with nothing to add
 *  up reads as the stat's name. */
export function shownNumber(n: NumberSpec, scale?: Scale): string {
  const live = scale?.printed ? undefined : liveTotal(n, scale);
  if (live !== undefined) return String(live);
  if (isBareStat(n)) return KINDS[n.kind].name;
  return String(n.base);
}

/** Card text as a bare string: `{sp:3}` becomes `3`, `{sp:0}` the stat's name.
 *  For every place card text is read, not drawn — the draft dossier, the
 *  gallery search, the deck editor, the targeting banner, aria labels. */
export function plainText(text: string | undefined): string {
  if (!text) return '';
  return parseMarkup(text).map((t) => (t.type === 'text' ? t.text : shownNumber(t))).join('');
}

/** What the popover says about a number. */
export interface NumberExplanation {
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
  const { name, ink, blurb } = KINDS[n.kind];
  const stat = statOf(n, scale);
  const owner = scale?.who ? `${possessive(scale.who)} ` : '';
  const power = n.per === 1 ? `${owner}${name}`
    : n.per === 2 ? `half of ${owner}${name}`
    : `${owner}${name} divided by ${n.per}`;
  const rounding = n.per === 1 ? '' : ', rounded down';
  let lead: string;
  if (scale?.printed || stat === undefined) {
    const now = stat === undefined ? '' : ` (${stat} now)`;
    lead = isBareStat(n) ? `${owner}${name}${now}` : `${n.base} + ${power}${now}`;
  } else {
    const total = liveTotal(n, scale)!;
    lead = isBareStat(n)
      ? `${owner}${name} ${stat}`
      : n.per === 1
        ? `${n.base} + ${owner}${name} ${stat} = ${total}`
        : `${n.base} + ${power} ${stat}${rounding} = ${total}`;
  }
  return { title: name, accent: ink, lead, lines: [blurb] };
}
