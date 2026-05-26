import { useState } from 'react';
import type { CardData } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { palette, fonts } from '../tokens';

const typeTint = (t: string) =>
  t === 'hero' ? palette.type.hero
  : t === 'spell' ? palette.type.spell
  : t === 'equipment' ? palette.type.equipment
  : palette.type.spell;

interface Props {
  cardId: string;
  size?: number;
  selected?: boolean;
}

function CardGlyph({ cardId, accent }: { cardId: string; accent: string }) {
  const s = { fill: accent, stroke: 'rgba(0,0,0,0.3)', strokeWidth: 2 };
  switch (cardId) {
    // Spells
    case 'slowing_hex':
      return (<>
        <circle cx="50" cy="50" r="30" fill="none" stroke={accent} strokeWidth="3" opacity="0.6" />
        <path d="M50 20 L55 45 L50 50 L45 45 Z" {...s} />
        <path d="M50 80 L45 55 L50 50 L55 55 Z" {...s} opacity="0.7" />
        <line x1="25" y1="50" x2="75" y2="50" stroke={accent} strokeWidth="3" opacity="0.5" />
      </>);
    case 'healbane':
      return (<>
        <path d="M50 25 C35 25 30 40 50 55 C70 40 65 25 50 25Z" {...s} />
        <line x1="30" y1="30" x2="70" y2="70" stroke="#c04a30" strokeWidth="5" strokeLinecap="round" />
        <line x1="70" y1="30" x2="30" y2="70" stroke="#c04a30" strokeWidth="5" strokeLinecap="round" />
      </>);
    case 'spirit_sap':
      return (<>
        <path d="M50 20 Q70 35 60 50 Q50 65 50 80" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        <path d="M50 20 Q30 35 40 50 Q50 65 50 80" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" opacity="0.5" />
        <circle cx="50" cy="50" r="8" fill={accent} opacity="0.7" />
      </>);
    // Equipment
    case 'healing_booster':
      return (<>
        <path d="M50 30 C38 30 34 42 50 55 C66 42 62 30 50 30Z" {...s} />
        <path d="M50 22 L54 30 L50 28 L46 30 Z" fill={accent} opacity="0.9" />
        <line x1="50" y1="58" x2="50" y2="72" stroke={accent} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      </>);
    case 'weapon_shielding':
      return (<>
        <path d="M50 20 L75 35 L75 58 C75 72 50 82 50 82 C50 82 25 72 25 58 L25 35 Z" fill={accent} opacity="0.25" stroke={accent} strokeWidth="2.5" />
        <circle cx="50" cy="48" r="6" fill={accent} opacity="0.8" />
        <path d="M40 48 L60 48" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      </>);
    case 'spirit_shielding':
      return (<>
        <path d="M50 20 L75 35 L75 58 C75 72 50 82 50 82 C50 82 25 72 25 58 L25 35 Z" fill={accent} opacity="0.25" stroke={accent} strokeWidth="2.5" />
        <path d="M50 38 L56 48 L50 58 L44 48 Z" fill={accent} opacity="0.8" />
      </>);
    case 'bullet_resist_shredder':
      return (<>
        <path d="M30 30 L70 70" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        <path d="M70 30 L30 70" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="50" r="22" fill="none" stroke={accent} strokeWidth="3" strokeDasharray="8 4" opacity="0.5" />
      </>);
    case 'bullet_resilience':
      return (<>
        <path d="M50 18 L78 34 L78 60 C78 76 50 86 50 86 C50 86 22 76 22 60 L22 34 Z" fill={accent} opacity="0.3" stroke={accent} strokeWidth="3" />
        <circle cx="50" cy="50" r="10" fill={accent} opacity="0.7" />
      </>);
    case 'spirit_resilience':
      return (<>
        <path d="M50 18 L78 34 L78 60 C78 76 50 86 50 86 C50 86 22 76 22 60 L22 34 Z" fill={accent} opacity="0.3" stroke={accent} strokeWidth="3" />
        <path d="M50 36 L58 50 L50 64 L42 50 Z" fill={accent} opacity="0.7" />
      </>);
    case 'healing_tempo':
      return (<>
        <path d="M50 25 C36 25 31 40 50 55 C69 40 64 25 50 25Z" {...s} />
        <path d="M60 55 Q65 65 60 75 Q55 65 60 55Z" fill={accent} opacity="0.7" />
        <path d="M68 60 Q73 70 68 80 Q63 70 68 60Z" fill={accent} opacity="0.5" />
      </>);
    case 'glass_cannon':
      return (<>
        <rect x="22" y="44" width="56" height="12" rx="3" fill={accent} opacity="0.5" />
        <circle cx="72" cy="50" r="10" fill={accent} opacity="0.3" stroke={accent} strokeWidth="2" />
        <path d="M30 35 L35 44" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M30 65 L35 56" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="38" y1="30" x2="62" y2="70" stroke="rgba(255,200,200,0.6)" strokeWidth="1.5" />
        <line x1="55" y1="28" x2="45" y2="72" stroke="rgba(255,200,200,0.6)" strokeWidth="1.5" />
      </>);
    default: {
      const d = CARDS_BY_ID[cardId];
      return d?.type === 'spell' ? (
        <path d="M50 15 L58 38 L82 38 L63 52 L70 75 L50 60 L30 75 L37 52 L18 38 L42 38 Z"
          fill={accent} stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
      ) : (
        <>
          <path d="M50 15 L62 42 L50 37 L38 42 Z" fill={accent} stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
          <rect x="46" y="37" width="8" height="35" rx="2" fill={accent} opacity="0.8" />
          <rect x="36" y="52" width="28" height="5" rx="2.5" fill={accent} opacity="0.6" />
        </>
      );
    }
  }
}

