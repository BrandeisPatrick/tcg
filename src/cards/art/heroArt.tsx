import { getHeroIdentity } from './heroPalette';
import { poster } from '@/ui/poster';

interface PortraitProps {
  cardId: string;
  size?: number;
  full?: boolean;       // fill container with object-cover
  className?: string;
  variant?: 'card' | 'mm' | 'sm';   // which asset variant to use
}

// Real hero card art lives in public/heroes/<cardId>_<variant>.webp.
// Prefix with Vite's BASE_URL so the path resolves under "/" (local dev)
// and "/deadlock-tcg/" (GitHub Pages production build).
function imageUrl(cardId: string, variant: 'card' | 'mm' | 'sm') {
  return `${import.meta.env.BASE_URL}heroes/${cardId}_${variant}.webp`;
}

/**
 * Per-hero objectPosition overrides for cover-cropped art, keyed by asset
 * kind. The uniform defaults ('50% 22%' splash, '50% 14%' tiles, 'center
 * 30%' portraits) assume a lone hero's face near the top-centre — duo
 * compositions break that rule. Mo & Krill's splash is a wide landscape
 * where Krill rides centre-frame and Mo's head fills the RIGHT half; in a
 * portrait box, cover fits it by height, so the X coordinate alone decides
 * the visible slice — centred X showed only Krill.
 */
export const HERO_ART_FOCUS: Record<string, { splash?: string; card?: string }> = {
  hero_mo_krill: { splash: '62% 22%' },
};

/** objectPosition for a hero's cover-cropped art, with per-surface default. */
export function heroArtFocus(cardId: string, kind: 'splash' | 'card', fallback: string): string {
  return HERO_ART_FOCUS[cardId]?.[kind] ?? fallback;
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
        background: poster.ground,
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
      {/* Subtle bottom tint so the label band under the art reads as printed
          over it, not butted against it. */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.45))',
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
        background: poster.panel,
        boxShadow: `inset 0 0 0 1px ${poster.edge}`,
      }}
    >
      <img src={url} alt={id.initial} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
}
