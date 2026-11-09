/**
 * How the board wires the deck motion in (three touches, so the files the
 * hero-card branch changes stay almost as they were):
 *
 *   useDeckMotion   Board calls it with its fresh FX batch: the plan for the
 *                   batch (empty under calm motion), the hand cards landing,
 *                   how long the opening takes, and the ticker the piles read
 *   DeckMotionProvider   round the board, so the piles can find the ticker
 *   useTickedCount  a pile's count, ticking with the motion
 */
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { FxEvent, GameState, PlayerID } from '@/engine/types';
import { useCalmMotion } from '../effects/fx/FxMotionContext';
import { EMPTY_PLAN, arrivingIids, planDeckMotion, type DeckMotionPlan } from './deckMotionPlan';
import { PileTicker, type PileKey } from './pileTicker';

const DeckMotionContext = createContext<PileTicker | null>(null);

export function DeckMotionProvider({ ticker, children }: { ticker: PileTicker; children: ReactNode }) {
  return <DeckMotionContext.Provider value={ticker}>{children}</DeckMotionContext.Provider>;
}

/** A pile's count as the board shows it: the engine's `actual`, less what is
 *  still in the air. Without a provider (the gallery, the deck editor) it is
 *  `actual`. */
export function useTickedCount(key: PileKey, actual: number): number {
  const ticker = useContext(DeckMotionContext);
  const pending = useSyncExternalStore(
    ticker?.subscribe ?? noSubscribe,
    () => ticker?.pendingFor(key) ?? 0,
    () => 0,
  );
  return Math.max(0, actual - pending);
}
const noSubscribe = () => () => {};

export interface DeckMotion {
  plan: DeckMotionPlan;
  /** The cards of your hand the plan flies in. */
  arriving: string[];
  /** ms the opening's motion takes (0 when this batch is not the opening, or
   *  under calm motion): the first-Active prompt waits this long. */
  openingDelay: number;
  ticker: PileTicker;
  calm: boolean;
}

/**
 * The plan for Board's fresh batch, built on the render the batch arrives and
 * kept while its key holds (as the FX timeline is). The game of the previous
 * render says where each card was before the batch. Under calm motion the plan
 * is empty: the piles and the hand just update.
 */
export function useDeckMotion(freshFx: readonly FxEvent[], freshFxKey: number, G: GameState, me: PlayerID): DeckMotion {
  const calm = useCalmMotion();
  const ticker = useMemo(() => new PileTicker(), []);
  const beforeRef = useRef<GameState | null>(null);
  const plan = useMemo(
    () => (calm || freshFxKey === 0 ? EMPTY_PLAN : planDeckMotion(freshFx, { me, before: beforeRef.current, after: G })),
    // The batch is the dependency; G is the game it arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [freshFxKey, calm],
  );
  useEffect(() => { beforeRef.current = G; }, [G]);
  useEffect(() => () => ticker.clear(), [ticker]);
  const arriving = useMemo(() => arrivingIids(plan, me), [plan, me]);
  return { plan, arriving, openingDelay: plan.opening ? plan.total : 0, ticker, calm };
}
