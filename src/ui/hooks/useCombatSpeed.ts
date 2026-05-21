import { useState, useCallback } from 'react';

export type CombatSpeed = 'instant' | 'fast' | 'normal' | 'slow';

export const COMBAT_SPEED_MS: Record<CombatSpeed, number> = {
  instant: 0,
  fast: 900,
  normal: 1500,
  slow: 2400,
};

const STORAGE_KEY = 'deadlock-tcg.combatSpeed';

function read(): CombatSpeed {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as CombatSpeed | null;
    if (v && v in COMBAT_SPEED_MS) return v;
  } catch {}
  return 'normal';
}

export function useCombatSpeed(): [CombatSpeed, (s: CombatSpeed) => void] {
  const [speed, setSpeedState] = useState<CombatSpeed>(read);
  const setSpeed = useCallback((s: CombatSpeed) => {
    setSpeedState(s);
    try { localStorage.setItem(STORAGE_KEY, s); } catch {}
  }, []);
  return [speed, setSpeed];
}
