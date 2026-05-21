import { palette } from '../tokens';

/** Tiny inline brass-gem chip used wherever a soul count is shown. */
export function SoulGem({ size = 14 }: { size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle at 35% 30%, #ffd98a, ${palette.accent} 55%, #6e4612 100%)`,
      border: '1px solid #3a2810',
      boxShadow: `0 1px 2px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,235,180,0.5)`,
      display: 'inline-block',
    }} />
  );
}
