import { useState, type CSSProperties } from 'react';
import type { StructureKind } from '@/engine/types';
import { ART_BASE } from '@/art/assets';
import { poster } from '../poster';

/**
 * The map's pictures, Deadlock's own (public/art/map_*.png, fetched from the
 * Deadlock wiki by scripts/art/fetch_map_icons.py, never redrawn): the Lane
 * Guardian, the Walker and the Patron on each side's rule, the Mid-Boss in the
 * pit, the Rejuvenator on the side that holds one.
 *
 * Printed as the shop prints an item (ItemIcon): the art set in a small
 * rounded tile on the graphite ground, inside a keyline of its owner's ink —
 * and, `grey`, greyed and faded the way a tile you cannot act on is (a fallen
 * structure, a Mid-Boss not in the pit). A file that fails to load leaves the
 * bare tile; whoever prints the icon names it in words too.
 */
export type MapIconKind = StructureKind | 'mid_boss' | 'rejuvenator';

/** Where a map icon lives. */
export const mapIconUrl = (kind: MapIconKind) => `${ART_BASE}map_${kind}.png`;

/** The grey of a tile you cannot act on (ItemIcon's `grey`). */
export const GREYED: CSSProperties = { filter: 'grayscale(1) brightness(0.82) contrast(0.9)', opacity: 0.5 };

export function MapIcon({ kind, size, ink = poster.edge, grey = false, ground = poster.frame, round = false, zoom = 1, style }: {
  kind: MapIconKind;
  size: number;
  /** The keyline: the owner's ink (your gold, the rival's sapphire), or the plate's edge. */
  ink?: string;
  grey?: boolean;
  /** What shows through the art's transparent ground. */
  ground?: string;
  /** A disc rather than a rounded square (a badge). */
  round?: boolean;
  /** Bring the picture in closer than its file frames it. */
  zoom?: number;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const radius = round ? '50%' : Math.max(3, Math.round(size * 0.18));
  return (
    <span aria-hidden data-map-icon={kind} style={{
      position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0,
      borderRadius: radius, background: ground, overflow: 'hidden', lineHeight: 0,
      transition: 'opacity 240ms ease, filter 240ms ease',
      ...(grey ? GREYED : {}),
      ...style,
    }}>
      {!failed && (
        <img
          src={mapIconUrl(kind)}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setFailed(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', pointerEvents: 'none',
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
          }}
        />
      )}
      {/* The keyline, over the art. */}
      <span style={{ position: 'absolute', inset: 0, borderRadius: radius, boxShadow: `inset 0 0 0 1.5px ${ink}`, pointerEvents: 'none' }} />
    </span>
  );
}
