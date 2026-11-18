import { TYPE, fonts, text } from '../tokens';
import { poster } from '../poster';

/** What a lesson taught, as its closing card lists it: three lines at most,
 *  each behind an ink tick. */
export function Learned({ lines, compact = false, ink = poster.inkDim }: { lines: string[]; compact?: boolean; ink?: string }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: compact ? 2 : 5 }}>
      {lines.map((line) => (
        <li key={line} style={{ ...text.body, display: 'flex', alignItems: 'baseline', gap: 7, fontSize: compact ? TYPE.small : TYPE.body, lineHeight: compact ? 1.3 : 1.4, color: ink }}>
          <span aria-hidden style={{ flexShrink: 0, fontFamily: fonts.display, color: poster.ink }}>✓</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
