import { poster } from '../poster';

/**
 * The flex slot on a hero tile: once its side has felled the enemy Walker
 * every hero may wear a fourth item, and until it does the fourth socket sits
 * empty beside its worn chips — a dashed gold square the size of a chip.
 */
export function FlexSocket({ size }: { size: number }) {
  const dim = size;
  return (
    <div
      role="img"
      aria-label="Flex slot: room for a fourth item"
      title="Flex slot — the enemy Walker fell: room for a fourth item"
      style={{
        width: dim, height: dim,
        boxSizing: 'border-box',
        borderRadius: 4,
        border: `1.5px dashed ${poster.you}`,
        background: 'rgba(217, 182, 74, 0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: poster.you,
        fontSize: Math.round(dim * 0.55),
        fontWeight: 800,
        lineHeight: 1,
        pointerEvents: 'none',
      }}
    >
      +
    </div>
  );
}
