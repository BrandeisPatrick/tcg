import { Fragment, type ReactNode } from 'react';
import { SwordIcon, SpiritIcon, HeartIcon } from '../card/Icons';
import { poster } from '../poster';
import { LOG_SPIRIT_PLUM } from '../helpers';

/** Swap "bullet dmg" / "spirit dmg" / "pure dmg" / "healed" for inline glyphs. */
const PATTERN = /(\bbullet dmg\b|\bspirit dmg\b|\bpure dmg\b|healed)/g;

// Glyph inks for the dark log: cream sword, plum spirit, red pure-damage
// heart, green heal heart — the same hues logEntryColor gives their lines.
const GLYPH = { display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' } as const;

function glyph(kind: string): ReactNode {
  if (kind === 'bullet dmg') {
    return (
      <span key={`g-bullet`} style={GLYPH}>
        <SwordIcon size={11} color={poster.cream} />
        <span>bullet dmg</span>
      </span>
    );
  }
  if (kind === 'spirit dmg') {
    return (
      <span key={`g-spirit`} style={GLYPH}>
        <SpiritIcon size={11} color={LOG_SPIRIT_PLUM} />
        <span>spirit dmg</span>
      </span>
    );
  }
  if (kind === 'pure dmg') {
    return (
      <span key={`g-pure`} style={GLYPH}>
        <HeartIcon size={11} color={poster.red} />
        <span>pure dmg</span>
      </span>
    );
  }
  if (kind === 'healed') {
    return (
      <span key={`g-heal`} style={GLYPH}>
        <HeartIcon size={11} color={poster.green} />
        <span>healed</span>
      </span>
    );
  }
  return kind;
}

/** The engine logs seats as "P0"/"P1" — render them as words. Mid-sentence
 *  occurrences read fine too ("…damage to Rival."). */
function humanize(t: string): string {
  return t
    .replace(/\bP0\b/g, 'You')
    .replace(/\bP1\b/g, 'Rival')
    .replace(/\bplayer 0\b/g, 'You')
    .replace(/\bplayer 1\b/g, 'Rival');
}

export function LogLine({ text }: { text: string }) {
  const parts = humanize(text).split(PATTERN);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 1) return <Fragment key={i}>{glyph(p)}</Fragment>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
