/**
 * The Gallery — every card and every piece of chrome the game draws, laid
 * out on one cream sheet so it can be looked at (and, for the effects,
 * fired) outside a match. Printed in the poster idiom like the title sheet,
 * the loadout and the lessons, so it reads as the same object; the last tab
 * is the art credits.
 *
 * Reached from the title's Gallery card (?preview=1); ?preview=1&tab=credits
 * opens straight on the credits.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardFrame } from './card/CardFrame';
import { StatusIcon } from './card/StatusIcon';
import { CardPlayOverlay } from './effects/CardPlayFlash';
import { UltFlashOverlay } from './effects/UltMomentFlash';
import { HEROES, SPELLS, EQUIPMENT, ULTIMATES } from '@/cards';
import { STATUSES } from '@/statuses';
import { HeroSlot } from './board/HeroSlot';
import { TurnCompass } from './board/TurnCompass';
import { SoulsRail } from './board/SoulsRail';
import { boardRows } from './board/BoardTable';
import { HeroDetailSheet } from './overlays/HeroDetailSheet';
import { DamageFxContext } from './effects/DamageFxContext';
import type { CardInstance, HeroCard, DamageEvent } from '@/engine/types';
import { fonts, radius, spring, text } from './tokens';
import { poster, chamfer, clipBoth, sheetStyle } from './poster';
import { PosterBackdrop } from './PosterBackdrop';
import { PosterButton } from './chrome';
import { LevelRing } from './card/LevelRing';
import { RoundCardIcon } from './card/RoundCardIcon';
import { useViewport } from './hooks/useViewport';
import { ArtCredits } from './system/ArtCredits';

const BASE = import.meta.env.BASE_URL ?? '/';

// Mock a board-state CardInstance for a hero so the gallery can render it
// through the same HeroSlot used in-game. Stats default to the printed values;
// no statuses / equipment / level mods are applied.
function mockHeroInstance(h: HeroCard): CardInstance {
  return {
    iid: `preview-${h.id}`,
    cardId: h.id,
    ownerId: '0',
    zone: 'active',
    hp: h.hp,
    hpMax: h.hp,
    atkMod: 0,
    spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: false,
    level: 1,
    exp: 0,
  };
}

type Tab = 'cards' | 'combat' | 'board' | 'statuses' | 'overlays' | 'credits';

const TABS: { id: Tab; label: string }[] = [
  { id: 'cards', label: 'Cards' },
  { id: 'combat', label: 'Combat FX' },
  { id: 'board', label: 'Board' },
  { id: 'statuses', label: 'Statuses' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'credits', label: 'Credits' },
];

function initialTab(): Tab {
  const t = new URLSearchParams(window.location.search).get('tab');
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'cards';
}

export function PreviewGallery() {
  const { isMobile } = useViewport();
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: isMobile ? 10 : 'clamp(14px, 3vh, 30px) clamp(14px, 3vw, 40px)',
        background: poster.ground,
        color: poster.ink,
        fontFamily: fonts.ui,
        overflowX: 'hidden',
      }}
    >
      <PosterBackdrop />

      {/* The sheet. Only opacity animates: a transform on this ancestor
          would trap the fixed-position overlays the demos fire. */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        aria-label="Gallery"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 1380,
          borderRadius: isMobile ? 18 : 28,
          overflow: 'hidden',
          padding: isMobile ? '14px 14px 20px' : 'clamp(18px, 2.4vh, 28px) clamp(22px, 3vw, 38px) clamp(24px, 3vh, 34px)',
          ...sheetStyle,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            paddingBottom: isMobile ? 12 : 16,
            marginBottom: isMobile ? 12 : 16,
            borderBottom: `1.5px solid ${poster.ink}`,
          }}
        >
          <PosterButton
            variant="paper"
            size="sm"
            onClick={() => { window.location.href = BASE; }}
            ariaLabel="Back to the title screen"
          >
            ← Back
          </PosterButton>
          <h1
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: isMobile ? 26 : 'clamp(28px, 3vw, 40px)',
              fontWeight: 400,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            Gallery
          </h1>
          {!isMobile && (
            <span
              style={{
                ...text.label,
                marginLeft: 'auto',
                fontSize: 10.5,
                letterSpacing: '0.2em',
                color: poster.inkDim,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {HEROES.length} heroes · {SPELLS.length} spells · {EQUIPMENT.length} items
            </span>
          )}
        </header>

        <TabBar tab={tab} setTab={setTab} compact={isMobile} />

        <div style={{ marginTop: isMobile ? 16 : 22 }}>
          {tab === 'cards' && <CardsTab />}
          {tab === 'combat' && <CombatFxTab />}
          {tab === 'board' && <BoardTab />}
          {tab === 'statuses' && <StatusesTab />}
          {tab === 'overlays' && <OverlaysTab />}
          {tab === 'credits' && <ArtCredits compact={isMobile} />}
        </div>
      </motion.section>
    </div>
  );
}

