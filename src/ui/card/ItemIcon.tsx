/**
 * An item as Deadlock's shop prints it: the item's own shop art (the icon
 * CardFrame uses, never redrawn) set in a rounded tile framed in its
 * category's colour — Weapon amber, Vitality green, Spirit purple — with the
 * deeper band along its foot where Deadlock prints the name. No words: what a
 * tile is for is said by its marks.
 *
 *   bolt (top right)      an active item: fired from its bearer's sheet
 *   tick (top left)       a copy is worn, or waits in your hand (in a build
 *                         row: this hero has it)
 *   chevron and price     priced at the difference — an upgrade of a
 *     (along the foot)    component on your side — and what it costs you
 *   inset (bottom left)   the item that stands in for this one, off this market
 *   dial / pips           a worn active's cooldown (turns left over a dimmed
 *                         face) or its charges
 *
 * `grey` is a tile you cannot act on (too dear, off the market); `lit` the
 * next item a build can afford (gold ring); `selected` a card picked up to be
 * put on a hero (cream ring). `chip` drops the frame to a keyline and the
 * marks to the live ones (cooldown, charges) for the hero tile's small chips.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { CardId } from '@/engine/types';
import { itemCard } from '@/cards';
import { ITEM_TIERS } from '@/engine/constants';
import { ITEM_IMG_BASE, SPELL_IMG_BASE } from '@/art/assets';
import { fonts } from '../tokens';
import { poster, shopInk } from '../poster';

export interface ItemIconMarks {
  /** A copy is worn by one of your heroes or waits in your hand. */
  owned?: boolean;
  /** Priced at the difference: what it costs you, printed on the tile. */
  discount?: number;
  /** The stand-in this market sells instead, inset. */
  standIn?: CardId;
  /** A worn active's own turns left before it can be used again. */
  cooldown?: number;
  /** A worn hard crowd-control active's charges left this match. */
  charges?: number;
  /** Copies of it in the deck being built ("×2" on the tile's foot). */
  copies?: number;
}

/** Where an item's shop icon lives. */
export function itemArtUrl(itemId: CardId): string | undefined {
  const data = itemCard(itemId);
  if (!data) return undefined;
  return `${data.type === 'spell' ? SPELL_IMG_BASE : ITEM_IMG_BASE}${data.id}.webp`;
}

