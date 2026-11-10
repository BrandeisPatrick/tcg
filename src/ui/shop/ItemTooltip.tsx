/**
 * An item's tooltip, laid out as Deadlock's own shop lays it out: a header in
 * the item's category colour with its name and price, the tier's diamonds and
 * the category; the stat lines; what it does — its card text, on the game's
 * paper, under ACTIVE (with its cooldown or charges) or PASSIVE; what it
 * builds from and into; and on a card you own, the Sell line with what selling
 * it brings back (all it cost the turn it was bought, half after).
 *
 * It sits beside the tile it was opened from — above it when there is room —
 * over the shop's sheet. Opened by a long-press (a mouse rest on a desktop),
 * it stays until a tap elsewhere; a second tap on the tile or on the tooltip
 * opens the full card (`onOpenCard`). A hover tooltip (`passive`) takes no
 * taps and goes when the mouse does.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { CardId } from '@/engine/types';
import { cardName, itemCard } from '@/cards';
import { fonts, spring, text } from '../tokens';
import { poster, shopInk } from '../poster';
import { Souls } from '../hud';
import { RuleText } from '../card/RuleText';
import { ItemIcon, TierDiamonds } from '../card/ItemIcon';
import { useViewport } from '../hooks/useViewport';
import { CATEGORY_WORD, buildsFrom, buildsInto, effectText, listPrice, soulsWord, statLines, useFacts } from './itemFacts';

/** The tooltip's accessible name: "Extended Magazine — item details". */
export const tooltipLabel = (itemId: CardId) => `${cardName(itemId)} — item details`;

export interface TooltipSale {
  /** What selling it brings back now. */
  refund: number;
  /** Bought this turn: the refund is all it cost. */
  full: boolean;
  /** Sell it. Absent: the line is information only. */
  onSell?: () => void;
  /** Why it cannot be sold now. */
  blockedReason?: string;
}

interface Props {
  itemId: CardId;
  /** The tile it was opened from, on screen. */
  anchor: DOMRect;
  /** What it costs you now, when it is on sale (an upgrade: the difference). */
  price?: number;
  /** The souls you hold, for "too dear" and the souls left after buying. */
  souls?: number;
  /** A copy you own: its sale. */
  sale?: TooltipSale;
  /** A worn active's live state: its cooldown left, or its charges. */
  live?: { cooldown?: number; charges?: number };
  /** One more line under the rest ("Tap a hero to put it on"). */
  note?: string;
  /** A hover peek: no taps, no catcher. */
  passive?: boolean;
  /** The second tap: the full card. */
  onOpenCard?: () => void;
  onClose: () => void;
}

const WIDTH = 296;
const GAP = 8;
const MARGIN = 10;

