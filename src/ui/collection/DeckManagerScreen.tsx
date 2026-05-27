import { useState } from 'react';
import { motion } from 'framer-motion';
import { palette, fonts, spring, text, shadow } from '../tokens';
import { loadPlayerData, savePlayerData, deleteDeck, setSelectedDeckIndex, MAX_DECKS, DECK_SIZE } from '@/storage/playerData';
import type { DeckSlot } from '@/storage/playerData';
import { CARDS_BY_ID } from '@/cards';
import { RoundCardIcon } from '../card/RoundCardIcon';

interface Props {
  onBack: () => void;
  onEditDeck: (slotIndex: number) => void;
}

export function DeckManagerScreen({ onBack, onEditDeck }: Props) {
  const [data, setData] = useState(() => loadPlayerData());

  function handleSelect(i: number) {
    setSelectedDeckIndex(i);
    setData(loadPlayerData());
  }

  function handleDelete(i: number) {
    deleteDeck(i);
    setData(loadPlayerData());
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: palette.bg0,
      color: palette.text,
      fontFamily: fonts.ui,
      padding: '40px 64px 60px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>
        <motion.button
          onClick={onBack}
          whileHover={{ x: -4 }}
          transition={spring.snappy}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: fonts.ui,
            fontSize: 13,
            fontWeight: 700,
            color: palette.accent,
            padding: '8px 0',
            marginBottom: 8,
          }}
        >
          ← Back
        </motion.button>

        <div style={{
          fontFamily: fonts.display,
          fontSize: 36,
          color: palette.text,
          marginBottom: 8,
        }}>
          Deck Manager
        </div>
        <div style={{ ...text.body, color: palette.textDim, marginBottom: 32 }}>
          Build decks of {DECK_SIZE} spells and equipment. Select a deck before starting a match.
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {Array.from({ length: MAX_DECKS }).map((_, i) => {
            const deck = data.decks[i];
            const isSelected = data.selectedDeckIndex === i;
            return (
              <DeckCard
                key={i}
                index={i}
                deck={deck}
                isSelected={isSelected}
                onEdit={() => onEditDeck(i)}
                onSelect={() => handleSelect(i)}
                onDelete={() => handleDelete(i)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DeckCard({ index, deck, isSelected, onEdit, onSelect, onDelete }: {
  index: number;
  deck: DeckSlot | null;
  isSelected: boolean;
  onEdit: () => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  if (!deck) {
    return (
      <motion.button
        onClick={onEdit}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        transition={spring.snappy}
        style={{
          padding: 28,
          border: `2px dashed ${palette.border}`,
          borderRadius: 10,
          background: 'rgba(245,232,204,0.4)',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          minHeight: 200,
        }}
      >
        <div style={{
          width: 48, height: 48,
          borderRadius: '50%',
          border: `2px dashed ${palette.textFaint}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          color: palette.textFaint,
        }}>
          +
        </div>
        <div style={{
          fontFamily: fonts.display,
          fontSize: 14,
          color: palette.textDim,
        }}>
          New Deck
        </div>
        <div style={{ ...text.body, color: palette.textFaint, fontSize: 11 }}>
          Slot {index + 1}
        </div>
      </motion.button>
    );
  }

  const cardCount = deck.cards.length;
  const isValid = cardCount === DECK_SIZE;
  const previewCards = deck.cards.slice(0, 5);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={spring.snappy}
      style={{
        padding: 20,
        border: isSelected
          ? `2px solid ${palette.accent}`
          : `1px solid ${palette.border}`,
        borderRadius: 10,
        background: palette.bg1,
        boxShadow: isSelected ? shadow.glowAccent : shadow.sm,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 200,
        position: 'relative',
      }}
    >
      {isSelected && (
        <div style={{
          position: 'absolute',
          top: -10,
          right: 14,
          padding: '3px 12px',
          borderRadius: 999,
          background: palette.accent,
          color: '#fff',
          fontFamily: fonts.ui,
          fontSize: 10,
          fontWeight: 700,
        }}>
          Active
        </div>
      )}

      <div style={{
        fontFamily: fonts.display,
        fontSize: 18,
        color: palette.text,
      }}>
        {deck.name || `Deck ${index + 1}`}
      </div>

      <div style={{
        ...text.body,
        color: isValid ? palette.success : palette.danger,
        fontSize: 11,
      }}>
        {cardCount}/{DECK_SIZE} cards
      </div>

      {previewCards.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {previewCards.map((cardId, i) => (
            <RoundCardIcon key={`${cardId}-${i}`} cardId={cardId} size={36} />
          ))}
          {deck.cards.length > 5 && (
            <div style={{
              width: 36, height: 36,
              borderRadius: '50%',
              background: palette.bg3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: fonts.ui,
              fontSize: 10,
              fontWeight: 700,
              color: palette.textDim,
            }}>
              +{deck.cards.length - 5}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          onClick={onEdit}
          style={{
            flex: 1,
            padding: '8px 14px',
            border: `1px solid ${palette.border}`,
            borderRadius: 6,
            background: palette.bg2,
            cursor: 'pointer',
            fontFamily: fonts.ui,
            fontSize: 12,
            fontWeight: 700,
            color: palette.text,
          }}
        >
          Edit
        </button>
        {isValid && !isSelected && (
          <button
            onClick={onSelect}
            style={{
              flex: 1,
              padding: '8px 14px',
              border: 'none',
              borderRadius: 6,
              background: palette.accent,
              cursor: 'pointer',
              fontFamily: fonts.ui,
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            Select
          </button>
        )}
        <button
          onClick={onDelete}
          style={{
            padding: '8px 12px',
            border: `1px solid ${palette.danger}`,
            borderRadius: 6,
            background: 'transparent',
            cursor: 'pointer',
            fontFamily: fonts.ui,
            fontSize: 12,
            fontWeight: 700,
            color: palette.danger,
          }}
        >
          ×
        </button>
      </div>
    </motion.div>
  );
}
