import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CardFrame } from './card/CardFrame';
import { StatusIcon } from './card/StatusIcon';
import { TurnBanner } from './effects/TurnBanner';
import { DamageFloaters, type FloaterEntry } from './effects/DamageFloater';
import { CardPlayOverlay } from './effects/CardPlayFlash';
import { UltFlashOverlay } from './effects/UltMomentFlash';
import { HEROES, SPELLS, EQUIPMENT, ULTIMATES } from '@/cards';
import { STATUSES } from '@/statuses';
import { HeroSlot } from './board/HeroSlot';
import type { CardInstance, HeroCard } from '@/engine/types';
import { palette, fonts, radius, shadow, text } from './tokens';
import { LevelRing } from './card/LevelRing';

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

type Tab = 'cards' | 'animations' | 'statuses';

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
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: 'cards', label: 'Cards' },
    { id: 'animations', label: 'Animations' },
    { id: 'statuses', label: 'Statuses' },
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
      <Section title="Turn Banner">
        <Caption>Plays at the start of each turn to mark who's moving. The combat banner uses the same chrome with a wine-red border to signal a contested beat.</Caption>
        <Row>
          <TriggerButton label="Your Move" component={(onDone) => (
            <AutoExit ms={2200} onDone={onDone}>
              <TurnBanner visible={true} text="Your Move" tone="self" />
            </AutoExit>
          )} />
          <TriggerButton label="Rival's Move" component={(onDone) => (
            <AutoExit ms={2200} onDone={onDone}>
              <TurnBanner visible={true} text="Rival's Move" tone="opponent" />
            </AutoExit>
          )} />
          <TriggerButton label="Combat · 1 / 3" component={(onDone) => (
            <AutoExit ms={2200} onDone={onDone}>
              <TurnBanner visible={true} text="Combat · 1 / 3" tone="opponent" />
            </AutoExit>
          )} />
        </Row>
      </Section>

      <Section title="Damage / Heal Floaters">
        <Caption>Single renderer for every damage and heal number on the board — combat hits, skill damage, status ticks (Bleed, Djinn's Mark), heals, face damage. Color encodes the source.</Caption>
        <Row>
          <FloaterTrigger label="Bullet (attack)" entry={{ value: -3, kind: 'attack' }} />
          <FloaterTrigger label="Spirit damage" entry={{ value: -7, kind: 'spirit' }} />
          <FloaterTrigger label="Pure (Bleed / Djinn's Mark)" entry={{ value: -2, kind: 'pure' }} />
          <FloaterTrigger label="Heal" entry={{ value: 4, kind: 'heal' }} />
          <FloaterTrigger label="Face damage" entry={{ value: -1, kind: 'face' }} />
        </Row>
      </Section>

      <Section title="Card-Play Flash">
        <Caption>Triggered when a spell or equipment is played from hand, or when a hero activates their skill. Same reveal in all cases — the relevant card sits on-screen for ~2.4s with a caption.</Caption>
        <Row>
          <CardPlayTrigger label="You — Spell" cardId="cold_front" caster="P0" />
          <CardPlayTrigger label="You — Equipment" cardId="restorative_shot" caster="P0" />
          <CardPlayTrigger label="You — Skill" cardId="hero_paige" caster="P0" kind="skill" />
          <CardPlayTrigger label="Rival — Spell" cardId="disarming_hex" caster="P1" />
          <CardPlayTrigger label="Rival — Equipment" cardId="bullet_shield" caster="P1" />
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

function FloaterTrigger({ label, entry }: {
  label: string;
  entry: { value: number; kind: FloaterEntry['kind'] };
}) {
  const [floaters, setFloaters] = useState<FloaterEntry[]>([]);
  function fire() {
    const id = `demo-${Date.now()}`;
    setFloaters([{
      id, iid: 'demo',
      value: entry.value, kind: entry.kind,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }]);
    setTimeout(() => setFloaters([]), 2000);
  }
  return (
    <>
      <Button onClick={fire}>{label}</Button>
      <DamageFloaters entries={floaters} />
    </>
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
          <AutoExit ms={2400} onDone={() => setActive(false)}>
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
