/**
 * Board — the persistent chrome around the cards: the turn compass, the
 * soul racks and the level rings. The souls rail has to be drawn against a
 * stage as tall as the live board, so it takes a narrow column of its own
 * and the other two stack beside it.
 */
import { useEffect, useState } from 'react';
import {
  TurnCompass, PHASE_STYLES, DEFAULT_PHASE_STYLE, type PhaseStyle, type TurnPhase,
} from '../board/TurnCompass';
import { SoulsRail } from '../board/SoulsRail';
import { boardRows } from '../board/BoardTable';
import { LevelRing } from '../card/LevelRing';
import { poster } from '../poster';
import { radius } from '../tokens';
import { useViewport } from '../hooks/useViewport';
import { Section, Caption, Notes, Row, Button, Sub, Grid, Segmented, type Option } from './primitives';

const RINGS: { level: 1 | 2 | 3 | 4; exp: number; label: string; hint: string }[] = [
  { level: 1, exp: 0, label: 'Lv1 · 0/3', hint: '3 segments, empty' },
  { level: 1, exp: 2, label: 'Lv1 · 2/3', hint: '2 of 3 lit' },
  { level: 2, exp: 0, label: 'Lv2 · 0/6', hint: '6 segments, empty' },
  { level: 2, exp: 4, label: 'Lv2 · 4/6', hint: '4 of 6 lit' },
  { level: 3, exp: 0, label: 'Lv3 · 0/9', hint: '9 segments, empty' },
  { level: 3, exp: 6, label: 'Lv3 · 6/9', hint: '6 of 9 lit' },
  { level: 4, exp: 0, label: 'Lv4 · max', hint: 'fully lit, with glow' },
];

export function BoardTab() {
  const { width } = useViewport();
  const wide = width >= 1100;
  return (
    <div style={wide
      ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0 32px', alignItems: 'start' }
      : undefined}
    >
      <div style={{ minWidth: 0 }}>
        <Section title="Turn compass" count={PHASE_STYLES.length} aside="five ways to print the phase">
          <TurnCompassDemo />
        </Section>

        <Section title="Hero level rings" aside="stages 1 to 4">
          <Caption>
            The progress ring on the portrait. It ticks up as the hero earns exp: at the end of a turn, when
            equipment is attached, on a killing blow.
          </Caption>
          <Grid min={104} gap={8}>
            {RINGS.map((r, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 6px', background: poster.paperBand, border: `1.5px solid ${poster.inkRule}` }}>
                {/* The ring sits where it does on a portrait: top right of a dark print. */}
                <div style={{ position: 'relative', width: 64, height: 64, background: poster.frame, borderRadius: 8 }}>
                  <div style={{ position: 'absolute', top: 6, right: 6 }}>
                    <LevelRing level={r.level} exp={r.exp} size={36} />
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 11.5, letterSpacing: '0.04em', color: poster.ink, fontVariantNumeric: 'tabular-nums' }}>{r.label}</div>
                <div style={{ fontSize: 11, lineHeight: 1.25, color: poster.inkDim, textAlign: 'center' }}>{r.hint}</div>
              </div>
            ))}
          </Grid>
        </Section>
      </div>

      <Section title="Souls rail">
        <SoulsRailDemo />
      </Section>
    </div>
  );
}

