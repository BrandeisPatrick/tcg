import type { ReactNode } from 'react';
import type { StatusId } from '@/engine/types';
import { poster } from '../poster';
import { Explain } from '../explain/Explain';
import { numberContent, statusContent } from '../explain/content';
import { KINDS, parseMarkup, shownNumber, type NumberSpec, type Scale } from './scaling';

export type { Scale } from './scaling';
export { plainText } from './scaling';

/**
 * Rule-text keywords that get auto-bolded inside `RuleText`. The keyword's
 * colour signals its semantic class — debuffs in the poster red, buffs in
 * the print green, timing markers in plain ink (bold is enough on paper) —
 * which makes scanning a card text fast.
 *
 * Multi-word terms (e.g., "Bullet Resist") MUST be longer than their
 * single-word prefixes ("Bullet") so the regex's longest-match-first sort
 * picks the compound first.
 */
export const KEYWORDS: Record<string, string> = {
  // Debuffs (poster red)
  'Stun':           poster.status.debuff,
  'Silence':        poster.status.debuff,
  'Silenced':       poster.status.debuff,
  'Disarm':         poster.status.debuff,
  'Disarmed':       poster.status.debuff,
  'Sleep':          poster.status.debuff,
  'Bleed':          poster.status.debuff,
  'Vulnerable':     poster.status.debuff,
  'Weaken':         poster.status.debuff,
  'Fixation':       poster.status.debuff,
  'Rooted':         poster.status.debuff,
  'Rabbit':         poster.status.debuff,
  // Buffs / defenses (print green)
  'Bullet Resist':  poster.status.buff,
  'Spirit Resist':  poster.status.buff,
  'Bullet Shield':  poster.status.buff,
  'Spirit Shield':  poster.status.buff,
  'Shield':         poster.status.buff,
  'Bullet Power':   poster.status.buff,
  'Spirit Power':   poster.status.buff,
  'Unstoppable':    poster.status.buff,
  'Dome':           poster.status.buff,
  'Last Stand':     poster.status.buff,
  // Timing markers (ink)
  'On attach':      poster.ink,
  'Start of turn':  poster.ink,
  'After attacking':poster.ink,
  // Scaling tag (spirit plum — same as the Spirit Power buff family)
  'caster Spirit':  poster.stat.spirit,
  // Damage type labels — make bullet vs spirit damage unmistakable.
  // 'bullet damage' / 'bullet dmg' compounds must come before solo 'bullet'.
  'bullet damage':  poster.stat.atk,
  'bullet dmg':     poster.stat.atk,
  'spirit damage':  poster.stat.spirit,
  'spirit dmg':     poster.stat.spirit,
};

/** The keywords that name a status in the registry (src/statuses): hovering
 *  or tapping one says what the status does, as a chip on a tile does.
 *  "Vulnerable" and the timing markers and damage labels are words of the
 *  card, not statuses, and explain nothing. */
export const KEYWORD_STATUS: Record<string, StatusId> = {
  'Stun': 'stun',
  'Silence': 'silenced',
  'Silenced': 'silenced',
  'Disarm': 'disarm',
  'Disarmed': 'disarm',
  'Sleep': 'sleep',
  'Bleed': 'bleed',
  'Weaken': 'weapon_power_down',
  'Fixation': 'fixation',
  'Rooted': 'rooted',
  'Rabbit': 'rabbit',
  'Bullet Resist': 'bullet_resist',
  'Spirit Resist': 'spirit_resist',
  'Shield': 'shield',
  'Bullet Power': 'weapon_power',
  'Spirit Power': 'spirit_power',
  'Unstoppable': 'unstoppable',
  'Dome': 'dome',
  'Last Stand': 'last_stand',
};

/** A power or resist followed by a minus ("Bullet Resist −1") is the debuff. */
const MINUS_VARIANT: Partial<Record<StatusId, StatusId>> = {
  weapon_power: 'weapon_power_down',
  spirit_power: 'spirit_power_down',
  bullet_resist: 'bullet_resist_down',
  spirit_resist: 'spirit_resist_down',
};

/** The status a keyword stands for, and the number the text prints right
 *  after it ("Shield 2", "Bleed 3", "Spirit Resist −2") or, failing that, right
 *  before it ("+2 Bullet Power"). */
