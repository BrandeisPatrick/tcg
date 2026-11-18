/**
 * An ability's picture tile on the hero sheet, and the dial it wears for
 * what holds it. The tile is a square of ink framed in the ability's colour
 * with its white glyph; the dial is printed over it in the same flat inks:
 *
 *   the frame   IS the gauge. While a wait runs it breaks into one segment a
 *               turn, starting at twelve and running clockwise: the turns
 *               served are in the ability's colour, the turns to come are
 *               faint. A whole frame is a ready ability, as it always was.
 *   the wipe    a clock-wipe of ink over the glyph: the dark part is the
 *               wait left, and the lit part grows clockwise from twelve.
 *   the number  the own turns left, stencilled in cream on the clock's hub.
 *   the bar     a charged skill's charges, as Deadlock prints them (Patrick,
 *               2026-11-17: "charge icon should not be dot"): a bar across
 *               the tile's top, one segment a charge, split by thin ink
 *               lines. A charge in hand is white; the next one back fills
 *               in Deadlock's spirit purple as its wait is served; a spent
 *               one is grey. With a charge in hand the glyph stays lit and
 *               the frame whole.
 *   the fill    a charged ultimate waits on damage, not turns, so its glyph
 *               fills from the foot like a level, and its frame has a
 *               segment for each point it needs. Its row prints the count.
 *
 * Motion, each once and short: when the sheet opens the wipe starts full (as
 * the turn it was used) and settles to its value while the served segments
 * ink in one by one; the number stamps in. When an ability has come back
 * since the dial was last looked at (a wait over, a charge returned, a count
 * full), the frame flashes its colour and a keyline rings out once. Under
 * `calm` the final state prints with no motion at all.
 *
 * The dial names itself (role img) for a screen reader and a mouse; the row's
 * own words stay first, so a row is still found by its name.
 */
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TYPE, fonts } from '../tokens';
import { poster, shopInk } from '../poster';
import {
  dialLabel, dialReadiness, dialSegments, dialShade, framePath, segmentDash, type DialModel,
} from './abilityDialModel';

/** The tile's corner, at the sheet's 44px. */
const RADIUS = 7;
/** The frame's weight. */
const FRAME = 2;
/** The ink over the glyph where it is still waiting. */
const SHADE = 0.8;
/** When the open sheet has landed and the dial may move, in seconds. */
const LAND = 0.14;
const EASE = [0.3, 0, 0.15, 1] as const;
/** The charge on its way back fills in Deadlock's spirit purple, as its HUD's does. */
const SPIRIT = shopInk('spirit').ink;

/** How ready each dial was when it was last looked at, by its `memo` key, so
 *  a sheet opened after an ability came back can say so once. */
const lastSeen = new Map<string, number>();

/** True while the dial draws the tile's frame itself (in segments). */
export const dialFramed = (m?: DialModel): boolean => !!m && dialShade(m) > 0;

/**
 * The picture tile every action row prints: `children` (the glyph) on ink,
 * framed in `ink`. Give it a `dial` and it wears the ability's wait.
 */
