import type { CardId } from '@/engine/types';
import { cardName, itemCard } from '@/cards';
import { RuleText } from '../card/RuleText';
import { HandThumb } from '../board/HandThumb';
import { fonts, text } from '../tokens';
import { poster } from '../poster';
import { scale } from '../hud';

/**
 * One item on a choice sheet (the item swap, the upgrade pick): its shop art
 * (the hand's thumb, price and all) and its name, kind and WHOLE rule beside
 * it. A miniature card cut the rule off mid-sentence or shrank it past
 * reading, and these sheets are where the player weighs one rule against
 * another. `tone` rings it: the new card green, the marked one red.
 */
export function ItemLine({ cardId, tone }: { cardId: CardId; tone?: 'new' | 'going' | null }) {
  const data = itemCard(cardId);
  const ring = tone === 'new' ? poster.target : tone === 'going' ? poster.red : 'rgba(23, 20, 16, 0.28)';
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
      width: '100%', boxSizing: 'border-box',
      padding: '10px 12px 10px 14px',
      borderRadius: 10,
      background: 'rgba(23, 20, 16, 0.05)',
      boxShadow: `inset 0 0 0 ${tone ? 2 : 1}px ${ring}`,
      lineHeight: 1.3,
    }}>
      <span style={{ flexShrink: 0, paddingTop: 4 }}><HandThumb cardId={cardId} /></span>
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontFamily: fonts.display, fontSize: scale.body, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.1, color: poster.ink }}>
          {cardName(cardId)}
        </span>
        {data && (
          <span style={{ fontFamily: fonts.display, fontSize: scale.floor, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1, color: poster.inkDim }}>
            {data.type === 'spell' ? 'Active' : 'Item'} · Tier {data.tier}
          </span>
        )}
        {data?.text && (
          <span style={{ ...text.body, fontSize: scale.body, lineHeight: 1.35, color: poster.ink }}>
            <RuleText text={data.text} passTaps />
          </span>
        )}
      </span>
    </span>
  );
}
