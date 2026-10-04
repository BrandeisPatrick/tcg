/**
 * Story — the story map's panels and sheets, off the map: the stop glyphs,
 * the stop card in every state a stop can be in, the run panel early, mid
 * and late in a run, the three title sheets, and the real 1-of-3 pick.
 *
 * The runs are built with newRun() + clearNode() and never saved, so
 * nothing here touches the run in progress. The map itself (840 kB of
 * geometry) is deliberately not imported.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardId } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import type { NodeKind, StoryRun } from '@/story/types';
import { newRun, clearNode } from '@/story/storyRun';
import { randomStartingHeroes, recruitChoices, supplyChoices } from '@/story/content';
import { StopGlyph, KIND_INK, KIND_LABEL, Sticker } from '../story/StopGlyph';
import { StopCard } from '../story/StopCard';
import { RunPanel } from '../story/RunPanel';
import { StorySheet } from '../story/StorySheet';
import { PickOverlay } from '../story/PickOverlay';
import { poster } from '../poster';
import { useViewport } from '../hooks/useViewport';
import { Section, Sub, Caption, Chip } from './primitives';

const SPINE = ['wallst', 'cityhall', 'timessq', 'themet', 'reservoir', 'cloisters', 'yankee'];
const BOROUGHS = ['bkbridge', 'gowanus', 'botanic', 'greenwood', 'flushing', 'citifield', 'coney'];
const GATES = ['liberty_sp', 'liberty', 'portnewark', 'siferry', 'jerseyheights', 'todthill'];

const clear = (run: StoryRun, ids: string[]) => ids.reduce(clearNode, run);

/** Every run the tab draws, built once per visit. */
function useRuns() {
  return useMemo(() => {
    const fresh = newRun('hero_kelvin');
    // Battery and Wall Street down: City Hall and the other route heads open.
    const early = { ...clear(fresh, ['battery', 'wallst']), heroes: ['hero_kelvin', 'hero_haze'] };
    const full = { ...early, heroes: ['hero_kelvin', 'hero_haze', 'hero_lash', 'hero_paige'] };
    // Up the Spine to the Cloisters (a cache), then to the boss.
    const toCache = { ...clear(early, ['cityhall', 'timessq', 'themet', 'reservoir']), heroes: ['hero_kelvin', 'hero_haze', 'hero_lash'] };
    const toBoss = clear(toCache, ['cloisters']);
    const mid = {
      ...clear(fresh, ['battery', 'wallst', 'cityhall', 'bkbridge']),
      heroes: ['hero_kelvin', 'hero_haze', 'hero_viscous'],
      deck: [...fresh.deck, 'healing_rite', 'extra_health'],
    };
    const late = {
      ...clear(fresh, ['battery', ...SPINE, 'bkbridge', 'gowanus', 'botanic', 'liberty_sp']),
      heroes: ['hero_kelvin', 'hero_haze', 'hero_lash', 'hero_paige'],
      deck: [...fresh.deck, 'healing_rite', 'extra_health', 'cold_front', 'extended_magazine', 'rusted_barrel'],
    };
    const won = {
      ...clear(fresh, ['battery', ...SPINE, ...BOROUGHS, ...GATES]),
      heroes: ['hero_kelvin', 'hero_haze', 'hero_lash', 'hero_paige'],
      deck: late.deck,
    };
    const lost = { ...mid, status: 'lost' as const };
    return { fresh, early, full, toCache, toBoss, mid, late, won, lost };
  }, []);
}

const node = (run: StoryRun, id: string) => run.nodes.find((n) => n.id === id)!;

export function StoryTab() {
  const runs = useRuns();
  return (
    <>
      <GlyphsSection />
      <StopCardsSection runs={runs} />
      <RunPanelSection runs={runs} />
      <SheetsSection runs={runs} />
      <PickSection runs={runs} />
    </>
  );
}

