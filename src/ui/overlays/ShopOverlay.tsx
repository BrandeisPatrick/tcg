import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ShopState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { RoundCardIcon } from '../card/RoundCardIcon';
import { fonts, spring } from '../tokens';

interface Props {
  shop: ShopState;
  me: PlayerID;
  onPick: (cardId: string) => void;
}

const RING_RADIUS = 170;
const ICON_SIZE = 130;
const ANGLES = [-90, 150, 30];

export function ShopOverlay({ shop, me, onPick }: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  const isMyShop = shop.forPlayer === me;

  if (!isMyShop) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1a1a22', fontFamily: fonts.display,
      }}>
        <span style={{ color: '#667', fontSize: 22, letterSpacing: 2 }}>
          OPPONENT SHOPPING...
        </span>
      </div>
    );
  }

  const focusedCardId = focused?.replace(/-\d+$/, '') ?? null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, #2a2a35 0%, #141418 70%)',
      overflow: 'hidden',
    }}>
      {/* Outer ring */}
      <div style={{
        position: 'absolute',
        width: RING_RADIUS * 2 + ICON_SIZE + 60,
        height: RING_RADIUS * 2 + ICON_SIZE + 60,
        borderRadius: '50%',
        border: '1.5px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 0 80px rgba(100,80,200,0.06)',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{
        position: 'absolute', top: '7%',
        textAlign: 'center', fontFamily: fonts.display,
      }}>
        <div style={{
          fontSize: 13, letterSpacing: 5, textTransform: 'uppercase',
          color: '#a89572', fontWeight: 700, marginBottom: 6,
        }}>
          SHOP · VISIT {shop.visit}
        </div>
        <div style={{
          fontSize: 36, fontWeight: 800, color: '#e8e0d0', letterSpacing: 2,
        }}>
          PICK {shop.round} OF 3
        </div>
      </div>

      {/* Revolver items */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`round-${shop.round}-${shop.choices.join(',')}`}
          initial={{ opacity: 0, scale: 0.8, rotate: -50 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.8, rotate: 50 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          style={{
            position: 'relative',
            width: RING_RADIUS * 2 + ICON_SIZE,
            height: RING_RADIUS * 2 + ICON_SIZE,
          }}
        >
          {shop.choices.map((cardId, i) => {
            const angle = (ANGLES[i] * Math.PI) / 180;
            const cx = Math.cos(angle) * RING_RADIUS;
            const cy = Math.sin(angle) * RING_RADIUS;
            const focusKey = cardId + '-' + i;
            const isFocused = focused === focusKey;
            const data = CARDS_BY_ID[cardId];

            return (
              <motion.div
                key={focusKey}
                onClick={() => setFocused(isFocused ? null : focusKey)}
                animate={isFocused ? { scale: 1.15 } : { scale: 1 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={spring}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  marginLeft: cx - ICON_SIZE / 2,
                  marginTop: cy - ICON_SIZE / 2 - 10,
                  cursor: 'pointer',
                }}
              >
                <RoundCardIcon cardId={cardId} size={ICON_SIZE} selected={isFocused} />

                {/* Effect text on focus */}
                <AnimatePresence>
                  {isFocused && data?.text && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      style={{
                        marginTop: 6,
                        fontFamily: fonts.ui,
                        fontSize: 11,
                        color: '#a89572',
                        lineHeight: 1.3,
                        textAlign: 'center',
                        maxWidth: ICON_SIZE + 30,
                        marginLeft: -(15),
                      }}
                    >
                      {data.text}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Pick button */}
      <div style={{ position: 'absolute', bottom: '9%' }}>
        <motion.button
          onClick={() => {
            if (focusedCardId) {
              onPick(focusedCardId);
              setFocused(null);
            }
          }}
          disabled={!focused}
          whileHover={focused ? { scale: 1.05 } : {}}
          whileTap={focused ? { scale: 0.95 } : {}}
          style={{
            padding: '14px 56px',
            border: focused ? '1px solid rgba(176,120,37,0.5)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            fontFamily: fonts.display,
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: 'uppercase',
            cursor: focused ? 'pointer' : 'default',
            color: focused ? '#fff' : '#665',
            background: focused
              ? 'linear-gradient(135deg, #b07825, #cc6630)'
              : 'rgba(255,255,255,0.05)',
            boxShadow: focused
              ? '0 4px 20px rgba(176,120,37,0.35)'
              : 'none',
            transition: 'all 0.3s',
          }}
        >
          {focusedCardId
            ? `PICK ${CARDS_BY_ID[focusedCardId]?.name ?? ''}`
            : 'SELECT A CARD'}
        </motion.button>
      </div>
    </div>
  );
}
