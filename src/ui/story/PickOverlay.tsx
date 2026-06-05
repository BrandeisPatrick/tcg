import { motion } from 'framer-motion';
import type { CardId } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroPortrait } from '@/cards/art/heroArt';
import { palette, fonts, text, spring, shadow, radius, typeTint } from '../tokens';

interface PickOverlayProps {
  kind: 'hero' | 'card';
  title: string;
  subtitle?: string;
  options: CardId[];
  onPick: (id: CardId) => void;
  onCancel?: () => void;
}

export function PickOverlay({ kind, title, subtitle, options, onPick, onCancel }: PickOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(20,12,2,0.78), rgba(20,12,2,0.92))',
        fontFamily: fonts.ui, padding: 24,
      }}
      onClick={() => onCancel?.()}
    >
      <motion.h2
        initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.soft}
        style={{
          fontFamily: fonts.display, fontSize: 28, color: palette.bg1, margin: 0,
          letterSpacing: '0.04em', textShadow: '0 2px 12px rgba(0,0,0,0.5)',
        }}
      >{title}</motion.h2>
      {subtitle && (
        <div style={{ ...text.body, color: palette.textFaint, marginTop: 6, marginBottom: 26 }}>{subtitle}</div>
      )}

      <div
        style={{ display: 'flex', gap: 22, marginTop: subtitle ? 0 : 26, flexWrap: 'wrap', justifyContent: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((id, i) => (
          <motion.button
            key={id + i}
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...spring.default, delay: 0.08 + i * 0.08 }}
            whileHover={{ y: -8, scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onPick(id)}
            style={{
              cursor: 'pointer', border: 'none', background: 'transparent', padding: 0,
            }}
            aria-label={`Choose ${CARDS_BY_ID[id]?.name ?? id}`}
          >
            {kind === 'hero' ? <HeroChoice id={id} /> : <CardChoice id={id} />}
          </motion.button>
        ))}
      </div>

      {onCancel && (
        <button
          onClick={() => onCancel()}
          style={{
            marginTop: 28, background: 'transparent', border: `1px solid ${palette.textFaint}`,
            color: palette.bg1, padding: '8px 22px', borderRadius: radius.pill,
            fontFamily: fonts.ui, fontSize: 12, cursor: 'pointer',
          }}
        >Back</button>
      )}
    </motion.div>
  );
}

function HeroChoice({ id }: { id: CardId }) {
  const data = CARDS_BY_ID[id];
  return (
    <div style={{
      width: 196, borderRadius: radius.lg, overflow: 'hidden',
      background: palette.bg2, border: `2px solid ${palette.accent}`,
      boxShadow: shadow.lg,
    }}>
      <div style={{ height: 224, overflow: 'hidden' }}>
        <HeroPortrait cardId={id} size={196} variant="card" />
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ ...text.label, fontSize: 14, color: palette.text }}>{data?.name ?? id}</div>
        {data?.type === 'hero' && (
          <div style={{ ...text.body, fontSize: 11, color: palette.textDim, marginTop: 3 }}>
            BP {data.atk} · HP {data.hp}{data.abilityName ? ` · ${data.abilityName}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

function CardChoice({ id }: { id: CardId }) {
  const data = CARDS_BY_ID[id];
  const t = data?.type === 'spell' || data?.type === 'equipment' ? data.type : 'spell';
  const tint = typeTint(t);
  const cost = data && 'cost' in data ? data.cost : undefined;
  return (
    <div style={{
      width: 196, minHeight: 260, borderRadius: radius.lg,
      background: palette.card.body, border: `2px solid ${tint.ribbon}`,
      boxShadow: shadow.lg, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        background: tint.ribbon, color: '#fff', padding: '8px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ ...text.label, color: '#fff' }}>{data?.name ?? id}</span>
        {cost != null && (
          <span style={{
            ...text.label, color: '#fff', background: 'rgba(0,0,0,0.28)',
            borderRadius: radius.pill, padding: '1px 8px', minWidth: 18, textAlign: 'center',
          }}>{cost}</span>
        )}
      </div>
      <div style={{ padding: '12px 13px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{
          ...text.body, fontSize: 10, color: tint.ribbon, textTransform: 'uppercase',
          letterSpacing: '0.12em', fontWeight: 700,
        }}>{t}</span>
        <span style={{ ...text.body, fontSize: 12, color: palette.card.bodyText, lineHeight: 1.4 }}>
          {data?.text ?? ''}
        </span>
      </div>
    </div>
  );
}
