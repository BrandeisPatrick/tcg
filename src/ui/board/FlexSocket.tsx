import { poster } from '../poster';

/**
 * The flex slot on a hero tile: once its side has felled the enemy Walker
 * every hero may wear a fourth item, and until it does the fourth socket sits
 * empty beside its worn chips — the shop inventory's empty slot (a dashed
 * square), a chip's size and corner, drawn to read over the portrait: a cream
 * dash on a film of ink, lifted off the art by the chips' own drop.
 */
export function FlexSocket({ size }: { size: number }) {
  return (
    <span
      role="img"
      aria-label="Flex slot: room for a fourth item"
      title="Flex slot — the enemy Walker fell: room for a fourth item"
      style={{
        display: 'block',
        width: size, height: size,
        boxSizing: 'border-box',
        borderRadius: Math.max(3, Math.round(size * 0.18)),
        border: `1.5px dashed ${poster.creamDim}`,
        background: 'rgba(23, 20, 16, 0.55)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
        pointerEvents: 'none',
      }}
    />
  );
}
