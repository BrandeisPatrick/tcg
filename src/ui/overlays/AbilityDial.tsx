/**
 * The marks an ability plate on the hero sheet wears for what holds it — the
 * same ones the board's item chips speak, drawn at plate size:
 *
 *   CooldownDial  a ring whose arc is the own turns left of the full
 *                 cooldown, the turns left printed inside it: full the turn
 *                 it is used, emptying as it cools, gone when it is ready
 *   ChargePips    a hard crowd-control item's charges: a pip each, filled
 *                 while it is left
 *   LockGlyph     an ultimate below Level 2
 *
 * Each names itself (role img) for a screen reader and a mouse; the plate's
 * own words stay first, so a plate is still found by its name.
 */
import type { CSSProperties } from 'react';
import { fonts } from '../tokens';

export function CooldownDial({ left, full, size = 28, ink, track, label, style }: {
  /** Own turns left. */
  left: number;
  /** The full cooldown, in own turns. */
  full: number;
  size?: number;
  /** The arc and the number. */
  ink: string;
  /** The ring under the arc. */
  track: string;
  label?: string;
  style?: CSSProperties;
}) {
  const r = 12.5;
  const round = 2 * Math.PI * r;
  const share = full > 0 ? Math.max(0, Math.min(1, left / full)) : 0;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0, lineHeight: 0, ...style }}
    >
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <circle cx="16" cy="16" r={r} fill="none" stroke={track} strokeWidth="3" />
        {share > 0 && (
          <circle
            cx="16" cy="16" r={r} fill="none" stroke={ink} strokeWidth="3"
            strokeDasharray={`${share * round} ${round}`}
            transform="rotate(-90 16 16)"
          />
        )}
      </svg>
      {left > 0 && (
        <span aria-hidden style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: fonts.display, fontSize: Math.round(size * 0.46), lineHeight: 1,
          color: ink, fontVariantNumeric: 'tabular-nums',
        }}>{left}</span>
      )}
    </span>
  );
}

export function ChargePips({ left, total, ink, faint, size = 9, label }: {
  left: number;
  total: number;
  ink: string;
  /** A spent pip's ring. */
  faint: string;
  size?: number;
  label?: string;
}) {
  return (
    <span role="img" aria-label={label} title={label} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.45), flexShrink: 0, lineHeight: 0 }}>
      {Array.from({ length: Math.max(total, left) }, (_, i) => (
        <span key={i} aria-hidden style={{
          width: size, height: size, borderRadius: '50%',
          background: i < left ? ink : 'transparent',
          boxShadow: `inset 0 0 0 1.5px ${i < left ? ink : faint}`,
        }} />
      ))}
    </span>
  );
}

export function LockGlyph({ size = 14, color, hole }: { size?: number; color: string; hole?: string }) {
  return (
    <svg viewBox="0 0 12 14" width={Math.round(size * 12 / 14)} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <path d="M3.3 6.4V4.3a2.7 2.7 0 0 1 5.4 0v2.1" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <rect x="1.2" y="6.2" width="9.6" height="7.2" rx="1.5" fill={color} />
      {hole && <path d="M6 8.6v2.2" stroke={hole} strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
