import { getHeroIdentity } from './heroPalette';
import { poster } from '@/ui/poster';
import { HERO_IMG_BASE } from '@/art/assets';

interface PortraitProps {
  cardId: string;
}

// Real hero card art lives in public/heroes/<cardId>_<variant>.webp.
function imageUrl(cardId: string, variant: 'card' | 'mm' | 'sm') {
  return `${HERO_IMG_BASE}${cardId}_${variant}.webp`;
}

/**
 * Per-hero objectPosition overrides for cover-cropped art, keyed by asset
 * kind. The uniform defaults ('50% 22%' splash, '50% 14%' tiles, 'center
 * 30%' portraits) assume a lone hero's face near the top-centre — duo
 * compositions and off-centre heads break that rule. Mo & Krill's splash is
 * a wide landscape where Krill rides centre-frame and Mo's head fills the
 * RIGHT half; in a portrait box, cover fits it by height, so the X
 * coordinate alone decides the visible slice — centred X showed only Krill.
 * Dynamo's centre is his coat and mechanical arm; his helmeted head floats
 * at the upper right, half cut off by a centred crop.
 */
const HERO_ART_FOCUS: Record<string, { splash?: string; card?: string }> = {
  hero_mo_krill: { splash: '62% 22%' },
  hero_dynamo: { splash: '84% 22%' },
};

/** objectPosition for a hero's cover-cropped art, with per-surface default. */
export function heroArtFocus(cardId: string, kind: 'splash' | 'card', fallback: string): string {
  return HERO_ART_FOCUS[cardId]?.[kind] ?? fallback;
}

/**
 * Heroes whose splash cannot be cover-cropped into a 5:7 box at all: Mo &
 * Krill's is a wide landscape of a mole the size of a truck, so any portrait
 * slice shows Krill beside a dark void or Mo's snout alone. Their card art
 * frames the pair, so a portrait box draws that instead of the splash.
 */
const PORTRAIT_FROM_CARD_ART = new Set(['hero_mo_krill']);

/** The art for a 5:7 portrait box (the draft's team cards): the splash with
 *  its focus and the card art as the fallback, or the card art outright where
 *  the splash's composition cannot be cropped to a portrait. */
export function heroPortraitArt(cardId: string): { src: string; fallback: string | null; objectPosition: string } {
  if (PORTRAIT_FROM_CARD_ART.has(cardId)) {
    return { src: imageUrl(cardId, 'card'), fallback: null, objectPosition: heroArtFocus(cardId, 'card', '50% 14%') };
  }
  return {
    src: `${HERO_IMG_BASE}${cardId}_splash.webp`,
    fallback: imageUrl(cardId, 'card'),
    objectPosition: heroArtFocus(cardId, 'splash', '50% 20%'),
  };
}

export function HeroPortrait({ cardId }: PortraitProps) {
  const id = getHeroIdentity(cardId);
  const url = imageUrl(cardId, 'card');
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
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
        // Not draggable: it sits inside hand cards, whose own drag must not be
        // taken over by a native image drag.
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
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
