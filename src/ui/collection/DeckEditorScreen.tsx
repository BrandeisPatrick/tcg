/**
 * Deck editor — fifteen cards, chosen from the pool. Reached only from the
 * Loadout sheet, and printed in the same poster idiom so the trip in doesn't
 * change materials: pool on the left, the deck itself on a darker ink column
 * to the right, both on one cream sheet.
 */
import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer, sheetStyle } from '../poster';
import { PosterBackdrop } from '../PosterBackdrop';
import { PosterButton } from '../chrome';
import { getDeck, saveDeck, DECK_SIZE, MAX_COPIES } from '@/storage/playerData';
import type { DeckSlot } from '@/storage/playerData';
import { SPELLS, EQUIPMENT, CARDS_BY_ID } from '@/cards';
import type { CardData } from '@/engine/types';
import { RoundCardIcon } from '../card/RoundCardIcon';
import { useViewport } from '../hooks/useViewport';
import { useSettings } from '@/storage/settings';

interface Props {
  slotIndex: number;
  onBack: () => void;
}

type Filter = 'all' | 'spell' | 'equipment';

export function DeckEditorScreen({ slotIndex, onBack }: Props) {
  const { isMobile } = useViewport();
  const { reducedMotion } = useSettings();
  const osReducedMotion = useReducedMotion();
  const ambient = !reducedMotion && !osReducedMotion;

  const existing = getDeck(slotIndex);
  const [name, setName] = useState(existing?.name ?? `Deck ${slotIndex + 1}`);
  const [cards, setCards] = useState<string[]>(existing?.cards ?? []);
  const [filter, setFilter] = useState<Filter>('all');

  const pool: CardData[] = filter === 'spell' ? SPELLS
    : filter === 'equipment' ? EQUIPMENT
    : [...SPELLS, ...EQUIPMENT];

  const countInDeck = (cardId: string) => cards.filter((c) => c === cardId).length;
  const isFull = cards.length >= DECK_SIZE;

  function addCard(cardId: string) {
    if (isFull || countInDeck(cardId) >= MAX_COPIES) return;
    setCards([...cards, cardId]);
  }

  function removeCard(index: number) {
    setCards(cards.filter((_, i) => i !== index));
  }

  function handleSave() {
    const deck: DeckSlot = {
      id: `deck_${slotIndex}`,
      name: name.trim() || `Deck ${slotIndex + 1}`,
      cards,
    };
    saveDeck(slotIndex, deck);
    onBack();
  }

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: isMobile ? 10 : 'clamp(14px, 3vh, 30px) clamp(14px, 3vw, 40px)',
        background: poster.ground,
        color: poster.ink,
        fontFamily: fonts.ui,
        overflowX: 'hidden',
      }}
    >
      <PosterBackdrop ambient={ambient} />

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        aria-label="Deck editor"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 1380,
          borderRadius: isMobile ? 18 : 28,
          overflow: 'hidden',
          ...sheetStyle,
        }}
      >
        {/* Header — back, name, count, save. */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 10 : 16,
            flexWrap: isMobile ? 'wrap' : 'nowrap',
            padding: isMobile ? '14px 14px 12px' : 'clamp(18px, 2.4vh, 26px) clamp(22px, 3vw, 38px) 16px',
            paddingRight: isMobile ? 50 : 60, // clear of the fixed system gear
            borderBottom: `1.5px solid ${poster.ink}`,
          }}
        >
          <PosterButton variant="paper" size="sm" onClick={onBack} ariaLabel="Discard changes and go back">
            ← Back
          </PosterButton>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Deck name"
            aria-label="Deck name"
            style={{
              flex: 1,
              minWidth: isMobile ? 130 : 180,
              maxWidth: isMobile ? undefined : 320,
              padding: '5px 2px 6px',
              border: 'none',
              borderBottom: `1.5px solid ${poster.inkDim}`,
              background: 'transparent',
              fontFamily: fonts.display,
              fontSize: isMobile ? 20 : 24,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              color: poster.ink,
              outline: 'none',
            }}
          />

          <span
            style={{
              ...text.label,
              fontSize: 13,
              letterSpacing: '0.14em',
              fontVariantNumeric: 'tabular-nums',
              color: isFull ? poster.ink : poster.red,
              flexShrink: 0,
            }}
          >
            {cards.length}/{DECK_SIZE}
          </span>

          <PosterButton variant="ink" size="sm" onClick={handleSave}>
            Save
          </PosterButton>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 330px',
            alignItems: 'start',
          }}
        >
          {/* Pool */}
          <div style={{ padding: isMobile ? '14px 14px 18px' : 'clamp(16px, 2vh, 22px) clamp(22px, 3vw, 38px) 30px' }}>
            <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
              {(['all', 'spell', 'equipment'] as Filter[]).map((f) => (
                <motion.button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  whileTap={{ scale: 0.96 }}
                  transition={spring.snappy}
                  style={{
                    padding: '6px 14px',
                    border: `1.5px solid ${filter === f ? poster.ink : poster.inkRule}`,
                    background: filter === f ? poster.ink : 'transparent',
                    color: filter === f ? poster.paper : poster.inkDim,
                    clipPath: chamfer(6),
                    WebkitClipPath: chamfer(6),
                    fontFamily: fonts.display,
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                    cursor: 'pointer',
                  }}
                >
                  {f === 'all' ? 'All' : f === 'spell' ? 'Spells' : 'Items'}
                </motion.button>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(268px, 1fr))',
                gap: 8,
              }}
            >
              {pool.map((card) => (
                <PoolCard
                  key={card.id}
                  card={card}
                  count={countInDeck(card.id)}
                  canAdd={countInDeck(card.id) < MAX_COPIES && !isFull}
                  onAdd={() => addCard(card.id)}
                />
              ))}
            </div>
          </div>

          {/* The deck itself — an ink column, so the thing you're building
              reads as a separate object from the pool you're building it from. */}
          <div
            style={{
              alignSelf: 'stretch',
              background: poster.ink,
              color: poster.cream,
              padding: isMobile ? '14px 14px 20px' : 'clamp(16px, 2vh, 22px) 18px 30px',
              minHeight: isMobile ? undefined : 420,
            }}
          >
            <div
              style={{
                fontFamily: fonts.display,
                fontSize: 15,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: poster.paper,
                paddingBottom: 10,
                marginBottom: 12,
                borderBottom: `1px solid ${poster.edge}`,
              }}
            >
              In the Deck
            </div>

            {cards.length === 0 ? (
              <div style={{ ...text.body, fontSize: 12, color: poster.creamDim, paddingTop: 20 }}>
                Tap cards on the left.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <AnimatePresence mode="popLayout">
                  {cards.map((cardId, i) => {
                    const data = CARDS_BY_ID[cardId];
                    return (
                      <motion.button
                        key={`${cardId}-${i}`}
                        type="button"
                        layout
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={spring.snappy}
                        onClick={() => removeCard(i)}
                        aria-label={`Remove ${data?.name ?? cardId}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          padding: '5px 8px 5px 5px',
                          border: `1px solid ${poster.edge}`,
                          background: poster.panel,
                          color: poster.cream,
                          clipPath: chamfer(5),
                          WebkitClipPath: chamfer(5),
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <RoundCardIcon cardId={cardId} size={26} showName={false} />
                        <span style={{ ...text.label, fontSize: 11, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {data?.name ?? cardId}
                        </span>
                        <span style={{ ...text.label, fontSize: 10, color: poster.creamDim, flexShrink: 0 }}>
                          {(data as { cost?: number } | undefined)?.cost ?? 0}
                        </span>
                        <span aria-hidden style={{ color: poster.red, fontSize: 13, lineHeight: 1, flexShrink: 0 }}>×</span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </motion.section>
    </div>
  );
}

function PoolCard({ card, count, canAdd, onAdd }: {
  card: CardData;
  count: number;
  canAdd: boolean;
  onAdd: () => void;
}) {
  const cost = (card as { cost?: number }).cost ?? 0;
  const tier = card.type === 'equipment' ? (card as { tier?: number }).tier : null;

  return (
    <motion.button
      type="button"
      onClick={canAdd ? onAdd : undefined}
      disabled={!canAdd}
      aria-label={`Add ${card.name}, ${count} of ${MAX_COPIES} in deck`}
      whileHover={canAdd ? { y: -2 } : undefined}
      whileTap={canAdd ? { scale: 0.98 } : undefined}
      transition={spring.snappy}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 12px',
        border: `1.5px solid ${count > 0 ? poster.ink : poster.inkRule}`,
        background: 'transparent',
        color: poster.ink,
        clipPath: chamfer(7),
        WebkitClipPath: chamfer(7),
        cursor: canAdd ? 'pointer' : 'default',
        opacity: canAdd ? 1 : 0.45,
        textAlign: 'left',
      }}
    >
      <RoundCardIcon cardId={card.id} size={36} showName={false} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontFamily: fonts.display,
            fontSize: 13,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {card.name}
        </span>
        {card.text && (
          <span
            style={{
              ...text.body,
              display: 'block',
              fontSize: 10.5,
              color: poster.inkDim,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 1,
            }}
          >
            {card.text}
          </span>
        )}
      </span>
      {/* Cost coin, then copies held. */}
      <span
        aria-hidden
        style={{
          ...text.label,
          fontSize: 11,
          flexShrink: 0,
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%',
          background: poster.gold,
          border: `1.5px solid ${poster.ink}`,
          color: poster.ink,
        }}
        title={tier ? `Tier ${tier} · cost ${cost}` : `Cost ${cost}`}
      >
        {cost}
      </span>
      <span
        aria-hidden
        style={{
          ...text.label,
          fontSize: 10,
          flexShrink: 0,
          minWidth: 22,
          textAlign: 'right',
          color: count > 0 ? poster.ink : poster.inkDim,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count}/{MAX_COPIES}
      </span>
    </motion.button>
  );
}
