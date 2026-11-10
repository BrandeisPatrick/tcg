import { useEffect, useSyncExternalStore } from 'react';

/**
 * The System menu's remote: a screen that has no free corner for the gear
 * (the match table — its top strip is the rival's name, hand and map track)
 * FOLDS it away and opens the menu from its own menu button instead. The
 * gear's layer (SystemLayer) listens here; Escape toggles the menu as ever.
 */
let folded = 0;
const foldSubs = new Set<() => void>();
const openSubs = new Set<() => void>();

/** Open the System menu from anywhere. */
export function openSystemMenu() {
  openSubs.forEach((f) => f());
}

/** SystemLayer: run `fn` whenever something asks for the menu. */
export function onOpenSystemMenu(fn: () => void): () => void {
  openSubs.add(fn);
  return () => { openSubs.delete(fn); };
}

/** While mounted with `on`, the gear is not drawn. */
export function useFoldGear(on = true) {
  useEffect(() => {
    if (!on) return;
    folded += 1;
    foldSubs.forEach((f) => f());
    return () => {
      folded -= 1;
      foldSubs.forEach((f) => f());
    };
  }, [on]);
}

/** SystemLayer: whether the gear is folded away right now. */
export function useGearFolded(): boolean {
  return useSyncExternalStore(
    (f) => { foldSubs.add(f); return () => { foldSubs.delete(f); }; },
    () => folded > 0,
    () => false,
  );
}