/** The sheet's tabs — stencil plates in a row; the open one is inked.
 *  On a phone the row scrolls sideways rather than wrapping. */
function TabBar({ tab, setTab, compact }: { tab: Tab; setTab: (t: Tab) => void; compact: boolean }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [tab]);
  return (
    <nav
      ref={nav}
      aria-label="Gallery sections"
      style={{
        display: 'flex',
        gap: 6,
        overflowX: compact ? 'auto' : undefined,
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        paddingBottom: compact ? 2 : 0,
      }}
    >
      {TABS.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => setTab(it.id)}
            aria-pressed={active}
            style={{
              flexShrink: 0,
              padding: compact ? '9px 14px' : '10px 18px',
              background: active ? poster.ink : 'transparent',
              color: active ? poster.paper : poster.ink,
              border: `1.5px solid ${active ? poster.ink : poster.inkRule}`,
              ...clipBoth(chamfer(6)),
              fontFamily: fonts.display,
              fontSize: compact ? 11 : 12,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

// =============================================================================
// CARDS TAB
// =============================================================================

function CardsTab() {
  const { isMobile } = useViewport();
  return (
    <>
      <Section title={`Heroes (${HEROES.length})`}>
        <Grid min={isMobile ? 150 : 170}>
          {HEROES.map((h) => (
            <div key={h.id} style={{ aspectRatio: '3 / 4' }}>
              <HeroSlot
                card={mockHeroInstance(h)}
                owner="0" myId="0" isOpponent={false}
                pending={null} isTargetable={false}
                isCurrentTurn={false}
                onTap={() => {}}
              />
            </div>
          ))}
        </Grid>
      </Section>

      <Section title={`Spells (${SPELLS.length})`}>
        <Grid min={150}>
          {SPELLS.map((s) => (
            <CardFrame key={s.id} cardId={s.id} size="hand" />
          ))}
        </Grid>
      </Section>

      <Section title={`Equipment (${EQUIPMENT.length})`}>
        <Grid min={150}>
          {EQUIPMENT.map((e) => (
            <CardFrame key={e.id} cardId={e.id} size="hand" glow={e.tier === 3 ? 'gold' : null} />
          ))}
        </Grid>
      </Section>

      <Section title={`Round Icons — Spells (${SPELLS.length})`}>
        <Grid min={160}>
          {SPELLS.map((s) => (
            <RoundCardIcon key={s.id} cardId={s.id} size={120} />
          ))}
        </Grid>
      </Section>

      <Section title={`Round Icons — Equipment (${EQUIPMENT.length})`}>
        <Grid min={160}>
          {EQUIPMENT.map((e) => (
            <RoundCardIcon key={e.id} cardId={e.id} size={120} />
          ))}
        </Grid>
      </Section>

      <Section title={`Ultimates (${ULTIMATES.length})`}>
        <Grid min={150}>
          {ULTIMATES.map((u) => (
            <CardFrame key={u.id} cardId={u.id} size="hand" glow="gold" />
          ))}
        </Grid>
      </Section>

      <Section title="Long-press preview">
        <p style={{ ...text.body, color: poster.inkDim, marginBottom: 12 }}>
          Hold any card in-game to surface this large-format view. Uses CardFrame size="full".
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <CardFrame cardId="hero_haze" size="full" glow="accent" />
          <CardFrame cardId="ult_abrams" size="full" glow="gold" />
          <CardFrame cardId="metal_skin" size="full" />
        </div>
      </Section>

      <Section title="Unaffordable — cost coin warning">
        <p style={{ ...text.body, color: poster.inkDim, marginBottom: 12 }}>
          When the player can't pay a card's soul cost the hand card dims and its
          ink cost coin flips to warning red — affordable next to unaffordable below.
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <CardFrame cardId="metal_skin" size="hand" />
          <div style={{ opacity: 0.42, filter: 'saturate(0.55)' }}>
            <CardFrame cardId="metal_skin" size="hand" unaffordable />
          </div>
          <CardFrame cardId="metal_skin" size="hand" unaffordable />
        </div>
      </Section>
    </>
  );
}

// =============================================================================
// COMBAT FX TAB — transient feedback (what you see when something happens)
// =============================================================================

function CombatFxTab() {
  return (
    <>
      <Section title="Damage Flash — card got hit">
        <Caption>The on-card reaction when a hero takes damage — a type-coloured glow/tint over the card (bullet = vermillion, spirit = plum, pure = teal, KO = wine), no shake. The HP-number pulse below carries the amount. Drives skill/spell/ult/bleed via the impact-beat sequencer, and basic attacks via the choreographer at impact.</Caption>
        <DamageFlashDemo />
      </Section>

      <Section title="Rem Merge — Lil Helpers">
        <Caption>Rem's skill merges her into an ally as a temporary buff. The bearer shows her portrait badge with a turn countdown and a green buff border (left). On the bench she shows the skill-ready glint — she casts from the bench (right).</Caption>
        <RemMergeDemo />
      </Section>

      <Section title="HP / BP Tick">
        <Caption>Damage and heals animate ON the hero card's HP / BP number — a quick scale pulse that stays in the stat's own colour family (ink for BP, red for HP). Buffs pulse brighter, debuffs/damage pulse desaturated grey. Click below to mutate a mock card and watch the number tick.</Caption>
        <StatTickDemo />
      </Section>

      <Section title="Card-Play Flash">
        <Caption>Triggered when a spell or equipment is played from hand, or when a hero activates their skill. Same reveal in all cases — the relevant card sits on-screen for ~1.7s with a caption.</Caption>
        <Row>
          <CardPlayTrigger label="You — Spell" cardId="cold_front" caster="P0" />
          <CardPlayTrigger label="You — Equipment" cardId="restorative_shot" caster="P0" />
          <CardPlayTrigger label="You — Skill" cardId="hero_paige" caster="P0" kind="skill" />
          <CardPlayTrigger label="Rival — Spell" cardId="disarming_hex" caster="P1" />
          <CardPlayTrigger label="Rival — Equipment" cardId="weapon_shielding" caster="P1" />
          <CardPlayTrigger label="Rival — Skill" cardId="hero_kelvin" caster="P1" kind="skill" />
        </Row>
      </Section>

      <Section title="Ultimate Moment">
        <Caption>Dramatic screen-fill on ultimate cast — gold tint for you, wine for rival. Pairs with the Card-Play Flash on actual cast.</Caption>
        <Row>
          <UltTrigger label="You — Seismic Impact" name="Seismic Impact" caster="P0" />
          <UltTrigger label="You — Rallying Charge" name="Rallying Charge" caster="P0" />
          <UltTrigger label="Rival — Death Slam" name="Death Slam" caster="P1" />
          <UltTrigger label="Rival — Soul Exchange" name="Soul Exchange" caster="P1" />
        </Row>
      </Section>
    </>
  );
}

// =============================================================================
// BOARD TAB — persistent HUD chrome + progression
// =============================================================================

function BoardTab() {
  return (
    <>
      <Section title="Turn Compass">
        <Caption>Persistent quiet indicator pinned between the two active heroes. Idle: a conic-gradient ring sweeps slowly (~8s) and the chevron points at whoever's turn. Combat mode: the ring swaps to a segmented progress fill — one arc per attack step, filling in the attacker's hue with the active segment pulsing. No sibling chrome.</Caption>
        <TurnCompassDemo />
      </Section>

      <Section title="Souls Rail">
        <Caption>Vertical stack of flat gold coins hugging the right edge of the 3×3 grid. Rival's chips anchor at the top edge; yours anchor at the bottom — position carries ownership. Each soul = one chip; spends pop the head chip off, refills pop a new one on. No labels, no mid-divider.</Caption>
        <SoulsRailDemo />
      </Section>

      <Section title="Hero Level Rings — stages 1 → 4">
        <Caption>The on-portrait progress ring; ticks up as the hero earns exp (end of turn, equipment attach, kill blow).</Caption>
        <Grid min={150}>
          {[
            { level: 1 as const, exp: 0,  label: 'Lv1 · 0/3 exp',   hint: '3 segments (empty)' },
            { level: 1 as const, exp: 2,  label: 'Lv1 · 2/3 exp',   hint: '2 of 3 lit' },
            { level: 2 as const, exp: 0,  label: 'Lv2 · 0/6 exp',   hint: '6 segments (empty)' },
            { level: 2 as const, exp: 4,  label: 'Lv2 · 4/6 exp',   hint: '4 of 6 lit' },
            { level: 3 as const, exp: 0,  label: 'Lv3 · 0/9 exp',   hint: '9 segments (empty)' },
            { level: 3 as const, exp: 6,  label: 'Lv3 · 6/9 exp',   hint: '6 of 9 lit' },
            { level: 4 as const, exp: 0,  label: 'Lv4 · max',       hint: 'fully lit + glow' },
          ].map((stage, idx) => (
            <div key={idx} style={{
              padding: 14,
              background: poster.paperBand,
              border: `1.5px solid ${poster.inkRule}`,
              ...clipBoth(chamfer(8)),
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                position: 'relative', width: 96, height: 96,
                background: poster.frame,
                borderRadius: 8,
              }}>
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <LevelRing level={stage.level} exp={stage.exp} size={36} />
                </div>
              </div>
              <div style={{ ...text.label, color: poster.ink }}>{stage.label}</div>
              <div style={{ ...text.body, color: poster.inkDim, textAlign: 'center' }}>{stage.hint}</div>
            </div>
          ))}
        </Grid>
      </Section>
    </>
  );
}

/** Helpers for the Animations tab — each `Trigger*` button mounts its target
 *  effect for a fixed window then unmounts it, so the trigger can be re-played. */

function TriggerButton({ label, component }: {
  label: string;
  component: (onDone: () => void) => React.ReactNode;
}) {
  const [active, setActive] = useState(false);
  return (
    <>
      <Button onClick={() => setActive(true)} disabled={active}>{label}</Button>
      {active && component(() => setActive(false))}
    </>
  );
}

function AutoExit({ ms, onDone, children }: { ms: number; onDone: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [ms, onDone]);
  return <>{children}</>;
}

function SoulsRailDemo() {
  // The stage is exactly the live board's row stack (bench, lane, bench
  // from the shared boardRows metrics), because the rail lays its two
  // racks out against those same rows; any other height puts your rack
  // below the stage. The rail is absolutely positioned inside it, so the
  // live board's right-edge anchor reads correctly here too.
  const { isMobile } = useViewport();
  const bench = boardRows.bench(isMobile);
  const lane = boardRows.lane(isMobile);
  const gap = boardRows.gap(isMobile);
  const [rival, setRival] = useState(2);
  const [you, setYou] = useState(3);
  const standIn = { border: `1px dashed ${poster.inkFaint}`, borderRadius: radius.sm, opacity: 0.6 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        position: 'relative',
        height: bench * 2 + lane + gap * 2,
        borderRadius: radius.md,
        border: `1.5px solid ${poster.inkRule}`,
        background: poster.paperBand,
      }}>
        {/* Stand-ins for the three board rows, on the board's own metrics,
            so each rack visibly sits centred in its bench row. */}
        <div style={{
          position: 'absolute', inset: '0 12px',
          display: 'flex', flexDirection: 'column', gap,
        }}>
          <div style={{ flex: `0 0 ${bench}px`, ...standIn }} />
          <div style={{ flex: `0 0 ${lane}px`, ...standIn }} />
          <div style={{ flex: `0 0 ${bench}px`, ...standIn }} />
        </div>
        <SoulsRail rivalSouls={rival} yourSouls={you} />
      </div>
      <Row>
        <Button onClick={() => setRival((s) => Math.max(0, s - 1))}>−1 Rival ({rival})</Button>
        <Button onClick={() => setRival((s) => s + 1)}>+1 Rival</Button>
        <Button onClick={() => setYou((s) => Math.max(0, s - 1))}>−1 You ({you})</Button>
        <Button onClick={() => setYou((s) => s + 1)}>+1 You</Button>
        <Button onClick={() => { setRival(2); setYou(3); }}>Reset</Button>
      </Row>
    </div>
  );
}

function TurnCompassDemo() {
  // Two mounted compasses — one per idle turn state — plus a combat-mode
  // sub-stage that flips the same component into its segmented-ring state
  // via the `combatOverride` prop. The 18-px column gap matches the
  // chevron's max extent so it never collides with the label.
  const [turn, setTurn] = useState(1);
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [combatMode, setCombatMode] = useState(false);
  const [attackerIsMe, setAttackerIsMe] = useState(true);
  const [total, setTotal] = useState(3);
  const [currentBeat, setCurrentBeat] = useState(0);
  const combatOverride = combatMode
    ? { total, currentBeat, attackerIsMe }
    : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
          <TurnCompass isMyTurn={true} turn={turn} combatOverride={null} />
          <span style={{ ...text.label, color: poster.inkDim }}>Your Move (idle)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
          <TurnCompass isMyTurn={false} turn={turn} combatOverride={null} />
          <span style={{ ...text.label, color: poster.inkDim }}>Rival's Move (idle)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ ...text.label, color: poster.inkDim }}>Live toggle</span>
          <div style={{ padding: '8px 0' }}>
            <TurnCompass isMyTurn={isMyTurn} turn={turn} combatOverride={combatOverride} />
          </div>
          <Row>
            <Button onClick={() => setTurn((v) => v + 1)}>+1 Turn</Button>
            <Button onClick={() => setIsMyTurn((v) => !v)}>Flip side</Button>
            <Button onClick={() => { setTurn(1); setIsMyTurn(true); setCombatMode(false); setAttackerIsMe(true); setTotal(3); setCurrentBeat(0); }}>Reset</Button>
          </Row>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ ...text.label, color: poster.inkDim }}>Combat mode (same compass)</span>
        <Row>
          <Button onClick={() => setCombatMode((v) => !v)}>{combatMode ? 'Combat: ON' : 'Combat: OFF'}</Button>
          <Button onClick={() => setCurrentBeat((b) => (b + 1) % (total + 1))} disabled={!combatMode}>Step beat ({currentBeat} / {total})</Button>
          <Button onClick={() => setAttackerIsMe((v) => !v)} disabled={!combatMode}>{attackerIsMe ? 'You attacking' : 'Rival attacking'}</Button>
          <Button onClick={() => setTotal((t) => (t % 4) + 1)} disabled={!combatMode}>Total = {total} (cycle)</Button>
        </Row>
        <Caption>Toggling combat mode swaps the live-toggle compass's idle conic sweep for a segmented progress ring — one arc per beat, filling in the attacker's hue. The active segment pulses. No sibling chrome.</Caption>
      </div>
    </div>
  );
}

