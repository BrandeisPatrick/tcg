import type { CSSProperties } from 'react';

/**
 * Card shine — the layered "physical/holo card" treatment, pairs with the
 * `.card-shine` classes in styles.css. Mount as the last child of a
 * `position: relative; overflow: hidden` container with a border-radius (the
 * layers inherit it). Reads the CSS variables written by `usePointerTilt`:
 *   --mx/--my  pointer position (glare + holo follow it)
 *   --glare    highlight strength (0 at rest)
 * so the glare and holo only ignite while the pointer is tracking the card.
 *
 * Holo (the iridescent sheen) is rarity-scaled: commons get a glossy glare
 * only, mythics get full rainbow holo. `board` is the restrained battlefield
 * variant — ring + dim holo, no broad glare, so tiles stay calm.
 */
export function CardShine({ rarity, board = false, cast = false }: {
  rarity: 1 | 2 | 3 | 4;
  board?: boolean;
  /** Render the scripted one-shot sheen bar (the play-cast reveal animates the
   *  `--cast` var to sweep it across, since no pointer is over the card). */
  cast?: boolean;
}) {
  // Pointer-reactive layers ride on top regardless of rarity (even commons
  // feel like glossy stock); the holo gradient strength scales with rarity.
  const holo = rarity >= 4 ? 0.42 : rarity >= 3 ? 0.26 : rarity >= 2 ? 0.14 : 0;
  return (
    <div
      aria-hidden
      className={`card-shine${board ? ' card-shine--board' : ''} rarity-fx--ring-${rarity}`}
      style={{ '--holo': String(holo) } as CSSProperties}
    >
      {rarity >= 2 && <div className="card-shine__ring" />}
      {holo > 0 && <div className="card-shine__holo" />}
      <div className="card-shine__glare" />
      {cast && <div className="card-shine__cast" />}
    </div>
  );
}

/**
 * Back-compat thin wrapper — older call sites pass `rarity`/`board`/`seed`.
 * `seed` is no longer needed (the shine is pointer-driven, not on a timer) so
 * it's accepted and ignored.
 */
export function RarityFX({ rarity, board = false }: {
  rarity: 1 | 2 | 3 | 4;
  board?: boolean;
  seed?: string;
}) {
  if (rarity < 1) return null;
  return <CardShine rarity={rarity} board={board} />;
}
