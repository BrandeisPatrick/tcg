/**
 * Calm motion for the FX layer. When the player has asked for reduced motion
 * (the system menu's setting, or the OS preference) the board still tells
 * the story of every hit — the wash, the sticker, the amount — but nothing
 * flies: no bolts, tracers, motes, rings or shockwaves, and the tiles do not
 * recoil. The timeline's beats are unchanged, so a number still drops when
 * the impact would have landed.
 */
import { createContext, useContext } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useSettings } from '@/storage/settings';

export const FxCalmContext = createContext(false);

export function useFxCalm(): boolean {
  return useContext(FxCalmContext);
}

/** The app's reduced-motion setting, or the OS preference. */
export function useCalmMotion(): boolean {
  const { reducedMotion } = useSettings();
  const os = useReducedMotion();
  return reducedMotion || !!os;
}