function StatTickDemo() {
  // Mock a Paige instance and let the demo mutate hp / atkMod directly so
  // the on-card animation (driven by useStatTick inside HeroSlot) fires
  // exactly the same way it does in a real match.
  const paige = HEROES.find((h) => h.id === 'hero_paige')!;
  const [hp, setHp] = useState(paige.hp);
  const [atkMod, setAtkMod] = useState(0);
  const card: CardInstance = {
    ...mockHeroInstance(paige),
    hp, hpMax: paige.hp, atkMod,
  };
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ width: 180, aspectRatio: '3 / 4' }}>
        <HeroSlot
          card={card}
          owner="0" myId="0" isOpponent={false}
          pending={null} isTargetable={false}
          isCurrentTurn={false}
          onTap={() => {}}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Caption>HP changes</Caption>
        <Row>
          <Button onClick={() => setHp((v) => Math.max(0, v - 1))}>−1 HP</Button>
          <Button onClick={() => setHp((v) => Math.max(0, v - 3))}>−3 HP</Button>
          <Button onClick={() => setHp((v) => Math.min(paige.hp, v + 1))}>+1 HP</Button>
          <Button onClick={() => setHp(paige.hp)}>Full heal</Button>
        </Row>
        <Caption>BP changes</Caption>
        <Row>
          <Button onClick={() => setAtkMod((v) => v + 1)}>+1 BP</Button>
          <Button onClick={() => setAtkMod((v) => v - 1)}>−1 BP</Button>
          <Button onClick={() => setAtkMod(0)}>Reset</Button>
        </Row>
      </div>
    </div>
  );
}

