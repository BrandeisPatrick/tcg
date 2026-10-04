/**
 * The story mode's three title sheets, printed on cream over the dimmed map:
 * the intro before a run (what the campaign is, and its three routes), the
 * win, and the loss. Each has one red way forward and a way back.
 *
 * `embedded` prints the sheet alone, in flow, for the Gallery.
 */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CARDS_BY_ID } from '@/cards';
import type { StoryRun } from '@/story/types';
import { REGIONS } from '@/story/campaign';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer, clipBoth, scrimStyle, sheetStyle } from '../poster';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';
import { FramedPortrait, StopGlyph, eyebrow } from './StopGlyph';

/** INK TAG eyebrow — black plate, cream stencil caps (the mulligan sheet's). */
const inkTag = {
  display: 'inline-block',
  alignSelf: 'flex-start',
  padding: '5px 10px',
  background: poster.ink,
  color: poster.paper,
  fontFamily: fonts.display,
  fontSize: 10.5,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  lineHeight: 1,
  ...clipBoth(chamfer(4)),
};

export function StorySheet({ run, onBegin, onExit, embedded = false }: {
  run: StoryRun | null;
  onBegin: () => void;
  onExit: () => void;
  embedded?: boolean;
}) {
  const { isMobile } = useViewport();
  const won = run?.status === 'won';
  const primary = !run ? 'Enter the city ›' : won ? 'New run ›' : 'Try again ›';

  const sheet = (
    <motion.section
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label={!run ? 'Streets of New York' : won ? 'Campaign won' : 'Run over'}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      style={{
        ...sheetStyle,
        position: 'relative',
        width: '100%',
        maxWidth: 640,
        margin: embedded ? 0 : 'auto',
        boxSizing: 'border-box',
        borderRadius: isMobile ? 16 : 22,
        padding: isMobile ? '20px 16px 18px' : '30px 36px 30px',
        color: poster.ink,
        fontFamily: fonts.ui,
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? 14 : 18,
      }}
    >
      {!run ? <Intro compact={isMobile} /> : <Outcome run={run} compact={isMobile} />}

      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column-reverse' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: 10,
          marginTop: 4,
          paddingTop: isMobile ? 14 : 18,
          borderTop: `1.5px solid ${poster.ink}`,
        }}
      >
        <PosterButton variant="paper" size={isMobile ? 'md' : 'sm'} onClick={onExit} ariaLabel="Back to the title screen">
          ← Back
        </PosterButton>
        <PosterButton variant="red" onClick={onBegin} style={{ minWidth: isMobile ? undefined : 220 }}>
          {primary}
        </PosterButton>
      </div>
    </motion.section>
  );

  if (embedded) return sheet;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        ...scrimStyle,
        zIndex: 58,
        overflowY: 'auto',
        // Phones: the top band stays clear of the System gear.
        padding: isMobile ? '64px 12px 16px' : '48px 32px',
        alignItems: 'flex-start',
      }}
    >
      {sheet}
    </motion.div>
  );
}

function Title({ children, color = poster.ink, compact }: { children: ReactNode; color?: string; compact: boolean }) {
  return (
    <h1
      style={{
        margin: 0,
        fontFamily: fonts.display,
        fontWeight: 400,
        fontSize: compact ? 28 : 46,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        lineHeight: 0.98,
        color,
      }}
    >
      {children}
    </h1>
  );
}

const Rule = () => <span aria-hidden style={{ display: 'block', width: 44, height: 3, background: poster.red }} />;

// ---- before a run --------------------------------------------------------------

