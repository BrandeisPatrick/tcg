import { useState, type CSSProperties, type ReactNode } from 'react';
import { fonts, text } from '../tokens';
import { poster } from '../poster';
import { RuleText } from './RuleText';
import { CardShine, rarityInk } from './RarityFX';
import {
  type Foil, type Holo, type HoloScope, type HoloStrength, type HoloPalette,
  hasStamp, hasGloss, useFoilPointer,
  FoilEdge, GlossPanel, HoloLayer, foilTextClass, TILT_TRANSFORM,
} from './SpotVarnish';
import { CARDS_BY_ID, CARD_INDEX, CARD_TOTAL } from '@/cards';
import type { CardData } from '@/engine/types';
import { HeroPortrait } from '@/cards/art/heroArt';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { SwordIcon, HeartIcon } from './Icons';

type Size = 'hand' | 'full';

interface Props {
  cardId: string;
  size?: Size;
  selected?: boolean;
  glow?: 'gold' | 'accent' | 'danger' | null;
  style?: CSSProperties;
  /** Hide the top-right hero BP/HP stat pills (used by the skill-used reveal,
   *  where the stat badge is noise — the reveal is about the skill). */
  hideStats?: boolean;
  /** The soul cost to print on the coin, for a card that is an instance in
   *  hand: the engine's `cardCost`, which honours an override (Sinclair's copied
   *  ultimate is free). Omitted, the card's printed cost — right for the deck
   *  editor, the collection and the gallery, where no instance exists. */
  cost?: number;
  /** Player can't pay this card's soul cost right now — the cost coin flips
   *  to warning red so the greyed-out card explains itself at a glance. */
  unaffordable?: boolean;
  /** Pointer feedback — the frame lights and the card lifts under the
   *  cursor. On by default; the scripted cast overlay passes false because it
   *  animates its own motion. */
  physical?: boolean;
  /** Render the scripted cast sheen bar so a parent can sweep it via `--cast`
   *  (used by the play-cast reveal). */
  castSheen?: boolean;
  /** Premium print finish for a rarity-4 sheet — metallic ink on the keyline
   *  and type, and/or a clear varnish on the bands. Off by default: an
   *  ordinary card is a matte screen print and stays one. */
  foil?: Foil | null;
  /** Iridescence, and the plate it was applied to. `holoScope` defaults to
   *  the art window, which keeps it off the rules text. */
  holo?: Holo | null;
  holoScope?: HoloScope;
  holoStrength?: HoloStrength;
  /** Scales a pattern holo's tile; ignored by the wash variants. */
  holoMarkScale?: number;
  /** What the bands are made of; defaults to the game's amber–teal. */
  holoPalette?: HoloPalette;
  /** Turn the card to follow the pointer. Shares --px/--py with the foil, so
   *  the metal catches light because the card moved, which is the point. */
  tilt?: boolean;
}

const SIZES: Record<Size, { w: number; h: number }> = {
  hand: { w: 134, h: 188 },
  full: { w: 300, h: 420 },
};

// The print sits slightly recessed in its frame (the title page's mode cards
// use the same inner edge).
const ART_INNER_EDGE = 'inset 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 -18px 24px -12px rgba(0, 0, 0, 0.5)';
// One dark drop shadow for every card; state colours go on the border and an
// inset ring, never on outer glows.
const CARD_SHADOW = '0 14px 26px rgba(0, 0, 0, 0.35), 0 3px 8px rgba(0, 0, 0, 0.25)';

function typeLabel(data: CardData | undefined): string {
  if (!data) return '';
  switch (data.type) {
    case 'hero': return 'Hero';
    case 'spell': return 'Spell';
    case 'equipment': return `Item · Tier ${data.tier ?? 1}`;
    case 'ultimate': return 'Ultimate';
  }
}