export function statusOfKeyword(word: string, following: string, preceding = ''): { id: StatusId; value?: number } | null {
  const named = KEYWORD_STATUS[word];
  if (!named) return null;
  const after = /^\s*([−-]?)(\d+)/.exec(following);
  const before = after ? null : /\+(\d+)\s*$/.exec(preceding);
  const id = (after?.[1] && MINUS_VARIANT[named]) || named;
  return { id, value: after ? Number(after[2]) : before ? Number(before[1]) : undefined };
}

// Build a single global regex from the keys, longest-first to greedily match
// compound terms like "Bullet Resist" before the prefix "Bullet" could win.
const TERMS_SORTED = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length);
const KEYWORD_REGEX = new RegExp(`(${TERMS_SORTED.map(escapeRegex).join('|')})`, 'g');

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Props {
  text: string;
  /** Override the inherit color for non-keyword spans (default: inherit) */
  baseColor?: string;
  /** The keyword inks are picked for cream paper; on a solid action plate
   *  (the red skill plate) they sink into the fill. There, every keyword is
   *  printed in this colour — the plate's own type — and heavier, so it
   *  still stands out from the running text. A scaling number keeps its own
   *  colour as the ground of a small plate instead. */
  keywordColor?: string;
  /** The live figures the scaling numbers are read against: a hero in play
   *  prints base + its Spirit (Bullet) Power; a card in hand prints its own
   *  number and says the live one in the explanation. See card/scaling.ts. */
  scale?: Scale;
  /** A tap on a number or a status word goes through to whatever the text sits
   *  on instead of opening its popup: a card in the hand fan, where a tap is
   *  the card's (it plays, or arms). Hovering still explains it. */
  passTaps?: boolean;
}

/**
 * Renders card rule text with status keywords + timing markers bolded and
 * colored, and its scaling numbers (`{sp:3}`, `{bp:3}`) printed in the colour
 * of what they scale with. Hovering or tapping a number or a status keyword
 * explains it (Explain). Splits on the markup first, then on the keyword
 * regex (capturing group) so matches and gaps alternate in the output array.
 */
export function RuleText({ text, baseColor, keywordColor, scale, passTaps }: Props) {
  if (!text) return null;
  return (
    <>
      {parseMarkup(text).map((tok, i) => (tok.type === 'num'
        ? <ScalingNumber key={i} spec={tok} scale={scale} plate={keywordColor} passTaps={passTaps} />
        : <Keywords key={i} text={tok.text} baseColor={baseColor} keywordColor={keywordColor} passTaps={passTaps} />))}
    </>
  );
}

/** One scaling number: the figure in its colour, asked for its arithmetic. */
function ScalingNumber({ spec, scale, plate, passTaps }: { spec: NumberSpec; scale?: Scale; plate?: string; passTaps?: boolean }) {
  const ink = KINDS[spec.kind].ink;
  const word = shownNumber(spec, scale);
  return (
    <Explain content={numberContent(spec, scale)} underline={!plate} passTaps={passTaps}>
      <span
        data-scales={spec.kind}
        style={plate
          // On an action plate the colour moves to the number's ground.
          ? { background: ink, color: plate, fontWeight: 800, padding: '0 4px', borderRadius: 3, fontVariantNumeric: 'tabular-nums' }
          : { color: ink, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
      >{word}</span>
    </Explain>
  );
}

/** A run of plain text with its keywords bolded and its status words explained. */
function Keywords({ text, baseColor, keywordColor, passTaps }: { text: string; baseColor?: string; keywordColor?: string; passTaps?: boolean }) {
  const parts = text.split(KEYWORD_REGEX);
  const out: ReactNode[] = parts.map((part, i) => {
    const color = KEYWORDS[part];
    if (!color) {
      return baseColor ? <span key={i} style={{ color: baseColor }}>{part}</span> : <span key={i}>{part}</span>;
    }
    const word = (
      <strong style={keywordColor ? { color: keywordColor, fontWeight: 800 } : { color, fontWeight: 700 }}>{part}</strong>
    );
    const status = statusOfKeyword(part, parts[i + 1] ?? '', parts[i - 1] ?? '');
    if (!status) return <span key={i}>{word}</span>;
    return (
      <Explain key={i} content={statusContent(status.id, { value: status.value })} underline passTaps={passTaps}>{word}</Explain>
    );
  });
  return <>{out}</>;
}
