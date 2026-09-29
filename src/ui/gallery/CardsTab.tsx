/**
 * Cards — the whole set at hand size, filtered rather than scrolled. One
 * bar narrows it to a type, finds a card by name or rule, or swaps to the
 * two views that are not cards: the round table icons and the card states.
 * Any card opens at full size, so the grid can stay small enough to see
 * the set and a long rule is still one tap from readable.
 */
import { Fragment, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardData, EquipmentCard } from '@/engine/types';
import { HEROES, SPELLS, EQUIPMENT, ULTIMATES, CARDS_BY_ID } from '@/cards';
import { CardFrame } from '../card/CardFrame';
import { RoundCardIcon } from '../card/RoundCardIcon';
import { HeroSlot } from '../board/HeroSlot';
import { useViewport } from '../hooks/useViewport';
import { CardLightbox } from './CardLightbox';
import { mockHeroInstance } from './mock';
import {
  Section, Sub, Caption, CardGrid, Fit, Grid, Segmented, type Option,
} from './primitives';

type Show = 'all' | 'heroes' | 'spells' | 'equipment' | 'ultimates' | 'icons' | 'states';
const SHOWS: Show[] = ['all', 'heroes', 'spells', 'equipment', 'ultimates', 'icons', 'states'];
const TIERS = [1, 2, 3, 4] as const;

function initialShow(): Show {
  const s = new URLSearchParams(window.location.search).get('show');
  return SHOWS.includes(s as Show) ? (s as Show) : 'all';
}

const hit = (c: CardData, q: string) =>
  !q || c.name.toLowerCase().includes(q) || c.id.includes(q) || (c.text ?? '').toLowerCase().includes(q);

/** "3–4 souls" from the cards themselves, so the label cannot drift from the data. */
function costBand(cards: EquipmentCard[]): string {
  const costs = cards.map((c) => c.cost ?? 0);
  const lo = Math.min(...costs);
  const hi = Math.max(...costs);
  return lo === hi ? `${lo} souls` : `${lo}–${hi} souls`;
}

const count = (n: number, of: number) => (n === of ? n : `${n} of ${of}`);

