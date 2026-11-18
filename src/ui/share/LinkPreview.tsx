/**
 * The link preview — the picture a chat app, a forum or a social feed shows
 * when the game's link is pasted into it (Open Graph and Twitter-card tags in
 * index.html name the baked file, public/link-preview.jpg).
 *
 * It is the title sheet made into one card: the cream paper, the brush-script
 * lead-in over Deadlock's wordmark, a tagline that says what it is (a
 * fan-made card game), the line that says whose the wordmark is, the red seal,
 * and a fan of the game's own hero cards rising from the foot. Nothing is redrawn for it, so it changes when the cards do.
 *
 * Its rules:
 *  - 1200 × 630, the size every preview is cut from (1.91 : 1).
 *  - What must be read sits in the middle 630 px square: some apps crop the
 *    picture square. The words are there, and the three middle cards.
 *  - No motion: the page is photographed, so everything stands as it lands.
 *  - No art that needs a person's leave (the tutorial's cover): only what the
 *    title sheet and the cards already show (public/art/CREDITS.md).
 *
 * Shown at ?share=1 (src/main.tsx), top-left on a bare page, and baked from
 * there by scripts/art/bake_link_preview.mjs.
 */
import type { CSSProperties } from 'react';
import type { CardId } from '@/engine/types';
import { CardFrame, SIZES } from '../card/CardFrame';
import { fonts } from '../tokens';
import { poster, sheetStyle } from '../poster';
import { StarburstSeal, WORDMARK_INK } from '../start/StartScreen';

export const LINK_PREVIEW = { w: 1200, h: 630 } as const;

/** The fan, left to right: five heroes in five colours, the two on the right
 *  looking in. The middle three are the ones a square crop keeps. */
const FAN: CardId[] = ['hero_vindicta', 'hero_paige', 'hero_abrams', 'hero_lady_geist', 'hero_kelvin'];
/** A card in the fan is the full card face at this scale. */
const CARD_SCALE = 0.8;
/** Centre to centre along the foot, and how far each step from the middle
 *  turns and drops a card. */
const STEP = 196;
const TURN = 7;
const DROP = 16;
/** Where the middle card's top edge sits. */
const FAN_TOP = 314;

const label: CSSProperties = {
  fontFamily: fonts.display,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  lineHeight: 1,
};

export function LinkPreview() {
  const card = SIZES.full;
  const mid = (FAN.length - 1) / 2;
  return (
    <div
      id="link-preview"
      style={{
        position: 'relative',
        width: LINK_PREVIEW.w,
        height: LINK_PREVIEW.h,
        overflow: 'hidden',
        ...sheetStyle,
        boxShadow: 'none',
        color: poster.ink,
      }}
    >
      {/* The corners: what it is, and what it costs. A square crop loses them. */}
      <span style={{ ...label, position: 'absolute', left: 34, top: 30, fontSize: 13, letterSpacing: '0.3em', color: poster.inkDim }}>
        Unofficial fan project
      </span>
      <span style={{ ...label, position: 'absolute', right: 34, top: 30, fontSize: 13, letterSpacing: '0.3em', color: poster.inkDim }}>
        Free · plays in your browser
      </span>

      {/* The title, centred: lead-in, wordmark, tagline, whose the wordmark is. */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 58, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 560, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{
            fontFamily: fonts.script, fontSize: 46, lineHeight: 1, color: poster.ink,
            transform: 'rotate(-3.5deg)', transformOrigin: 'left bottom', marginLeft: 8, marginBottom: 6,
          }}>
            Get dealt into
          </div>
          <img src={WORDMARK_INK} alt="Deadlock" draggable={false} style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
        <div style={{ ...label, fontSize: 17, letterSpacing: '0.36em', color: poster.ink, marginTop: 20, paddingLeft: '0.36em' }}>
          A fan-made card game · Old New York
        </div>
        <div style={{ ...label, fontSize: 11, letterSpacing: '0.3em', color: poster.inkDim, marginTop: 10, paddingLeft: '0.3em' }}>
          Not affiliated with Valve Corporation
        </div>
      </div>

      {/* The seal, hung off the wordmark's right shoulder. */}
      <div style={{ position: 'absolute', left: 908, top: 78, transform: 'rotate(11deg)', filter: 'drop-shadow(0 10px 16px rgba(23, 20, 16, 0.32))' }}>
        <StarburstSeal size={172} script="Play it" big="Free!" />
      </div>

      {/* The fan: the game's own hero cards, rising from the foot. */}
      {FAN.map((id, i) => {
        const off = i - mid;
        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: LINK_PREVIEW.w / 2 + off * STEP - (card.w * CARD_SCALE) / 2,
              top: FAN_TOP + Math.abs(off) * Math.abs(off) * DROP,
              width: card.w * CARD_SCALE,
              height: card.h * CARD_SCALE,
              transform: `rotate(${off * TURN}deg)`,
              transformOrigin: '50% 120%',
              // The middle card lies on top, its neighbours under it.
              zIndex: 10 - Math.abs(off),
            }}
          >
            <div style={{ width: card.w, height: card.h, transform: `scale(${CARD_SCALE})`, transformOrigin: '0 0' }}>
              <CardFrame cardId={id} size="full" physical={false} tapExplains={false} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
