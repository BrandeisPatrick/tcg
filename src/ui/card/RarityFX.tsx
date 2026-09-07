import { poster } from '../poster';

/**
 * Card shine — cards are flat screen prints, so the one light effect left is
 * the scripted cast bar (`.card-shine__cast` in styles.css): CardPlayFlash
 * animates the inherited `--cast` variable 0→1 on a wrapper and the bar
 * sweeps across the card as it is dealt onto the sheet.
 *
 * Mount as the last child of a `position: relative; overflow: hidden;
 * isolation: isolate` container with a border-radius (the layer inherits it
 * and blends against the card alone). Renders nothing unless `cast` is set,
 * so hosts that still mount it for a rarity treatment get a matte card;
 * `rarity` and `board` are accepted for those call sites.
 */
export function CardShine({ cast = false }: {
  rarity: 1 | 2 | 3 | 4;
  board?: boolean;
  /** Render the scripted one-shot sheen bar (the play-cast reveal animates the
   *  `--cast` var to sweep it across, since no pointer is over the card). */
  cast?: boolean;
}) {
  if (!cast) return null;
  return (
    <div aria-hidden className="card-shine">
      <div className="card-shine__cast" />
    </div>
  );
}

/** Flat rarity inks for the printed rarity dot: common grey, uncommon green,
 *  rare print blue, mythic gold. */
export function rarityInk(rarity: 1 | 2 | 3 | 4): string {
  return rarity >= 4 ? poster.gold
    : rarity >= 3 ? '#3b5d8a'
    : rarity >= 2 ? poster.green
    : '#8f8a80';
}
