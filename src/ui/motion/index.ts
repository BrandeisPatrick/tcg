/**
 * The deck game's card motion (docs/deck-plan.md, "Animations"): cards flying
 * between the deck, the hand and the discard pile, the opening's heroes into
 * the deck, an upgrade appearing and going in, and the piles' counts ticking
 * with it — all driven by the `deck` FX events the engine reports.
 *
 *   deckMotionPlan.ts     the plan, pure (events → flights, ticks, riffles)
 *   pileTicker.ts         the counts' hold until the card leaves or lands
 *   DeckMotionContext.tsx useDeckMotion / DeckMotionProvider / useTickedCount
 *   admitBatch.ts         a batch put up once (its ticks scheduled once)
 *   DeckMotionLayer.tsx   the ghosts in the air
 */
export { DECK_MOTION, planDeckMotion, arrivingIids, deckEvents, locate, EMPTY_PLAN } from './deckMotionPlan';
export type { DeckMotionPlan, Flight, PileTick, Riffle, Anchor } from './deckMotionPlan';
export { PileTicker } from './pileTicker';
export { admitBatch } from './admitBatch';
export type { PileKey } from './pileTicker';
export { DeckMotionProvider, useDeckMotion, useTickedCount } from './DeckMotionContext';
export { DeckMotionLayer } from './DeckMotionLayer';