function SoulsRailDemo() {
  // The stage is exactly the live board's row stack (bench, lane, bench
  // from the shared boardRows metrics), because the rail lays its two
  // racks out against those same rows; any other height puts your rack
  // below the stage. The rail is absolutely positioned inside it, so the
  // live board's right-edge anchor reads correctly here too. Only the
  // width is the Gallery's own: the rail hugs the right edge whatever the
  // board's width, so the stage need be no wider than it takes to show that.
  const { isMobile } = useViewport();
  const bench = boardRows.bench(isMobile);
  const lane = boardRows.lane(isMobile);
  const gap = boardRows.gap(isMobile);
  const [rival, setRival] = useState(2);
  const [you, setYou] = useState(3);
  const standIn = { border: `1px dashed ${poster.inkFaint}`, borderRadius: radius.sm, opacity: 0.6 };
  return (
    <div style={{ display: 'flex', gap: isMobile ? 22 : 34, alignItems: 'flex-start' }}>
      <div style={{
        position: 'relative',
        flex: '0 0 auto',
        width: isMobile ? 132 : 170,
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

      <div style={{ flex: '1 1 0', minWidth: 0, maxWidth: 300 }}>
        <Caption>
          A stack of flat gold coins hugging the right edge of the board. The rival&rsquo;s rack anchors at the
          top row and yours at the bottom, so position carries ownership.
        </Caption>
        <Caption>
          One coin per soul. A spend leaves its socket as an empty outline; a refill pops a coin back in.
        </Caption>
        <Sub title="Rival" note={`${rival} souls`} />
        <Row>
          <Button onClick={() => setRival((s) => Math.max(0, s - 1))}>−1</Button>
          <Button onClick={() => setRival((s) => s + 1)}>+1</Button>
        </Row>
        <Sub title="You" note={`${you} souls`} />
        <Row>
          <Button onClick={() => setYou((s) => Math.max(0, s - 1))}>−1</Button>
          <Button onClick={() => setYou((s) => s + 1)}>+1</Button>
        </Row>
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => { setRival(2); setYou(3); }}>Reset</Button>
        </div>
      </div>
    </div>
  );
}

const PHASE_OPTIONS: Option<TurnPhase>[] = [
  { id: 'prepare', label: 'Prepare' },
  { id: 'battle', label: 'Battle' },
  { id: 'regroup', label: 'Prepare' },
];

const PHASE_STYLE_NOTES: Record<PhaseStyle, { name: string; note: string }> = {
  track: { name: 'Track', note: 'The word on a slip under the dial, over three pips: where the turn is and what comes next. The battle is the diamond, and its word inverts to a plate.' },
  bars: { name: 'Bars', note: 'Level bars, like a music player’s: flat before the battle, bouncing through it, held where they stopped after it.' },
  tag: { name: 'Tag', note: 'A numbered ink tag. For the battle it takes the colour of whoever is fighting.' },
  thirds: { name: 'Thirds', note: 'Nothing added. The ring is the turn in three arcs and the caption is the word; the battle’s arc splits into its attack steps.' },
  ink: { name: 'Ink', note: 'Nothing added. The caption is the word, and the dial floods with ink for the battle.' },
};

/** Attack steps in the demo's battle. */
const DEMO_BEATS = 2;

function TurnCompassDemo() {
  // One set of controls drives every dial, so the ways of printing the
  // phase are compared on the same turn at the same moment.
  const [turn, setTurn] = useState(3);
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [phase, setPhase] = useState<TurnPhase>('prepare');
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(false);
  const combatOverride = phase === 'battle' ? { total: DEMO_BEATS, currentBeat: beat, attackerIsMe: isMyTurn } : null;

  // Play a turn: prepare, the battle beat by beat, prepare again, and the
  // turn changes hands.
  useEffect(() => {
    if (!playing) return;
    const script: [number, () => void][] = [
      [0, () => { setPhase('prepare'); setBeat(0); }],
      [1500, () => setPhase('battle')],
      [2500, () => setBeat(1)],
      [3500, () => { setPhase('regroup'); setBeat(0); }],
      [5000, () => { setIsMyTurn((v) => !v); setTurn((t) => t + 1); setPhase('prepare'); setPlaying(false); }],
    ];
    const timers = script.map(([at, run]) => setTimeout(run, at));
    return () => timers.forEach(clearTimeout);
  }, [playing]);

  const pickPhase = (p: TurnPhase) => { setPlaying(false); setBeat(0); setPhase(p); };

  return (
    <>
      <Caption>
        The dial pinned between the two active heroes: whose turn, which turn, and where in the turn. A turn
        runs <strong>Prepare</strong>, <strong>Battle</strong>, <strong>Prepare</strong>, then it changes
        hands, and the turn button walks it with the dial: Enter Battle, then End Turn. Below are five ways
        of printing the phase, all on the same turn.
      </Caption>
      <div className="gal-bar gal-bar--static" style={{ margin: '0 0 12px', padding: '8px 0', background: 'none', borderTop: `1px solid ${poster.inkRule}` }}>
        <Segmented label="Phase" value={phase} onChange={pickPhase} options={PHASE_OPTIONS} />
        <Button onClick={() => setPlaying(true)} disabled={playing}>{playing ? 'Playing…' : 'Play a turn'}</Button>
        <Button onClick={() => setBeat((b) => (b + 1) % (DEMO_BEATS + 1))} disabled={phase !== 'battle' || playing}>
          Step beat ({Math.min(beat + 1, DEMO_BEATS)} / {DEMO_BEATS})
        </Button>
        <Button onClick={() => setIsMyTurn((v) => !v)} disabled={playing}>{isMyTurn ? 'Your turn' : 'Rival’s turn'}</Button>
        <Button onClick={() => setTurn((v) => v + 1)} disabled={playing}>+1 turn</Button>
      </div>
      <Grid min={176} gap={10}>
        {PHASE_STYLES.map((style) => (
          <figure key={style} style={{ margin: 0, padding: '0 10px 10px', border: `1.5px solid ${poster.inkRule}` }}>
            {/* The dial on its divider, with the room it has on the board:
                the chevron above or below, and a readout hanging under it. */}
            <div style={{ position: 'relative', height: 146, display: 'flex', justifyContent: 'center', paddingTop: 28 }}>
              <div aria-hidden style={{ position: 'absolute', top: 6, bottom: 6, left: '50%', width: 1, background: poster.inkFaint }} />
              <TurnCompass isMyTurn={isMyTurn} turn={turn} phase={phase} phaseStyle={style} combatOverride={combatOverride} />
            </div>
            <figcaption>
              <div style={{ fontWeight: 700, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: poster.ink }}>
                {PHASE_STYLE_NOTES[style].name}
                {style === DEFAULT_PHASE_STYLE && <span style={{ fontWeight: 400, letterSpacing: '0.02em', textTransform: 'none', color: poster.inkDim }}> · on the board</span>}
              </div>
              <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.35, color: poster.inkSoft }}>{PHASE_STYLE_NOTES[style].note}</div>
            </figcaption>
          </figure>
        ))}
      </Grid>
      <Notes label="How it reads">
        <p>
          Outside the battle the ring is a conic gradient on a sweep of about 8 s. While the battle is fought
          it becomes a segmented progress fill: one arc per attack step, the step in flight pulsing. The
          chevron and the hue say whose turn it is, and a turn changing hands fires one ring-burst.
        </p>
        <p>
          The phase is meant to be found, not to call for attention: nothing moves in either prepare phase,
          and only the battle animates. To change what the board prints, set DEFAULT_PHASE_STYLE in
          TurnCompass.tsx.
        </p>
      </Notes>
    </>
  );
}
