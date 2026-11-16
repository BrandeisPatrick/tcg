/**
 * Chance. One effect rolls a die: a flying hero dodges a hit 1 time in 3
 * (Vindicta's Flight; `damageUnit`). The roll is drawn from the match's own
 * seeded stream (`nextRandom`), so a game replays — which also means a copy of
 * the game would roll the same number. A preview must not show a roll that
 * has not been made, and the AI must not look one up, so both run BLIND: no
 * die is drawn and nothing dodges (the hit is assumed to land, as 2 in 3 do).
 *
 *  - Blind: the attack line and the push shown while an attack is being
 *    aimed (ui/board/attackAim.ts, Board), and the AI's whole look
 *    (`enumerateAIMoves`).
 *  - Not blind: a move made, and the forecast taken as the attack is
 *    committed (the choreographer walks it, so it has to be what happens).
 */
let blind = 0;

/** Run `fn` with every roll skipped: nothing is drawn from the stream and no hit is dodged. */
export function withBlindRolls<T>(fn: () => T): T {
  blind++;
  try {
    return fn();
  } finally {
    blind--;
  }
}

/** True inside `withBlindRolls`. */
export function rollsBlind(): boolean {
  return blind > 0;
}
