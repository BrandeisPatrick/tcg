import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CardFrame } from './card/CardFrame';
import { StatusIcon } from './card/StatusIcon';
import { TurnBanner } from './effects/TurnBanner';
import { DamageFloaters, type FloaterEntry } from './effects/DamageFloater';
import { HEROES, SPELLS, EQUIPMENT, ULTIMATES } from '@/cards';
import { STATUSES } from '@/statuses';
import { SwordIcon, HeartIcon, StatPill } from './card/Icons';
import { palette, fonts, radius, shadow, spring, text } from './tokens';
import { LevelIcon } from './card/LevelIcon';
import { LevelRing } from './card/LevelRing';

export function PreviewGallery() {
  useEffect(() => { document.body.classList.add('preview'); return () => document.body.classList.remove('preview'); }, []);

  const [bannerOn, setBannerOn] = useState(false);
  const [floaters, setFloaters] = useState<FloaterEntry[]>([]);
  const [animPhase, setAnimPhase] = useState<string>('idle');

  function playSequence() {
    setAnimPhase('banner');
    setBannerOn(true);
    setTimeout(() => setBannerOn(false), 800);
    setTimeout(() => {
      setAnimPhase('damage');
      const id = `dmg-${Date.now()}`;
      setFloaters([{ id, iid: 'demo', value: -7, kind: 'spirit', x: window.innerWidth / 2, y: window.innerHeight / 2 }]);
      setTimeout(() => setFloaters([]), 950);
    }, 1100);
    setTimeout(() => {
      const id = `heal-${Date.now()}`;
      setFloaters([{ id, iid: 'demo', value: 4, kind: 'heal', x: window.innerWidth / 2 + 80, y: window.innerHeight / 2 }]);
      setTimeout(() => setFloaters([]), 950);
      setAnimPhase('idle');
    }, 1900);
  }

  return (
    <div style={{
      minHeight: '100dvh',
      padding: '24px 16px 80px',
      background: palette.bg0,
      color: palette.text,
      fontFamily: fonts.ui,
    }}>
      <header style={{ maxWidth: 1100, margin: '0 auto 28px' }}>
        <h1 style={{
          fontFamily: fonts.ui, fontSize: 22, fontWeight: 700,
          color: palette.accent, margin: 0,
          textShadow: `0 0 24px ${palette.accent}55`,
        }}>
          Deadlock TCG · Preview Gallery
        </h1>
        <p style={{ color: palette.textDim, marginTop: 6 }}>
          Every card and status icon. Use this to scan visual quality. Return to game:&nbsp;
          <a href="/" style={{ color: palette.accent }}>back to match</a>
        </p>
      </header>

      <Section title="Animation Showroom">
        <button
          onClick={playSequence}
          style={{
            background: `linear-gradient(180deg, ${palette.accent}cc, ${palette.accent}55)`,
            color: palette.text, border: 'none',
            padding: '12px 24px', borderRadius: radius.md,
            fontFamily: fonts.ui, fontWeight: 700, fontSize: 12,
            cursor: 'pointer', boxShadow: shadow.glowAccent,
          }}
        >Play sequence</button>
        <p style={{ color: palette.textDim, fontSize: 12, marginTop: 8 }}>
          Phase: <strong>{animPhase}</strong>. Triggers turn banner, then damage and heal floaters.
        </p>
      </Section>

      <Section title="Hero Levels — stages 1 → 4">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 18,
        }}>
          {[
            { level: 1, exp: 0,  label: 'Lv1 · 0/3 exp',   hint: '3-piece ring (empty)' },
            { level: 1, exp: 2,  label: 'Lv1 · 2/3 exp',   hint: '2 of 3 segments lit' },
            { level: 2, exp: 0,  label: 'Lv2 · 0/6 exp',   hint: '6-piece ring (empty)' },
            { level: 2, exp: 4,  label: 'Lv2 · 4/6 exp',   hint: '4 of 6 segments lit' },
            { level: 3, exp: 0,  label: 'Lv3 · 0/9 exp',   hint: '9-piece ring (empty)' },
            { level: 3, exp: 6,  label: 'Lv3 · 6/9 exp',   hint: '6 of 9 segments lit' },
            { level: 4, exp: 0,  label: 'Lv4 · max',       hint: 'ring fully lit + glow' },
            { level: 4, exp: 0,  label: 'Lv4 · max',       hint: 'exp no longer accrues' },
          ].map((stage, idx) => (
            <div key={idx} style={{
              padding: 16,
              background: palette.bg2,
              border: `1px solid ${palette.border}`,
              borderRadius: radius.md,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{ position: 'relative', width: 110, height: 110 }}>
                {/* Mock the hero-slot dark portrait area so the ring contrasts. */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(180deg, rgba(20,28,48,0.95), rgba(8,12,22,0.98))',
                  borderRadius: radius.md,
                }} />
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <LevelRing level={stage.level} exp={stage.exp} size={36} />
                </div>
              </div>
              {/* Inline-style stats row mock. */}
              <div style={{
                width: '100%',
                background: palette.card.body,
                color: palette.card.bodyText,
                padding: '6px 10px',
                borderRadius: radius.sm,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              }}>
                <span style={{ color: palette.atk, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <SwordIcon size={13} color={palette.atk} /> 4
                </span>
                <span style={{ color: '#d4a93c', display: 'inline-flex', alignItems: 'center', gap: 3, fontVariantNumeric: 'tabular-nums' }}>
                  <LevelIcon level={stage.level} size={13} /> Lv {stage.level}
                </span>
                <span style={{ color: palette.hp, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <HeartIcon size={13} color={palette.hp} /> 9
                </span>
              </div>
              <div style={{ ...text.label, color: palette.accent, marginTop: 2 }}>{stage.label}</div>
              <div style={{ ...text.body, color: palette.textDim, textAlign: 'center' }}>{stage.hint}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Heroes (${HEROES.length})`}>
        <Grid min={320}>
          {HEROES.map((h) => (
            <CardFrame
              key={h.id}
              cardId={h.id}
              size="full"
              footer={
                <>
                  <StatPill big icon={<SwordIcon size={18} />} value={h.atk} color={palette.atk} />
                  <StatPill big icon={<HeartIcon size={18} />} value={h.hp} color={palette.hp} />
                </>
              }
            />
          ))}
        </Grid>
      </Section>

      <Section title={`Spells (${SPELLS.length})`}>
        <Grid min={320}>
          {SPELLS.map((s) => (
            <CardFrame key={s.id} cardId={s.id} size="full" />
          ))}
        </Grid>
      </Section>

      <Section title={`Equipment (${EQUIPMENT.length})`}>
        <Grid min={320}>
          {EQUIPMENT.map((e) => (
            <CardFrame
              key={e.id}
              cardId={e.id}
              size="full"
              glow={e.tier === 3 ? 'gold' : null}
            />
          ))}
        </Grid>
      </Section>

      <Section title={`Ultimates (${ULTIMATES.length})`}>
        <Grid min={320}>
          {ULTIMATES.map((u) => (
            <CardFrame
              key={u.id}
              cardId={u.id}
              size="full"
              glow="gold"
              footer={
                <span style={{
                  color: palette.type.ultimate.accent,
                  fontWeight: 700, fontSize: 12,
                }}>Ultimate</span>
              }
            />
          ))}
        </Grid>
      </Section>

      <Section title={`Status Icons (${STATUSES.length})`}>
        <Grid min={120}>
          {STATUSES.map((s) => {
            // Binary CC + the simple flag statuses are always applied at
            // value=1 by the engine; rendering "STUN 1 (2)" is noise. Show
            // realistic example values: magnitudes get 3, binaries get 1
            // (the StatusIcon hides the pill automatically for those).
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

      <Section title="Full-Size Card (long-press style)">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <CardFrame
            cardId="hero_haze"
            size="full"
            glow="accent"
            footer={
              <>
                <StatPill big icon={<SwordIcon size={18} />} value={4} color={palette.atk} />
                <StatPill big icon={<HeartIcon size={18} />} value={8} color={palette.hp} />
              </>
            }
          />
          <CardFrame
            cardId="ult_abrams"
            size="full"
            glow="gold"
            footer={
              <span style={{
                color: palette.type.ultimate.accent,
                fontWeight: 700, fontSize: 12,
              }}>Ultimate</span>
            }
          />
          <CardFrame
            cardId="divine_barrier"
            size="full"
            glow="gold"
            footer={
              <span style={{
                color: palette.type.equipment.accent,
                fontWeight: 700, fontSize: 12,
              }}>Mythic Tier 3</span>
            }
          />
        </div>
      </Section>

      <DamageFloaters entries={floaters} />
      <TurnBanner visible={bannerOn} text="Your Turn" tone="self" />
    </div>
  );
}

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
