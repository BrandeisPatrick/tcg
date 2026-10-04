/**
 * The stop card — what a stop on the story map is, printed on a cream sheet
 * before anything happens: its route and number, the place, the kind and
 * state stickers, and for a fight who leads it and how hard it is. The one
 * button at the bottom is the only way in, so a tap on the map never starts
 * a fight by accident.
 *
 * A plain box: it fills whatever slot the map screen docks it in (a right
 * column on desktop, the bottom gutter on a phone).
 */
import { CARDS_BY_ID } from '@/cards';
import type { StoryRun, StoryNode } from '@/story/types';
import { stopFacts, type StopFacts } from '@/story/describe';
import { HeroBadge } from '@/cards/art/heroArt';
import { fonts, text } from '../tokens';
import { poster, sheetStyle } from '../poster';
import { PosterButton } from '../chrome';
import { KIND_INK, KIND_LABEL, StopGlyph, Sticker, FramedPortrait, eyebrow } from './StopGlyph';

/** The sticker each kind wears: fights in their red, the rest in ink. */
const STICKER_INK = {
  battle: poster.red,
  elite: poster.stat.spirit,
  boss: poster.redDeep,
  recruit: poster.ink,
  supply: poster.ink,
} as const;

const CTA = { battle: 'Fight ›', elite: 'Fight ›', boss: 'Fight ›', recruit: 'Recruit ›', supply: 'Open cache ›' } as const;

export function StopCard({ run, node, compact, onGo, onClose }: {
  run: StoryRun;
  node: StoryNode;
  compact: boolean;
  onGo: () => void;
  onClose: () => void;
}) {
  const f = stopFacts(run, node);
  const where = f.stopNumber === 0
    ? `${f.routeName} · where it starts`
    : `${f.routeName} · stop ${f.stopNumber} of ${f.routeStops}`;
  const pad = compact ? 14 : 18;
  // A cleared stop keeps the kind it was printed with: a recruit you took
  // before the roster filled should not turn into a cache in hindsight.
  const kind = f.state === 'cleared' ? node.kind : f.kind;

  return (
    <section
      aria-label={`${f.place}, ${KIND_LABEL[kind]}`}
      style={{
        ...sheetStyle,
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: compact ? 14 : 16,
        padding: `${compact ? 12 : 16}px ${pad}px ${pad}px`,
        color: poster.ink,
        fontFamily: fonts.ui,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 10 : 14,
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: compact ? 5 : 7, paddingRight: 34 }}>
        <span style={{ ...eyebrow, color: poster.inkDim }}>{where}</span>
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontWeight: 400,
            fontSize: compact ? 22 : 26,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            lineHeight: 1.02,
          }}
        >
          {f.place}
        </h2>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          <Sticker label={KIND_LABEL[kind]} ink={STICKER_INK[kind]} glyph={kind} small={compact} />
          {f.state === 'cleared' && <Sticker label="Cleared" ink={poster.ink} glyph="cleared" small={compact} />}
          {f.state === 'locked' && <Sticker label="Locked" ink={poster.ink} glyph="locked" outline small={compact} />}
        </span>
      </header>

      <CloseButton onClose={onClose} place={f.place} />

      {f.combat ? <CombatBody f={f} compact={compact} /> : <OfferBody f={f} run={run} compact={compact} />}

      {f.state === 'open' && (
        <PosterButton
          variant={f.combat ? 'red' : 'ink'}
          onClick={onGo}
          ariaLabel={f.combat ? `Fight at ${f.place}` : f.kind === 'recruit' ? `Recruit at ${f.place}` : `Open the cache at ${f.place}`}
          style={{ width: '100%', padding: compact ? '13px 18px' : '15px 24px' }}
        >
          {CTA[f.kind]}
        </PosterButton>
      )}
      {f.state === 'locked' && (
        <PosterButton
          disabled
          ariaLabel={f.lockedBy?.name ? `Locked. Clear ${f.lockedBy.name} first` : 'Locked'}
          style={{ width: '100%', padding: compact ? '12px 14px' : '14px 18px', fontSize: compact ? 12 : 13, letterSpacing: '0.16em', lineHeight: 1.2 }}
        >
          {f.lockedBy?.name ? `Clear ${f.lockedBy.name} first` : 'Locked'}
        </PosterButton>
      )}
    </section>
  );
}

