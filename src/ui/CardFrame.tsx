import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { palette, fonts, shadow, radius, rarityStyle, typeTint } from './tokens';
import { RuleText } from './RuleText';
import { CARDS_BY_ID, CARD_INDEX, CARD_TOTAL } from '@/cards';
import type { CardData } from '@/engine/types';
import { HeroPortrait } from '@/cards/art/heroArt';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { SwordIcon, HeartIcon } from './Icons';

type Size = 'hand' | 'slot' | 'full';

interface Props {
  cardId: string;
  size?: Size;
  selected?: boolean;
  glow?: 'gold' | 'accent' | 'danger' | null;
  faded?: boolean;
  className?: string;
  style?: CSSProperties;
  overlay?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  rotate?: number;
  zoom?: boolean;
}

const SIZES: Record<Size, { w: number; h: number; nameSize: number; bodySize: number }> = {
  hand: { w: 134, h: 188, nameSize: 12, bodySize: 9 },
  slot: { w: 0,   h: 0,   nameSize: 13, bodySize: 10 },
  full: { w: 300, h: 420, nameSize: 24, bodySize: 13 },
};

function frameAccent(data: CardData | undefined) {
  if (!data) return palette.type.spell.accent;
  if (data.type === 'hero') return getHeroIdentity(data.id).primary;
  if (data.type === 'ultimate') return getHeroIdentity(data.linkedHero).primary;
  return typeTint(data.type).accent;
}

function typeLabel(data: CardData | undefined): string {
  if (!data) return '';
  switch (data.type) {
    case 'hero': return 'Hero';
    case 'spell': return 'Spell';
    case 'equipment': return `Item · Tier ${(data as any).tier ?? 1}`;
    case 'ultimate': return 'Ultimate';
  }
}

// Hand-tuned SVG fallback art keyed by card id. Used when /spells/{id}.webp or
// /items/{id}.webp is missing — keeps cards readable instead of showing a flat
// colored block. New cards added before bitmap art exists also use this.
function FallbackGlyph({ cardId, accent }: { cardId: string; accent: string }) {
  const stroke = '#1a1410';
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
          <path d="M50 32 L50 68 M32 50 L68 50" {...common} strokeWidth="6" stroke="#fff" opacity="0.85" />
        </svg>
      );
    case 'boundless_spirit':
      return (
        <svg viewBox="0 0 100 100" width="64%" height="64%">
          <defs>
            <radialGradient id="boundG" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
              <stop offset="40%" stopColor={accent} stopOpacity="0.9" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="44" fill="url(#boundG)" />
          <path d="M50 18 C66 28, 70 50, 50 82 C30 50, 34 28, 50 18 Z"
            fill={accent} stroke={stroke} strokeWidth="2.5" opacity="0.95" />
          <circle cx="50" cy="44" r="6" fill="#fff" opacity="0.9" />
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
          <circle cx="50" cy="50" r="10" fill="#fff" opacity="0.85" />
        </svg>
      );
  }
}