export function AbilityTile({ ink, size = 44, dim = false, dial, memo, calm = false, children, style }: {
  /** The ability's colour: the frame. */
  ink: string;
  size?: number;
  /** Held back for a reason the dial does not show: the whole tile fades. */
  dim?: boolean;
  dial?: DialModel;
  /** Names this dial among all dials (hero and ability), for its memory. */
  memo?: string;
  calm?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const framed = dialFramed(dial);
  // A tile the dial is shading is not faded as well: the dial is the reason.
  const faded = dim && !framed;
  return (
    <span style={{
      position: 'relative', width: size, height: size, flexShrink: 0, boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: Math.round(size * RADIUS / 44), background: poster.ink,
      boxShadow: framed ? undefined : `inset 0 0 0 ${FRAME}px ${ink}`,
      opacity: faded ? 0.45 : 1, filter: faded ? 'saturate(0.4)' : undefined,
      ...style,
    }}>
      {children}
      {dial && <AbilityDial model={dial} ink={ink} size={size} calm={calm} memo={memo} />}
    </span>
  );
}

/** The dial alone: an overlay the size of its tile (which must be positioned).
 *  `numeral` false leaves the number out (a worn item's wait, Patrick
 *  2026-11-16: "I don't want a number"): the segments and the wipe say it. */
export function AbilityDial({ model, ink, size = 44, calm = false, memo, numeral: showNumeral = true }: {
  model: DialModel;
  ink: string;
  size?: number;
  calm?: boolean;
  memo?: string;
  numeral?: boolean;
}) {
  const clip = useId();
  const shade = dialShade(model);
  const { total, done } = dialSegments(model);
  const readiness = dialReadiness(model);
  const label = dialLabel(model);

  // The "ready" moment: something came back since this dial was last seen.
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (!memo) return;
    const was = lastSeen.get(memo);
    lastSeen.set(memo, readiness);
    if (!calm && was !== undefined && readiness > was) setFlash((n) => n + 1);
  }, [memo, readiness, calm]);

  // Drawn in the sheet's 44 units whatever the size, so every weight scales.
  const S = 44;
  const mid = S / 2;
  const frame = framePath(S, FRAME / 2, RADIUS - FRAME / 2);
  const inner = { x: FRAME, y: FRAME, side: S - 2 * FRAME, r: RADIUS - FRAME };
  // The wipe: a circle whose stroke is as wide as the circle, so a dash of it
  // is a wedge; it reaches past the tile's corners (2r > S / √2).
  const r = S * 0.36;
  const round = 2 * Math.PI * r;
  const framed = shade > 0;
  const wait = model.kind === 'wait' ? model : undefined;
  const charges = wait?.charges;
  const numeral = showNumeral && wait && framed ? wait.left : undefined;
  const move = (delay: number, duration: number) => (calm ? { duration: 0 } : { delay, duration, ease: EASE });

  return (
    <svg
      role="img"
      aria-label={label}
      data-ability-dial={model.kind}
      viewBox={`0 0 ${S} ${S}`}
      width={size}
      height={size}
      style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      <title>{label}</title>
      <defs>
        <clipPath id={clip}>
          <rect x={inner.x} y={inner.y} width={inner.side} height={inner.side} rx={inner.r} />
        </clipPath>
      </defs>

      {/* THE WIPE (a wait) or THE FILL (a charged ultimate), over the glyph. */}
      {framed && (
        <g clipPath={`url(#${clip})`}>
          {wait ? (
            // Counter-clockwise from twelve, so what is left of it is the
            // last of the clock and the lit part grows clockwise.
            <g transform={`translate(${mid} ${mid}) rotate(-90) scale(1 -1)`}>
              <motion.circle
                r={r} fill="none" strokeWidth={2 * r}
                strokeDasharray={`${round} ${round}`}
                initial={calm ? false : { strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: round * (1 - shade) }}
                transition={move(LAND, 0.5)}
                style={{ stroke: poster.ink, opacity: SHADE }}
              />
            </g>
          ) : (
            <motion.rect
              x={inner.x} y={inner.y} width={inner.side}
              initial={calm ? false : { height: inner.side }}
              animate={{ height: inner.side * shade }}
              transition={move(LAND, 0.5)}
              style={{ fill: poster.ink, opacity: SHADE }}
            />
          )}
          {/* The fill's waterline, in the ability's colour. */}
          {!wait && shade < 1 && (
            <motion.rect
              x={inner.x} width={inner.side} height={1.5}
              initial={calm ? false : { y: inner.y + inner.side - 1.5 }}
              animate={{ y: inner.y + inner.side * shade - 0.75 }}
              transition={move(LAND, 0.5)}
              style={{ fill: ink }}
            />
          )}
        </g>
      )}

      {/* THE FRAME, in segments: the turns to come faint, the turns served inked. */}
      {framed && (
        <g fill="none" strokeWidth={FRAME} strokeLinecap="butt">
          {Array.from({ length: total }, (_, i) => {
            const dash = segmentDash(i, total, frame.length, total > 8 ? 1.6 : 2.2);
            return (
              <g key={i}>
                <path d={frame.d} strokeDasharray={dash.array} strokeDashoffset={dash.offset} style={{ stroke: poster.creamFaint }} />
                {i < done && (
                  <motion.path
                    d={frame.d} strokeDasharray={dash.array} strokeDashoffset={dash.offset}
                    initial={calm ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={move(LAND + 0.08 + (0.36 * i) / Math.max(1, total), 0.14)}
                    style={{ stroke: ink }}
                  />
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* THE NUMBER: own turns left. Keyed by its value, so each turn stamps anew. */}
      {numeral !== undefined && shade < 1 && (
        // The clock's hub: ink under the number wherever the glyph is lit again.
        <circle cx={mid} cy={mid} r={10.5} style={{ fill: poster.ink, opacity: 0.84 }} />
      )}
      {numeral !== undefined && (
        <motion.text
          key={numeral}
          x={mid} y={mid} dy="0.36em" textAnchor="middle"
          initial={calm ? false : { opacity: 0, scale: 1.35 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={calm ? { duration: 0 } : { delay: LAND + 0.12, type: 'spring', stiffness: 520, damping: 24, mass: 0.6 }}
          style={{
            fontFamily: fonts.display, fontSize: numeral > TYPE.small ? TYPE.title : TYPE.display, lineHeight: 1,
            fill: poster.cream, stroke: poster.ink, strokeWidth: 3.5, strokeLinejoin: 'round', paintOrder: 'stroke',
            fontVariantNumeric: 'tabular-nums',
          }}
        >{numeral}</motion.text>
      )}

      {/* THE BAR: a charged skill's charges, a segment each, across the tile's top. */}
      {wait && charges && (() => {
        const n = Math.max(charges.max, charges.left);
        const x0 = 5, w = S - 10, h = 7.5, y = -h / 2 + FRAME / 2, line = 1.5;
        const seg = (w - line * (n + 1)) / n;
        const served = wait.left > 0 ? (wait.full - wait.left) / wait.full : 0;
        return (
          <g data-charge-bar={`${charges.left}/${n}`}>
            {/* The ink under it: the thin lines between the segments, and its keyline. */}
            <rect x={x0} y={y} width={w} height={h} rx={1.2} style={{ fill: poster.ink }} />
            {Array.from({ length: n }, (_, i) => {
              const x = x0 + line + i * (seg + line);
              const held = i < charges.left;
              const next = i === charges.left && served > 0;
              return (
                <g key={i}>
                  <rect x={x} y={y + line} width={seg} height={h - 2 * line} style={{ fill: held ? poster.cream : poster.creamFaint }} />
                  {next && (
                    <motion.rect
                      x={x} y={y + line} height={h - 2 * line}
                      initial={calm ? false : { width: 0 }}
                      animate={{ width: seg * served }}
                      transition={move(LAND + 0.1, 0.4)}
                      style={{ fill: SPIRIT }}
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })()}

      {/* THE READY MOMENT: the tile flashes its colour and a keyline rings out. */}
      {flash > 0 && !calm && (
        <g key={flash}>
          <motion.rect
            x={inner.x} y={inner.y} width={inner.side} height={inner.side} rx={inner.r}
            initial={{ opacity: 0.85 }} animate={{ opacity: 0 }}
            transition={{ delay: LAND, duration: 0.42, ease: 'easeOut' }}
            style={{ fill: ink }}
          />
          <motion.rect
            x={1} y={1} width={S - 2} height={S - 2} rx={RADIUS - 1} fill="none" strokeWidth={2}
            initial={{ opacity: 0, scale: 1 }} animate={{ opacity: [0, 1, 0], scale: 1.34 }}
            transition={{ delay: LAND, duration: 0.55, ease: 'easeOut', times: [0, 0.15, 1] }}
            style={{ stroke: ink, transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        </g>
      )}
    </svg>
  );
}