function RemMergeDemo() {
  const bearer = HEROES.find((h) => h.id === 'hero_dynamo')!;
  const rem = HEROES.find((h) => h.id === 'hero_rem')!;
  const baseBearer = mockHeroInstance(bearer);
  const remMerged: CardInstance = {
    ...mockHeroInstance(rem),
    zone: 'equipment',
    attachedTo: 'preview-bearer',
    remMergeTurnsLeft: 3,
    remMergeHpBuff: 2,
  };
  const bearerCard: CardInstance = {
    ...baseBearer,
    iid: 'preview-bearer',
    hpMax: baseBearer.hpMax + 2,
    hp: baseBearer.hpMax + 2,
    attached: [remMerged],
  };
  const remBench: CardInstance = { ...mockHeroInstance(rem), iid: 'preview-rem-bench', zone: 'bench', slot: 1 };
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ width: 180, aspectRatio: '3 / 4' }}>
        <HeroSlot card={bearerCard} owner="0" myId="0" isOpponent={false}
          pending={null} isTargetable={false} isCurrentTurn onTap={() => {}} />
      </div>
      <div style={{ width: 132, aspectRatio: '3 / 4' }}>
        <HeroSlot card={remBench} owner="0" myId="0" isOpponent={false} compact
          pending={null} isTargetable={false} isCurrentTurn onTap={() => {}} />
      </div>
      <Caption>Left: carry with Rem merged (badge + countdown 3, green border) and +2 max HP. Right: Rem on the bench, skill-ready glint.</Caption>
    </div>
  );
}

