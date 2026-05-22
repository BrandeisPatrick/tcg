import { motion } from 'framer-motion';
import type { CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { effectiveAtk } from '@/engine/util';
import { HeroPortrait } from '@/cards/art/heroArt';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { StatusIcon } from '../card/StatusIcon';
import { SwordIcon, HeartIcon, ShieldIcon } from '../card/Icons';
import { palette, fonts, radius, spring, text, statRow } from '../tokens';
import { LevelRing } from '../card/LevelRing';
import { useStatTick } from './useStatTick';

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
  /** True if the local player has already used a skill this turn — suppresses the skill-ready glint on every own hero. */
  playerSkillSpent?: boolean;
}

export function HeroSlot({
  card, owner, myId, isOpponent, pending, isTargetable, isCurrentTurn, compact,
  onTap, onLongPress, onEquipmentHover, registerSlotRef, playerSkillSpent,
}: Props) {
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressFired = false;
  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') {
    return <div style={{ aspectRatio: '3 / 4', border: `1px dashed ${palette.border}`, borderRadius: radius.md }} />;
  }
  const isAlly = owner === myId;
  // Outgoing attack value as it will resolve in combat: effectiveAtk minus any
  // Weaken so the displayed BP matches what the hero actually swings for.
  // (combat.ts:effectiveAttackDamage applies the same subtraction.)
  const weakenValue = card.statuses.find((s) => s.id === 'weaken')?.value ?? 0;
  const atk = Math.max(0, effectiveAtk(card) - weakenValue);
  // Stat number stays in its own brand-colour family (brass for BP, vermillion
  // for HP) and only modulates intensity to show drift from the printed base:
  //   default → brand colour, buffed → bright shade, debuffed/damaged → grey.
  // Keeping the hue locked means a quick glance always identifies which stat
  // is which, while the intensity carries the state.
  const baseAtk = data.atk;
  const atkColor = atk > baseAtk ? palette.atkBright : atk < baseAtk ? palette.atkDim : palette.atk;
  const baseHp = data.hp;
  const hpColor =
    card.hp < card.hpMax ? palette.hpDim
    : card.hpMax > baseHp ? palette.hpBright
    : palette.hp;
  // Pulse the stat number on the card whenever its value changes — this
  // replaces the old floating ±N number above the card.
  const hpTick = useStatTick(card.hp);
  const bpTick = useStatTick(atk);
  const shieldValue = card.statuses.find((s) => s.id === 'shield')?.value ?? 0;
  const shieldTick = useStatTick(shieldValue);
  const isActive = card.zone === 'active';
  // Corpse: dead hero waiting to respawn in this slot.
  const respawnLeft = card.respawnTurnsLeft ?? 0;
  const isCorpse = respawnLeft > 0;
  // Skill-ready glint only shows when both per-hero and player-wide flags allow it.
  const skillReady = !isCorpse && isActive && isAlly && data.skill && !card.skillUsedThisTurn && !playerSkillSpent;
  const isArmedSource = !!pending && pending.kind === 'useSkill' && pending.iid === card.iid;
  const attached = isCorpse ? [] : (card.attached ?? []);
  // On the small in-game tile we only have room for the primary keyword.
  const role = getHeroIdentity(card.cardId).keywords[0] ?? 'Hero';

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

  // Compact bench mode: smaller stats + body; ribbon + name use the shared
  // text.label preset so they match every other panel label on the board.
  const statSize = compact ? 12 : 15;
  const iconSize = compact ? 11 : 13;
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
      whileHover={isAlly && !isCorpse ? { y: -4, scale: 1.015 } : undefined}
      transition={spring.snappy}
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

        {!isCorpse && card.statuses.length > 0 && (
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
                <img src={`${import.meta.env.BASE_URL}items/${eq.cardId}.webp`} alt="" loading="lazy" decoding="async"
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

        {card.statuses.some((s) => s.id === 'unstoppable') && (
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

        {!isCorpse && (
          <div style={{
            position: 'absolute', top: 5, right: 5,
            filter: isFocus ? `drop-shadow(0 0 6px ${palette.accent}aa)` : undefined,
          }}>
            <LevelRing
              level={card.level ?? 1}
              exp={card.exp ?? 0}
              size={compact ? 22 : 28}
            />
          </div>
        )}
      </div>

      {/* Type ribbon: role — uses the shared text.label preset (Inter 11px / 700)
          for typographic continuity with every other panel/zone label. */}
      <div style={{
        flexShrink: 0,
        padding: compact ? '3px 8px' : '4px 9px',
        background: `linear-gradient(180deg, ${palette.type.hero.ribbon}, ${palette.type.hero.ribbon}d8)`,
        color: '#fff',
        ...text.label,
        textAlign: 'left',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        borderBottom: '1px solid rgba(0,0,0,0.34)',
        textShadow: '0 1px 1px rgba(0,0,0,0.45)',
      }}>
        {role}
      </div>

      {/* Cream body — name + stats row. Name is text.label scale boosted one
          step so it reads as the headline above the smaller role ribbon. */}
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
          ...text.label,
          fontSize: compact ? 11 : 13,
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
        }}>
          {/* BP + HP numbers pulse + colour-flash on change. The icons stay
              static (brand-colour anchor) — only the value text animates. */}
          <span style={{ ...statRow.pair(statSize) }}>
            <SwordIcon size={iconSize} color={palette.atk} />
            <motion.span
              style={{ color: atkColor, display: 'inline-block' }}
              animate={bpTick
                ? { scale: [1, 1.35, 1],
                    color: [atkColor, bpTick === 'up' ? palette.atkBright : palette.atkDim, atkColor] }
                : { scale: 1, color: atkColor }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >{atk}</motion.span>
          </span>
          {shieldValue > 0 && (
            <span style={{ ...statRow.pair(statSize) }}>
              <ShieldIcon size={iconSize} color={palette.success} />
              <motion.span
                style={{ color: palette.success, display: 'inline-block' }}
                animate={shieldTick
                  ? { scale: [1, 1.4, 1],
                      color: [palette.success, shieldTick === 'down' ? '#9bd47a' : '#bff09e', palette.success] }
                  : { scale: 1, color: palette.success }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >{shieldValue}</motion.span>
            </span>
          )}
          <span style={{ ...statRow.pair(statSize) }}>
            <HeartIcon size={iconSize} color={palette.hp} />
            <motion.span
              style={{ color: hpColor, display: 'inline-block' }}
              animate={hpTick
                ? { scale: [1, 1.35, 1],
                    color: [hpColor, hpTick === 'up' ? palette.hpBright : palette.hpDim, hpColor] }
                : { scale: 1, color: hpColor }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >{card.hp}</motion.span>
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
      {/* Hourglass glyph in the center of the ring — "respawning" timer */}
      <div style={{
        position: 'absolute',
        width: ringSize * 0.5, height: ringSize * 0.5,
        opacity: 0.92,
      }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          {/* Top frame bar */}
          <rect x="18" y="14" width="64" height="6" rx="1.5"
            fill="#f0e2c2" stroke="#1a1208" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Glass body — two triangles meeting at a narrow neck */}
          <path
            d="M24 20 L76 20 L54 50 L76 80 L24 80 L46 50 Z"
            fill="#f0e2c2" stroke="#1a1208" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Sand pile at the bottom (the part that's already drained) */}
          <path
            d="M34 78 L66 78 L58 70 L42 70 Z"
            fill="#1a1208" opacity="0.55" />
          {/* Sand stream falling through the neck */}
          <line x1="50" y1="46" x2="50" y2="60"
            stroke="#1a1208" strokeWidth="2" strokeLinecap="round" />
          {/* Bottom frame bar */}
          <rect x="18" y="80" width="64" height="6" rx="1.5"
            fill="#f0e2c2" stroke="#1a1208" strokeWidth="2.5" strokeLinejoin="round" />
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
        <span style={{ ...text.label, color: '#ffd98a', fontVariantNumeric: 'tabular-nums' }}>({turnsLeft})</span>
      </div>
    </div>
  );
}