/** A mark's small disc, half over the tile's corner. */
function Badge({ size, at, children, ink }: { size: number; at: CSSProperties; children: ReactNode; ink: string }) {
  return (
    <span aria-hidden style={{
      position: 'absolute', ...at,
      width: size, height: size, borderRadius: '50%',
      background: ink, boxShadow: `0 0 0 1.5px ${poster.frame}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', zIndex: 1,
    }}>{children}</span>
  );
}

export function ItemIcon({ itemId, size = 44, grey = false, lit = false, selected = false, chip = false, marks = {} }: {
  itemId: CardId;
  size?: number;
  grey?: boolean;
  lit?: boolean;
  selected?: boolean;
  chip?: boolean;
  marks?: ItemIconMarks;
}) {
  const data = itemCard(itemId);
  const [failed, setFailed] = useState(false);
  if (!data) return null;
  const { ink, deep } = shopInk(data.slot);
  const url = itemArtUrl(itemId);
  const radius = Math.max(3, Math.round(size * 0.18));
  // The frame round the art, and the deeper band along its foot.
  const frame = chip ? 1.5 : Math.max(2, Math.round(size * 0.05));
  const foot = chip ? 1.5 : Math.max(frame + 1, Math.round(size * 0.11));
  const badge = Math.max(12, Math.round(size * 0.34));
  const cooling = (marks.cooldown ?? 0) > 0;
  const ring = lit ? `0 0 0 2.5px ${poster.you}, 0 0 12px 2px rgba(217, 182, 74, 0.7)`
    : selected ? `0 0 0 2.5px ${poster.cream}, 0 0 0 4.5px ${poster.ink}`
    : chip ? 'none'
    : '0 2px 4px rgba(0, 0, 0, 0.45)';
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0, lineHeight: 0 }}>
      <span style={{
        position: 'absolute', inset: 0,
        borderRadius: radius,
        background: `linear-gradient(${ink} 0 calc(100% - ${foot}px), ${deep} calc(100% - ${foot}px))`,
        overflow: 'hidden',
        boxShadow: ring,
        filter: grey ? 'grayscale(1) brightness(0.82) contrast(0.9)' : undefined,
        opacity: grey ? 0.5 : 1,
        transition: 'opacity 160ms ease, filter 160ms ease, box-shadow 160ms ease',
      }}>
        {url && !failed && (
          <img
            src={url}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            style={{
              position: 'absolute', left: frame, top: frame,
              width: `calc(100% - ${frame * 2}px)`, height: `calc(100% - ${frame + foot}px)`,
              borderRadius: Math.max(2, radius - frame),
              objectFit: 'cover',
              pointerEvents: 'none',
              filter: cooling ? 'grayscale(0.7) brightness(0.45)' : undefined,
            }}
          />
        )}
        {/* A worn active on cooldown: the turns left, over its dimmed face. */}
        {cooling && (
          <span aria-hidden style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: fonts.display, fontSize: Math.max(10, Math.round(size * 0.5)), lineHeight: 1,
            color: poster.cream, textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)', paddingBottom: foot - frame,
          }}>{marks.cooldown}</span>
        )}
      </span>
      {/* A hard crowd-control active's charges: a pip each, along the foot. */}
      {marks.charges != null && (
        <span aria-hidden style={{
          position: 'absolute', left: 0, right: 0, bottom: Math.max(1, foot / 2 - 2.5),
          display: 'flex', justifyContent: 'center', gap: 2, pointerEvents: 'none',
        }}>
          {Array.from({ length: Math.max(marks.charges, 2) }, (_, i) => (
            <span key={i} style={{
              width: chip ? 4 : 5, height: chip ? 4 : 5, borderRadius: '50%',
              background: i < marks.charges! ? poster.cream : 'transparent',
              boxShadow: `0 0 0 1px ${i < marks.charges! ? poster.ink : poster.creamDim}`,
            }} />
          ))}
        </span>
      )}
      {!chip && data.type === 'spell' && (
        <Badge size={badge} at={{ top: -4, right: -4 }} ink={poster.ink}>
          <svg viewBox="0 0 10 14" width={badge * 0.5} height={badge * 0.66} aria-hidden>
            <path d="M6.2 0 L0.6 8 H4.4 L3.4 14 L9.4 5.4 H5.6 Z" fill={poster.gold} />
          </svg>
        </Badge>
      )}
      {!chip && marks.owned && (
        <Badge size={badge} at={{ top: -4, left: -4 }} ink={poster.status.buff}>
          <svg viewBox="0 0 10 10" width={badge * 0.58} height={badge * 0.58} aria-hidden>
            <path d="M1.6 5.2 L4 7.6 L8.6 2.6" fill="none" stroke={poster.paper} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Badge>
      )}
      {/* An upgrade bought for the difference: the chevron and what it costs. */}
      {!chip && marks.discount != null && (
        <span aria-hidden style={{
          position: 'absolute', left: '50%', bottom: -6, transform: 'translateX(-50%)',
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: '1px 5px 1px 4px', borderRadius: 999,
          background: poster.green, color: poster.ink, boxShadow: `0 0 0 1.5px ${poster.frame}`,
          fontFamily: fonts.display, fontSize: Math.max(9, Math.round(size * 0.24)), lineHeight: 1.05,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 1,
        }}>
          <svg viewBox="0 0 10 8" width={7} height={6} aria-hidden>
            <path d="M1.2 6.4 L5 2.4 L8.8 6.4" fill="none" stroke={poster.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {marks.discount}
        </span>
      )}
      {/* Copies in the deck being built: "×N" on a gold tag along the foot. */}
      {!chip && (marks.copies ?? 0) > 0 && (
        <span aria-hidden style={{
          position: 'absolute', left: '50%', bottom: -6, transform: 'translateX(-50%)',
          padding: '1px 5px', borderRadius: 999,
          background: poster.gold, color: poster.ink, boxShadow: `0 0 0 1.5px ${poster.frame}`,
          fontFamily: fonts.display, fontSize: Math.max(9, Math.round(size * 0.24)), lineHeight: 1.05,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 1,
        }}>×{marks.copies}</span>
      )}
      {!chip && marks.standIn && (
        <span aria-hidden style={{ position: 'absolute', right: -3, bottom: -3, pointerEvents: 'none', zIndex: 1, lineHeight: 0, borderRadius: Math.round(size * 0.1), boxShadow: `0 0 0 1.5px ${poster.frame}` }}>
          <ItemIcon itemId={marks.standIn} size={Math.round(size * 0.46)} chip />
        </span>
      )}
    </span>
  );
}

/** A small diamond for each tier of the shop (ITEM_TIERS, five), `tier` of
 *  them filled: the tier's mark in a tier row's header, the tooltip and a card
 *  in the hand. */
export function TierDiamonds({ tier, size = 7, ink = poster.cream, faint = poster.creamFaint }: { tier: number; size?: number; ink?: string; faint?: string }) {
  return (
    <span aria-hidden style={{ display: 'inline-flex', gap: Math.max(1, Math.round(size * 0.3)), alignItems: 'center', lineHeight: 0 }}>
      {ITEM_TIERS.map((i) => (
        <svg key={i} viewBox="0 0 10 10" width={size} height={size}>
          <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill={i <= tier ? ink : 'none'} stroke={i <= tier ? ink : faint} strokeWidth="1.2" />
        </svg>
      ))}
    </span>
  );
}
