import { palette } from './tokens';

/**
 * Rule-text keywords that get auto-bolded inside `RuleText`. The keyword's
 * color signals its semantic class — debuffs in wine red, buffs in success
 * green, timing markers in brass — which makes scanning a card text fast.
 *
 * Multi-word terms (e.g., "Bullet Resist") MUST be longer than their
 * single-word prefixes ("Bullet") so the regex's longest-match-first sort
 * picks the compound first.
 */
const KEYWORDS: Record<string, string> = {
  // Debuffs (wine red)
  'Stun':           palette.status.debuff,
  'Silence':        palette.status.debuff,
  'Silenced':       palette.status.debuff,
  'Disarm':         palette.status.debuff,
  'Disarmed':       palette.status.debuff,
  'Sleep':          palette.status.debuff,
  'Bleed':          palette.status.debuff,
  'Vulnerable':     palette.status.debuff,
  // Buffs / defenses (success green)
  'Bullet Resist':  palette.status.buff,
  'Spirit Resist':  palette.status.buff,
  'Shield':         palette.status.buff,
  'Weapon Power':   palette.status.buff,
  'Spirit Power':   palette.status.buff,
  'Unstoppable':    palette.status.buff,
  'Invincibility':  palette.status.buff,
  // Timing markers (brass)
  'On attach':      palette.accent,
  'Start of turn':  palette.accent,
  'After attacking':palette.accent,
  'Mythic':         palette.accent,
  // Scaling tag (spirit purple — same as Spirit Power buff family)
  'caster Spirit':  palette.spirit,
  // Damage type labels — make bullet vs spirit damage unmistakable.
  // 'bullet damage' / 'bullet dmg' compounds must come before solo 'bullet'.
  'bullet damage':  palette.atk,
  'bullet dmg':     palette.atk,
  'spirit damage':  palette.spirit,
  'spirit dmg':     palette.spirit,
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
            <strong key={i} style={{ color, fontWeight: 800 }}>{part}</strong>
          );
        }
        return baseColor ? <span key={i} style={{ color: baseColor }}>{part}</span> : <span key={i}>{part}</span>;
      })}
    </>
  );
}