function DamageFlashDemo() {
  const hero = HEROES.find((h) => h.id === 'hero_abrams')!;
  const card = mockHeroInstance(hero);
  const [fx, setFx] = useState<DamageEvent | null>(null);
  const seqRef = useRef(0);
  // Clear-timer held in a ref: re-firing within the 1.5s window must cancel
  // the previous unmount fuse, or the stale timer cuts the NEW flash short.
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = (type: 'attack' | 'spirit' | 'pure', ko = false) => {
    if (clearRef.current) clearTimeout(clearRef.current);
    setFx({ iid: card.iid, type, ko, amount: ko ? 99 : 3, seq: ++seqRef.current });
    clearRef.current = setTimeout(() => setFx(null), 1500);
  };
  const resolver = (iid: string) => (iid === card.iid ? fx : null);
  return (
    <DamageFxContext.Provider value={resolver}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 180, aspectRatio: '3 / 4' }}>
          <HeroSlot
            card={card}
            owner="0" myId="0" isOpponent={false}
            pending={null} isTargetable={false} isCurrentTurn={false}
            onTap={() => {}}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Caption>Type drives the colour (bullet = vermillion, spirit = plum, pure = teal, KO = wine). No shake — minimal + informative.</Caption>
          <Row>
            <Button onClick={() => fire('attack')}>Bullet hit</Button>
            <Button onClick={() => fire('spirit')}>Spirit hit</Button>
            <Button onClick={() => fire('pure')}>Pure hit</Button>
            <Button onClick={() => fire('attack', true)}>KO</Button>
          </Row>
        </div>
      </div>
    </DamageFxContext.Provider>
  );
}

