import { Fragment, type ReactNode } from 'react';
import { SwordIcon, SpiritIcon, HeartIcon } from '../card/Icons';
import { palette } from '../tokens';

/** Swap "bullet dmg" / "spirit dmg" / "pure dmg" / "healed" for inline glyphs. */
const PATTERN = /(\bbullet dmg\b|\bspirit dmg\b|\bpure dmg\b|healed)/g;

function glyph(kind: string): ReactNode {
  if (kind === 'bullet dmg') {
    return (
      <span key={`g-bullet`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
        <SwordIcon size={11} color={palette.atk} />
        <span>bullet dmg</span>
      </span>
    );
  }
  if (kind === 'spirit dmg') {
    return (
      <span key={`g-spirit`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
        <SpiritIcon size={11} color={palette.spirit} />
        <span>spirit dmg</span>
      </span>
    );
  }
  if (kind === 'pure dmg') {
    return (
      <span key={`g-pure`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
        <HeartIcon size={11} color={palette.danger} />
        <span>pure dmg</span>
      </span>
    );
  }
  if (kind === 'healed') {
    return (
      <span key={`g-heal`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
        <HeartIcon size={11} color={palette.success} />
        <span>healed</span>
      </span>
    );
  }
  return kind;
}

export function LogLine({ text }: { text: string }) {
  const parts = text.split(PATTERN);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 1) return <Fragment key={i}>{glyph(p)}</Fragment>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
