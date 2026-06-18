import { useState } from 'react';
import { motion } from 'framer-motion';
import { HEROES } from '@/cards';
import { CARDS_BY_ID } from '@/cards';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { palette, fonts, spring, text, shadow } from '../tokens';
import { getPreferredHeroes, savePreferredHeroes, MAX_PREFERRED_HEROES } from '@/storage/playerData';
import type { CardId } from '@/engine/types';
import { useViewport } from '../hooks/useViewport';

const HERO_IMG_BASE = `${import.meta.env.BASE_URL ?? '/'}heroes/`;

interface Props {
  onBack: () => void;
}

export function HeroPreferenceScreen({ onBack }: Props) {
  const { isMobile } = useViewport();
  const [slots, setSlots] = useState<(CardId | null)[]>(() => {
    const saved = getPreferredHeroes();
    while (saved.length < MAX_PREFERRED_HEROES) saved.push(null);
    return saved;
  });

  const selected = new Set(slots.filter(Boolean));

  function addHero(heroId: string) {
    const nextEmpty = slots.findIndex((s) => s === null);
    if (nextEmpty < 0) return;
    const next = [...slots];
    next[nextEmpty] = heroId;
    setSlots(next);
    savePreferredHeroes(next);
  }

  function removeSlot(index: number) {
    const next = [...slots];
    next[index] = null;
    setSlots(next);
    savePreferredHeroes(next);
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
          Preferred Heroes
        </div>
        <div style={{ ...text.body, color: palette.textDim, marginBottom: 32 }}>
          Set up to 4 heroes in priority order. During draft, these will be auto-picked first when available.
        </div>

        {/* Priority slots */}
        <div style={{
          display: 'flex',
          gap: isMobile ? 10 : 16,
          marginBottom: isMobile ? 28 : 40,
          justifyContent: 'center',
        }}>
          {slots.map((heroId, i) => (
            <PrioritySlot
              key={i}
              index={i}
              heroId={heroId}
              onRemove={() => removeSlot(i)}
              isMobile={isMobile}
            />
          ))}
        </div>

        {/* Hero grid */}
        <div style={{
          fontFamily: fonts.display,
          fontSize: 14,
          color: palette.textDim,
          marginBottom: 16,
        }}>
          Available Heroes ({HEROES.length})
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? 'repeat(auto-fill, minmax(84px, 1fr))'
            : 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: isMobile ? 8 : 12,
        }}>
          {HEROES.map((hero) => {
            const isSelected = selected.has(hero.id);
            const identity = getHeroIdentity(hero.id);
            return (
              <motion.button
                key={hero.id}
                onClick={() => !isSelected && addHero(hero.id)}
                disabled={isSelected}
                whileHover={!isSelected ? { y: -4, scale: 1.02 } : undefined}
                whileTap={!isSelected ? { scale: 0.97 } : undefined}
                transition={spring.snappy}
                style={{
                  padding: 0,
                  border: isSelected
                    ? `2px solid ${palette.accent}`
                    : `1px solid ${palette.border}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                  cursor: isSelected ? 'default' : 'pointer',
                  background: '#1a0f06',
                  opacity: isSelected ? 0.4 : 1,
                  aspectRatio: '3 / 4',
                  position: 'relative',
                }}
              >
                <img
                  src={`${HERO_IMG_BASE}${hero.id}_card.webp`}
                  alt=""
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: '50% 14%',
                    userSelect: 'none',
                  }}
                />
                <div style={{
                  position: 'absolute',
                  left: 0, right: 0, bottom: 0,
                  padding: '4px 6px',
                  background: `linear-gradient(to top, ${identity.accent}, transparent)`,
                  color: '#fff',
                  fontFamily: fonts.ui,
                  fontSize: 10,
                  fontWeight: 700,
                  textShadow: '0 1px 2px rgba(0,0,0,0.7)',
                  textAlign: 'center',
                }}>
                  {hero.name}
                </div>
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    top: 4, right: 4,
                    width: 20, height: 20,
                    borderRadius: '50%',
                    background: palette.accent,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: fonts.ui,
                  }}>
                    {slots.indexOf(hero.id) + 1}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PrioritySlot({ index, heroId, onRemove, isMobile }: {
  index: number;
  heroId: string | null;
  onRemove: () => void;
  isMobile: boolean;
}) {
  const data = heroId ? CARDS_BY_ID[heroId] : null;
  const identity = heroId ? getHeroIdentity(heroId) : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      <div style={{
        fontFamily: fonts.display,
        fontSize: 11,
        letterSpacing: '0.2em',
        color: palette.accent,
      }}>
        #{index + 1}
      </div>
      <motion.div
        layout
        style={{
          width: isMobile ? 74 : 100,
          height: isMobile ? 98 : 132,
          borderRadius: 8,
          overflow: 'hidden',
          border: heroId
            ? `2px solid ${palette.accent}`
            : `2px dashed ${palette.border}`,
          background: heroId ? '#1a0f06' : 'rgba(245,232,204,0.4)',
          cursor: heroId ? 'pointer' : 'default',
          position: 'relative',
          boxShadow: heroId ? shadow.md : 'none',
        }}
        onClick={heroId ? onRemove : undefined}
        whileHover={heroId ? { scale: 0.97 } : undefined}
        transition={spring.snappy}
      >
        {heroId ? (
          <>
            <img
              src={`${HERO_IMG_BASE}${heroId}_card.webp`}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: '50% 14%',
                userSelect: 'none',
              }}
            />
            <div style={{
              position: 'absolute',
              left: 0, right: 0, bottom: 0,
              padding: '4px 6px',
              background: `linear-gradient(to top, ${identity?.accent ?? '#000'}, transparent)`,
              color: '#fff',
              fontFamily: fonts.ui,
              fontSize: 10,
              fontWeight: 700,
              textShadow: '0 1px 2px rgba(0,0,0,0.7)',
              textAlign: 'center',
            }}>
              {data?.name}
            </div>
            <div style={{
              position: 'absolute',
              top: 4, right: 4,
              width: 18, height: 18,
              borderRadius: '50%',
              background: 'rgba(138,46,42,0.85)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: fonts.ui,
            }}>
              ×
            </div>
          </>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: palette.textFaint,
            fontFamily: fonts.ui,
            fontSize: 11,
            fontWeight: 700,
          }}>
            Empty
          </div>
        )}
      </motion.div>
    </div>
  );
}
