import { useRef, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { cardName, itemCard } from '@/cards';
import { moveItemBlocked, playBlocked, sellRefund } from '@/engine/legality';
import { itemCooldown, wornItems } from '@/engine/query';
import type { Action } from '@/engine/engine';
import { HeroBadge } from '@/cards/art/heroArt';
import { ItemIcon, TierDiamonds, itemArtUrl } from '../card/ItemIcon';
import { PosterButton } from '../chrome';
import { fonts, spring, text } from '../tokens';
import { poster, shopInk } from '../poster';
import { ShopTile } from './ShopTile';
import { usePress } from './usePress';
import { TIERS, soulsWord } from './itemFacts';
import { shake } from './shake';
import type { TipRequest } from './tips';

type ShopMove = Extract<Action, { type: 'buy' | 'sell' | 'moveItem' | 'playCard' }>;

/** The name a card in the shop's hand row announces itself by — the same as
 *  the board's hand (`inHandLabel`), so the tutorial and the QA scripts find a
 *  card in your hand wherever it shows. */
const inHand = (name: string) => `${name}, in your hand`;

/**
 * Your inventory, as Deadlock's shop keeps it in its corner: each hero's
 * slots — three, four with the flex slot — as squares, a worn item's tile in
 * its category's colour and an empty slot faint; and under them the hand,
 * the cards bought and not yet on a hero, as the unassigned row.
 *
 *   tap a worn item     Sell it, or Move it to another hero
 *   tap a card in hand  Sell it, or tap a hero to put it on (one that cannot
 *                       take it shakes, and the board's sticker says why)
 *   hold either         the tooltip, with the Sell line
 */
export function Inventory({ G, me, heroes, cap, slot, columns, armed, picked, onArm, onPick, onMove, onTip }: {
  G: GameState;
  me: PlayerID;
  heroes: CardInstance[];
  cap: number;
  /** A slot's size, px. */
  slot: number;
  columns: number;
  armed: string | null;
  picked: string | null;
  onArm: (iid: string | null) => void;
  onPick: (iid: string | null) => void;
  onMove: (a: ShopMove) => void;
  onTip: (t: TipRequest | null) => void;
}) {
  const ps = G.players[me];
  const armedCard = armed ? ps.hand.find((c) => c.iid === armed) : undefined;
  const pickedWorn = picked
    ? heroes.flatMap((h) => wornItems(h).map((it) => ({ it, bearer: h }))).find((x) => x.it.iid === picked)
    : undefined;

  return (
    <div role="group" aria-label="Inventory" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 6 }}>
        {heroes.map((h) => (
          <HeroSlots
            key={h.iid}
            G={G} me={me} hero={h} cap={cap} slot={slot}
            armedCard={armedCard} picked={picked}
            onPick={(iid) => { onArm(null); onPick(picked === iid ? null : iid); }}
            onPlay={(card) => { onMove({ type: 'playCard', cardIid: card.iid, heroIid: h.iid }); if (playBlocked(G, me, card.iid, h.iid) === null) onArm(null); }}
            onTip={onTip}
          />
        ))}
      </div>

      {pickedWorn && (
        <ActionBar label="Sell or move the item" onClose={() => onPick(null)}>
          <ItemIcon itemId={pickedWorn.it.cardId} size={30} chip />
          <PosterButton
            variant="red" size="sm"
            onClick={() => { onMove({ type: 'sell', itemIid: pickedWorn.it.iid }); onPick(null); }}
            ariaLabel={`Sell ${cardName(pickedWorn.it.cardId)} for ${soulsWord(sellRefund(G, pickedWorn.it))}`}
            style={{ padding: '7px 11px' }}
          >Sell +{sellRefund(G, pickedWorn.it)}</PosterButton>
          {heroes.length > 1 && <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.16em', color: poster.creamDim }}>Move</span>}
          {heroes.filter((h) => h.iid !== pickedWorn.bearer.iid).map((to) => {
            const no = moveItemBlocked(G, me, pickedWorn.it.iid, to.iid);
            return (
              <button key={to.iid} type="button" disabled={!!no}
                aria-label={`Move ${cardName(pickedWorn.it.cardId)} to ${cardName(to.cardId)}`}
                onClick={() => { onMove({ type: 'moveItem', itemIid: pickedWorn.it.iid, toHeroIid: to.iid }); onPick(null); }}
                style={{ padding: 0, border: 'none', background: 'none', cursor: no ? 'not-allowed' : 'pointer', opacity: no ? 0.3 : 1, lineHeight: 0 }}>
                <HeroBadge cardId={to.cardId} size={28} />
              </button>
            );
          })}
        </ActionBar>
      )}

      {/* The hand: what is bought and not yet on a hero — the unassigned row. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: Math.round(slot * 1.3) }}>
        <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.18em', color: poster.creamDim, width: 34, flexShrink: 0 }}>Hand</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          {ps.hand.length === 0 && <span aria-hidden style={{ width: Math.round(slot * 0.74), height: Math.round(slot * 1.04), borderRadius: 4, border: `1.5px dashed ${poster.edge}` }} />}
          {ps.hand.map((c) => (
            <HandThumb
              key={c.iid}
              card={c}
              width={Math.round(slot * 0.74)}
              selected={armed === c.iid}
              onTap={() => { onPick(null); onArm(armed === c.iid ? null : c.iid); }}
              onTip={(rect, passive) => onTip(rect ? { itemId: c.cardId, anchor: rect, source: 'hand', iid: c.iid, passive } : null)}
            />
          ))}
        </div>
      </div>

      {armedCard && (
        <ActionBar label="Sell or put on the card" onClose={() => onArm(null)}>
          <PosterButton
            variant="red" size="sm"
            onClick={() => { onMove({ type: 'sell', itemIid: armedCard.iid }); onArm(null); }}
            ariaLabel={`Sell ${cardName(armedCard.cardId)} for ${soulsWord(sellRefund(G, armedCard))}`}
            style={{ padding: '7px 11px' }}
          >Sell +{sellRefund(G, armedCard)}</PosterButton>
          <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.14em', color: poster.cream }}>or tap a hero to put it on</span>
        </ActionBar>
      )}
    </div>
  );
}

/** One hero's row of slots. While a card is picked up the row is a target:
 *  ringed green when the card can go on, and a tap there puts it on; one that
 *  cannot take it shakes. */
function HeroSlots({ G, me, hero, cap, slot, armedCard, picked, onPick, onPlay, onTip }: {
  G: GameState; me: PlayerID; hero: CardInstance; cap: number; slot: number;
  armedCard: CardInstance | undefined;
  picked: string | null;
  onPick: (iid: string) => void;
  onPlay: (card: CardInstance) => void;
  onTip: (t: TipRequest | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const items = wornItems(hero);
  const name = cardName(hero.cardId);
  const canTake = !!armedCard && playBlocked(G, me, armedCard.iid, hero.iid) === null;
  const target = !!armedCard;
  const tap = target ? () => {
    if (!canTake && ref.current) shake(ref.current);
    onPlay(armedCard!);
  } : undefined;
  return (
    <div
      ref={ref}
      role={target ? 'button' : 'group'}
      aria-label={target ? `Put ${cardName(armedCard!.cardId)} on ${name}` : `${name}'s slots`}
      onClick={tap}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: 4, minWidth: 0,
        borderRadius: 7,
        border: `1.5px solid ${canTake ? poster.target : target ? poster.edge : 'transparent'}`,
        background: canTake ? 'rgba(98, 196, 98, 0.14)' : 'rgba(0, 0, 0, 0.16)',
        cursor: target ? (canTake ? 'pointer' : 'not-allowed') : 'default',
        transition: 'border-color 140ms ease, background 140ms ease',
      }}
    >
      <HeroBadge cardId={hero.cardId} size={Math.round(slot * 0.82)} />
      <div style={{ display: 'flex', gap: 4, minWidth: 0, pointerEvents: target ? 'none' : 'auto' }}>
        {Array.from({ length: cap }, (_, i) => {
          const it = items[i];
          if (!it) return <EmptySlot key={i} size={slot} />;
          const live = { cooldown: itemCooldown(it) || undefined, charges: it.charges };
          return (
            <ShopTile
              key={it.iid}
              itemId={it.cardId}
              size={slot}
              selected={picked === it.iid}
              marks={{ cooldown: live.cooldown, charges: live.charges ?? undefined }}
              label={`${cardName(it.cardId)}, worn by ${name} — sell it or move it`}
              onTap={() => onPick(it.iid)}
              onLong={(r) => onTip({ itemId: it.cardId, anchor: r, source: 'worn', iid: it.iid })}
              onHover={(r) => onTip(r ? { itemId: it.cardId, anchor: r, source: 'worn', iid: it.iid, passive: true } : null)}
            />
          );
        })}
      </div>
    </div>
  );
}

function EmptySlot({ size }: { size: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: Math.round(size * 0.18),
      border: `1.5px dashed ${poster.edge}`,
      background: 'rgba(255, 255, 255, 0.03)',
    }} />
  );
}

/** The tier diamonds' size on a hand thumbnail `width` px wide: about a
 *  seventh of it, and never so big that a diamond for every tier (and a 1px
 *  gap between each) overflows the foot inside its border. */
const diamondSize = (width: number) =>
  Math.max(3, Math.min(Math.round(width * 0.14), Math.floor((width - 3 - (TIERS.length - 1)) / TIERS.length)));

/** A card in the hand as a thumbnail: the item's art on a small card, its
 *  foot in the category's colour with the tier's diamonds. */
function HandThumb({ card, width, selected, onTap, onTip }: {
  card: CardInstance; width: number; selected: boolean;
  onTap: () => void;
  onTip: (rect: DOMRect | null, passive?: boolean) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const data = itemCard(card.cardId);
  const rect = () => ref.current!.getBoundingClientRect();
  const press = usePress(onTap, () => onTip(rect()), (on) => onTip(on ? rect() : null, true));
  if (!data) return null;
  const { ink } = shopInk(data.slot);
  const height = Math.round(width * 1.4);
  const url = itemArtUrl(card.cardId);
  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={`${inHand(data.name)} — tap to sell it or put it on a hero; hold to see it`}
      aria-pressed={selected}
      whileTap={{ scale: 0.92 }}
      animate={{ y: selected ? -4 : 0 }}
      transition={spring.snappy}
      {...press}
      style={{
        position: 'relative', width, height, padding: 0, flexShrink: 0,
        border: `1.5px solid ${ink}`, borderRadius: 4,
        background: poster.ink, overflow: 'hidden', cursor: 'pointer',
        boxShadow: selected ? `0 0 0 2px ${poster.cream}, 0 6px 12px rgba(0, 0, 0, 0.5)` : '0 2px 4px rgba(0, 0, 0, 0.45)',
        touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
      } as CSSProperties}
    >
      {url && <img src={url} alt="" draggable={false} style={{ display: 'block', width: '100%', height: width - 3, objectFit: 'cover', pointerEvents: 'none' }} />}
      <span aria-hidden style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: width - 3,
        background: ink, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <TierDiamonds tier={data.tier} size={diamondSize(width)} ink={poster.ink} faint="rgba(23, 20, 16, 0.35)" />
      </span>
    </motion.button>
  );
}

function ActionBar({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: 6, borderRadius: 7, background: 'rgba(0, 0, 0, 0.28)', border: `1px solid ${poster.edge}`,
    }}>
      {children}
      <span style={{ flex: 1 }} />
      <button type="button" aria-label="Keep it" onClick={onClose}
        style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: fonts.display, fontSize: 16, lineHeight: 1, color: poster.creamDim, padding: '0 4px' }}>×</button>
    </div>
  );
}