// Hand-tuned SVG fallback art keyed by card id. Used when /spells/{id}.webp or
// /items/{id}.webp is missing — a cream stencil on the charcoal ground keeps
// cards readable instead of showing an empty window. New cards added before
// bitmap art exists also use this. Pips and cross-marks are ink knock-outs.
function FallbackGlyph({ cardId, accent }: { cardId: string; accent: string }) {
  const stroke = poster.ink;
  const common = { fill: 'none', stroke: accent, strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (cardId) {
    case 'surge_of_power':
      return (
        <svg viewBox="0 0 100 100" width="62%" height="62%">
          <defs>
            <radialGradient id="surgeG" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
              <stop offset="60%" stopColor={accent} stopOpacity="0.25" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="42" fill="url(#surgeG)" />
          <path d="M50 14 L60 44 L88 44 L65 62 L74 90 L50 72 L26 90 L35 62 L12 44 L40 44 Z"
            fill={accent} stroke={stroke} strokeWidth="2.5" />
        </svg>
      );
    case 'suppressor':
      return (
        <svg viewBox="0 0 100 100" width="60%" height="60%">
          <circle cx="50" cy="50" r="36" {...common} />
          <line x1="22" y1="22" x2="78" y2="78" {...common} strokeWidth="7" />
          <circle cx="50" cy="50" r="14" fill={accent} stroke={stroke} strokeWidth="2.5" />
        </svg>
      );
    case 'improved_cooldown':
      return (
        <svg viewBox="0 0 100 100" width="60%" height="60%">
          <circle cx="50" cy="50" r="34" {...common} />
          <path d="M50 22 L50 50 L70 60" {...common} strokeWidth="6" />
          <path d="M82 30 L92 30 L92 20" {...common} strokeWidth="4" />
          <path d="M82 30 A38 38 0 0 0 50 14" {...common} strokeWidth="4" />
        </svg>
      );
    case 'diviners_kevlar':
      return (
        <svg viewBox="0 0 100 100" width="62%" height="62%">
          <path d="M50 10 L84 24 L82 60 Q82 78 50 92 Q18 78 18 60 L16 24 Z"
            fill={accent} stroke={stroke} strokeWidth="3" />
          <path d="M50 32 L50 68 M32 50 L68 50" {...common} strokeWidth="6" stroke={stroke} opacity="0.85" />
        </svg>
      );
    case 'boundless_spirit':
      return (
        <svg viewBox="0 0 100 100" width="64%" height="64%">
          <defs>
            <radialGradient id="boundG" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.85" />
              <stop offset="40%" stopColor={accent} stopOpacity="0.9" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="44" fill="url(#boundG)" />
          <path d="M50 18 C66 28, 70 50, 50 82 C30 50, 34 28, 50 18 Z"
            fill={accent} stroke={stroke} strokeWidth="2.5" opacity="0.95" />
          <circle cx="50" cy="44" r="6" fill={stroke} opacity="0.9" />
        </svg>
      );
    case 'frenzy':
      return (
        <svg viewBox="0 0 100 100" width="60%" height="60%">
          <path d="M30 14 L46 50 L24 54 L56 90 L48 56 L72 52 Z"
            fill={accent} stroke={stroke} strokeWidth="3" />
        </svg>
      );
    default:
      // Generic sigil — diamond with inner pip
      return (
        <svg viewBox="0 0 100 100" width="56%" height="56%">
          <path d="M50 14 L86 50 L50 86 L14 50 Z" fill={accent} stroke={stroke} strokeWidth="3" />
          <circle cx="50" cy="50" r="10" fill={stroke} opacity="0.85" />
        </svg>
      );
  }
}

function FallbackArt({ cardId }: { cardId: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: poster.ground,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <FallbackGlyph cardId={cardId} accent={poster.cream} />
    </div>
  );
}

function ArtImg({ src, cardId }: { src: string; cardId: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: poster.ground }}>
      {failed ? <FallbackArt cardId={cardId} /> : (
        // Not draggable: a hand card's drag is the card's, and a native image drag
        // would take the pointer over mid-flick (pointercancel) and drop nothing.
        <img src={src} alt="" loading="lazy" decoding="async" draggable={false}
          onError={() => setFailed(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center top', filter: 'saturate(0.94) contrast(1.05)',
          }} />
      )}
    </div>
  );
}

