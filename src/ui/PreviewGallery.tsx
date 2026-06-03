import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CardFrame } from './card/CardFrame';
import { StatusIcon } from './card/StatusIcon';
import { CardPlayOverlay } from './effects/CardPlayFlash';
import { UltFlashOverlay } from './effects/UltMomentFlash';
import { HEROES, SPELLS, EQUIPMENT, ULTIMATES } from '@/cards';
import { STATUSES } from '@/statuses';
import { HeroSlot } from './board/HeroSlot';
import { TurnCompass } from './board/TurnCompass';
import { SoulsRail } from './board/SoulsRail';
import { HeroDetailSheet } from './overlays/HeroDetailSheet';
import type { CardInstance, HeroCard } from '@/engine/types';
import { palette, fonts, radius, shadow, text } from './tokens';
import { LevelRing } from './card/LevelRing';
import { RoundCardIcon } from './card/RoundCardIcon';

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

type Tab = 'cards' | 'animations' | 'statuses' | 'overlays';

export function PreviewGallery() {
  useEffect(() => { document.body.classList.add('preview'); return () => document.body.classList.remove('preview'); }, []);
  const [tab, setTab] = useState<Tab>('cards');

  return (
    <div style={{
      minHeight: '100dvh',
      padding: '24px 16px 80px',
      background: palette.bg0,
      color: palette.text,
      fontFamily: fonts.ui,
    }}>
      <header style={{ maxWidth: 1100, margin: '0 auto 18px' }}>
        <h1 style={{
          fontFamily: fonts.ui, fontSize: 22, fontWeight: 700,
          color: palette.accent, margin: 0,
          textShadow: `0 0 24px ${palette.accent}55`,
        }}>
          Deadlock TCG · Preview Gallery
        </h1>
        <p style={{ color: palette.textDim, marginTop: 6 }}>
          Visual catalog of every in-game render.&nbsp;
          <a href="/" style={{ color: palette.accent }}>back to match</a>
        </p>
      </header>

      <TabBar tab={tab} setTab={setTab} />

      <div style={{ marginTop: 22 }}>
        {tab === 'cards' && <CardsTab />}
        {tab === 'animations' && <AnimationsTab />}
        {tab === 'statuses' && <StatusesTab />}
        {tab === 'overlays' && <OverlaysTab />}
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: 'cards', label: 'Cards' },
    { id: 'animations', label: 'Animations' },
    { id: 'statuses', label: 'Statuses' },
    { id: 'overlays', label: 'Overlays' },
  ];
  return (
    <div style={{
      maxWidth: 1100, margin: '0 auto',
      display: 'flex', gap: 4,
      borderBottom: `1px solid ${palette.border}`,
    }}>
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              color: active ? palette.text : palette.textDim,
              border: 'none',
              borderBottom: `2px solid ${active ? palette.accent : 'transparent'}`,
              cursor: 'pointer',
              fontFamily: fonts.ui,
              fontSize: 13, fontWeight: 700,
              marginBottom: -1,
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// CARDS TAB
// =============================================================================

function CardsTab() {
  return (
    <>
      <Section title={`Heroes (${HEROES.length})`}>
        <Grid min={170}>
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
        <p style={{ ...text.body, color: palette.textDim, marginBottom: 12 }}>
          Hold any card in-game to surface this large-format view. Uses CardFrame size="full".
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <CardFrame cardId="hero_haze" size="full" glow="accent" />
          <CardFrame cardId="ult_abrams" size="full" glow="gold" />
          <CardFrame cardId="metal_skin" size="full" />
        </div>
      </Section>
    </>
  );
}

// =============================================================================
// ANIMATIONS TAB
// =============================================================================

function AnimationsTab() {
  return (
    <>
      <Section title="Turn Compass">
        <Caption>Persistent quiet indicator pinned between the two active heroes. Idle: a conic-gradient ring sweeps slowly (~8s) and the chevron points at whoever's turn. Combat mode: the ring swaps to a segmented progress fill — one arc per attack step, filling in the attacker's hue with the active segment pulsing. No sibling chrome.</Caption>
        <TurnCompassDemo />
      </Section>

      <Section title="Souls Rail">
        <Caption>Vertical stack of flat brass rectangles hugging the right edge of the 3×3 grid. Rival's chips anchor at the top edge; yours anchor at the bottom — position carries ownership. Each soul = one chip; spends pop the head chip off, refills pop a new one on. No labels, no mid-divider.</Caption>
        <SoulsRailDemo />
      </Section>

      <Section title="HP / BP Tick">
        <Caption>Damage and heals animate ON the hero card's HP / BP number — a quick scale pulse that stays in the stat's own colour family (brass for BP, vermillion for HP). Buffs pulse brighter, debuffs/damage pulse desaturated grey. Click below to mutate a mock card and watch the number tick.</Caption>
        <StatTickDemo />
      </Section>

      <Section title="Card-Play Flash">
        <Caption>Triggered when a spell or equipment is played from hand, or when a hero activates their skill. Same reveal in all cases — the relevant card sits on-screen for ~3.2s with a caption.</Caption>
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
              background: palette.bg2,
              border: `1px solid ${palette.border}`,
              borderRadius: radius.md,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                position: 'relative', width: 96, height: 96,
                background: 'linear-gradient(180deg, rgba(20,28,48,0.95), rgba(8,12,22,0.98))',
                borderRadius: radius.md,
              }}>
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <LevelRing level={stage.level} exp={stage.exp} size={36} />
                </div>
              </div>
              <div style={{ ...text.label, color: palette.accent }}>{stage.label}</div>
              <div style={{ ...text.body, color: palette.textDim, textAlign: 'center' }}>{stage.hint}</div>
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
  // Stage matches the live board's height proportion (3 rows of 180/290
  // px + gaps ≈ 690 px). The rail is rendered absolutely inside a
  // relative container so the same anchor logic the live board uses
  // (right: -28px) reads correctly here too.
  const [rival, setRival] = useState(2);
  const [you, setYou] = useState(3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        position: 'relative',
        height: 460,
        borderRadius: radius.md,
        border: `1px solid ${palette.border}`,
        background: `linear-gradient(180deg, ${palette.bg1}, ${palette.bg2})`,
      }}>
        {/* Stage stand-ins for the 3 board rows so the rail's midline
            visibly aligns with the centre row, just like in-game. */}
        <div style={{
          position: 'absolute', inset: 12,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ flex: 1, border: `1px dashed ${palette.border}`, borderRadius: radius.sm, opacity: 0.6 }} />
          <div style={{ flex: 1.6, border: `1px dashed ${palette.border}`, borderRadius: radius.sm, opacity: 0.6 }} />
          <div style={{ flex: 1, border: `1px dashed ${palette.border}`, borderRadius: radius.sm, opacity: 0.6 }} />
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
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
          <TurnCompass isMyTurn={true} turn={turn} combatOverride={null} />
          <span style={{ ...text.label, color: palette.textDim }}>Your Move (idle)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
          <TurnCompass isMyTurn={false} turn={turn} combatOverride={null} />
          <span style={{ ...text.label, color: palette.textDim }}>Rival's Move (idle)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ ...text.label, color: palette.textDim }}>Live toggle</span>
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
        <span style={{ ...text.label, color: palette.textDim }}>Combat mode (same compass)</span>
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