function Intro({ compact }: { compact: boolean }) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
        <span
          style={{
            fontFamily: fonts.script,
            fontSize: compact ? 24 : 30,
            lineHeight: 1,
            transform: 'rotate(-3deg)',
            transformOrigin: 'left bottom',
            marginLeft: 4,
            paddingRight: 40,
          }}
        >
          Take the city, block by block
        </span>
        <Title compact={compact}>Streets of New York</Title>
      </div>
      <Rule />
      <p style={{ ...text.body, margin: 0, fontSize: compact ? 13.5 : 14.5, color: poster.inkSoft, maxWidth: 520 }}>
        Start with one hero and recruit up to four. Build a deck from what you find on the way.
        Three routes run out of the Battery, and each one ends at a boss. Every block is harder
        than the last.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ ...eyebrow, color: poster.inkDim, paddingBottom: 8 }}>Three routes</span>
        {REGIONS.map((r) => {
          const boss = r.locs.find((l) => l.kind === 'boss') ?? r.locs[r.locs.length - 1];
          const bossName = boss.enemy ? CARDS_BY_ID[boss.enemy]?.name : undefined;
          return (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: compact ? 12 : 16,
                padding: compact ? '9px 0' : '10px 0',
                borderTop: `1px solid ${poster.inkRule}`,
              }}
            >
              <FramedPortrait hero={boss.enemy} w={compact ? 42 : 48} h={compact ? 54 : 62} border={poster.red} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontFamily: fonts.display, fontSize: compact ? 17 : 20, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.05 }}>
                  {r.name}
                </span>
                <span style={{ ...text.body, fontSize: compact ? 12 : 13, color: poster.inkDim, lineHeight: 1.3 }}>
                  Ends at {boss.name}{bossName ? ` · ${bossName}` : ''}
                </span>
              </span>
              <span style={{ ...eyebrow, fontSize: 9.5, color: poster.inkDim, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {r.locs.length} stops
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---- after a run ---------------------------------------------------------------

function Outcome({ run, compact }: { run: StoryRun; compact: boolean }) {
  const won = run.status === 'won';
  const bosses = run.nodes.filter((n) => n.kind === 'boss');
  const bossesDown = bosses.filter((b) => run.clearedNodeIds.includes(b.id)).length;
  const last = run.currentNodeId ? run.nodes.find((n) => n.id === run.currentNodeId) : undefined;
  const line = won
    ? 'All three bosses are down. Every route out of the Battery is yours.'
    : last
      ? `The run ended after ${last.name ?? 'your last stop'}.`
      : 'The run ended at the Battery.';

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 12, paddingRight: 40 }}>
        <span style={inkTag}>{won ? 'Campaign won' : 'Run over'}</span>
        <Title compact={compact} color={won ? poster.ink : poster.red}>
          {won ? 'The city is yours' : 'Outflanked'}
        </Title>
      </div>
      <Rule />
      <p style={{ ...text.body, margin: 0, fontSize: compact ? 13.5 : 14.5, color: poster.inkSoft }}>{line}</p>

      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          borderTop: `1px solid ${poster.inkRule}`,
          borderBottom: `1px solid ${poster.inkRule}`,
        }}
      >
        <Fact label="Stops cleared" value={`${run.clearedNodeIds.length}/${run.nodes.length}`} compact={compact} />
        <Fact label="Bosses" value={`${bossesDown}/${bosses.length}`} compact={compact} rule />
        <Fact label="Deck" value={String(run.deck.length)} compact={compact} rule />
      </dl>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ ...eyebrow, color: poster.inkDim }}>Your roster</span>
        <div style={{ display: 'flex', gap: compact ? 8 : 12 }}>
          {[0, 1, 2, 3].map((i) => {
            const id = run.heroes[i];
            const w = compact ? 64 : 76, h = compact ? 84 : 100;
            return id ? (
              <figure key={id} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6, width: w }}>
                <FramedPortrait hero={id} w={w} h={h} border={poster.you} />
                <figcaption style={{ ...text.label, fontSize: 10, letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {CARDS_BY_ID[id]?.name ?? id}
                </figcaption>
              </figure>
            ) : (
              <span
                key={`empty-${i}`}
                aria-hidden
                style={{
                  width: w,
                  height: h,
                  boxSizing: 'border-box',
                  borderRadius: 8,
                  border: `1.5px dashed ${poster.inkFaint}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <StopGlyph kind="recruit" color={poster.inkFaint} size={22} />
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Fact({ label, value, compact, rule }: { label: string; value: string; compact: boolean; rule?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 5,
        padding: compact ? '10px 0 10px 12px' : '12px 0 12px 16px',
        paddingLeft: rule ? (compact ? 12 : 16) : 0,
        borderLeft: rule ? `1px solid ${poster.inkRule}` : undefined,
        minWidth: 0,
      }}
    >
      <dt style={{ ...eyebrow, fontSize: 9.5, letterSpacing: '0.16em', color: poster.inkDim, whiteSpace: 'nowrap' }}>{label}</dt>
      <dd style={{ margin: 0, fontFamily: fonts.display, fontSize: compact ? 26 : 32, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </dd>
    </div>
  );
}