function ArtWindow({ data }: { data: CardData | undefined }) {
  if (!data) return null;
  if (data.type === 'hero') return <HeroPortrait cardId={data.id} full />;
  if (data.type === 'ultimate') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: poster.ground }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.7, filter: 'saturate(0.94) contrast(1.05)' }}>
          <HeroPortrait cardId={data.linkedHero} full />
        </div>
        {/* ULT wordmark — a cream stencil over the dimmed linked-hero portrait */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.35)',
        }}>
          <span style={{
            color: poster.cream,
            fontFamily: fonts.display,
            fontSize: 22,
            letterSpacing: '0.2em',
            marginRight: '-0.2em',
            textTransform: 'uppercase',
            lineHeight: 1,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
          }}>ULT</span>
        </div>
      </div>
    );
  }
  if (data.type === 'spell') return <ArtImg src={`${import.meta.env.BASE_URL}spells/${data.id}.webp`} cardId={data.id} />;
  if (data.type === 'equipment') return <ArtImg src={`${import.meta.env.BASE_URL}items/${data.id}.webp`} cardId={data.id} />;
  return null;
}

export function CardFrame({
  cardId, size = 'hand', selected = false, glow = null, style, hideStats = false,
  cost: costInPlay, unaffordable = false, physical, castSheen = false, foil = null,
  holo = null, holoScope = 'art', holoStrength = 'medium', holoMarkScale = 1,
  holoPalette = 'amber', tilt = false,
}: Props) {
  const [hover, setHover] = useState(false);
  // Premium-plate flags, read once so the markup below stays declarative.
  const stamped = hasStamp(foil);
  const glossed = hasGloss(foil);
  // One pointer source feeds the foil ramps, the holo sweep and the tilt.
  const pointerLive = !!foil || !!holo || tilt;
  const { ref: foilRef, onPointerMove, onPointerLeave } = useFoilPointer(pointerLive);
  // Pointer feedback is on by default; the cast overlay passes physical={false}.
  const reactive = physical ?? true;
  const lit = reactive && hover;
  const data = CARDS_BY_ID[cardId];
  const sz = SIZES[size];
  const rarity = data?.rarity ?? 1;
  const isHero = data?.type === 'hero';
  // State colour: the glow prop wins (gold = your ultimate / tier-3, accent =
  // selection / legal target, danger = mulligan swap); a bare `selected`
  // reads as the accent. It paints the border and an inset ring.
  const stateColor = glow === 'gold' ? poster.you
    : glow === 'accent' ? poster.target
    : glow === 'danger' ? poster.red
    : selected ? poster.target
    : null;

  // Charcoal frame: art window on top (~55% of the height), an ink type band,
  // then the cream label band with the rules.
  const containerStyle: CSSProperties = {
    width: sz.w,
    height: sz.h,
    borderRadius: 10,
    background: poster.frame,
    border: `2px solid ${stateColor ?? (lit ? poster.frameLit : poster.edge)}`,
    boxShadow: stateColor ? `inset 0 0 0 2px ${stateColor}, ${CARD_SHADOW}` : CARD_SHADOW,
    position: 'relative',
    overflow: 'hidden',
    color: poster.ink,
    fontFamily: fonts.ui,
    cursor: 'default',
    // The rotate(0deg) base is load-bearing: it keeps the card on its own
    // compositor layer, so text antialiasing does not shift when the lift
    // transform kicks in.
    // The rotate(0deg) base stays first among the flat transforms; the tilt's
    // perspective() must lead the whole list to apply to the rotations after it.
    transform: `${tilt ? TILT_TRANSFORM + ' ' : ''}rotate(0deg) ${selected ? 'translateY(-8px)' : lit ? 'translateY(-3px)' : ''}`,
    transition: 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease, border-color 180ms ease',
    // The cast sheen blends (screen) against the card only, not the sheet.
    isolation: 'isolate',
    display: 'flex',
    flexDirection: 'column',
    ...style,
  };

  const artH = size === 'full' ? '58%' : '55%';
  const printedCost = data && data.type !== 'hero' ? data.cost ?? 0 : 0;
  const cost = costInPlay ?? printedCost;
  // A card with no price prints no coin — but a copy made free (Sinclair's
  // copied ultimate) prints a 0, so it does not look like a card with no cost.
  const showCost = !isHero && (cost > 0 || cost !== printedCost);
  const showStats = isHero;

  return (
    <div
      ref={foilRef}
      className={[foil && 'foil', tilt && 'tilt'].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); onPointerLeave(); }}
      onPointerMove={onPointerMove}
    >
      {/* Art window — printed edge to edge across the top portion */}
      <div style={{
        position: 'relative',
        flex: `0 0 ${artH}`,
        minHeight: 0,
        overflow: 'hidden',
        background: poster.ground,
      }}>
        <ArtWindow data={data} />
        <div aria-hidden style={{ position: 'absolute', inset: 0, boxShadow: ART_INNER_EDGE, pointerEvents: 'none' }} />
        {holo && holoScope === 'art' && <HoloLayer variant={holo} strength={holoStrength} markScale={holoMarkScale} palette={holoPalette} />}

        {/* Cost coin (top-left) — an ink disc with a cream numeral; flips to
            the poster red when the player can't afford it so the dimmed card
            explains itself. */}
        {showCost && (
          <div style={{
            position: 'absolute', top: 4, left: 4,
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: unaffordable ? poster.red : poster.ink,
            border: `1px solid ${poster.creamDim}`,
            borderRadius: '50%',
            color: poster.cream,
            fontFamily: fonts.display, fontSize: 12, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            zIndex: 5,
          }}>{cost}</div>
        )}

        {/* Stat chips (top-right) for heroes — ink chips with cream numerals;
            the icon colour carries the stat hue (neutral bullet, red heart). */}
        {showStats && !hideStats && (
          <div style={{
            position: 'absolute', top: 4, right: 4,
            display: 'flex', gap: 3,
          }}>
            <StatPill icon={<SwordIcon size={11} color={poster.cream} />} value={(data as any).atk} />
            <StatPill icon={<HeartIcon size={11} color={poster.stat.hp} />} value={(data as any).hp} />
          </div>
        )}

        {/* Rarity dot (top-right) for non-heroes — a flat fill with an ink ring */}
        {!showStats && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: 10, height: 10, borderRadius: '50%',
            background: rarityInk(rarity),
            border: `1px solid ${poster.ink}`,
            boxSizing: 'border-box',
          }} />
        )}
      </div>

      {/* Type band — an ink tag across the card: the type, plus the hero's
          keywords. One line; a long keyword list clips with an ellipsis. */}
      <div style={{
        position: 'relative',
        flexShrink: 0,
        padding: '4px 9px',
        background: poster.ink,
        color: poster.cream,
        fontFamily: fonts.display,
        fontSize: 10,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        lineHeight: 1.3,
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {/* Foil type on the ink band takes the full ramp — its bright end is
            far lighter than the ink, so the metal reads at full range here. */}
        <span className={stamped ? foilTextClass() : undefined}>
          {typeLabel(data)}
          {isHero && getHeroIdentity((data as any).id).keywords
            .map((k) => ` · ${k}`).join('')}
        </span>
        {glossed && <GlossPanel />}
      </div>

      {/* Cream label band — name and rules printed on paper */}
      <div style={{
        position: 'relative',
        flex: '1 1 auto',
        background: poster.paperBand,
        color: poster.ink,
        display: 'flex',
        flexDirection: 'column',
        padding: '5px 8px 6px',
        minHeight: 0,
      }}>
        {/* The name is set in the stencil display face; rules and labels in
            the ui face. Only colour and weight separate the body's elements. */}

        {/* Name — slightly larger on full-size cards so it reads as the card
            headline above the body text; hand-size keeps the compact 12.
            Allows up to 2 lines so long canon names (e.g. "Extended Magazine",
            "Mystic Regeneration") don't truncate with an ellipsis. */}
        <div
          className={stamped ? foilTextClass(true) : undefined}
          style={{
            fontFamily: fonts.display,
            fontSize: size === 'full' ? 14 : 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            // Omitted when stamped: an inline colour outranks the stylesheet's
            // `color: transparent`, and opaque ink would paint straight over
            // the ramp that background-clip had just knocked out of the glyphs.
            ...(stamped ? null : { color: poster.ink }),
            lineHeight: 1.15,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            // The stamped name needs its own stacking context so the band's
            // varnish layer cannot wash over the foil glyphs.
            position: 'relative',
            zIndex: 1,
          }}
        >
          {data?.name ?? cardId}
        </div>

        {/* Body text (effect) — Skill / Passive label is inlined as a bold
            prefix on the same row as the effect description. */}
        {data?.text && (() => {
          const d = data as any;
          const isSkill = isHero && !!d.skill;
          const isPassive = isHero && !d.skill && !!d.passives?.length;
          const tag = isSkill ? 'Skill' : isPassive ? 'Passive' : null;
          // Hand-size cards are 134×188 — give the effect every pixel:
          // tighter line-height, smaller font, full ink for sharper reads.
          const isHand = size === 'hand';
          return (
            <div style={{
              ...text.body,
              flex: 1,
              marginTop: isHand ? 3 : 4,
              fontSize: isHand ? 11 : 12,
              lineHeight: isHand ? 1.25 : 1.35,
              color: isHand ? poster.ink : poster.inkDim,
              overflow: 'hidden',
            }}>
              {tag && (
                <span style={{
                  fontWeight: 700,
                  // Skill in the poster red, Passive in dim ink — both read as
                  // bold labels and stay clearly distinct at a glance.
                  color: isSkill ? poster.red : poster.inkDim,
                  marginRight: 5,
                }}>{tag}</span>
              )}
              <RuleText text={data.text} />
            </div>
          );
        })()}

        {/* Set / identifier line — only on full-size cards. Hand-size is
            too cramped to give this reference info real estate; the effect
            text takes priority. */}
        {size === 'full' && data && (
          <div style={{
            marginTop: 'auto',
            paddingTop: 3,
            borderTop: `1px solid ${poster.inkRule}`,
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 400,
            color: poster.inkDim,
            fontVariantNumeric: 'tabular-nums',
          }}>
            DLK · Cursed Apple · {String(CARD_INDEX[data.id] ?? 0).padStart(2, '0')}/{CARD_TOTAL}
          </div>
        )}

        {glossed && <GlossPanel paper />}
      </div>

      {/* Cast sheen — only the scripted play-cast bar; the print is otherwise matte */}
      <CardShine rarity={rarity} cast={castSheen} />

      {/* Iridescence over the whole sheet. Above the bands, so it washes the
          rules text too — the reason `art` is the default scope. */}
      {holo && holoScope === 'card' && <HoloLayer variant={holo} strength={holoStrength} markScale={holoMarkScale} palette={holoPalette} />}

      {/* Premium plates, outermost so the keyline rides the card's own edge */}
      {stamped && <FoilEdge />}
    </div>
  );
}

/** Flat stat chip — ink ground, cream numeral, the icon carries the hue. */
function StatPill({ icon, value }: { icon: ReactNode; value: number }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      padding: '2px 6px',
      background: poster.ink,
      color: poster.cream,
      borderRadius: 3,
      fontWeight: 700,
      fontSize: 12,
      lineHeight: 1.2,
      fontVariantNumeric: 'tabular-nums',
    }}>
      {icon}
      <span>{value}</span>
    </div>
  );
}
