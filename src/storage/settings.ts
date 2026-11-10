import { useSyncExternalStore } from 'react';

/**
 * Player-facing app settings, persisted per-browser. Kept tiny and
 * synchronous; components subscribe via useSettings() so a change made
 * in the system menu applies immediately everywhere (e.g. combat tempo).
 */
export interface AppSettings {
  /** Multiplier on combat beat tempo — higher = faster animations. */
  combatSpeed: 1 | 1.5 | 2;
  /** Force framer-motion's reduced-motion mode. false still honours the
   *  OS-level prefers-reduced-motion preference (MotionConfig 'user'). */
  reducedMotion: boolean;
  /** Side panel when a match starts: 'auto' opens it only on wide
   *  viewports (≥1100px), the explicit values always win. */
  panelDefault: 'auto' | 'open' | 'closed';
  /** The match table seen flat from above rather than at Pocket's tilted
   *  angle (the rival's half receding). Off by default: the tilt is on. */
  flatTable: boolean;
}

const KEY = 'deadlock-tcg-settings';
const DEFAULTS: AppSettings = { combatSpeed: 1, reducedMotion: false, panelDefault: 'auto', flatTable: false };

let cache: AppSettings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): AppSettings {
  if (!cache) {
    let loaded: AppSettings;
    try {
      loaded = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      loaded = { ...DEFAULTS };
    }
    // Sanitize persisted values — combatSpeed divides the combat beat timer,
    // so a stale/foreign value (e.g. a legacy "slow" string) would NaN the
    // step duration and make combat resolve with no visible beats.
    const speed = Number(loaded.combatSpeed);
    loaded.combatSpeed = (speed === 1 || speed === 1.5 || speed === 2 ? speed : DEFAULTS.combatSpeed) as AppSettings['combatSpeed'];
    loaded.reducedMotion = loaded.reducedMotion === true;
    loaded.flatTable = loaded.flatTable === true;
    loaded.panelDefault = (['auto', 'open', 'closed'] as const).includes(loaded.panelDefault)
      ? loaded.panelDefault : DEFAULTS.panelDefault;
    cache = loaded;
  }
  return cache!;
}

export function updateSettings(patch: Partial<AppSettings>): void {
  cache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Private browsing / quota — the in-memory value still applies.
  }
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React subscription to the settings store. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings);
}

/** Storage keys owned by the app — the system menu's "reset data" scope. */
export const APP_STORAGE_KEYS = [
  'deadlock-tcg-player',
  'deadlock-tcg-story',
  KEY,
] as const;
