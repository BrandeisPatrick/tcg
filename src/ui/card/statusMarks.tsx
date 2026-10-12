/**
 * The pictograms a status wears. A status chip is a label on its class colour;
 * the statuses that stand for a place, a thing or a count of something carry a
 * small printed mark in front of the label, and the FX layer slaps the same mark
 * above the sticker when the status lands. One drawing per mark, so a chip and
 * the sticker it began as always show the same picture:
 *
 *   fixation   a reticle — the mark an attacker fixed on its target (its stack
 *              count rides in the middle on the sticker; the chip prints it)
 *   dome       a dome over a base line — nothing gets through to what is under it
 *   rooted     a stem splitting into roots — held where it stands
 *   rabbit     a rabbit's head, ears up — the hexed
 *   last_stand a column of chevrons climbing — a charge building toward its strike
 *
 * Any status the registry does not know (a future id, a typo) gets the diamond
 * tag instead, so there is never a blank chip or sticker; the statuses that
 * already read well as a label, or have a flourish of their own, are left alone.
 *
 * Drawn on a 16-unit grid in `currentColor` line art: the chip prints it in
 * cream on its class colour, the sticker in the status ink over a wider ink
 * underlay (`outline`) so it reads on any art.
 */
import type { StatusId } from '@/engine/types';
import { STATUSES_BY_ID } from '@/statuses';
import { fonts } from '../tokens';

export type MarkKind = 'fixation' | 'dome' | 'rooted' | 'rabbit' | 'last_stand' | 'unknown';

const MARKED: ReadonlySet<string> = new Set(['fixation', 'dome', 'rooted', 'rabbit', 'last_stand']);

/** Which mark a status wears, or null when it has none: the five that have one
 *  of their own, the diamond for an id the registry does not know, nothing for
 *  the rest (their label, or their flourish, says it). */
export function markFor(id: StatusId): MarkKind | null {
  if (MARKED.has(id)) return id as MarkKind;
  return STATUSES_BY_ID[id] ? null : 'unknown';
}

/** The shapes of a mark, in the 16-unit box. Strokes are set by the caller.
 *  `ground` draws the bare outline only (the ink laid under a mark): no tints,
 *  dots or numbers. */
function Shapes({ kind, count, ground = false }: { kind: MarkKind; count?: number; ground?: boolean }) {
  // The closed shapes carry a tint of the mark's own colour, so a small mark
  // reads as a thing and not as a scribble.
  const tint = ground ? {} : { fill: 'currentColor', fillOpacity: 0.4 };
  switch (kind) {
    case 'fixation':
      return (
        <>
          <circle cx="8" cy="8" r="4.7" />
          <path d="M8 0.9V4M8 12V15.1M0.9 8H4M12 8H15.1" />
          {!ground && (count === undefined
            ? <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
            : (
              <text x="8" y="10.3" textAnchor="middle" fontSize="6.6" fontFamily={fonts.display} fill="currentColor" stroke="none">{count}</text>
            ))}
        </>
      );
    case 'dome':
      return (
        <>
          <path d="M2.1 11.6A5.9 5.9 0 0 1 13.9 11.6Z" {...tint} />
          <path d="M0.9 13.6H15.1" />
          {!ground && <path d="M4.5 10A3.8 3.8 0 0 1 7.2 7.2" />}
        </>
      );
    case 'rooted':
      return (
        <>
          <path d="M8 1.4V6" />
          <path d="M8 6C8 8.6 4.6 9.2 3.2 14.6" />
          <path d="M8 6V15" />
          <path d="M8 6C8 8.6 11.4 9.2 12.8 14.6" />
        </>
      );
    case 'rabbit':
      return (
        <>
          <ellipse cx="5.7" cy="4.2" rx="1.6" ry="3.3" {...tint} />
          <ellipse cx="10.3" cy="4.2" rx="1.6" ry="3.3" {...tint} />
          <circle cx="8" cy="10.7" r="4.3" {...tint} />
          {!ground && (
            <>
              <circle cx="6.5" cy="10.2" r="0.75" fill="currentColor" stroke="none" />
              <circle cx="9.5" cy="10.2" r="0.75" fill="currentColor" stroke="none" />
              <circle cx="8" cy="12.2" r="0.7" fill="currentColor" stroke="none" />
            </>
          )}
        </>
      );
    case 'last_stand':
      return (
        <>
          <path d="M3.2 14.2L8 9.8L12.8 14.2" opacity="0.5" />
          <path d="M3.2 9.6L8 5.2L12.8 9.6" opacity="0.78" />
          <path d="M3.2 5L8 0.9L12.8 5" />
        </>
      );
    case 'unknown':
      return (
        <>
          <path d="M8 1.4L14.6 8L8 14.6L1.4 8Z" {...tint} />
          {!ground && <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />}
        </>
      );
  }
}

/** A status's mark at `size` px, or nothing for a status that wears none. */
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
  if (!kind) return null;
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