function CloseButton({ onClose, place }: { onClose: () => void; place: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`Close ${place}`}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: poster.ink,
        cursor: 'pointer',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Who leads the fight, then its three numbers. */
function CombatBody({ f, compact }: { f: StopFacts; compact: boolean }) {
  const leader = f.leader ? CARDS_BY_ID[f.leader] : undefined;
  const edge = [f.buff.atk ? `+${f.buff.atk} ATK` : '', f.buff.hp ? `+${f.buff.hp} HP` : ''].filter(Boolean).join(' · ');
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 12 : 14 }}>
        <FramedPortrait hero={f.leader} w={compact ? 46 : 56} h={compact ? 60 : 72}>
          <StopGlyph kind="battle" color={poster.cream} size={compact ? 22 : 26} />
        </FramedPortrait>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ ...eyebrow, fontSize: 9.5, color: poster.inkDim }}>{leader ? 'Led by' : 'Facing'}</span>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: compact ? 17 : 19,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              lineHeight: 1.05,
            }}
          >
            {leader ? leader.name : 'A street crew'}
          </span>
          {f.kind === 'boss' && (
            <span style={{ ...text.body, fontSize: 11.5, color: poster.inkSoft, lineHeight: 1.3 }}>
              Beat them to take the route.
            </span>
          )}
        </span>
      </div>

      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'auto auto minmax(0, 1fr)',
          borderTop: `1.5px solid ${poster.ink}`,
          borderBottom: `1px solid ${poster.inkRule}`,
        }}
      >
        <Fact label="Foes" value={f.foes} compact={compact} />
        <Fact label="K.O.s to win" value={f.patronHp} compact={compact} rule />
        <Fact label="Their edge" value={edge || 'None'} compact={compact} rule small />
      </dl>
    </>
  );
}

function Fact({ label, value, compact, rule, small }: {
  label: string;
  value: number | string;
  compact: boolean;
  rule?: boolean;
  /** A worded value prints smaller so it fits the column. */
  small?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        // Label first for a reader, numeral on top for the eye; the
        // reversed column also sits every label on one baseline.
        flexDirection: 'column-reverse',
        justifyContent: 'flex-start',
        gap: 4,
        padding: compact ? '8px 12px 8px' : '10px 14px 10px',
        paddingLeft: rule ? (compact ? 12 : 14) : 0,
        borderLeft: rule ? `1px solid ${poster.inkRule}` : undefined,
        minWidth: 0,
      }}
    >
      <dt style={{ ...eyebrow, fontSize: 9, letterSpacing: '0.16em', color: poster.inkDim, whiteSpace: 'nowrap' }}>
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontFamily: fonts.display,
          fontSize: small ? (compact ? 15 : 16) : compact ? 24 : 28,
          lineHeight: 1,
          minHeight: compact ? 24 : 28,
          display: 'flex',
          alignItems: 'flex-end',
          letterSpacing: small ? '0.04em' : 0,
          textTransform: 'uppercase',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          color: small && value !== 'None' ? poster.red : poster.ink,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

/** A recruit or a cache: what is on offer, and what you already hold. */
function OfferBody({ f, run, compact }: { f: StopFacts; run: StoryRun; compact: boolean }) {
  const paysOut = f.node.kind === 'recruit' && f.kind === 'supply';
  const line = f.state === 'cleared'
    ? 'You have been here. Nothing is left to take.'
    : f.kind === 'recruit'
      ? 'Three heroes are waiting here. One joins you.'
      : 'A cache of three cards. One goes in your deck.';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 12 }}>
      <p style={{ ...text.body, margin: 0, fontSize: compact ? 13 : 14, color: poster.inkSoft }}>
        {line}
        {paysOut && f.state !== 'cleared' && (
          <> Your roster is full, so this stop pays out a card instead.</>
        )}
      </p>
      {f.kind === 'recruit' ? <RosterStrip run={run} /> : <DeckLine run={run} />}
    </div>
  );
}

/** Your four roster slots, small, with the count. */
function RosterStrip({ run }: { run: StoryRun }) {
  const slots = [0, 1, 2, 3];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingTop: 10,
        borderTop: `1px solid ${poster.inkRule}`,
      }}
      aria-label={`Roster ${run.heroes.length} of 4`}
    >
      <span style={{ ...eyebrow, fontSize: 9.5, color: poster.inkDim, marginRight: 4 }}>Roster</span>
      {slots.map((i) => {
        const id = run.heroes[i];
        return id ? (
          <span key={i} style={{ borderRadius: 7, border: `2px solid ${poster.you}`, display: 'block' }}>
            <HeroBadge cardId={id} size={30} />
          </span>
        ) : (
          <span
            key={i}
            aria-hidden
            style={{ width: 34, height: 34, borderRadius: 7, border: `1.5px dashed ${poster.inkFaint}`, boxSizing: 'border-box' }}
          />
        );
      })}
      <span style={{ ...text.label, fontSize: 12, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
        {run.heroes.length}/4
      </span>
    </div>
  );
}

function DeckLine({ run }: { run: StoryRun }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingTop: 10,
        borderTop: `1px solid ${poster.inkRule}`,
      }}
    >
      <StopGlyph kind="supply" color={KIND_INK.supply} size={16} />
      <span style={{ ...eyebrow, fontSize: 9.5, color: poster.inkDim }}>Your deck</span>
      <span style={{ ...text.label, fontSize: 12, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
        {run.deck.length} cards
      </span>
    </div>
  );
}
