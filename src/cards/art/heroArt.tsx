import { getHeroIdentity } from './heroPalette';

interface PortraitProps {
  cardId: string;
  size?: number;
  full?: boolean;       // fill container with object-cover
  className?: string;
  variant?: 'card' | 'mm' | 'sm';   // which asset variant to use
}

// Real hero card art lives in /public/heroes/<cardId>_<variant>.webp
function imageUrl(cardId: string, variant: 'card' | 'mm' | 'sm') {
  return `/heroes/${cardId}_${variant}.webp`;
}

export function HeroPortrait({ cardId, size, full = false, className, variant = 'card' }: PortraitProps) {
  const id = getHeroIdentity(cardId);
  const url = imageUrl(cardId, variant);
  return (
    <div
      className={className}
      style={{
        width: size ?? '100%',
        height: size ?? '100%',
        position: 'relative',
        overflow: 'hidden',
        background: `radial-gradient(ellipse at 50% 30%, ${id.primary}55, ${id.accent} 60%, #05080f 100%)`,
      }}
    >
      <img
        src={url}
        alt={id.initial}
        loading="lazy"
        decoding="async"
        style={{
          width: '100%',
          height: '100%',
          objectFit: full ? 'cover' : 'contain',
          objectPosition: 'center 30%',
          display: 'block',
          maskImage: 'radial-gradient(ellipse 90% 80% at 50% 45%, black 70%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 45%, black 70%, transparent 100%)',
        }}
      />
      {/* Color tint overlay to unify look */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.45) 100%), linear-gradient(180deg, transparent 70%, ${id.accent}55 100%)`,
        pointerEvents: 'none',
      }} />
    </div>
  );
}

export function HeroBadge({ cardId, size = 28 }: { cardId: string; size?: number }) {
  const url = imageUrl(cardId, 'mm');
  const id = getHeroIdentity(cardId);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${id.primary}, ${id.accent})`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.15)`,
      }}
    >
      <img src={url} alt={id.initial} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
}