function FallbackArt({ cardId, kind }: { cardId: string; kind: 'spell' | 'equipment' }) {
  const tint = kind === 'spell' ? palette.type.spell : palette.type.equipment;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse at 50% 38%, ${tint.from}, ${tint.to})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* subtle radial sheen */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 40%, rgba(255,255,255,0.10), transparent 55%)`,
        pointerEvents: 'none',
      }} />
      <FallbackGlyph cardId={cardId} accent={tint.accent} />
    </div>
  );
}

function ArtImg({ src, kind, cardId }: { src: string; kind: 'spell' | 'equipment'; cardId: string }) {
  const [failed, setFailed] = useState(false);
  const tint = kind === 'spell' ? palette.type.spell : palette.type.equipment;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      background: `linear-gradient(180deg, ${tint.from}, ${tint.to})`,
    }}>
      {failed ? <FallbackArt cardId={cardId} kind={kind} /> : (
        <img src={src} alt="" loading="lazy" decoding="async"
          onError={() => setFailed(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center top', filter: 'saturate(1.1)',
          }} />
      )}
    </div>
  );
}

function ArtWindow({ data, size }: { data: CardData | undefined; size: Size }) {
  if (!data) return null;
  if (data.type === 'hero') return <HeroPortrait cardId={data.id} full />;
  if (data.type === 'ultimate') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.7, filter: 'saturate(1.3)' }}>
          <HeroPortrait cardId={data.linkedHero} full />
        </div>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5), transparent 70%)',
        }}>
          <span style={{
            color: palette.type.ultimate.accent,
            fontFamily: fonts.ui, fontWeight: 800,
            fontSize: size === 'full' ? 38 : 22, letterSpacing: '0.32em',
            textShadow: `0 0 18px ${palette.type.ultimate.accent}cc, 0 2px 6px rgba(0,0,0,0.9)`,
          }}>ULT</span>
        </div>
      </div>
    );
  }
  if (data.type === 'spell') return <ArtImg src={`${import.meta.env.BASE_URL}spells/${data.id}.webp`} kind="spell" cardId={data.id} />;
  if (data.type === 'equipment') return <ArtImg src={`${import.meta.env.BASE_URL}items/${data.id}.webp`} kind="equipment" cardId={data.id} />;
  return null;
}

export function CardFrame({
  cardId, size = 'hand', selected = false, glow = null, faded = false,
  overlay, footer, onClick, className, style, rotate = 0, zoom = false,
}: Props) {
  const [hover, setHover] = useState(false);
  const data = CARDS_BY_ID[cardId];
  const t = data?.type ?? 'spell';
  const tint = typeTint(t);
  const sz = SIZES[size];
  const accent = frameAccent(data);
  const rarity = data?.rarity ?? 1;
  const gem = rarityStyle(rarity);
  const isHero = data?.type === 'hero';
  // Champion treatment: heroes and ultimates get an inner gold inset border.
  const isChampion = data?.type === 'hero' || data?.type === 'ultimate';
  const goldInset = palette.rarity[4].fill; // shared gold accent

  // Header art window takes ~55% of the card height; cream body takes the rest.
  const containerStyle: CSSProperties = {
    width: size === 'slot' ? '100%' : sz.w,
    height: size === 'slot' ? '100%' : sz.h,
    borderRadius: 10,
    background: '#3a2810',  // dark mahogany frame, peeks through as edge
    boxShadow: glow === 'gold' ? shadow.glowGold
             : glow === 'accent' ? shadow.glowAccent
             : glow === 'danger' ? shadow.glowDanger
             : '0 6px 16px rgba(40, 20, 0, 0.28), 0 1px 3px rgba(40, 20, 0, 0.18)',
    border: `2px solid ${selected ? accent : '#5a3f1c'}`,
    position: 'relative',
    overflow: 'hidden',
    color: palette.card.bodyText,
    fontFamily: fonts.ui,
    cursor: onClick ? 'pointer' : 'default',
    transform: `rotate(${rotate}deg) ${selected ? 'translateY(-8px)' : ''} ${zoom ? 'scale(1.02)' : ''}`,
    transition: 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease',
    opacity: faded ? 0.45 : 1,
    isolation: 'isolate',
    display: 'flex',
    flexDirection: 'column',
    ...style,
  };

  const artH = size === 'full' ? '58%' : '55%';
  const cost = (data && (data.type === 'spell' || data.type === 'equipment' || data.type === 'ultimate'))
    ? (data as any).cost ?? 0 : 0;
  const showCost = !isHero && cost > 0;
  const showStats = isHero;

  return (
    <div
      className={className}
      style={containerStyle}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Champion gold inset border (heroes + ultimates) */}
      {isChampion && (
        <div style={{
          position: 'absolute', inset: 3,
          borderRadius: 7,
          border: `1px solid ${goldInset}66`,
          boxShadow: `inset 0 0 8px ${goldInset}22`,
          pointerEvents: 'none',
          zIndex: 4,
        }} /> )}
      {/* Art window — fills the top portion */}
      <div style={{
        position: 'relative',
        flex: `0 0 ${artH}`,
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <ArtWindow data={data} size={size} />
        {overlay && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{overlay}</div>}

        {/* Cost gem (top-left) — brass soul coin */}
        {showCost && (
          <div style={{
            position: 'absolute', top: 4, left: 4,
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `radial-gradient(circle at 35% 30%, #ffd98a, ${palette.accent} 55%, #6e4612 100%)`,
            border: '1.5px solid #3a2810',
            borderRadius: '50%',
            boxShadow: `0 1px 3px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,230,170,0.55)`,
            color: '#2a1a06',
            fontFamily: fonts.display, fontWeight: 800, fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 1px 0 rgba(255,235,180,0.4)',
            zIndex: 5,
          }}>{cost}</div>
        )}

        {/* Stat pills (top-right) for heroes */}
        {showStats && (
          <div style={{
            position: 'absolute', top: 4, right: 4,
            display: 'flex', gap: 3,
          }}>
            <StatPill icon={<SwordIcon size={11} color="#1a1410" />} value={(data as any).atk} bg={palette.atk} />
            <StatPill icon={<HeartIcon size={11} color="#1a1410" />} value={(data as any).hp} bg={palette.hp} />
          </div>
        )}

        {/* Rarity gem (top-right) for non-heroes (small dot) */}
        {!showStats && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            width: 10, height: 10, borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, ${gem.fill}, #0b1220)`,
            boxShadow: `0 0 8px ${gem.glow}, inset 0 0 3px rgba(255,255,255,0.35)`,
          }} />
        )}
      </div>

      {/* Horizontal type banner — single style with the rest of the card.
          Hover triggers a shimmer sweep. */}
      <div style={{
        position: 'relative',
        flexShrink: 0,
        padding: '3px 8px',
        background: `linear-gradient(90deg, ${tint.ribbon}ee, ${tint.ribbon}aa 60%, ${tint.ribbon}55)`,
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        textAlign: 'left',
        borderBottom: `1px solid rgba(0,0,0,0.3)`,
        overflow: 'hidden',
      }}>
        <span style={{ position: 'relative', zIndex: 2 }}>
          {typeLabel(data)}
          {isHero && ` · ${capitalize(getHeroIdentity((data as any).id).role)}`}
          {isHero && (data as any).abilityName ? ` · ${(data as any).abilityName}` : ''}
        </span>
        <AnimatePresence>
          {hover && (
            <motion.div
              key="shimmer"
              initial={{ x: '-130%' }}
              animate={{ x: '130%' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute', top: 0, bottom: 0, left: 0,
                width: '45%',
                background: `linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.5) 50%, transparent 75%)`,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Cream body */}
      <div style={{
        flex: '1 1 auto',
        background: palette.card.body,
        color: palette.card.bodyText,
        display: 'flex',
        flexDirection: 'column',
        padding: '5px 8px 6px',
        minHeight: 0,
      }}>
        {/* All body-section text is a single unified style: fonts.ui, size 11,
            no letter-spacing, no uppercase. Only color and font-weight differ
            between elements. */}

        {/* Name */}
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: palette.card.bodyText,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.2,
        }}>
          {data?.name ?? cardId}
        </div>

        {/* SKILL / PASSIVE label — bold, dark for skill, grey for passive. */}
        {size !== 'slot' && isHero && data?.text && (() => {
          const d = data as any;
          const isSkill = !!d.skill;
          const tag = isSkill ? 'Skill' : d.passives?.length ? 'Passive' : null;
          if (!tag) return null;
          return (
            <div style={{
              marginTop: 4,
              fontSize: 11,
              fontWeight: 700,
              color: isSkill ? palette.card.bodyText : palette.card.bodyTextDim,
            }}>{tag}</div>
          );
        })()}

        {/* Body text (effect). Keywords still auto-bolded by RuleText. */}
        {size !== 'slot' && data?.text && (
          <div style={{
            flex: 1,
            marginTop: 3,
            fontSize: 11,
            fontWeight: 400,
            lineHeight: 1.35,
            color: palette.card.bodyTextDim,
            overflow: 'hidden',
          }}>
            <RuleText text={data.text} />
          </div>
        )}

        {/* Footer slot (optional override) */}
        {footer && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 4,
            fontSize: 11, fontWeight: 400, color: palette.card.flavor,
            borderTop: `1px solid ${palette.card.bodyBorder}55`,
            paddingTop: 4,
          }}>
            {footer}
          </div>
        )}

        {/* Set / identifier line */}
        {size !== 'slot' && data && (
          <div style={{
            marginTop: footer ? 2 : 'auto',
            paddingTop: 2,
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 400,
            color: palette.card.flavor,
            opacity: 0.55,
          }}>
            DLK · Cursed Apple · {String(CARD_INDEX[data.id] ?? 0).padStart(2, '0')}/{CARD_TOTAL}
          </div>
        )}
      </div>
    </div>
  );
}

function rarityName(r: 1 | 2 | 3 | 4): string {
  return r === 4 ? 'Mythic' : r === 3 ? 'Rare' : r === 2 ? 'Uncommon' : 'Common';
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function StatPill({ icon, value, bg }: { icon: ReactNode; value: number; bg: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      padding: '2px 6px',
      background: bg,
      color: '#1a1410',
      borderRadius: 10,
      fontWeight: 800,
      fontSize: 11,
      fontVariantNumeric: 'tabular-nums',
      boxShadow: '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
      border: '1px solid rgba(0,0,0,0.4)',
    }}>
      {icon}
      <span>{value}</span>
    </div>
  );
}
