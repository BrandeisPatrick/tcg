/**
 * Board — the persistent chrome around the cards: the turn compass, the
 * soul racks, the level rings and the level edge. The souls rail has to be
 * drawn against a stage as tall as the live board, so it takes a narrow
 * column of its own and the compass and rings stack beside it; the level
 * edge is shown on real tiles and runs the sheet's full width.
 */
import { Fragment, useEffect, useState } from 'react';
import type { CardInstance, PlayerID } from '@/engine/types';
import { HEROES } from '@/cards';
import { TurnCompass, type TurnPhase } from '../board/TurnCompass';
import { SoulsRail } from '../board/SoulsRail';
import { boardRows } from '../board/BoardTable';
import { HeroSlot } from '../board/HeroSlot';
import { LevelRing } from '../card/LevelRing';
import { poster } from '../poster';
import { radius } from '../tokens';
import { useViewport } from '../hooks/useViewport';
import { mockHeroInstance } from './mock';
import { Section, Caption, Notes, Row, Button, Sub, Grid, Segmented, Toggle, type Option } from './primitives';

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
    <>
    <div style={wide
      ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0 32px', alignItems: 'start' }
      : undefined}
    >
      <div style={{ minWidth: 0 }}>
        <Section title="Turn compass" aside="a look for each phase">
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

    <Section title="Level edge" id="level-edge">
      <LevelEdgeDemo />
    </Section>
    </>
  );
}

const TRIM_LEVELS = [1, 2, 3, 4] as const;

/** The tiles the bezel is shown on: both Actives in their owners' frames,
 *  a resting bench tile, and a bench tile lit as a legal target. */
const TRIM_ROWS: { id: string; label: string; hero: string; owner: PlayerID; compact: boolean; target: boolean }[] = [
  { id: 'you', label: 'Your Active', hero: 'hero_kelvin', owner: '0', compact: false, target: false },
  { id: 'rival', label: 'Rival Active', hero: 'hero_lady_geist', owner: '1', compact: false, target: false },
  { id: 'bench', label: 'Bench', hero: 'hero_paige', owner: '0', compact: true, target: false },
  { id: 'target', label: 'Target', hero: 'hero_abrams', owner: '1', compact: true, target: true },
];

function LevelEdgeDemo() {
  // Level up: every tile drops a level for a moment and comes back, so each
  // band strikes in as it does when a hero levels on the board.
  const [rewound, setRewound] = useState(false);
  useEffect(() => {
    if (!rewound) return;
    const t = setTimeout(() => setRewound(false), 500);
    return () => clearTimeout(t);
  }, [rewound]);
  return (
    <>
      <Caption>
        A hero&rsquo;s level, printed into its frame. The border is already the state channel (gold yours,
        red the rival&rsquo;s, green a legal target), so the level is a band inside it, with a dark line
        along its inner edge so it reads over the portrait and the cream band alike.
      </Caption>
      <Caption>
        It reads by form as well as ink: <strong>Lv2</strong> a plain band, <strong>Lv3</strong> the band
        with photo corners, <strong>Lv4</strong> a heavier band and larger corners in foil, with a slow
        sheen running round it. Tiles at the board&rsquo;s own size.
      </Caption>
      <Row>
        <Button onClick={() => setRewound(true)} disabled={rewound}>Level up</Button>
      </Row>
      <LevelEdgeSheet rewound={rewound} />
      <Notes label="How it reads">
        <p>
          Steel, blue, violet foil: none of them is a state colour. The hero sheet&rsquo;s big card carries the same band in its
          charcoal margin. Under calm motion the Lv4 sheen holds still and a level-up only flashes.
        </p>
      </Notes>
    </>
  );
}

function LevelEdgeSheet({ rewound }: { rewound: boolean }) {
  const card = (row: (typeof TRIM_ROWS)[number], lv: 1 | 2 | 3 | 4): CardInstance => ({
    ...mockHeroInstance(HEROES.find((h) => h.id === row.hero)!),
    // One iid per tile: HeroSlot's layoutId is built from it.
    iid: `trim-${row.id}-${lv}`,
    ownerId: row.owner,
    zone: row.compact ? 'bench' : 'active',
    level: rewound ? TRIM_LEVELS[Math.max(0, lv - 2)] : lv,
  });
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '92px repeat(4, 180px)', gap: '14px 16px',
        alignItems: 'center', width: 'max-content',
      }}>
        <span />
        {TRIM_LEVELS.map((lv) => (
          <div key={lv} className="gal-figcap" style={{ marginTop: 0 }}>Lv{lv}</div>
        ))}
        {TRIM_ROWS.map((row) => (
          <Fragment key={row.id}>
            <div className="gal-figcap" style={{ marginTop: 0, textAlign: 'left' }}>{row.label}</div>
            {TRIM_LEVELS.map((lv) => (
              <div key={lv} style={{ width: 180, height: row.compact ? 180 : 280 }}>
                <HeroSlot
                  card={card(row, lv)}
                  owner={row.owner} myId="0" isOpponent={row.owner !== '0'}
                  pending={null} isTargetable={row.target}
                  compact={row.compact}
                  onTap={() => {}}
                />
              </div>
            ))}
          </Fragment>
        ))}
      </div>
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
  { id: 'prepare', label: 'Before' },
  { id: 'battle', label: 'Attack' },
  { id: 'regroup', label: 'After' },
];