export function ItemTooltip({ itemId, anchor, price, souls, sale, live, note, passive = false, onOpenCard, onClose }: Props) {
  const { width: vw, height: vh } = useViewport();
  const panel = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (panel.current) setHeight(panel.current.offsetHeight);
  });
  const data = itemCard(itemId);
  if (!data) return null;
  const { ink, deep } = shopInk(data.slot);
  const width = Math.min(WIDTH, vw - MARGIN * 2);
  // Beside the tile where the screen is wide enough — to its right, as
  // Deadlock's shop opens it, or its left at the right edge — level with its
  // top. On a phone, above the tile when it fits there, else below it, else
  // wherever there is most room.
  const besideRight = anchor.right + GAP + width <= vw - MARGIN;
  const besideLeft = anchor.left - GAP - width >= MARGIN;
  const beside = vw >= 768 && (besideRight || besideLeft);
  const roomAbove = anchor.top - GAP - MARGIN;
  const roomBelow = vh - anchor.bottom - GAP - MARGIN;
  const above = !beside && (height > 0 ? (height <= roomAbove || (height > roomBelow && roomAbove > roomBelow)) : roomAbove > roomBelow);
  const left = beside
    ? (besideRight ? anchor.right + GAP : anchor.left - GAP - width)
    : Math.max(MARGIN, Math.min(vw - width - MARGIN, anchor.left + anchor.width / 2 - width / 2));
  const top = beside
    ? Math.max(MARGIN, Math.min(vh - MARGIN - (height || 0), anchor.top - 8))
    : above
      ? Math.max(MARGIN, anchor.top - GAP - (height || 0))
      : Math.min(Math.max(MARGIN, vh - MARGIN - (height || 0)), anchor.bottom + GAP);
  const maxHeight = vh - MARGIN * 2;

  const stats = statLines(itemId);
  const effect = effectText(itemId);
  const use = useFacts(itemId);
  const from = buildsFrom(itemId);
  const into = buildsInto(itemId);
  const list = listPrice(itemId);
  const cost = price ?? list;
  const short = souls !== undefined && price !== undefined && souls < price;

  const tapCard = onOpenCard && !passive ? () => onOpenCard() : undefined;

  return (
    <>
      {/* A tap anywhere else puts it away — and does nothing else, so a look
          at an item never buys the one under the thumb. A tap on the tile it
          came from is the second tap: the full card. */}
      {!passive && (
        <div
          aria-hidden
          // The press that opened the tooltip ends on the catcher: on a touch
          // screen its release lands here as a click. Only a press that
          // starts here counts.
          onPointerDown={() => { pressed.current = true; }}
          onClick={(e) => {
            if (!pressed.current) return;
            pressed.current = false;
            const inTile = e.clientX >= anchor.left && e.clientX <= anchor.right && e.clientY >= anchor.top && e.clientY <= anchor.bottom;
            if (inTile && onOpenCard) onOpenCard();
            else onClose();
          }}
          // A touch's long-press may end in a contextmenu too: only a
          // right-click that starts here puts the tooltip away.
          onContextMenu={(e) => { e.preventDefault(); if (pressed.current) { pressed.current = false; onClose(); } }}
          style={{ position: 'fixed', inset: 0, zIndex: 89 }}
        />
      )}
      <motion.div
        ref={panel}
        role="dialog"
        aria-label={tooltipLabel(itemId)}
        initial={{ opacity: 0, x: beside ? (besideRight ? -6 : 6) : 0, y: beside ? 0 : above ? 6 : -6, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={spring.snappy}
        onClick={tapCard}
        style={{
          position: 'fixed', left, top, width, maxHeight, overflowY: 'auto',
          zIndex: 89,
          pointerEvents: passive ? 'none' : 'auto',
          cursor: tapCard ? 'pointer' : 'default',
          background: poster.frame,
          border: `1.5px solid ${poster.edge}`,
          borderRadius: 8,
          boxShadow: '0 18px 36px rgba(0, 0, 0, 0.6), 0 3px 8px rgba(0, 0, 0, 0.4)',
          color: poster.cream,
          fontFamily: fonts.ui,
          visibility: height > 0 ? 'visible' : 'hidden',
        }}
      >
        {/* Header — the category's colour, as Deadlock prints it. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 10px 9px 9px', background: ink, color: poster.ink }}>
          <ItemIcon itemId={itemId} size={40} chip />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: fonts.display, fontSize: 16, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.05 }}>{data.name}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <TierDiamonds tier={data.tier} size={7} ink={poster.ink} faint="rgba(23, 20, 16, 0.4)" />
              <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.16em', color: poster.ink }}>Tier {data.tier} · {CATEGORY_WORD[data.slot]}</span>
            </span>
          </div>
          <span
            aria-label={`Costs ${soulsWord(cost)}${price !== undefined && price < list ? ` (an upgrade, at the difference: ${list} list)` : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', padding: '3px 7px', borderRadius: 4, background: poster.ink }}
          >
            <Souls n={cost} size={15} tone={short ? 'short' : 'mint'} />
            {price !== undefined && price < list && (
              <span style={{ fontFamily: fonts.display, fontSize: 11, lineHeight: 1, color: poster.creamFaint, textDecoration: 'line-through' }}>{list}</span>
            )}
          </span>
        </div>

        {/* Stat lines. */}
        {stats.length > 0 && (
          <Rows>
            {stats.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: fonts.display, fontSize: 16, lineHeight: 1, color: ink, minWidth: 26 }}>{s.value}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: poster.cream }}>{s.label}</span>
              </div>
            ))}
          </Rows>
        )}

        {/* What it does — ACTIVE with its cooldown or charges, or PASSIVE — on the game's paper. */}
        {(effect || use.kind === 'active') && (
          <div style={{ padding: '8px 10px 2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                ...text.label, fontSize: 9.5, letterSpacing: '0.2em',
                padding: '3px 6px', borderRadius: 3,
                background: use.kind === 'active' ? poster.gold : 'transparent',
                color: use.kind === 'active' ? poster.ink : poster.creamDim,
                border: use.kind === 'active' ? 'none' : `1px solid ${poster.edge}`,
              }}>{use.kind === 'active' ? 'Active' : 'Passive'}</span>
              {use.kind === 'active' && (
                <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.14em', color: poster.creamDim }}>
                  {'charges' in use
                    ? `${live?.charges ?? use.charges} of ${use.charges} charges a match`
                    : live?.cooldown ? `Ready in ${live.cooldown} turn${live.cooldown === 1 ? '' : 's'} · cooldown ${use.cooldown}`
                    : `Cooldown ${use.cooldown} turns · starts cooling`}
                </span>
              )}
            </div>
            {effect && (
              <div style={{
                ...text.body, fontSize: 12.5, lineHeight: 1.4,
                padding: '8px 10px', borderRadius: 5,
                background: poster.paperBand, color: poster.ink,
              }}>
                <RuleText text={effect} passTaps />
              </div>
            )}
          </div>
        )}

        {/* Builds from / into. */}
        {(from || into.length > 0) && (
          <Rows>
            {from && <Chain label="Builds from" ids={[from]} />}
            {into.length > 0 && <Chain label="Builds into" ids={into} />}
          </Rows>
        )}

        {/* The Sell line, on a card you own. */}
        {sale && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderTop: `1px solid ${poster.edge}` }}>
            <span style={{ ...text.label, fontSize: 10, letterSpacing: '0.16em', color: poster.creamDim }}>Sell</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Souls n={`+${sale.refund}`} size={14} />
            </span>
            <span style={{ fontSize: 11, color: poster.creamDim, flex: 1, minWidth: 0 }}>
              {sale.blockedReason ?? (sale.full ? 'all it cost — bought this turn' : 'half — bought before this turn')}
            </span>
            {sale.onSell && !sale.blockedReason && (
              <button
                type="button"
                aria-label={`Sell ${data.name} for ${soulsWord(sale.refund)}`}
                onClick={(e) => { e.stopPropagation(); sale.onSell!(); }}
                style={{
                  border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer',
                  background: poster.red, color: poster.paper,
                  fontFamily: fonts.display, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1,
                }}
              >Sell +{sale.refund}</button>
            )}
          </div>
        )}

        <div style={{ padding: '6px 10px 8px', borderTop: `1px solid ${poster.edge}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {note && <span style={{ fontSize: 11.5, color: poster.cream }}>{note}</span>}
          {short && price !== undefined && souls !== undefined && (
            <span style={{ fontSize: 11.5, color: poster.red }}>Need {soulsWord(price)} — you have {souls}</span>
          )}
          {!passive && onOpenCard && (
            <span style={{ ...text.label, fontSize: 9, letterSpacing: '0.18em', color: poster.creamFaint }}>Tap again for the full card</span>
          )}
        </div>
      </motion.div>
    </>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${poster.edge}` }}>{children}</div>;
}

/** "Builds from [icon] Extra Spirit" — a component or what it upgrades into. */
function Chain({ label, ids }: { label: string; ids: CardId[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ ...text.label, fontSize: 9, letterSpacing: '0.16em', color: poster.creamDim, width: 78, flexShrink: 0 }}>{label}</span>
      {ids.map((id) => (
        <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ItemIcon itemId={id} size={20} chip />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{cardName(id)}</span>
        </span>
      ))}
    </div>
  );
}
