import type { CardId } from '@/engine/types';

/** A tooltip asked for: the item, the tile it was opened from, and what kind
 *  of tile — an item on sale (`market`), a build's item you already have
 *  (`build`), an item worn by one of your heroes (`worn`, by its instance) or
 *  a card in your hand (`hand`, by its instance). A `passive` one is a mouse
 *  resting on the tile: it takes no taps and goes when the mouse does. */
export interface TipRequest {
  itemId: CardId;
  anchor: DOMRect;
  source: 'market' | 'build' | 'worn' | 'hand';
  iid?: string;
  passive?: boolean;
}

/** The next tooltip, given the one up and a request: a hover never takes the
 *  place of a tooltip opened by a hold, and a hover ending (null) only puts a
 *  hover's tooltip away. */
export function nextTip(cur: TipRequest | null, req: TipRequest | null): TipRequest | null {
  if (req === null) return cur?.passive ? null : cur;
  if (req.passive && cur && !cur.passive) return cur;
  return req;
}
