import type { StatusId } from '@/engine/types';
import { STATUSES_BY_ID } from '@/statuses';
import { poster } from '../poster';
import { statusClass, statusLabel } from '../card/StatusIcon';
import { explainNumber, type NumberSpec, type Scale } from '../card/scaling';

/**
 * What an Explain popover says: plain data, so the words can be read and
 * tested without drawing anything. A number's colour says what it scales with
 * (card/scaling.ts); a status says what it does (src/statuses). Both pass
 * through the same hover tooltip / tap popup.
 */
export interface ExplainContent {
  title: string;
  /** The side-rule colour: the number's ink, or the status chip's class colour. */
  accent: string;
  /** One emphasised line under the title (a number's sum). */
  lead?: string;
  lines: string[];
}

/** A scaling number's explanation, for whoever it belongs to. */
export function numberContent(n: NumberSpec, scale?: Scale): ExplainContent {
  return explainNumber(n, scale);
}

/** What a status does. `value` fills the registry's `<value>` for a chip on a
 *  hero; `valueWord` stands in for it where no number is known (a keyword in
 *  card text with nothing after it). `duration` is the chip's turns left. */
export function statusContent(
  id: StatusId,
  { value, duration, valueWord = 'N' }: { value?: number; duration?: number; valueWord?: string } = {},
): ExplainContent {
  const def = STATUSES_BY_ID[id];
  const desc = (def?.desc ?? '').replace(/<value>/g, value === undefined ? valueWord : String(value));
  const turns = typeof duration === 'number' && duration > 0 && duration < 99
    ? `${duration} turn${duration === 1 ? '' : 's'} left.`
    : null;
  return {
    title: def?.title ?? statusLabel(id),
    accent: poster.status[statusClass(id)],
    lines: [desc, turns].filter((s): s is string => !!s),
  };
}