function GlyphsSection() {
  const kinds: (NodeKind | 'cleared' | 'locked')[] = ['battle', 'elite', 'boss', 'recruit', 'supply', 'cleared', 'locked'];
  return (
    <Section title="Glyphs" count={kinds.length}>
      <Caption>
        One line drawing per kind of stop, and the two states besides open. The same glyph prints on a map
        marker, a sticker and the stop card.
      </Caption>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {kinds.map((k) => {
          const ink = k === 'cleared' || k === 'locked' ? poster.ink : KIND_INK[k];
          return (
            <figure key={k} style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 76 }}>
              <span style={{ display: 'flex', gap: 6 }}>
                <span style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${poster.inkRule}`, borderRadius: 6 }}>
                  <StopGlyph kind={k} color={ink} size={24} />
                </span>
                <span style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: poster.panel, borderRadius: 6 }}>
                  <StopGlyph kind={k} color={poster.cream} size={24} />
                </span>
              </span>
              <figcaption className="gal-figcap">{k === 'cleared' || k === 'locked' ? k : KIND_LABEL[k]}</figcaption>
            </figure>
          );
        })}
      </div>
      <Sub title="Stickers" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Sticker label="Battle" ink={poster.red} glyph="battle" />
        <Sticker label="Elite" ink={poster.stat.spirit} glyph="elite" />
        <Sticker label="Boss" ink={poster.redDeep} glyph="boss" />
        <Sticker label="Recruit" ink={poster.ink} glyph="recruit" />
        <Sticker label="Supply" ink={poster.ink} glyph="supply" />
        <Sticker label="Cleared" ink={poster.ink} glyph="cleared" />
        <Sticker label="Locked" ink={poster.ink} glyph="locked" outline />
      </div>
    </Section>
  );
}

type Runs = ReturnType<typeof useRuns>;

function StopCardsSection({ runs }: { runs: Runs }) {
  const [log, setLog] = useState<string | null>(null);
  const variants: { label: string; run: StoryRun; id: string }[] = [
    { label: 'Battle, open — led by a hero', run: runs.early, id: 'cityhall' },
    { label: 'Battle, open — no leader (the Battery)', run: runs.fresh, id: 'battery' },
    { label: 'Boss, open', run: runs.toBoss, id: 'yankee' },
    { label: 'Recruit, open', run: runs.early, id: 'bkbridge' },
    { label: 'Recruit with a full roster', run: runs.full, id: 'bkbridge' },
    { label: 'Supply, open', run: runs.toCache, id: 'cloisters' },
    { label: 'Locked', run: runs.early, id: 'timessq' },
    { label: 'Cleared', run: runs.early, id: 'wallst' },
  ];
  const grid = (compact: boolean) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 18 }}>
      {variants.map((v) => (
        <Slot key={v.label + compact} label={v.label} width={compact ? 366 : 340}>
          <StopCard
            run={v.run}
            node={node(v.run, v.id)}
            compact={compact}
            onGo={() => setLog(`${v.label}: go`)}
            onClose={() => setLog(`${v.label}: close`)}
          />
        </Slot>
      ))}
    </div>
  );
  return (
    <Section title="Stop card" count={variants.length} aside={log ? <span style={{ color: poster.stat.atkBright }}>{log}</span> : undefined}>
      <Caption>
        What a stop is, and the one button that acts on it. A tap on the map opens this; only the button
        starts anything. Desktop docks it in a 340px column, a phone in the bottom gutter.
      </Caption>
      <Sub title="Desktop" note="340 wide" />
      {grid(false)}
      <Sub title="Phone" note="366 wide, compact" />
      {grid(true)}
    </Section>
  );
}

function RunPanelSection({ runs }: { runs: Runs }) {
  const [log, setLog] = useState<string | null>(null);
  const panels: { label: string; run: StoryRun }[] = [
    { label: 'Fresh run', run: runs.fresh },
    { label: 'Mid-run', run: runs.mid },
    { label: 'Full roster, a boss down', run: runs.late },
  ];
  const focus = (label: string) => (n: { name?: string; id: string }) => setLog(`${label}: show ${n.name ?? n.id}`);
  return (
    <Section title="Run panel" aside={log ? <span style={{ color: poster.stat.atkBright }}>{log}</span> : undefined}>
      <Caption>
        The run at a glance, in ink so it reads over land and water. Press a hero or View for the cards, a
        route for its next stop; Abandon asks first. On a phone it folds to the bar, which opens the same
        panel as a sheet.
      </Caption>
      <Sub title="Desktop" note="288 wide" />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 18 }}>
        {panels.map((p) => (
          <Slot key={p.label} label={p.label} width={288}>
            <RunPanel run={p.run} compact={false} onFocusStop={focus(p.label)} onAbandon={() => setLog(`${p.label}: abandoned`)} />
          </Slot>
        ))}
      </div>
      <Sub title="Phone bar" note="366 wide — press it" />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 18 }}>
        {panels.map((p) => (
          <Slot key={p.label} label={p.label} width={366}>
            <RunPanel run={p.run} compact onFocusStop={focus(p.label)} onAbandon={() => setLog(`${p.label}: abandoned`)} />
          </Slot>
        ))}
      </div>
    </Section>
  );
}

function SheetsSection({ runs }: { runs: Runs }) {
  const [open, setOpen] = useState<number | null>(null);
  const sheets: { label: string; run: StoryRun | null }[] = [
    { label: 'Intro', run: null },
    { label: 'Won', run: { ...runs.won, status: 'won' } },
    { label: 'Lost', run: runs.lost },
  ];
  return (
    <Section title="Sheets" count={sheets.length}>
      <Caption>
        Before a run, after a win and after a loss. Over the map they sit on the scrim; here they are
        printed in place; the chips open each one over the screen.
      </Caption>
      <div className="gal-chips" style={{ marginBottom: 14 }}>
        {sheets.map((s, i) => (
          <Chip key={s.label} onClick={() => setOpen(i)} on={open === i}>{s.label} on the scrim</Chip>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 22 }}>
        {sheets.map((s) => (
          <Slot key={s.label} label={s.label} width={640}>
            <div style={{ background: poster.ground, borderRadius: 18, padding: 14 }}>
              <StorySheet run={s.run} embedded onBegin={() => {}} onExit={() => {}} />
            </div>
          </Slot>
        ))}
      </div>
      <AnimatePresence>
        {open != null && (
          <StorySheet key={open} run={sheets[open].run} onBegin={() => setOpen(null)} onExit={() => setOpen(null)} />
        )}
      </AnimatePresence>
    </Section>
  );
}

function PickSection({ runs }: { runs: Runs }) {
  const [open, setOpen] = useState<null | { kind: 'hero' | 'card'; title: string; subtitle: string; verb: string; options: CardId[] }>(null);
  const [took, setTook] = useState<string | null>(null);
  const picks = [
    {
      label: 'Starting hero',
      hint: 'Three heroes dealt at random; one starts the run.',
      make: () => ({ kind: 'hero' as const, title: 'Choose your first hero', subtitle: 'They start the run with you. Recruit three more on the way.', verb: 'Start with', options: randomStartingHeroes() }),
    },
    {
      label: 'Recruit',
      hint: 'A recruit stop: three heroes you do not have yet.',
      make: () => ({ kind: 'hero' as const, title: 'Recruit a hero', subtitle: 'Brooklyn Bridge · one joins your roster', verb: 'Recruit', options: recruitChoices(runs.early, node(runs.early, 'bkbridge')) }),
    },
    {
      label: 'Supply cache',
      hint: 'A cache: three cards, one goes in your deck.',
      make: () => ({ kind: 'card' as const, title: 'Open the cache', subtitle: 'The Cloisters · one card goes in your deck', verb: 'Take', options: supplyChoices(runs.toCache, node(runs.toCache, 'cloisters')) }),
    },
  ];
  return (
    <Section title="Pick" aside={took ? <span style={{ color: poster.stat.atkBright }}>{took}</span> : undefined}>
      <Caption>
        The real overlay. Press a card to choose it, then the button that names it; 1–3, Enter and Escape
        work too. Below 700px wide it turns into a strip with the chosen card large.
      </Caption>
      <div className="gal-pick">
        {picks.map((p) => (
          <button key={p.label} type="button" className="gal-pick__item" onClick={() => { setTook(null); setOpen(p.make()); }}>
            <b>{p.label}</b>
            <span>{p.hint}</span>
          </button>
        ))}
      </div>
      <AnimatePresence>
        {open && (
          <PickOverlay
            key={open.title}
            kind={open.kind}
            title={open.title}
            subtitle={open.subtitle}
            options={open.options}
            confirmVerb={open.verb}
            onPick={(id) => { setTook(`${open.verb} ${CARDS_BY_ID[id]?.name ?? id}`); setOpen(null); }}
            onCancel={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </Section>
  );
}

/** A labelled, fixed-width slot — the width the map screen would dock. On a
 *  phone it never runs past the sheet. */
function Slot({ label, width, children }: { label: string; width: number; children: ReactNode }) {
  const { isMobile } = useViewport();
  return (
    <figure style={{ margin: 0, width: isMobile ? `min(${width}px, 100%)` : width, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <figcaption className="gal-figcap" style={{ textAlign: 'left' }}>{label}</figcaption>
      {children}
    </figure>
  );
}