function CardPlayTrigger({ label, cardId, caster, kind = 'play' }: {
  label: string; cardId: string; caster: 'P0' | 'P1'; kind?: 'play' | 'skill';
}) {
  const [active, setActive] = useState(false);
  return (
    <>
      <Button onClick={() => setActive(true)} disabled={active}>{label}</Button>
      <AnimatePresence>
        {active && (
          <AutoExit ms={1700} onDone={() => setActive(false)}>
            <CardPlayOverlay cardId={cardId} caster={caster} kind={kind} />
          </AutoExit>
        )}
      </AnimatePresence>
    </>
  );
}

function UltTrigger({ label, name, caster }: { label: string; name: string; caster: 'P0' | 'P1' }) {
  const [active, setActive] = useState(false);
  return (
    <>
      <Button onClick={() => setActive(true)} disabled={active}>{label}</Button>
      <AnimatePresence>
        {active && (
          <AutoExit ms={2400} onDone={() => setActive(false)}>
            <UltFlashOverlay name={name} caster={caster} />
          </AutoExit>
        )}
      </AnimatePresence>
    </>
  );
}

// =============================================================================
// STATUSES TAB
// =============================================================================

function StatusesTab() {
  return (
    <Section title={`Status Icons (${STATUSES.length})`}>
      <Caption>Buffs in green, debuffs in red, utility statuses in ink. Magnitude statuses show a value pill; binary statuses (Stun, Silence, Disarm) hide it.</Caption>
      <Grid min={230}>
        {STATUSES.map((s) => {
          const MAGNITUDE: Record<string, number> = {
            bullet_resist: 3, spirit_resist: 3, shield: 5,
            weapon_power: 2, spirit_power: 2, bleed: 3,
          };
          const value = MAGNITUDE[s.id] ?? 1;
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: 10,
              background: poster.paperBand, border: `1.5px solid ${poster.inkRule}`,
              ...clipBoth(chamfer(6)),
            }}>
              <StatusIcon id={s.id} value={value} duration={2} />
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ ...text.label, color: poster.ink }}>{s.title}</div>
                <div style={{ ...text.body, fontSize: 12, color: poster.inkDim }}>{s.id}</div>
              </div>
            </div>
          );
        })}
      </Grid>
    </Section>
  );
}

