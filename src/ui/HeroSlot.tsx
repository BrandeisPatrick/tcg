import { motion } from 'framer-motion';
import type { CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { effectiveAtk } from '@/engine/util';
import { HeroPortrait } from '@/cards/art/heroArt';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { StatusIcon } from './StatusIcon';
import { SwordIcon, HeartIcon } from './Icons';
import { palette, fonts, radius, spring, text } from './tokens';

interface Props {
  card: CardInstance;
  owner: PlayerID;
  myId: PlayerID;
  isOpponent: boolean;
  pending: { iid: string; kind: 'playCard' | 'useSkill'; filter: string } | null;
  isTargetable: boolean;
  isCurrentTurn?: boolean;
  compact?: boolean;
  onTap: (c: CardInstance, owner: PlayerID) => void;
  onLongPress?: (c: CardInstance) => void;
  onEquipmentHover?: (eq: CardInstance | null) => void;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  attackPulse?: boolean;
  /** True if the local player has already used a skill this turn — suppresses the skill-ready glint on every own hero. */
  playerSkillSpent?: boolean;
}

export function HeroSlot({
  card, owner, myId, isOpponent, pending, isTargetable, isCurrentTurn, compact,
  onTap, onLongPress, onEquipmentHover, registerSlotRef, attackPulse, playerSkillSpent,
}: Props) {
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressFired = false;
  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') {
    return <div style={{ aspectRatio: '3 / 4', border: `1px dashed ${palette.border}`, borderRadius: radius.md }} />;
  }
  const isAlly = owner === myId;
  const atk = effectiveAtk(card);
  const lowHp = card.hp <= card.hpMax * 0.4;
  const isActive = card.zone === 'active';
  // Corpse: dead hero waiting to respawn in this slot.
  const respawnLeft = card.respawnTurnsLeft ?? 0;
  const isCorpse = respawnLeft > 0;
  // Skill-ready glint only shows when both per-hero and player-wide flags allow it.
  const skillReady = !isCorpse && isActive && isAlly && data.skill && !card.skillUsedThisTurn && !playerSkillSpent;
  const isArmedSource = !!pending && pending.kind === 'useSkill' && pending.iid === card.iid;
  const attached = isCorpse ? [] : (card.attached ?? []);
  const role = getHeroIdentity(card.cardId).role;

  const lungeY = attackPulse ? (isOpponent ? 14 : -14) : 0;

  // Visual focus: only the active hero whose player's turn it currently is gets
  // the brass halo. Everything else stays calm — mahogany frame on parchment.
  const isFocus = isActive && !!isCurrentTurn;
  const mahoganyFrame = '#5a3f1c';
  const warmShadow = '0 4px 12px rgba(40, 20, 0, 0.32), 0 1px 2px rgba(40, 20, 0, 0.18)';

  let border: string;
  let boxShadow: string;
  if (isTargetable) {
    border = `2px solid ${palette.success}`;
    boxShadow = `0 0 0 2px ${palette.success}, 0 0 28px ${palette.success}aa`;
  } else if (isArmedSource) {
    border = `2px solid ${palette.accent}`;
    boxShadow = `0 0 0 3px ${palette.accent}aa, 0 0 36px ${palette.accent}cc, ${warmShadow}`;
  } else if (isFocus) {
    border = `2px solid ${palette.accent}`;
    boxShadow = `0 0 0 1px ${palette.accent}88, 0 0 22px ${palette.accent}66, ${warmShadow}`;
  } else if (isActive) {
    border = `2px solid ${isAlly ? '#7a5c2a' : '#6a3530'}`;
    boxShadow = warmShadow;
  } else {
    border = `2px solid ${mahoganyFrame}`;
    boxShadow = warmShadow;
  }

  // Compact bench mode: smaller fonts, shorter body
  const nameSize = compact ? 10 : 13;
  const ribbonFontSize = compact ? 7 : 8.5;
  const statSize = compact ? 12 : 15;
  const iconSize = compact ? 11 : 13;
  const ribbonLetterSpacing = compact ? '0.12em' : '0.16em';
  const bodyPadding = compact ? '4px 6px 5px' : '5px 9px 6px';

  return (
    <motion.button
      layoutId={`hero-${card.iid}`}
      ref={(el) => registerSlotRef?.(card.iid, el)}
      onClick={() => { if (!pressFired) onTap(card, owner); pressFired = false; }}
      onPointerDown={() => {
        pressFired = false;
        if (onLongPress) {
          pressTimer = setTimeout(() => { pressFired = true; onLongPress(card); }, 420);
        }
      }}
      onPointerUp={() => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; } }}
      onPointerLeave={() => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; } }}
      animate={{ y: lungeY, scale: attackPulse ? 1.04 : 1 }}
      whileHover={isAlly && !attackPulse && !isCorpse ? { y: -4, scale: 1.015 } : undefined}
      transition={attackPulse ? { duration: 0.22, ease: [0.34, 1.56, 0.64, 1] } : spring.snappy}
      whileTap={isCorpse ? undefined : { scale: 0.97 }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: radius.lg,
        border,
        background: '#3a2810',   // dark mahogany frame, peeks at edges
        boxShadow,
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        color: palette.text,
        fontFamily: fonts.ui,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Art window — dark portrait, fills top portion */}
      <div style={{
        position: 'relative',
        flex: '1 1 auto',
        minHeight: 0,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(20,28,48,0.95), rgba(8,12,22,0.98))',
      }}>
        <div style={{
          width: '100%', height: '100%',
          filter: isCorpse ? 'grayscale(0.95) brightness(0.4) contrast(0.9)' : undefined,
          transition: 'filter 600ms ease',
        }}>
          <HeroPortrait cardId={card.cardId} full />
        </div>

        {/* Status pills row — top of portrait. While invincibility is on, the
            aura is the only indicator (other statuses are suppressed because
            they can't do anything until it expires). */}
        {!isCorpse && card.statuses.length > 0 && !card.statuses.some((s) => s.id === 'invincibility') && (
          <div style={{
            position: 'absolute', top: 6, left: 6, right: 6,
            display: 'flex', flexWrap: 'wrap', gap: 4,
            justifyContent: 'center',
            maxHeight: compact ? 36 : 54, overflow: 'hidden',
            pointerEvents: 'none',
          }}>
            {card.statuses.slice(0, compact ? 3 : 5).map((s, i) => (
              <StatusIcon key={i} id={s.id} value={s.value} duration={s.duration} size={compact ? 'compact' : 'normal'} />
            ))}
          </div>
        )}

        {/* Attached equipment chips — bottom-left of portrait, real item art */}
        {attached.length > 0 && (
          <div style={{
            position: 'absolute', left: 4, bottom: 4,
            display: 'flex', flexDirection: 'row', gap: 3,
          }}>
            {attached.slice(0, compact ? 3 : 4).map((eq) => (
              <div key={eq.iid}
                onMouseEnter={(e) => { e.stopPropagation(); onEquipmentHover?.(eq); }}
                onMouseLeave={(e) => { e.stopPropagation(); onEquipmentHover?.(null); }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: compact ? 18 : 24,
                  height: compact ? 18 : 24,
                  borderRadius: 4,
                  background: '#1a1208',
                  border: `1.5px solid ${palette.type.equipment.ribbon}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.55)',
                  overflow: 'hidden',
                  cursor: 'help',
                }} title={CARDS_BY_ID[eq.cardId]?.name}>
                <img src={`/items/${eq.cardId}.webp`} alt="" loading="lazy" decoding="async"
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
              </div>
            ))}
          </div>
        )}

        {/* Respawn overlay — corpse: skull + countdown, hero stays in slot but greyed */}
        {isCorpse && (
          <RespawnOverlay turnsLeft={respawnLeft} compact={!!compact} />
        )}

        {/* Skill ready glint — sweeps across portrait only (suppressed while armed) */}
        {!isCorpse && skillReady && !isArmedSource && (
          <motion.div
            aria-hidden
            initial={{ x: '-120%' }}
            animate={{ x: '120%' }}
            transition={{ repeat: Infinity, repeatDelay: 1.8, duration: 1.4, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: 0, bottom: 0, width: '40%',
              background: `linear-gradient(115deg, transparent 30%, ${palette.accent}66 50%, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Casting pulse — while this hero's skill is pending a target */}
        {isArmedSource && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0.25 }}
            animate={{ opacity: [0.25, 0.6, 0.25] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(ellipse at center, ${palette.accent}55, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Invincibility bubble — soft cyan-gold aura that pulses across the whole portrait */}
        {card.statuses.some((s) => s.id === 'invincibility') && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 0.65, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(circle at center, rgba(255,240,180,0.0) 35%, rgba(176,120,37,0.25) 60%, rgba(176,120,37,0.45) 78%, rgba(176,120,37,0.7) 100%)`,
              boxShadow: 'inset 0 0 24px rgba(255,235,180,0.5)',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Active indicator dot — brass when current-turn focus */}
        {isActive && (
          <div style={{
            position: 'absolute', top: 5, right: 5,
            width: 6, height: 6, borderRadius: '50%',
            background: isFocus ? palette.accent : 'rgba(255, 220, 160, 0.6)',
            boxShadow: isFocus ? `0 0 8px ${palette.accent}` : 'none',
          }} />
        )}
      </div>

      {/* Brass type ribbon: role */}
      <div style={{
        flexShrink: 0,
        padding: '2px 8px',
        background: `linear-gradient(90deg, ${palette.type.hero.ribbon}, ${palette.type.hero.ribbon}cc)`,
        color: '#fff',
        fontFamily: fonts.display,
        fontSize: ribbonFontSize,
        fontWeight: 700,
        letterSpacing: ribbonLetterSpacing,
        textTransform: 'uppercase',
        textAlign: 'left',
        borderBottom: `1px solid rgba(0,0,0,0.3)`,
        textShadow: '0 1px 1px rgba(0,0,0,0.3)',
      }}>
        {role}
      </div>

      {/* Cream body — name + stats row */}
      <div style={{
        flexShrink: 0,
        background: palette.card.body,
        color: palette.card.bodyText,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: bodyPadding,
        minHeight: 0,
      }}>
        <div style={{
          fontFamily: fonts.display,
          fontSize: nameSize,
          fontWeight: 700,
          letterSpacing: '0.02em',
          color: palette.card.bodyText,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.1,
        }}>
          {data.name}
        </div>
        <div style={{
          marginTop: 3,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: fonts.display, fontSize: statSize, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
        }}>
          <span style={{
            color: palette.atk,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            <SwordIcon size={iconSize} color={palette.atk} /> {atk}
          </span>
          <span style={{
            color: lowHp ? palette.danger : palette.hp,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            <HeartIcon size={iconSize} color={lowHp ? palette.danger : palette.hp} /> {card.hp}
            <span style={{
              opacity: 0.5,
              fontSize: Math.max(9, statSize - 4),
              fontWeight: 500,
              fontFamily: fonts.ui,
              marginLeft: 1,
            }}>/{card.hpMax}</span>
          </span>
        </div>
      </div>
    </motion.button>
  );
}

/**
 * Renders the in-slot respawn state: dim red wash, slow rotating sigil ring,
 * skull glyph, and the countdown badge. On the last turn (1T), it pulses faster
 * and brightens to signal "about to revive."
 */
function RespawnOverlay({ turnsLeft, compact }: { turnsLeft: number; compact: boolean }) {
  const isLast = turnsLeft === 1;
  const wash = isLast ? palette.success : palette.danger;
  const ringSize = compact ? 56 : 78;
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      gap: compact ? 6 : 10,
    }}>
      {/* Dim wash — sapphire/wine when waiting, soft success when about to revive */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isLast ? [0.30, 0.55, 0.30] : [0.18, 0.32, 0.18] }}
        transition={{ duration: isLast ? 0.9 : 2.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at center, ${wash}cc, ${wash}55 55%, transparent 85%)`,
        }}
      />
      {/* Slow rotating brass ring with tick marks (Deadlock "respawn clock" feel) */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: isLast ? 6 : 14, repeat: Infinity, ease: 'linear' }}
        style={{ position: 'relative', width: ringSize, height: ringSize }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <circle cx="50" cy="50" r="44" fill="none" stroke={palette.accent} strokeWidth="2" opacity="0.85" />
          <circle cx="50" cy="50" r="48" fill="none" stroke={palette.accent} strokeWidth="0.7" opacity="0.5" />
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 50 + Math.cos(rad) * 44;
            const y1 = 50 + Math.sin(rad) * 44;
            const x2 = 50 + Math.cos(rad) * 48;
            const y2 = 50 + Math.sin(rad) * 48;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={palette.accent} strokeWidth={deg % 90 === 0 ? 1.8 : 1} opacity="0.8" />;
          })}
        </svg>
      </motion.div>
      {/* Skull glyph in the center of the ring */}
      <div style={{
        position: 'absolute',
        width: ringSize * 0.5, height: ringSize * 0.5,
        opacity: 0.92,
      }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <path d="M50 14 C28 14 14 30 14 50 C14 62 20 71 28 76 L28 86 L42 86 L42 78 L58 78 L58 86 L72 86 L72 76 C80 71 86 62 86 50 C86 30 72 14 50 14 Z M34 46 C34 40 38 36 44 36 C50 36 54 40 54 46 C54 52 50 56 44 56 C38 56 34 52 34 46 Z M46 46 C46 50 50 54 56 54 C62 54 66 50 66 46 C66 42 62 38 56 38 C50 38 46 42 46 46 Z M44 64 L52 64 L52 72 L44 72 Z"
            fill="#f0e2c2" stroke="#1a1208" strokeWidth="2" />
        </svg>
      </div>
      {/* Countdown badge — RESPAWNING · 3T */}
      <div style={{
        position: 'absolute',
        bottom: compact ? 10 : 18,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: compact ? '3px 8px' : '4px 10px',
        background: 'rgba(8,12,22,0.85)',
        border: `1px solid ${palette.accent}aa`,
        borderRadius: 999,
        boxShadow: `0 0 12px ${wash}aa`,
        ...text.label, color: palette.accent,
      }}>
        <span>Respawn</span>
        <span style={{ ...text.numeric, color: '#ffd98a' }}>({turnsLeft})</span>
      </div>
    </div>
  );
}