/** Attack steps in the demo's attack (the swing and two Extra Attacks). */
const DEMO_BEATS = 3;
/** What the board's fit-scale leaves of the dial on a 1440 × 900 screen. */
const BOARD_SCALE = 0.75;

function TurnCompassDemo() {
  const [turn, setTurn] = useState(3);
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [phase, setPhase] = useState<TurnPhase>('prepare');
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [boardSize, setBoardSize] = useState(false);
  const attackOf = (currentBeat: number) => ({ total: DEMO_BEATS, currentBeat, attackerIsMe: isMyTurn });

  // Play a turn: the attack ahead, the attack step by step, the attack
  // made, and the turn changes hands.
  useEffect(() => {
    if (!playing) return;
    const script: [number, () => void][] = [
      [0, () => { setPhase('prepare'); setBeat(0); }],
      [1500, () => setPhase('battle')],
      [2400, () => setBeat(1)],
      [3300, () => setBeat(2)],
      [4200, () => { setPhase('regroup'); setBeat(0); }],
      [5700, () => { setIsMyTurn((v) => !v); setTurn((t) => t + 1); setPhase('prepare'); setPlaying(false); }],
    ];
    const timers = script.map(([at, run]) => setTimeout(run, at));
    return () => timers.forEach(clearTimeout);
  }, [playing]);

  const pickPhase = (p: TurnPhase) => { setPlaying(false); setBeat(0); setPhase(p); };

  // The dial on its divider, with the room it has on the board.
  const dial = (label: string, node: React.ReactNode) => (
    <figure style={{ margin: 0, flex: '1 1 120px', minWidth: 0, border: `1.5px solid ${poster.inkRule}` }}>
      <div style={{ position: 'relative', height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div aria-hidden style={{ position: 'absolute', top: 6, bottom: 6, left: '50%', width: 1, background: poster.inkFaint }} />
        <div style={{ transform: boardSize ? `scale(${BOARD_SCALE})` : undefined }}>{node}</div>
      </div>
      <figcaption style={{ padding: '0 10px 9px', fontWeight: 700, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: poster.ink, textAlign: 'center' }}>
        {label}
      </figcaption>
    </figure>
  );

  return (
    <>
      <Caption>
        The dial pinned between the two active heroes: whose turn, which turn, and where in the turn. A turn
        is the player&rsquo;s to spend on cards, skills and a retreat, with one <strong>attack</strong> among
        them, made from the Active&rsquo;s sheet; the turn button only ends it. The dial marks the attack:
        before it, while it lands, and once it is made. Each has its own look, and none of them is a word.
      </Caption>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        {dial('Before the attack', <TurnCompass isMyTurn={isMyTurn} turn={turn} phase="prepare" combatOverride={null} />)}
        {dial('The attack', <TurnCompass isMyTurn={isMyTurn} turn={turn} phase="battle" combatOverride={attackOf(1)} />)}
        {dial('Attack made', <TurnCompass isMyTurn={isMyTurn} turn={turn} phase="regroup" combatOverride={null} />)}
        {dial('Live', <TurnCompass isMyTurn={isMyTurn} turn={turn} phase={phase} combatOverride={phase === 'battle' ? attackOf(beat) : null} />)}
      </div>
      <div className="gal-bar gal-bar--static" style={{ margin: '0 0 12px', padding: '8px 0', background: 'none', borderTop: `1px solid ${poster.inkRule}` }}>
        <Segmented label="Live" value={phase} onChange={pickPhase} options={PHASE_OPTIONS} />
        <Button onClick={() => setPlaying(true)} disabled={playing}>{playing ? 'Playing…' : 'Play a turn'}</Button>
        <Button onClick={() => setBeat((b) => (b + 1) % DEMO_BEATS)} disabled={phase !== 'battle' || playing}>
          Next attack step ({beat + 1} / {DEMO_BEATS})
        </Button>
        <Button onClick={() => setIsMyTurn((v) => !v)} disabled={playing}>{isMyTurn ? 'Your turn' : 'Rival’s turn'}</Button>
        <Button onClick={() => setTurn((v) => v + 1)} disabled={playing}>+1 turn</Button>
        <Toggle on={boardSize} onChange={setBoardSize}>Board size</Toggle>
      </div>
      <Notes label="How it reads">
        <p>
          Before the attack the dial is quiet: only the spinner moves, a faint arc on a sweep of about 8 s.
          The attack is loud. The ring becomes one arc per attack step (the swing, then any Extra Attacks),
          filling in the attacker’s colour, and level bars like a music player’s stand out all round the
          dial and bounce. Every attack step lands as a thump: the bars jump, the dial pops and a ring
          bursts off it.
        </p>
        <p>
          Once the attack is made the bars settle into a short fringe that stays until the turn changes
          hands, so the rest of the turn reads as its start with the attack behind it; a turn ended without
          an attack stays quiet throughout. The chevron and the hue say whose turn it is, and a turn
          changing hands fires one ring-burst. Board size shrinks the dials to what a 1440 × 900 screen
          leaves of them.
        </p>
      </Notes>
    </>
  );
}
