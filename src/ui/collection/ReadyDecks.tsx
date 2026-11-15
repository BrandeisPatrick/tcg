/**
 * Ready decks — the Loadout's first row: five decks made to be picked and
 * played as they are (cards/readyDecks.ts), each a squad of four and its 16
 * items. "Use deck" saves both: the squad the draft hands you first and the
 * deck every match deals. When that would replace picks or a deck of your
 * own, the button asks once more before it does.
 */
import { useEffect, useState } from 'react';
import { cardName } from '@/cards';
import { READY_DECKS, type ReadyDeck } from '@/cards/readyDecks';
import type { CardId } from '@/engine/types';
import { HERO_IMG_BASE } from '@/art/assets';
import { fonts, text } from '../tokens';
import { poster } from '../poster';
import { PosterButton } from '../chrome';

/** The row's accessible name. */
export const READY_DECKS_LABEL = 'Ready decks';

export function ReadyDecks({ inUse, guarded, onUse, compact }: {
  /** The ready deck the saved squad and deck are, if they are one. */
  inUse: ReadyDeck | undefined;
  /** True when using a deck would replace picks or a deck the player made. */
  guarded: boolean;
  onUse: (deck: ReadyDeck) => void;
  compact: boolean;
}) {
  // The deck whose button has been pressed once and waits for the second press.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => { setArmed(null); }, [inUse?.id]);

  const press = (deck: ReadyDeck) => {
    if (guarded && armed !== deck.id) { setArmed(deck.id); return; }
    setArmed(null);
    onUse(deck);
  };

  return (
    <div
      role="group"
      aria-label={READY_DECKS_LABEL}
      style={{
        display: 'grid',
        gridAutoFlow: 'column',
        // A phone shows one deck and the edge of the next; a desktop sheet all five.
        gridAutoColumns: `minmax(${compact ? 232 : 200}px, 1fr)`,
        gap: compact ? 8 : 10,
        overflowX: 'auto',
        scrollSnapType: 'x proximity',
        paddingBottom: 8,
        // The row scrolls to the sheet's edge on a phone, not to its padding.
        marginRight: compact ? -14 : 0,
        paddingRight: compact ? 14 : 0,
      }}
    >
      {READY_DECKS.map((deck) => {
        const on = inUse?.id === deck.id;
        const asking = armed === deck.id;
        return (
          <article
            key={deck.id}
            aria-label={`${deck.name}${on ? ', in use' : ''}`}
            style={{
              scrollSnapAlign: 'start',
              display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
              padding: compact ? 10 : 12,
              background: poster.paperBand,
              borderRadius: 8,
              boxShadow: `inset 0 0 0 ${on ? 2 : 1.5}px ${on ? poster.soulInk : poster.ink}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h3 style={{
                margin: 0, flex: 1, minWidth: 0,
                fontFamily: fonts.display, fontWeight: 400, fontSize: 17, letterSpacing: '0.06em',
                textTransform: 'uppercase', lineHeight: 1.05, color: poster.ink,
              }}>{deck.name}</h3>
              {on && (
                <span style={{ ...text.label, fontSize: 10, letterSpacing: '0.14em', color: poster.soulInk, whiteSpace: 'nowrap' }}>In use</span>
              )}
            </div>

            <div aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}>
              {deck.heroes.map((h) => <Portrait key={h} heroId={h} />)}
            </div>
            <p style={{ ...text.label, margin: 0, fontSize: 10, letterSpacing: '0.08em', color: poster.inkDim, lineHeight: 1.3 }}>
              {deck.heroes.map((h) => cardName(h)).join(' · ')}
            </p>

            <p style={{ ...text.body, margin: 0, flex: 1, fontSize: 12.5, lineHeight: 1.35, color: poster.inkSoft }}>
              {asking ? 'This replaces your squad and your deck.' : deck.blurb}
            </p>

            <PosterButton
              variant={asking ? 'red' : on ? 'ink' : 'paper'}
              size="sm"
              disabled={on}
              onClick={() => press(deck)}
              ariaLabel={on ? `${deck.name} is your deck` : asking ? `Replace your squad and deck with ${deck.name}` : `Use the ready deck ${deck.name}`}
              style={{ width: '100%', padding: '9px 8px', letterSpacing: '0.16em' }}
            >
              {on ? 'In use' : asking ? 'Replace mine' : 'Use deck'}
            </PosterButton>
          </article>
        );
      })}
    </div>
  );
}

/** A squad member's face, square, as the roster crops it. */
function Portrait({ heroId }: { heroId: CardId }) {
  return (
    <span style={{ display: 'block', aspectRatio: '1 / 1', background: poster.frame, boxShadow: `inset 0 0 0 1px ${poster.ink}`, overflow: 'hidden', borderRadius: 3 }}>
      <img
        src={`${HERO_IMG_BASE}${heroId}_card.webp`}
        alt=""
        draggable={false}
        loading="lazy"
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 12%', filter: 'saturate(0.94) contrast(1.05)', userSelect: 'none' }}
      />
    </span>
  );
}
