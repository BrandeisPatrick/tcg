import { useState } from 'react';
import type { CardId } from '@/engine/types';
import { itemCard } from '@/cards';
import { HERO_IMG_BASE } from '@/art/assets';
import { PRICE } from '@/engine/constants';
import { fonts } from '../tokens';
import { TierDiamonds, itemArtUrl } from '../card/ItemIcon';
import { levelGreen, poster, shopInk } from '../poster';

/** The phone hand's card, px: six sit across a 390-px screen with a sliver of
 *  the seventh at the edge, which is what says the strip scrolls. */
export const THUMB_W = 52;
export const THUMB_H = 72;
/** The category frame round the art. */
const FRAME = 2;
/** The art's square, inside the frame; the rest below it is the foot. */
const ART = THUMB_W - FRAME * 2;
const RADIUS = 6;
const BOLT = 15;

/**
 * A card in the phone's hand, compact: card-shaped, the item's own shop art
 * (never redrawn) framed in its category's colour — Weapon amber, Vitality
 * green, Spirit purple — over a foot in that colour with the tier's diamonds,
 * and its price on a coin at the top left (red when it cannot be paid for
 * now, `unaffordable`). A hero card is its portrait in a charcoal frame, its
 * foot blank: it goes on the bench for free. No name: it is the accessible
 * label, and a long press opens the full card. An active item carries the
 * shop's bolt. `armed` rings it in the green the heroes it may go on glow in
 * (the strip lifts it).
 */
export function HandThumb({ cardId, armed = false, unaffordable = false, level }: {
  cardId: CardId; armed?: boolean; unaffordable?: boolean;
  /** A hero's level (back from the lane with it): its frame in its level green. */
  level?: number;
}) {
  const data = itemCard(cardId);
  const [failed, setFailed] = useState(false);
  const ink = data ? shopInk(data.slot).ink : level !== undefined ? levelGreen(level) : poster.edge;
  const url = data ? itemArtUrl(cardId) : `${HERO_IMG_BASE}${cardId}_sm.webp`;
  return (
    <span style={{ position: 'relative', display: 'block', width: THUMB_W, height: THUMB_H }}>
      <span style={{
        position: 'absolute', inset: 0,
        borderRadius: RADIUS,
        // The frame and the foot are the category's ink; the art sits on it.
        background: ink,
        overflow: 'hidden',
        boxShadow: armed
          ? `0 0 0 2px ${poster.target}, 0 0 8px 1px rgba(98, 196, 98, 0.6), 0 6px 10px rgba(0, 0, 0, 0.5)`
          : '0 3px 7px rgba(0, 0, 0, 0.5)',
        transition: 'box-shadow 160ms ease',
      }}>
        <span style={{
          position: 'absolute', left: FRAME, top: FRAME, width: ART, height: ART,
          borderRadius: RADIUS - FRAME, overflow: 'hidden', background: poster.ground,
        }}>
          {url && !failed && (
            <img
              src={url}
              alt=""
              draggable={false}
              decoding="async"
              onError={() => setFailed(true)}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            />
          )}
        </span>
        {data && (
          <span aria-hidden style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, top: FRAME + ART,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TierDiamonds tier={data.tier} size={6} ink={poster.ink} faint="rgba(23, 20, 16, 0.35)" />
          </span>
        )}
      </span>
      {/* The price, half over the top-left corner. */}
      {data && (
        <span aria-hidden style={{
          position: 'absolute', top: -4, left: -4, minWidth: BOLT, height: BOLT, padding: '0 3px', boxSizing: 'border-box',
          borderRadius: BOLT / 2, background: unaffordable ? poster.red : poster.gold, color: poster.ink,
          boxShadow: `0 0 0 1.5px ${poster.frame}`, fontFamily: fonts.display, fontSize: 9.5, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>{PRICE[data.tier]}</span>
      )}
      {/* An active item: the shop's bolt, half over the top-right corner. */}
      {data?.type === 'spell' && (
        <span aria-hidden style={{
          position: 'absolute', top: -4, right: -4, width: BOLT, height: BOLT, borderRadius: '50%',
          background: poster.ink, boxShadow: `0 0 0 1.5px ${poster.frame}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <svg viewBox="0 0 10 14" width={BOLT * 0.5} height={BOLT * 0.66} aria-hidden>
            <path d="M6.2 0 L0.6 8 H4.4 L3.4 14 L9.4 5.4 H5.6 Z" fill={poster.gold} />
          </svg>
        </span>
      )}
    </span>
  );
}
