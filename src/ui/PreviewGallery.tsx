import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CardFrame } from './CardFrame';
import { StatusIcon } from './StatusIcon';
import { TurnBanner } from './TurnBanner';
import { DamageFloaters, type FloaterEntry } from './DamageFloater';
import { HEROES, SPELLS, EQUIPMENT, ULTIMATES } from '@/cards';
import { STATUSES } from '@/statuses';
import { SwordIcon, HeartIcon, StatPill } from './Icons';
import { palette, fonts, radius, shadow, spring } from './tokens';

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
          fontFamily: fonts.display, fontSize: 32, fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase',
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
            fontFamily: fonts.display, fontWeight: 600, fontSize: 14,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            cursor: 'pointer', boxShadow: shadow.glowAccent,
          }}
        >Play sequence</button>
        <p style={{ color: palette.textDim, fontSize: 12, marginTop: 8 }}>
          Phase: <strong>{animPhase}</strong>. Triggers turn banner, then damage and heal floaters.
        </p>
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
                  fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase',
                }}>Ultimate</span>
              }
            />
          ))}
        </Grid>
      </Section>

      <Section title={`Status Icons (${STATUSES.length})`}>
        <Grid min={120}>
          {STATUSES.map((s) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: 10, borderRadius: radius.md,
              background: palette.bg2, border: `1px solid ${palette.border}`,
            }}>
              <StatusIcon id={s.id} value={2} duration={2} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                <div style={{ color: palette.textDim, fontSize: 11 }}>{s.id}</div>
              </div>
            </div>
          ))}
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
                fontWeight: 700, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase',
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
                fontWeight: 700, fontSize: 12, letterSpacing: '0.04em',
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
        fontFamily: fonts.display, fontSize: 18, fontWeight: 600,
        letterSpacing: '0.2em', textTransform: 'uppercase',
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
