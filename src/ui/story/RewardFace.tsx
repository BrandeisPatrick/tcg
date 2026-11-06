/**
 * A pick as it prints: a hero or an item is its own card; a purse of souls
 * (a supply stop's third choice) is printed in the same charcoal frame — the
 * soul coins and their stencilled count in the art window, the ink type
 * band, and what it does on the cream label band — so the three options of
 * a cache read as one hand.
 */
import type { CardId } from '@/engine/types';
import type { FightReward, RewardChoice } from '@/story/types';
import { cardName } from '@/cards';
import { CardFrame, SIZES } from '../card/CardFrame';
import { fonts, text } from '../tokens';
import { poster, soulCoin, tileShadow, printEdge } from '../poster';

/** One option of a 1-of-3 pick: a card (a hero), or a supply (an item or
 *  souls). */
export type PickOption = CardId | RewardChoice;

export const soulsLabel = (n: number) => `${n} ${n === 1 ? 'soul' : 'souls'}`;

/** The card an option is, when it is one. */
export function optionCard(option: PickOption): CardId | undefined {
  return typeof option === 'string' ? option : 'item' in option ? option.item : undefined;
}

/** What an option is called: the card's name, or "8 souls". */
export function optionName(option: PickOption): string {
  const id = optionCard(option);
  if (id) return cardName(id);
  return soulsLabel((option as { souls: number }).souls);
}

/** What the next fight starts with, in a few words: "1 item · 8 souls". */
export function rewardSummary(reward: FightReward): string {
  const n = reward.items.length;
  const parts = [n ? `${n} ${n === 1 ? 'item' : 'items'}` : '', reward.souls > 0 ? soulsLabel(reward.souls) : ''];
  return parts.filter(Boolean).join(' · ') || 'Nothing yet';
}

type Size = 'hand' | 'full';

export function OptionFace({ option, size, glow = null, physical }: {
  option: PickOption;
  size: Size;
  glow?: 'gold' | null;
  physical?: boolean;
}) {
  const id = optionCard(option);
  return id
    ? <CardFrame cardId={id} size={size} glow={glow} physical={physical} />
    : <SoulsFace souls={(option as { souls: number }).souls} size={size} glow={glow} />;
}

/** The most coins the art window racks; the numeral counts every soul. */
const RACK = 12;

/** A purse of souls, card-sized: what a supply stop offers instead of an
 *  item, and what the next fight's souls look like in the run panel. */
export function SoulsFace({ souls, size = 'hand', glow = null }: {
  souls: number;
  size?: Size;
  glow?: 'gold' | null;
}) {
  const sz = SIZES[size];
  const hand = size === 'hand';
  const coin = hand ? 13 : 26;
  const perRow = 4;
  const coins = Math.min(souls, RACK);
  const ring = glow === 'gold' ? poster.you : null;
  return (
    <div
      role="img"
      aria-label={soulsLabel(souls)}
      style={{
        width: sz.w,
        height: sz.h,
        boxSizing: 'border-box',
        borderRadius: 10,
        background: poster.frame,
        border: `2px solid ${ring ?? poster.edge}`,
        boxShadow: ring ? `inset 0 0 0 2px ${ring}, ${tileShadow}` : tileShadow,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        color: poster.ink,
        fontFamily: fonts.ui,
      }}
    >
      {/* Art window: the count, stencilled, over the rack of coins. */}
      <div style={{
        position: 'relative',
        flex: `0 0 ${hand ? '55%' : '58%'}`,
        minHeight: 0,
        background: poster.ground,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: hand ? 6 : 14,
      }}>
        <span style={{
          fontFamily: fonts.display,
          fontSize: hand ? 30 : 64,
          lineHeight: 1,
          color: poster.gold,
          fontVariantNumeric: 'tabular-nums',
        }}>
          +{souls}
        </span>
        <span aria-hidden style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(perRow, Math.max(1, coins))}, ${coin}px)`,
          gap: hand ? 3 : 6,
        }}>
          {Array.from({ length: coins }, (_, i) => <span key={i} style={{ ...soulCoin(coin), display: 'block' }} />)}
        </span>
        <div aria-hidden style={{ position: 'absolute', inset: 0, boxShadow: printEdge, pointerEvents: 'none' }} />
      </div>

      {/* Type band. */}
      <div style={{
        flexShrink: 0,
        padding: '4px 9px',
        background: poster.ink,
        color: poster.cream,
        fontFamily: fonts.display,
        fontSize: 10,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        lineHeight: 1.3,
        textAlign: 'left',
      }}>
        Souls
      </div>

      {/* Label band: the name, and what it does. */}
      <div style={{
        flex: '1 1 auto',
        minHeight: 0,
        background: poster.paperBand,
        padding: '5px 8px 6px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          fontFamily: fonts.display,
          fontSize: hand ? 12 : 14,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1.15,
        }}>
          {soulsLabel(souls)}
        </div>
        <div style={{
          ...text.body,
          marginTop: hand ? 3 : 4,
          fontSize: hand ? 11 : 12,
          lineHeight: hand ? 1.25 : 1.35,
          color: hand ? poster.ink : poster.inkDim,
          overflow: 'hidden',
        }}>
          {hand
            ? 'To spend in your next fight.'
            : `Your next fight starts with ${souls} more ${souls === 1 ? 'soul' : 'souls'} to spend.`}
        </div>
      </div>
    </div>
  );
}
