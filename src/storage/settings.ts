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
  /** The old "Tilted table" switch. The match is one flat sheet now and
   *  nothing reads this; it is kept so settings saved with it still load. */
  tiltedTable: boolean;
}

/** What `tiltedTable` loads as when nothing was saved (unused: see the
 *  field). */
export const DEFAULT_TILTED_TABLE = false;

const KEY = 'deadlock-tcg-settings';
const DEFAULTS: AppSettings = { combatSpeed: 1, reducedMotion: false, panelDefault: 'auto', tiltedTable: DEFAULT_TILTED_TABLE };

let cache: AppSettings | null = null;
/** Whether the player has set the camera themselves. Until then it is not
 *  saved, so the default above reaches every phone that has not chosen. */
let tiltChosen = false;
const listeners = new Set<() => void>();

export function getSettings(): AppSettings {
  if (!cache) {
    let loaded: AppSettings;
    try {
      // `flatTable` was the old camera switch (the steep tilt was the
      // default then): dropped, so every phone starts from today's default.
      const { flatTable: _old, ...saved } = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      loaded = { ...DEFAULTS, ...saved };
      tiltChosen = typeof saved.tiltedTable === 'boolean';
    } catch {
      loaded = { ...DEFAULTS };
    }
    // Sanitize persisted values — combatSpeed divides the combat beat timer,
    // so a stale/foreign value (e.g. a legacy "slow" string) would NaN the
    // step duration and make combat resolve with no visible beats.
    const speed = Number(loaded.combatSpeed);
    loaded.combatSpeed = (speed === 1 || speed === 1.5 || speed === 2 ? speed : DEFAULTS.combatSpeed) as AppSettings['combatSpeed'];
    loaded.reducedMotion = loaded.reducedMotion === true;
    loaded.tiltedTable = tiltChosen ? loaded.tiltedTable === true : DEFAULT_TILTED_TABLE;
    loaded.panelDefault = (['auto', 'open', 'closed'] as const).includes(loaded.panelDefault)
      ? loaded.panelDefault : DEFAULTS.panelDefault;
    cache = loaded;
  }
  return cache!;
}

export function updateSettings(patch: Partial<AppSettings>): void {
  cache = { ...getSettings(), ...patch };
  if (typeof patch.tiltedTable === 'boolean') tiltChosen = true;
  try {
    const { tiltedTable, ...rest } = cache;
    localStorage.setItem(KEY, JSON.stringify(tiltChosen ? { ...rest, tiltedTable } : rest));
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