// =============================================================================
// OVERLAYS TAB
// =============================================================================

function mockEquipInstance(cardId: string, charges?: number): CardInstance {
  return {
    iid: `preview-eq-${cardId}`,
    cardId,
    ownerId: '0',
    zone: 'equipment',
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
    ...(charges != null ? { charges } : {}),
  };
}

const SHEET_SCENARIOS: { id: string; label: string; hint: string }[] = [
  { id: 'ready',   label: 'Skill READY (yours)', hint: 'Skill card is the button — tap to use' },
  { id: 'used',    label: 'Skill USED',           hint: 'Dimmed, "already used this turn"' },
  { id: 'blocked', label: 'Skill blocked',        hint: 'Flat card + reason ("Not your turn")' },
  { id: 'enemy',   label: 'Enemy hero',           hint: 'Read-only, no action' },
  { id: 'loaded',  label: 'Statuses + equipment + retreat', hint: 'Active Effects, Equipment, Retreat all shown' },
];

function OverlaysTab() {
  const [heroId, setHeroId] = useState('hero_kelvin');
  const [scenario, setScenario] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const hero = HEROES.find((h) => h.id === heroId)!;

  function build(s: string): { card: CardInstance; props: Parameters<typeof HeroDetailSheet>[0] } {
    let card = mockHeroInstance(hero);
    const props: Parameters<typeof HeroDetailSheet>[0] = {
      card,
      isMine: true,
      canUseSkill: true,
      onUseSkill: () => setToast('⚔︎ Skill activated'),
      onClose: () => setScenario(null),
    };
    if (s === 'used') { card = { ...card, skillUsedThisTurn: true }; props.canUseSkill = false; }
    if (s === 'blocked') { props.canUseSkill = false; props.skillBlockedReason = 'Not your turn'; }
    if (s === 'enemy') { props.isMine = false; props.canUseSkill = false; }
    if (s === 'loaded') {
      card = {
        ...card,
        statuses: [
          { id: 'bleed', value: 3, duration: 2 },
          { id: 'shield', value: 5, duration: 999 },
          { id: 'spirit_power', value: 2, duration: 2 },
        ],
        attached: [mockEquipInstance('titanic_magazine'), mockEquipInstance('improved_cooldown', 2)],
      };
      props.canRetreat = true;
      props.retreatCost = 2;
      props.onRetreat = () => setToast('↻ Retreated');
    }
    props.card = card;
    return { card, props };
  }

  const built = scenario ? build(scenario) : null;

  return (
    <Section title="Hero Detail Sheet">
      <Caption>
        The bottom-sheet that opens when you tap a hero. The Skill section <strong>is</strong> the
        action — tap the skill card to use it (no separate button). Pick a hero and a state, then
        open. Heroes with a passive (instead of a skill) show a non-actionable Passive block.
      </Caption>

      <Row>
        <label style={{ ...text.label, color: poster.inkDim, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Hero
          <select
            value={heroId}
            onChange={(e) => setHeroId(e.target.value)}
            style={{
              background: poster.paper, color: poster.ink,
              border: `1.5px solid ${poster.ink}`, borderRadius: 0,
              padding: '8px 10px', fontFamily: fonts.ui, fontWeight: 700, fontSize: 12,
            }}
          >
            {HEROES.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
      </Row>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SHEET_SCENARIOS.map((sc) => (
          <div key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Button onClick={() => setScenario(sc.id)}>{sc.label}</Button>
            <span style={{ ...text.body, color: poster.inkDim }}>{sc.hint}</span>
          </div>
        ))}
      </div>

      {toast && (
        <p style={{ marginTop: 14, ...text.label, color: poster.stat.atkBright }}>
          {toast} — (sheet closed, as it does in-game)
        </p>
      )}

      <AnimatePresence>
        {built && <HeroDetailSheet key={`${heroId}-${scenario}`} {...built.props} />}
      </AnimatePresence>
    </Section>
  );
}

// =============================================================================
// LAYOUT PRIMITIVES — the sheet's own voice: stencil eyebrows over a hairline,
// prose in the body register, the poster button for anything pressed.
// =============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ margin: '0 0 34px' }}>
      <h2
        style={{
          margin: '0 0 14px',
          paddingBottom: 6,
          borderBottom: `1px solid ${poster.inkRule}`,
          fontFamily: fonts.display,
          fontSize: 11,
          fontWeight: 400,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: poster.inkDim,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children, min = 150 }: { children: React.ReactNode; min?: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
      gap: 14,
    }}>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>;
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p style={{ ...text.body, color: poster.inkDim, margin: '0 0 12px', maxWidth: 760 }}>{children}</p>;
}

function Button({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <PosterButton variant="paper" size="sm" onClick={onClick} disabled={disabled}>
      {children}
    </PosterButton>
  );
}
