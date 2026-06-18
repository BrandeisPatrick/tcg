import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { palette, fonts, spring, text, shadow } from '../tokens';
import { loadPlayerData, savePlayerData, deleteDeck, setSelectedDeckIndex, MAX_DECKS, DECK_SIZE } from '@/storage/playerData';
import type { DeckSlot } from '@/storage/playerData';
import { CARDS_BY_ID } from '@/cards';
import { useViewport } from '../hooks/useViewport';

interface Props {
  onBack: () => void;
  onEditDeck: (slotIndex: number) => void;
}

export function DeckManagerScreen({ onBack, onEditDeck }: Props) {
  const { isMobile } = useViewport();
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
      padding: isMobile ? '24px 14px 40px' : '40px 64px 60px',
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
          fontSize: isMobile ? 28 : 36,
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
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? 16 : 24,
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

const BASE = import.meta.env.BASE_URL ?? '/';

function cardArtSrc(cardId: string): string | null {
  const data = CARDS_BY_ID[cardId];
  if (!data) return null;
  if (data.type === 'spell') return `${BASE}spells/${data.id}.webp`;
  if (data.type === 'equipment') return `${BASE}items/${data.id}.webp`;
  return null;
}

function typeTintGrad(cardId: string): { from: string; to: string } {
  const data = CARDS_BY_ID[cardId];
  if (!data) return palette.type.spell;
  return data.type === 'equipment' ? palette.type.equipment : palette.type.spell;
}

function CardThumb({ cardId, size = 44 }: { cardId: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = cardArtSrc(cardId);
  const tint = typeTintGrad(cardId);

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 6,
      overflow: 'hidden',
      flexShrink: 0,
      background: `linear-gradient(135deg, ${tint.from}, ${tint.to})`,
      border: `1px solid rgba(0,0,0,0.25)`,
      boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.06)',
      position: 'relative',
    }}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          draggable={false}
          style={{
            position: 'absolute',
            inset: -4,
            width: 'calc(100% + 8px)',
            height: 'calc(100% + 8px)',
            objectFit: 'cover',
            objectPosition: 'center 30%',
          }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.4,
          color: 'rgba(255,255,255,0.5)',
          fontWeight: 700,
        }}>
          ?
        </div>
      )}
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
          minHeight: 260,
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

  // Deduplicate cards into (cardId, count) pairs for the card list
  const cardCounts: { id: string; name: string; count: number; type: string }[] = [];
  const seen = new Map<string, number>();
  for (const cardId of deck.cards) {
    const existing = seen.get(cardId);
    if (existing !== undefined) {
      cardCounts[existing].count++;
    } else {
      const data = CARDS_BY_ID[cardId];
      seen.set(cardId, cardCounts.length);
      cardCounts.push({
        id: cardId,
        name: data?.name ?? cardId,
        count: 1,
        type: data?.type ?? 'spell',
      });
    }
  }

  const spellCount = deck.cards.filter(id => CARDS_BY_ID[id]?.type === 'spell').length;
  const equipCount = deck.cards.filter(id => CARDS_BY_ID[id]?.type === 'equipment').length;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={spring.snappy}
      style={{
        borderRadius: 10,
        background: palette.bg1,
        border: isSelected
          ? `2px solid ${palette.accent}`
          : `1px solid ${palette.borderStrong}`,
        boxShadow: isSelected ? shadow.glowAccent : shadow.sm,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 260,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Active badge */}
      {isSelected && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 20,
          padding: '4px 14px 5px',
          borderRadius: '0 0 6px 6px',
          background: palette.accent,
          color: '#fff',
          fontFamily: fonts.display,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          boxShadow: '0 2px 8px rgba(176,120,37,0.35)',
          zIndex: 2,
        }}>
          Active
        </div>
      )}

      {/* Header section */}
      <div style={{ padding: '20px 22px 0' }}>
        <div style={{
          fontFamily: fonts.display,
          fontSize: 22,
          color: palette.text,
          marginBottom: 6,
          lineHeight: 1.1,
        }}>
          {deck.name || `Deck ${index + 1}`}
        </div>

        <div style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <span style={{
            ...text.body,
            fontSize: 12,
            color: isValid ? palette.success : palette.danger,
            fontWeight: 700,
          }}>
            {cardCount}/{DECK_SIZE}
          </span>
          <span style={{ width: 1, height: 12, background: palette.borderStrong }} />
          <span style={{ ...text.body, fontSize: 11, color: palette.textDim }}>
            {spellCount} spells · {equipCount} items
          </span>
        </div>
      </div>

      {/* Card list with art thumbnails */}
      <div style={{
        flex: 1,
        padding: '0 22px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        overflow: 'hidden',
      }}>
        {cardCounts.slice(0, 6).map((entry) => {
          const typeColor = entry.type === 'equipment'
            ? palette.type.equipment.ribbon
            : palette.type.spell.ribbon;
          return (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '4px 8px 4px 4px',
                borderRadius: 6,
                background: palette.bg2,
                border: `1px solid ${palette.border}`,
                borderLeft: `3px solid ${typeColor}`,
              }}
            >
              <CardThumb cardId={entry.id} size={32} />
              <div style={{
                flex: 1,
                minWidth: 0,
                ...text.label,
                fontSize: 12,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {entry.name}
              </div>
              {entry.count > 1 && (
                <div style={{
                  ...text.label,
                  fontSize: 11,
                  color: palette.textDim,
                  background: palette.bg3,
                  borderRadius: 4,
                  padding: '1px 6px',
                  flexShrink: 0,
                }}>
                  ×{entry.count}
                </div>
              )}
            </div>
          );
        })}
        {cardCounts.length > 6 && (
          <div style={{
            ...text.body,
            fontSize: 11,
            color: palette.textFaint,
            textAlign: 'center',
            padding: '6px 0 2px',
            borderTop: `1px dashed ${palette.border}`,
            marginTop: 2,
          }}>
            +{cardCounts.length - 6} more
          </div>
        )}
      </div>

      {/* Buttons */}
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '14px 22px 18px',
        marginTop: 'auto',
        borderTop: `1px solid ${palette.border}`,
      }}>
        <motion.button
          onClick={onEdit}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={spring.snappy}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: `1px solid ${palette.borderStrong}`,
            borderRadius: 6,
            background: palette.bg2,
            cursor: 'pointer',
            fontFamily: fonts.ui,
            fontSize: 12,
            fontWeight: 700,
            color: palette.text,
            boxShadow: shadow.sm,
          }}
        >
          Edit
        </motion.button>
        {isValid && !isSelected ? (
          <motion.button
            onClick={onSelect}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={spring.snappy}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              borderRadius: 6,
              background: palette.accent,
              cursor: 'pointer',
              fontFamily: fonts.ui,
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              boxShadow: shadow.sm,
            }}
          >
            Select
          </motion.button>
        ) : isSelected ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...text.body,
            fontSize: 11,
            color: palette.textFaint,
          }}>
            In use
          </div>
        ) : null}
        <motion.button
          onClick={onDelete}
          whileHover={{ scale: 1.02, background: 'rgba(138,46,42,0.08)' }}
          whileTap={{ scale: 0.95 }}
          transition={spring.snappy}
          style={{
            padding: '10px 14px',
            border: `1px solid rgba(138,46,42,0.3)`,
            borderRadius: 6,
            background: 'transparent',
            cursor: 'pointer',
            fontFamily: fonts.ui,
            fontSize: 11,
            fontWeight: 700,
            color: palette.danger,
          }}
        >
          Delete
        </motion.button>
      </div>
    </motion.div>
  );
}