function FallbackArt({ cardId }: { cardId: string }) {
  const data = CARDS_BY_ID[cardId];
  const tint = data?.type === 'spell' ? palette.type.spell : palette.type.equipment;
  return (
    <div style={{
      width: '100%', height: '100%',
      background: `radial-gradient(circle at 40% 35%, ${tint.from}ee, ${tint.to})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg viewBox="0 0 100 100" width="60%" height="60%" style={{ opacity: 0.85 }}>
        <CardGlyph cardId={cardId} accent={tint.accent} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.12), transparent 60%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}

function CircleArt({ data }: { data: CardData | undefined }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (!data) return null;
  const tint = typeTint(data.type);
  const isSpell = data.type === 'spell';
  const isEquip = data.type === 'equipment';
  const basePath = import.meta.env.BASE_URL ?? '/';
  const src = isSpell ? `${basePath}spells/${data.id}.webp`
            : isEquip ? `${basePath}items/${data.id}.webp`
            : null;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: `linear-gradient(135deg, ${tint.from}, ${tint.to})`,
      position: 'relative',
    }}>
      {src && !imgFailed ? (
        <img src={src} alt="" loading="lazy" decoding="async"
          onError={() => setImgFailed(true)}
          style={{
            position: 'absolute', inset: -10,
            width: 'calc(100% + 20px)', height: 'calc(100% + 20px)',
            objectFit: 'cover', objectPosition: 'center',
            filter: 'saturate(1.1) brightness(1.05)',
          }} />
      ) : (
        <FallbackArt cardId={data.id} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.08), transparent 60%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}

export function RoundCardIcon({ cardId, size = 130, selected = false }: Props) {
  const data = CARDS_BY_ID[cardId];
  const tint = typeTint(data?.type ?? 'spell');
  const cost = data && data.type !== 'hero' ? (data as any).cost ?? 0 : 0;
  const name = data?.name ?? cardId;
  const rarity = data?.rarity ?? 1;

  const ringColor = selected ? 'rgba(220,170,50,0.85)'
    : rarity >= 4 ? 'rgba(200,160,50,0.6)'
    : rarity >= 3 ? 'rgba(80,100,200,0.6)'
    : rarity >= 2 ? 'rgba(58,112,48,0.5)'
    : 'rgba(160,150,130,0.4)';

  const typeLabel = data?.type === 'spell' ? 'Spell'
    : data?.type === 'equipment' ? `T${(data as any).tier ?? 1}`
    : '';

  return (
    <div style={{ width: size, textAlign: 'center' }}>
      {/* Circle container */}
      <div style={{
        width: size, height: size,
        borderRadius: '50%',
        position: 'relative',
        overflow: 'hidden',
        border: selected
          ? '3px solid rgba(220,170,50,0.85)'
          : `2px solid ${ringColor}`,
        boxShadow: selected
          ? '0 0 30px rgba(220,170,50,0.4), 0 0 60px rgba(220,170,50,0.15), 0 8px 24px rgba(0,0,0,0.5)'
          : `0 0 16px ${ringColor}40, 0 4px 16px rgba(0,0,0,0.4)`,
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}>
        {/* Card art fills circle */}
        <CircleArt data={data} />

        {/* Inner vignette for depth */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }} />

        {/* Type badge at bottom of circle */}
        <div style={{
          position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
          padding: '2px 10px', borderRadius: 10,
          background: `${tint.ribbon}dd`,
          border: '1px solid rgba(0,0,0,0.3)',
          fontSize: 10, fontWeight: 700, color: '#fff',
          fontFamily: fonts.ui, letterSpacing: 0.5,
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}>
          {typeLabel}
        </div>

        {/* Cost pip (top-left) */}
        {cost > 0 && (
          <div style={{
            position: 'absolute', top: 4, left: 4,
            width: 26, height: 26, borderRadius: '50%',
            background: 'linear-gradient(135deg, #d4a840, #b07825)',
            border: '2px solid rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#1a1008',
            fontFamily: fonts.ui,
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
          }}>
            {cost}
          </div>
        )}
      </div>

      {/* Name below */}
      <div style={{
        marginTop: 10,
        fontFamily: fonts.display,
        fontSize: 14,
        fontWeight: 700,
        color: selected ? '#e8d8b4' : '#8a7a60',
        letterSpacing: 0.5,
        lineHeight: 1.2,
        transition: 'color 0.3s',
      }}>
        {name}
      </div>
    </div>
  );
}
