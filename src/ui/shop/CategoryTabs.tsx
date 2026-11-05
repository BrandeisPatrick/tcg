import type { ItemSlot } from '@/engine/types';
import { fonts } from '../tokens';
import { poster, shopInk } from '../poster';
import { CATEGORY_WORD, SHOP_TABS } from './itemFacts';

/**
 * The shop's three tabs — Weapon · Vitality · Spirit — the lit one underlined
 * in its category's colour over a faint film of it, as Deadlock's shop marks
 * its open tab. The words are the only ones the tabs print.
 */
export function CategoryTabs({ tab, onTab, compact = false, idPrefix = 'shop' }: {
  tab: ItemSlot;
  onTab: (slot: ItemSlot) => void;
  compact?: boolean;
  /** Ties each tab to its panel (`${idPrefix}-panel`). */
  idPrefix?: string;
}) {
  return (
    <div role="tablist" aria-label="Item categories" style={{ display: 'flex', borderBottom: `1px solid ${poster.edge}` }}>
      {SHOP_TABS.map((slot) => {
        const on = slot === tab;
        const { ink, wash } = shopInk(slot);
        return (
          <button
            key={slot}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${slot}`}
            aria-selected={on}
            aria-controls={`${idPrefix}-panel`}
            onClick={() => onTab(slot)}
            style={{
              flex: 1, minWidth: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: compact ? '11px 4px 9px' : '12px 6px 10px',
              border: 'none',
              borderBottom: `3px solid ${on ? ink : 'transparent'}`,
              marginBottom: -1,
              background: on ? wash : 'transparent',
              color: on ? poster.cream : poster.creamDim,
              fontFamily: fonts.display,
              fontSize: compact ? 13 : 14,
              letterSpacing: compact ? '0.08em' : '0.12em',
              textTransform: 'uppercase',
              lineHeight: 1,
              cursor: 'pointer',
              transition: 'color 140ms ease, background 140ms ease, border-color 140ms ease',
            }}
          >
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: ink, opacity: on ? 1 : 0.55, flexShrink: 0 }} />
            {CATEGORY_WORD[slot]}
          </button>
        );
      })}
    </div>
  );
}

/** A category's banner over its column — the desktop sheet sets the three
 *  side by side, as Deadlock's shop does. */
export function CategoryBanner({ slot }: { slot: ItemSlot }) {
  const { ink, deep } = shopInk(slot);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 10px', marginBottom: 10, borderRadius: 4,
      background: `linear-gradient(90deg, ${ink}, ${deep})`,
      color: poster.ink,
      fontFamily: fonts.display, fontSize: 15, letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1,
    }}>
      {CATEGORY_WORD[slot]}
    </div>
  );
}
