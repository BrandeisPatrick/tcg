import type { CSSProperties, ReactNode } from 'react';
import { PosterButton } from '../chrome';
import { poster } from '../poster';
import { fonts } from '../tokens';

/**
 * The map's corner controls — zoom in, zoom out, and "locate", which flies
 * back to the frontier (every open stop plus where you stand). Chamfered ink
 * squares in PosterButton's voice; a button at its limit goes to the paper
 * outline rather than vanishing, so the column never shifts.
 */
export function MapControls({ canZoomIn, canZoomOut, onZoomIn, onZoomOut, onLocate, style }: {
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
  style?: CSSProperties;
}) {
  return (
    <div data-hud="controls" style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      <MapButton label="Zoom in" disabled={!canZoomIn} onClick={onZoomIn}>
        <path d="M12 5v14M5 12h14" />
      </MapButton>
      <MapButton label="Zoom out" disabled={!canZoomOut} onClick={onZoomOut}>
        <path d="M5 12h14" />
      </MapButton>
      <MapButton label="Show where you can go" onClick={onLocate}>
        <circle cx="12" cy="12" r="6.5" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5" />
      </MapButton>
    </div>
  );
}

function MapButton({ label, disabled, onClick, children }: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <PosterButton
      variant="ink"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      ariaLabel={label}
      title={label}
      style={{
        width: 44, height: 44, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Off: a paper outline, so it still reads over the dark water.
        ...(disabled ? { background: 'rgba(242, 230, 203, 0.92)', color: poster.inkFaint } : null),
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden
        style={{ display: 'block' }} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square">
        {children}
      </svg>
    </PosterButton>
  );
}

/** The credit's height. */
export const CREDIT_H = 18;
/** On a phone, while a sheet or a pick is up over the map, the credit drops
 *  to this far off the bottom, and the overlay keeps the strip below its
 *  controls clear (CREDIT_CLEAR): the credit still shows, never on a button. */
export const CREDIT_LOW = 8;
export const CREDIT_CLEAR = CREDIT_LOW + CREDIT_H + 8;

/** The OpenStreetMap credit the map data's licence (ODbL) asks for — pinned
 *  to the screen, since the sheet itself pans out of view. */
export function OsmCredit({ style }: { style?: CSSProperties }) {
  return (
    <div data-hud="credit" style={{
      padding: '2px 6px',
      background: 'rgba(242, 230, 203, 0.86)',
      color: poster.inkDim,
      fontFamily: fonts.ui, fontSize: 10, fontWeight: 600, lineHeight: '14px',
      whiteSpace: 'nowrap', pointerEvents: 'none',
      ...style,
    }}>© OpenStreetMap contributors</div>
  );
}
