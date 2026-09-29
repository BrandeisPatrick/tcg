/**
 * Board — the persistent chrome around the cards: the turn compass, the
 * soul racks and the level rings. The souls rail has to be drawn against a
 * stage as tall as the live board, so it takes a narrow column of its own
 * and the other two stack beside it.
 */
import { useState } from 'react';
import { TurnCompass } from '../board/TurnCompass';
import { SoulsRail } from '../board/SoulsRail';
import { boardRows } from '../board/BoardTable';
import { LevelRing } from '../card/LevelRing';
import { poster } from '../poster';
import { radius } from '../tokens';
import { useViewport } from '../hooks/useViewport';
import { Section, Caption, Notes, Row, Button, Sub, Grid } from './primitives';

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
        <Section title="Turn compass">
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

function TurnCompassDemo() {
  // Two mounted compasses — one per idle turn state — plus a live one that
  // the controls drive, which flips into its segmented-ring state through
  // the `combatOverride` prop.
  const [turn, setTurn] = useState(1);
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [combatMode, setCombatMode] = useState(false);
  const [attackerIsMe, setAttackerIsMe] = useState(true);
  const [total, setTotal] = useState(3);
  const [currentBeat, setCurrentBeat] = useState(0);
  const combatOverride = combatMode ? { total, currentBeat, attackerIsMe } : null;
  const reset = () => {
    setTurn(1); setIsMyTurn(true); setCombatMode(false);
    setAttackerIsMe(true); setTotal(3); setCurrentBeat(0);
  };
  const dial = (label: string, node: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, minWidth: 92 }}>
      {/* The chevron hangs outside the dial, so the dial gets room for it. */}
      <div style={{ padding: '10px 0' }}>{node}</div>
      <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: poster.inkDim, textAlign: 'center' }}>{label}</span>
    </div>
  );
  return (
    <>
      <Caption>
        A quiet indicator pinned between the two active heroes. Idle, a ring sweeps slowly and the chevron
        points at whoever&rsquo;s turn it is. In combat the ring becomes one arc per attack step, filling in
        the attacker&rsquo;s colour.
      </Caption>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '14px 28px', marginBottom: 12 }}>
        {dial('Your move', <TurnCompass isMyTurn turn={turn} combatOverride={null} />)}
        {dial('Rival’s move', <TurnCompass isMyTurn={false} turn={turn} combatOverride={null} />)}
        {dial('Live', <TurnCompass isMyTurn={isMyTurn} turn={turn} combatOverride={combatOverride} />)}
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <Sub title="Live dial" />
          <Row>
            <Button onClick={() => setTurn((v) => v + 1)}>+1 turn</Button>
            <Button onClick={() => setIsMyTurn((v) => !v)}>Flip side</Button>
            <Button onClick={reset}>Reset</Button>
          </Row>
          <Sub title="Combat mode" note="the same dial" />
          <Row>
            <Button onClick={() => setCombatMode((v) => !v)}>{combatMode ? 'Combat: on' : 'Combat: off'}</Button>
            <Button onClick={() => setCurrentBeat((b) => (b + 1) % (total + 1))} disabled={!combatMode}>Step beat ({currentBeat} / {total})</Button>
            <Button onClick={() => setAttackerIsMe((v) => !v)} disabled={!combatMode}>{attackerIsMe ? 'You attacking' : 'Rival attacking'}</Button>
            <Button onClick={() => setTotal((t) => (t % 4) + 1)} disabled={!combatMode}>Total = {total}</Button>
          </Row>
        </div>
      </div>
      <Notes label="How it reads">
        <p>
          The idle ring is a conic gradient on a sweep of about 8 s. Combat mode swaps it for a segmented
          progress fill: one arc per beat, the active segment pulsing. There is no sibling chrome; the dial
          carries the whole turn state.
        </p>
      </Notes>
    </>
  );
}