function CardPlayTrigger({ label, cardId, caster, kind = 'play' }: {
  label: string; cardId: string; caster: 'P0' | 'P1'; kind?: 'play' | 'skill';
}) {
  const [active, setActive] = useState(false);
  return (
    <>
      <Button onClick={() => setActive(true)} disabled={active}>{label}</Button>
      <AnimatePresence>
        {active && (
          <AutoExit ms={3200} onDone={() => setActive(false)}>
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
          <AutoExit ms={3200} onDone={() => setActive(false)}>
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
      <Caption>Buffs in success green, debuffs in wine red, utility statuses in brass. Magnitude statuses show a value pill; binary statuses (Stun, Silence, Disarm) hide it.</Caption>
      <Grid min={150}>
        {STATUSES.map((s) => {
          const MAGNITUDE: Record<string, number> = {
            bullet_resist: 3, spirit_resist: 3, shield: 5,
            weapon_power: 2, spirit_power: 2, bleed: 3,
          };
          const value = MAGNITUDE[s.id] ?? 1;
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: 10, borderRadius: radius.md,
              background: palette.bg2, border: `1px solid ${palette.border}`,
            }}>
              <StatusIcon id={s.id} value={value} duration={2} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{s.title}</div>
                <div style={{ color: palette.textDim, fontSize: 12 }}>{s.id}</div>
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

function mockEquipInstance(cardId: string): CardInstance {
  return {
    iid: `preview-eq-${cardId}`,
    cardId,
    ownerId: '0',
    zone: 'equipment',
    hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
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
        attached: [mockEquipInstance('titanic_magazine'), mockEquipInstance('healing_booster')],
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
        <label style={{ ...text.label, color: palette.textDim, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Hero
          <select
            value={heroId}
            onChange={(e) => setHeroId(e.target.value)}
            style={{
              background: palette.bg2, color: palette.text,
              border: `1px solid ${palette.border}`, borderRadius: radius.md,
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
            <span style={{ ...text.body, color: palette.textDim }}>{sc.hint}</span>
          </div>
        ))}
      </div>

      {toast && (
        <p style={{ marginTop: 14, ...text.label, color: palette.success }}>
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
// LAYOUT PRIMITIVES
// =============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ maxWidth: 1100, margin: '0 auto 36px' }}>
      <h2 style={{
        fontFamily: fonts.ui, fontSize: 12, fontWeight: 700,
        color: palette.textDim, margin: '0 0 14px',
      }}>{title}</h2>
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
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div>;
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p style={{ ...text.body, color: palette.textDim, marginBottom: 12 }}>{children}</p>;
}

function Button({ children, onClick, disabled }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled
          ? `linear-gradient(180deg, ${palette.bg2}, ${palette.bg1})`
          : `linear-gradient(180deg, ${palette.accent}cc, ${palette.accent}55)`,
        color: disabled ? palette.textFaint : palette.text,
        border: `1px solid ${disabled ? palette.border : palette.accent}`,
        padding: '8px 14px',
        borderRadius: radius.md,
        fontFamily: fonts.ui, fontWeight: 700, fontSize: 12,
        cursor: disabled ? 'wait' : 'pointer',
        boxShadow: disabled ? 'none' : shadow.glowAccent,
        opacity: disabled ? 0.7 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      {children}
    </button>
  );
}
