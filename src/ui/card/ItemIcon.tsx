/**
 * An item as the shop sheet prints it: the item's own Deadlock shop icon (the
 * art CardFrame uses, never redrawn) on a rounded square tinted with its
 * tab's colour — Weapon amber, Vitality green, Spirit purple — and keylined in
 * that tab's deep ink. No words: what an icon is for is said by its marks.
 *
 *   bolt (top right)    an active item: used from its bearer's sheet
 *   card (bottom right) a copy is in your hand
 *   tick (bottom right) a copy is worn (in a build row: this hero has it)
 *   chevron (top left)  priced at the difference: an upgrade of a component
 *                       on your side
 *   inset (bottom left) the item that stands in for this one, off this market
 *
 * `grey` is an icon you cannot act on (too dear, off the market); `lit` the
 * next item a build can afford (gold ring); `selected` the card armed in the
 * hand (ink ring).
 */
import { useState } from 'react';
import type { CardId } from '@/engine/types';
import { itemCard } from '@/cards';
import { ITEM_IMG_BASE, SPELL_IMG_BASE } from '@/art/assets';
import { poster, tabInk } from '../poster';

export interface ItemIconMarks {
  held?: boolean;
  worn?: boolean;
  discount?: boolean;
  /** The stand-in this market sells instead. */
  standIn?: CardId;
}

/** Where an item's shop icon lives. */
export function itemArtUrl(itemId: CardId): string | undefined {
  const data = itemCard(itemId);
  if (!data) return undefined;
  return `${data.type === 'spell' ? SPELL_IMG_BASE : ITEM_IMG_BASE}${data.id}.webp`;
}

/** Small ink disc a mark is printed on. */
function Badge({ size, at, children, ink = poster.ink }: { size: number; at: React.CSSProperties; children: React.ReactNode; ink?: string }) {
  return (
    <span aria-hidden style={{
      position: 'absolute', ...at,
      width: size, height: size, borderRadius: '50%',
      background: ink, border: `1.5px solid ${poster.paper}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxSizing: 'border-box', pointerEvents: 'none',
    }}>{children}</span>
  );
}

export function ItemIcon({ itemId, size = 44, grey = false, lit = false, selected = false, marks = {} }: {
  itemId: CardId;
  size?: number;
  grey?: boolean;
  lit?: boolean;
  selected?: boolean;
  marks?: ItemIconMarks;
}) {
  const data = itemCard(itemId);
  const [failed, setFailed] = useState(false);
  if (!data) return null;
  const { tint, deep } = tabInk(data.slot);
  const url = itemArtUrl(itemId);
  const badge = Math.max(13, Math.round(size * 0.36));
  const ring = lit ? `0 0 0 2.5px ${poster.you}, 0 0 12px 2px rgba(217, 182, 74, 0.75)`
    : selected ? `0 0 0 2.5px ${poster.ink}, 0 0 0 4.5px ${poster.you}`
    : '0 2px 5px rgba(0, 0, 0, 0.28)';
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}>
      <span style={{
        position: 'absolute', inset: 0,
        borderRadius: Math.round(size * 0.22),
        background: tint,
        border: `2px solid ${deep}`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        boxShadow: ring,
        filter: grey ? 'grayscale(1)' : undefined,
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
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover',
              // The paper of the print takes the tab's colour; the glyph stays dark.
              mixBlendMode: 'multiply',
              pointerEvents: 'none',
            }}
          />
        )}
      </span>
      {data.type === 'spell' && (
        <Badge size={badge} at={{ top: -4, right: -4 }} ink={deep}>
          <svg viewBox="0 0 10 14" width={badge * 0.5} height={badge * 0.66} aria-hidden>
            <path d="M6.2 0 L0.6 8 H4.4 L3.4 14 L9.4 5.4 H5.6 Z" fill={poster.paper} />
          </svg>
        </Badge>
      )}
      {marks.discount && (
        <Badge size={badge} at={{ top: -4, left: -4 }} ink={poster.green}>
          <svg viewBox="0 0 10 10" width={badge * 0.55} height={badge * 0.55} aria-hidden>
            <path d="M1.5 6.6 L5 3 L8.5 6.6" fill="none" stroke={poster.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Badge>
      )}
      {(marks.worn || marks.held) && (
        <Badge size={badge} at={{ bottom: -4, right: -4 }} ink={marks.worn ? poster.status.buff : poster.ink}>
          {marks.worn ? (
            <svg viewBox="0 0 10 10" width={badge * 0.56} height={badge * 0.56} aria-hidden>
              <path d="M1.6 5.2 L4 7.6 L8.6 2.6" fill="none" stroke={poster.paper} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 12" width={badge * 0.46} height={badge * 0.56} aria-hidden>
              <rect x="1" y="1" width="8" height="10" rx="1.6" fill="none" stroke={poster.paper} strokeWidth="1.8" />
            </svg>
          )}
        </Badge>
      )}
      {marks.standIn && (
        <span aria-hidden style={{ position: 'absolute', left: -5, bottom: -5, pointerEvents: 'none' }}>
          <ItemIcon itemId={marks.standIn} size={Math.round(size * 0.52)} />
        </span>
      )}
    </span>
  );
}
