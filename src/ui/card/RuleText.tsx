import { poster } from '../poster';

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
const KEYWORDS: Record<string, string> = {
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
  // Buffs / defenses (print green)
  'Bullet Resist':  poster.status.buff,
  'Spirit Resist':  poster.status.buff,
  'Bullet Shield':  poster.status.buff,
  'Spirit Shield':  poster.status.buff,
  'Shield':         poster.status.buff,
  'Bullet Power':   poster.status.buff,
  'Spirit Power':   poster.status.buff,
  'Unstoppable':    poster.status.buff,
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
}

/**
 * Renders card rule text with status keywords + timing markers bolded and
 * colored. Splits on the keyword regex (capturing group) so matches and gaps
 * alternate in the output array.
 */
export function RuleText({ text, baseColor }: Props) {
  if (!text) return null;
  const parts = text.split(KEYWORD_REGEX);
  return (
    <>
      {parts.map((part, i) => {
        const color = KEYWORDS[part];
        if (color) {
          return (
            <strong key={i} style={{ color, fontWeight: 700 }}>{part}</strong>
          );
        }
        return baseColor ? <span key={i} style={{ color: baseColor }}>{part}</span> : <span key={i}>{part}</span>;
      })}
    </>
  );
}
