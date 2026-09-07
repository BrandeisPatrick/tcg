import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fonts, spring, systemFont } from '../tokens';
import { poster, chamfer, PAPER_MOTTLE, sheetStyle } from '../poster';
import { PosterButton } from '../chrome';
import { useSettings, updateSettings, APP_STORAGE_KEYS, type AppSettings } from '@/storage/settings';

/**
 * Persistent system layer — the one piece of chrome that exists on every
 * screen. An ink gear pinned to the top-right corner opens a pause-style
 * settings sheet in the poster idiom: paper on the dark scene, ink type,
 * chamfered plates. Combat tempo, context-aware exit, save-data reset.
 * Mounted once in Root, OUTSIDE the screen transition wrapper, so it never
 * fades or moves during navigation.
 */
export function SystemLayer({ screen, onExitToMenu, exitLabel }: {
  /** Current view.screen from Root — drives which exit action shows. */
  screen: string;
  /** Leave the current context (concede a match / back to title). */
  onExitToMenu: () => void;
  /** Label for the exit action; empty string hides it (start screen). */
  exitLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const [armReset, setArmReset] = useState(false);

  // Re-disarm the destructive reset whenever the menu closes.
  useEffect(() => { if (!open) setArmReset(false); }, [open]);

  // Escape toggles the menu — the universal pause gesture. Nothing else in
  // the app binds Escape globally; overlays that need the key first
  // stopPropagation. Ignore the key while typing in an input (deck name).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fullscreen — tracked from the document so the toggle reflects reality
  // even when the user exits with the browser's own Esc handling.
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  function resetAll() {
    if (!armReset) { setArmReset(true); return; }
    for (const key of APP_STORAGE_KEYS) {
      try { localStorage.removeItem(key); } catch {}
    }
    // Full reload back to the title so every in-memory store re-seeds.
    window.location.href = import.meta.env.BASE_URL ?? '/';
  }

  return (
    <>
      {/* Gear — always visible, always in the same corner. */}
      <motion.button
        aria-label="System menu"
        title="Menu (Esc)"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.08, rotate: 24 }}
        whileTap={{ scale: 0.92 }}
        transition={spring.snappy}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 130,
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: poster.ink,
          border: `1.5px solid ${poster.edge}`,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <GearIcon />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 125,
              background: poster.scrim,
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.15 } }}
              transition={spring.default}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: 'min(560px, 94vw)',
                maxHeight: 'min(86vh, 720px)',
                overflowY: 'auto',
                borderRadius: 18,
                ...sheetStyle,
                backgroundImage: PAPER_MOTTLE,
                color: poster.ink,
                padding: '22px 26px 24px',
              }}
            >
              {/* Header — title + the key that closes it. */}
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottom: `1.5px solid ${poster.ink}`,
              }}>
                <span style={{
                  fontFamily: fonts.display,
                  fontSize: 26,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: poster.ink,
                  lineHeight: 1,
                }}>
                  System
                </span>
                <InkTag>Esc · Close</InkTag>
              </div>

              {/* Game */}
              <Section title="Game">
                <Field label="Combat speed">
                  <Segmented
                    options={([1, 1.5, 2] as AppSettings['combatSpeed'][]).map((s) => ({ value: s, label: `${s}×` }))}
                    value={settings.combatSpeed}
                    onSelect={(speed) => updateSettings({ combatSpeed: speed })}
                  />
                </Field>
                <Field label="Side panel on match start" hint="Auto opens it only on wide screens.">
                  <Segmented
                    options={([
                      { value: 'auto', label: 'Auto' },
                      { value: 'open', label: 'Open' },
                      { value: 'closed', label: 'Closed' },
                    ] as const).map((o) => o)}
                    value={settings.panelDefault}
                    onSelect={(panelDefault) => updateSettings({ panelDefault })}
                  />
                </Field>
              </Section>

              {/* Display */}
              <Section title="Display">
                <ToggleRow label="Fullscreen" on={isFullscreen} onClick={toggleFullscreen} />
                <ToggleRow
                  label="Reduce motion"
                  hint="Skips movement animations; fades stay."
                  on={settings.reducedMotion}
                  onClick={() => updateSettings({ reducedMotion: !settings.reducedMotion })}
                />
              </Section>

              {/* Actions */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '18px 0 0',
              }}>
                {exitLabel && (
                  <PosterButton
                    variant={screen === 'match' ? 'red' : 'ink'}
                    size="sm"
                    onClick={() => { setOpen(false); onExitToMenu(); }}
                    style={{ width: '100%' }}
                  >
                    {exitLabel}
                  </PosterButton>
                )}
                <PosterButton
                  variant={armReset ? 'red' : 'paper'}
                  size="sm"
                  onClick={resetAll}
                  style={{ width: '100%' }}
                >
                  {armReset ? 'Tap again to erase everything' : 'Reset save data'}
                </PosterButton>
              </div>

              {/* About — the disclaimer + version line. */}
              <div style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: `1px solid ${poster.inkRule}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                textAlign: 'center',
              }}>
                <div style={{ ...systemFont, color: poster.inkDim }}>
                  A fan-made tabletop adaptation. Not affiliated with Valve.
                </div>
                <div style={{ ...systemFont, color: poster.inkDim }}>
                  v0.1 · early prototype
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Small ink tag — the sheet's eyebrow / key hint. */
function InkTag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: '4px 9px',
      background: poster.ink,
      color: poster.paper,
      fontFamily: fonts.display,
      fontSize: 10,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      lineHeight: 1,
      clipPath: chamfer(4),
      WebkitClipPath: chamfer(4),
    }}>
      {children}
    </span>
  );
}

/** Titled settings block — keeps every group's rhythm identical. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 0 2px' }}>
      <div style={{
        fontFamily: fonts.display,
        fontSize: 11,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        color: poster.inkDim,
        marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

/** Labelled control row (label left, control right) with an optional hint. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
      }}>
        <span style={{ ...systemFont, color: poster.ink, whiteSpace: 'nowrap' }}>{label}</span>
        <div style={{ flex: '0 1 260px', minWidth: 180 }}>{children}</div>
      </div>
      {hint && <div style={{ ...systemFont, color: poster.inkDim }}>{hint}</div>}
    </div>
  );
}

/** Segmented control — a paper plate; the active segment is inked. */
function Segmented<T extends string | number>({ options, value, onSelect }: {
  options: readonly { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: 4,
      background: poster.paperBand,
      border: `1.5px solid ${poster.ink}`,
      clipPath: chamfer(6),
      WebkitClipPath: chamfer(6),
    }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onSelect(o.value)}
            style={{
              flex: 1,
              padding: '8px 0',
              border: 'none',
              background: active ? poster.ink : 'transparent',
              ...systemFont,
              color: active ? poster.paper : poster.ink,
              fontVariantNumeric: 'tabular-nums',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Full-width paper row with an On/Off pill on the right. */
function ToggleRow({ label, hint, on, onClick }: {
  label: string;
  hint?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        padding: '10px 12px',
        background: poster.paperBand,
        border: `1.5px solid ${poster.ink}`,
        clipPath: chamfer(6),
        WebkitClipPath: chamfer(6),
        cursor: 'pointer',
      }}
    >
      <span style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
        textAlign: 'left',
      }}>
        <span style={{ ...systemFont, color: poster.ink }}>{label}</span>
        {hint && <span style={{ ...systemFont, color: poster.inkDim }}>{hint}</span>}
      </span>
      <span style={{
        padding: '4px 12px',
        border: `1.5px solid ${poster.ink}`,
        background: on ? poster.ink : 'transparent',
        ...systemFont,
        color: on ? poster.paper : poster.ink,
        flexShrink: 0,
      }}>
        {on ? 'On' : 'Off'}
      </span>
    </button>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden>
      <path
        fill={poster.cream}
        d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm9 4.94v-2.68l-2.37-.6a6.9 6.9 0 0 0-.68-1.64l1.25-2.1-1.9-1.9-2.1 1.26a6.9 6.9 0 0 0-1.64-.68L13.34 3h-2.68l-.6 2.37a6.9 6.9 0 0 0-1.64.68l-2.1-1.25-1.9 1.9 1.26 2.1a6.9 6.9 0 0 0-.68 1.63L3 10.66v2.68l2.37.6c.15.58.38 1.13.68 1.64l-1.25 2.1 1.9 1.9 2.1-1.26c.51.3 1.06.53 1.63.68l.61 2.37h2.68l.6-2.37a6.9 6.9 0 0 0 1.64-.68l2.1 1.25 1.9-1.9-1.26-2.1c.3-.51.53-1.06.68-1.63l2.37-.61Z"
      />
    </svg>
  );
}