export function CardsTab() {
  const { isMobile } = useViewport();
  const [show, setShowState] = useState<Show>(initialShow);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const setShow = (s: Show) => {
    setShowState(s);
    const u = new URL(window.location.href);
    if (s === 'all') u.searchParams.delete('show'); else u.searchParams.set('show', s);
    window.history.replaceState(null, '', u);
  };

  const q = query.trim().toLowerCase();
  const heroes = useMemo(() => HEROES.filter((c) => hit(c, q)), [q]);
  const spells = useMemo(() => SPELLS.filter((c) => hit(c, q)), [q]);
  const gear = useMemo(() => EQUIPMENT.filter((c) => hit(c, q)), [q]);
  const ults = useMemo(() => ULTIMATES.filter((c) => hit(c, q)), [q]);
  const total = heroes.length + spells.length + gear.length + ults.length;

  const wants = (s: Show) => show === 'all' || show === s;
  // The full-size view walks whatever is on screen, in the order it is drawn.
  const walk = useMemo(() => {
    const wants = (s: Show) => show === 'all' || show === s;
    if (show === 'icons') return [...spells, ...gear].map((c) => c.id);
    if (show === 'states') return [];
    return [
      ...(wants('heroes') ? heroes : []),
      ...(wants('spells') ? spells : []),
      ...(wants('equipment') ? TIERS.flatMap((t) => gear.filter((g) => g.tier === t)) : []),
      ...(wants('ultimates') ? ults : []),
    ].map((c) => c.id);
  }, [show, heroes, spells, gear, ults]);

  const options: Option<Show>[] = [
    { id: 'all', label: 'All', n: total },
    { id: 'heroes', label: 'Heroes', n: heroes.length },
    { id: 'spells', label: 'Spells', n: spells.length },
    { id: 'equipment', label: 'Equipment', n: gear.length },
    { id: 'ultimates', label: 'Ultimates', n: ults.length },
    { id: 'icons', label: 'Table icons', n: spells.length + gear.length },
    { id: 'states', label: 'States' },
  ];

  const search = (
    <input
      type="search"
      className={isMobile ? 'gal-search gal-search--wide' : 'gal-search'}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Find a card by name or rule"
      aria-label="Find a card by name or rule"
      spellCheck={false}
      autoComplete="off"
    />
  );

  const card = (c: CardData, glow: 'gold' | null = null) => (
    <Fit key={c.id}>
      <button type="button" className="gal-card" aria-label={`${c.name} — open at full size`} onClick={() => setOpen(c.id)}>
        <CardFrame cardId={c.id} size="hand" glow={glow} style={{ cursor: 'zoom-in' }} />
      </button>
    </Fit>
  );

  const nothing = show !== 'states' && q && (show === 'icons' ? spells.length + gear.length : walk.length) === 0;

  return (
    <>
      <div className="gal-bar">
        <Segmented name="Show" value={show} onChange={setShow} options={options} scroll={isMobile} />
        {!isMobile && show !== 'states' && search}
      </div>
      {isMobile && show !== 'states' && search}

      {nothing && (
        <p className="gal-empty">
          No card matches “{query.trim()}”{show !== 'all' && ' in this view'}. Names and rules text are both searched.
        </p>
      )}

      {show !== 'icons' && show !== 'states' && (
        <>
          {wants('heroes') && heroes.length > 0 && (
            <Section title="Heroes" count={count(heroes.length, HEROES.length)} aside={!isMobile && 'Drawn as the board draws them: Bullet Power, level, health'}>
              <Grid min={isMobile ? 100 : 120} gap={isMobile ? 8 : 10}>
                {heroes.map((h) => (
                  <div key={h.id} style={{ aspectRatio: '3 / 4' }}>
                    <HeroSlot
                      card={mockHeroInstance(h)}
                      owner="0" myId="0" isOpponent={false}
                      pending={null} isTargetable={false}
                      isCurrentTurn={false}
                      compact
                      onTap={() => setOpen(h.id)}
                    />
                  </div>
                ))}
              </Grid>
            </Section>
          )}

          {wants('spells') && spells.length > 0 && (
            <Section title="Spells" count={count(spells.length, SPELLS.length)}>
              <CardGrid>{spells.map((s) => card(s))}</CardGrid>
            </Section>
          )}

          {wants('equipment') && gear.length > 0 && (
            <Section title="Equipment" count={count(gear.length, EQUIPMENT.length)} aside={!isMobile && 'Tier 3 wears the gold frame'}>
              {TIERS.map((t) => {
                const row = gear.filter((g) => g.tier === t);
                if (row.length === 0) return null;
                const all = EQUIPMENT.filter((g) => g.tier === t);
                return (
                  <Fragment key={t}>
                    <Sub title={`Tier ${t}`} note={`${costBand(all)} · ${count(row.length, all.length)}`} />
                    <CardGrid>{row.map((e) => card(e, e.tier === 3 ? 'gold' : null))}</CardGrid>
                  </Fragment>
                );
              })}
            </Section>
          )}

          {wants('ultimates') && ults.length > 0 && (
            <Section title="Ultimates" count={count(ults.length, ULTIMATES.length)}>
              <CardGrid>{ults.map((u) => card(u, 'gold'))}</CardGrid>
            </Section>
          )}
        </>
      )}

      {show === 'icons' && (
        <>
          <Caption>
            What a spell or a piece of equipment becomes once it is on the table: the same art in a round frame,
            with its type and rarity.
          </Caption>
          {([['Spells', spells, SPELLS.length], ['Equipment', gear, EQUIPMENT.length]] as const).map(([title, list, of]) => (
            list.length > 0 && (
              <Section key={title} title={title} count={count(list.length, of)}>
                <Grid min={isMobile ? 88 : 104} gap={isMobile ? 10 : 14}>
                  {list.map((c) => (
                    <button key={c.id} type="button" className="gal-icon" aria-label={`${c.name} — open at full size`} onClick={() => setOpen(c.id)}>
                      <RoundCardIcon cardId={c.id} size={isMobile ? 64 : 72} showName={false} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </Grid>
              </Section>
            )
          ))}
        </>
      )}

      {show === 'states' && <States />}

      <AnimatePresence>
        {open && CARDS_BY_ID[open] && (
          <CardLightbox
            ids={walk.includes(open) ? walk : [open]}
            id={open}
            onPick={setOpen}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** The looks a card takes on that are not its resting one. */
function States() {
  return (
    <>
      <Section title="Long-press preview">
        <Caption>
          Hold any card in a match to bring it up at this size (CardFrame size=&quot;full&quot;). The Gallery opens
          the same view on a tap.
        </Caption>
        <div className="gal-scroller gal-scroller--bleed">
          <CardFrame cardId="hero_haze" size="full" glow="accent" />
          <CardFrame cardId="ult_abrams" size="full" glow="gold" />
          <CardFrame cardId="metal_skin" size="full" />
        </div>
      </Section>

      <Section title="Unaffordable">
        <Caption>
          When the soul cost cannot be paid the hand card dims and its ink cost coin flips to warning red.
          Affordable, unaffordable as the hand draws it, and the red coin on its own.
        </Caption>
        <CardGrid pack="start" gap={14}>
          <Fit label="Affordable"><CardFrame cardId="metal_skin" size="hand" /></Fit>
          <Fit label="In hand">
            <div style={{ opacity: 0.42, filter: 'saturate(0.55)' }}>
              <CardFrame cardId="metal_skin" size="hand" unaffordable />
            </div>
          </Fit>
          <Fit label="Coin only"><CardFrame cardId="metal_skin" size="hand" unaffordable /></Fit>
        </CardGrid>
      </Section>
    </>
  );
}
