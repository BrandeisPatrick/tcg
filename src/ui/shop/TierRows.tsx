import type { ReactNode } from 'react';
import type { CardId, ItemSlot, ItemTier } from '@/engine/types';
import { PRICE } from '@/engine/constants';
import { TierDiamonds } from '../card/ItemIcon';
import { fonts, text } from '../tokens';
import { poster, shopInk, soulCoin } from '../poster';
import { CATEGORY_WORD, TIERS, soulsWord } from './itemFacts';

/**
 * One category's items as Deadlock's shop sets them out: a row per tier,
 * cheapest first, each headed by the tier's diamonds and its price — in the
 * warning ink while you cannot pay it (`short`) — and then the tiles. A tier
 * with nothing on sale prints no row. The tiles are the caller's: the shop's
 * buy, the draft's look, the build editor's pick.
 */
export function TierRows({ slot, byTier, renderTile, short, gap = 6, empty }: {
  slot: ItemSlot;
  byTier: Record<ItemTier, CardId[]>;
  renderTile: (id: CardId, tier: ItemTier) => ReactNode;
  short?: (tier: ItemTier) => boolean;
  gap?: number;
  /** Printed when no tier has anything. */
  empty?: ReactNode;
}) {
  const rows = TIERS.filter((t) => byTier[t].length > 0);
  if (rows.length === 0) return <>{empty ?? null}</>;
  return (
    <div role="group" aria-label={`${CATEGORY_WORD[slot]} items`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((tier) => (
        <div key={tier} role="group" aria-label={`Tier ${tier}: ${soulsWord(PRICE[tier])}`}>
          <TierHeader slot={slot} tier={tier} short={!!short?.(tier)} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap, paddingTop: 2 }}>
            {byTier[tier].map((id) => renderTile(id, tier))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** "◆◇◇◇ T1 · ● 2 souls" and a hairline — the price in the warning ink while
 *  you cannot pay it. */
export function TierHeader({ slot, tier, short = false }: { slot: ItemSlot; tier: ItemTier; short?: boolean }) {
  const { ink } = shopInk(slot);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <TierDiamonds tier={tier} size={7} ink={ink} />
      <span style={{ ...text.label, fontSize: 10, letterSpacing: '0.16em', color: poster.creamDim }}>T{tier}</span>
      <span aria-hidden style={{ color: poster.creamFaint, fontSize: 10 }}>·</span>
      <span aria-hidden style={soulCoin(10)} />
      <span style={{
        fontFamily: fonts.display, fontSize: 13, lineHeight: 1,
        color: short ? poster.red : poster.cream,
      }}>{PRICE[tier]}</span>
      <span style={{ ...text.label, fontSize: 9, letterSpacing: '0.14em', color: short ? poster.red : poster.creamDim }}>souls</span>
      <span aria-hidden style={{ flex: 1, height: 1, background: poster.edge }} />
    </div>
  );
}
