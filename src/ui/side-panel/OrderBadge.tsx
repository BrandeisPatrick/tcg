import { fonts } from '../tokens';

/** "1st" / "2nd" turn-order pill shown next to each patron label. */
export function OrderBadge({ order, color }: { order: '1st' | '2nd'; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '1px 5px',
      marginLeft: 4,
      borderRadius: 3,
      border: `1px solid ${color}88`,
      background: `linear-gradient(180deg, ${color}33, ${color}11)`,
      color: color,
      fontFamily: fonts.ui,
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.3,
    }}>
      {order}
    </span>
  );
}
