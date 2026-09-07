import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { CardInstance, PlayerID } from '@/engine/types';
import { DamageFlash } from '../effects/DamageFlash';
import { useDamageFx } from '../effects/DamageFxContext';
import { CARDS_BY_ID } from '@/cards';
import { effectiveAtk } from '@/engine/util';
import { HeroPortrait, HeroBadge } from '@/cards/art/heroArt';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { StatusIcon } from '../card/StatusIcon';
import { SwordIcon, HeartIcon, ShieldIcon } from '../card/Icons';
import { fonts, spring, text, statRow } from '../tokens';
import { poster } from '../poster';
import { LevelRing } from '../card/LevelRing';
import { useStatTick } from './useStatTick';

/**
 * The in-match hero tile, printed flat in the poster idiom: a charcoal frame
 * around an edge-to-edge portrait, an ink role band and a cream label band
 * carrying the name and the BP / Shield / HP row. One component renders both
 * the large Active tile and the `compact` Bench tile.
 */

// One dark drop under every tile — the print floats a hair off the sheet.
const TILE_SHADOW = '0 14px 26px rgba(0, 0, 0, 0.35), 0 3px 8px rgba(0, 0, 0, 0.25)';
// The frame's inner edge — the portrait sits slightly recessed in the charcoal.
const PRINT_EDGE = 'inset 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 -18px 24px -12px rgba(0, 0, 0, 0.5)';

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
  card, owner, myId, pending, isTargetable, isCurrentTurn, compact,
  onTap, onLongPress, onEquipmentHover, registerSlotRef, playerSkillSpent,
}: Props) {
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressFired = false;
  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') {
    return <div style={{ aspectRatio: '3 / 4', border: `1.5px dashed ${poster.inkFaint}`, borderRadius: 10 }} />;
  }
  const isAlly = owner === myId;
  // Outgoing attack value as it will resolve in combat: effectiveAtk minus any
  // Weaken so the displayed BP matches what the hero actually swings for.
  // (combat.ts:effectiveAttackDamage applies the same subtraction.)
  const weakenValue = card.statuses.find((s) => s.id === 'weapon_power_down')?.value ?? 0;
  const atk = Math.max(0, effectiveAtk(card) - weakenValue);
  // Stat inks stay in their own family (BP ink, HP red) and only shift shade
  // to show drift from the printed base: default → the stat ink, buffed →
  // bright, debuffed/damaged → dim grey. A locked hue means a glance always
  // identifies which stat is which; the shade carries the state.
  const baseAtk = data.atk;
  const atkColor = atk > baseAtk ? poster.stat.atkBright : atk < baseAtk ? poster.stat.atkDim : poster.stat.atk;
  const baseHp = data.hp;
  const hpColor =
    card.hp < card.hpMax ? poster.stat.hpDim
    : card.hpMax > baseHp ? poster.stat.hpBright
    : poster.stat.hp;
  // Pulse the stat number on the card whenever its value changes — this
  // replaces the old floating ±N number above the card.
  const hpTick = useStatTick(card.hp);
  const bpTick = useStatTick(atk);
  const shieldValue = card.statuses.find((s) => s.id === 'shield')?.value ?? 0;
  const shieldTick = useStatTick(shieldValue);
  const damageFx = useDamageFx(card.iid);
  const isActive = card.zone === 'active';
  // Corpse: dead hero waiting to respawn in this slot.
  const respawnLeft = card.respawnTurnsLeft ?? 0;
  const isCorpse = respawnLeft > 0;
  // Skill-ready glint only shows when both per-hero and player-wide flags allow it.
  // Bench-only heroes (Rem) cast from the bench, so they glint there too.
  const skillReady = !isCorpse && isAlly && !!data.skill && !card.skillUsedThisTurn && !playerSkillSpent
    && (isActive || !!data.flags?.benchOnly);
  const isArmedSource = !!pending && pending.kind === 'useSkill' && pending.iid === card.iid;
  const attached = isCorpse ? [] : (card.attached ?? []);
  // On the small in-game tile we only have room for the primary keyword; the
  // identity colour keys the role band's left edge, as the draft dossier does.
  const identity = getHeroIdentity(card.cardId);
  const role = identity.keywords[0] ?? 'Hero';

  // Frame states, in priority order. The poster is flat print: a state is a
  // border colour plus an inset ring, never an outer glow. The owner colour
  // keys the lane — gold for you, red for the rival; bench tiles rest on
  // charcoal.
  const isFocus = isActive && !!isCurrentTurn;
  const ownerColor = isAlly ? poster.you : poster.rival;
  let borderColor: string;
  let boxShadow: string;
  if (isTargetable) {
    borderColor = poster.target;
    boxShadow = `inset 0 0 0 2px ${poster.target}, ${TILE_SHADOW}`;
  } else if (isArmedSource) {
    borderColor = poster.red;
    boxShadow = `inset 0 0 0 2px ${poster.red}, ${TILE_SHADOW}`;
  } else if (isFocus) {
    borderColor = ownerColor;
    boxShadow = `inset 0 0 0 2px ${ownerColor}, ${TILE_SHADOW}`;
  } else if (isActive) {
    borderColor = ownerColor;
    boxShadow = TILE_SHADOW;
  } else {
    borderColor = poster.edge;
    boxShadow = TILE_SHADOW;
  }
  // A resting frame lightens on hover; a state-coloured frame keeps its signal.
  const restingFrame = borderColor === poster.edge;
  // Soft pulse behind the portrait: green while this tile is a legal target,
  // red while its own skill is armed and waiting for one.
  const pulse = isTargetable ? poster.target : isArmedSource ? poster.red : null;

  // Compact bench mode: smaller stats, bands and body.
  const statSize = compact ? 12 : 15;
  const iconSize = compact ? 11 : 13;
  const bodyPadding = compact ? '4px 6px 5px' : '5px 9px 6px';

  return (
    <motion.button
      layoutId={`hero-${card.iid}`}
      ref={(el) => registerSlotRef?.(card.iid, el)}
      aria-label={isCorpse
        ? `${data.name} — down, respawns in ${respawnLeft} turn${respawnLeft === 1 ? '' : 's'}`
        : `${data.name} — ${atk} attack, ${card.hp} health`}
      onClick={() => { if (!pressFired) onTap(card, owner); pressFired = false; }}
      onPointerDown={() => {
        pressFired = false;
        if (onLongPress) {
          pressTimer = setTimeout(() => { pressFired = true; onLongPress(card); }, 420);
        }
      }}
      onPointerUp={() => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; } }}
      onPointerLeave={() => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; } }}
      whileHover={isAlly && !isCorpse
        ? { y: -4, scale: 1.015, ...(restingFrame ? { borderColor: poster.frameLit } : {}) }
        : undefined}
      transition={spring.snappy}
      whileTap={isCorpse ? undefined : { scale: 0.97 }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        // Rounded, not chamfered: DamageFlash inherits this radius and the
        // combat choreographer clips its overlays to it.
        borderRadius: 10,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor,
        background: poster.frame,   // charcoal frame, peeks at the edges
        boxShadow,
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        color: poster.cream,
        fontFamily: fonts.ui,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* "Card got hit" flash — type-coloured, clipped to the card. Keyed by the
          hit's seq so each new hit replays the animation. */}
      {damageFx && <DamageFlash key={damageFx.seq} type={damageFx.type} ko={damageFx.ko} />}

      {/* Art window — the portrait printed edge to edge on a dark ground;
          a corpse is greyed and dimmed. */}
      <div style={{
        position: 'relative',
        flex: '1 1 auto',
        minHeight: 0,
        overflow: 'hidden',
        background: '#0f1214',
      }}>
        <div style={{
          width: '100%', height: '100%',
          filter: isCorpse ? 'grayscale(0.95) brightness(0.4) contrast(0.9)' : undefined,
          transition: 'filter 600ms ease',
        }}>
          <HeroPortrait cardId={card.cardId} full />
        </div>
        {/* Inner edge — the print sits slightly recessed in its frame. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, boxShadow: PRINT_EDGE, pointerEvents: 'none' }} />

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

        {/* Attached chips — bottom-left of portrait. Equipment shows item art;
            a merged hero (Rem · Lil Helpers) shows her portrait + turn countdown. */}
        {attached.length > 0 && (
          <div style={{
            position: 'absolute', left: 4, bottom: 4,
            display: 'flex', flexDirection: 'row', gap: 3,
          }}>
            {attached.slice(0, compact ? 3 : 4).map((eq) => {
              const eqData = CARDS_BY_ID[eq.cardId];
              const isMerged = eqData?.type === 'hero'; // Rem merged in
              const dim = compact ? 18 : 24;
              return (
                <div key={eq.iid}
                  onMouseEnter={(e) => { e.stopPropagation(); onEquipmentHover?.(eq); }}
                  onMouseLeave={(e) => { e.stopPropagation(); onEquipmentHover?.(null); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'relative',
                    width: dim,
                    height: dim,
                    borderRadius: 4,
                    background: poster.frame,
                    border: `1.5px solid ${isMerged ? poster.green : poster.cream}`,
                    overflow: 'hidden',
                    cursor: 'help',
                  }}
                  title={isMerged
                    ? `${eqData?.name} merged — ${eq.remMergeTurnsLeft ?? 0} turn(s) left`
                    : eqData?.name}>
                  {isMerged ? (
                    <HeroBadge cardId={eq.cardId} size={dim} />
                  ) : (
                    <img src={`${import.meta.env.BASE_URL}items/${eq.cardId}.webp`} alt="" loading="lazy" decoding="async"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                  )}
                  {/* Merge countdown (Rem) — green sticker, mirrors the charge pill. */}
                  {isMerged && eq.remMergeTurnsLeft != null && (
                    <span aria-label={`${eq.remMergeTurnsLeft} turns left`} style={{
                      ...chipPill(compact),
                      background: poster.green,
                    }}>{eq.remMergeTurnsLeft}</span>
                  )}
                  {/* Charge counter — consumable gear (cooldown→draw family) only.
                      Ink sticker that turns red on the last charge. */}
                  {!isMerged && eq.charges != null && (
                    <span aria-label={`${eq.charges} charges left`} style={{
                      ...chipPill(compact),
                      background: eq.charges <= 1 ? poster.red : poster.ink,
                    }}>{eq.charges}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Respawn overlay — corpse: clock ring + countdown, hero stays in slot but greyed */}
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
              background: `linear-gradient(115deg, transparent 30%, ${poster.you}66 50%, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* State pulse — green while this tile is a legal target, red while
            its own skill is armed and waiting for one. */}
        {pulse && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0.25 }}
            animate={{ opacity: [0.25, 0.6, 0.25] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(ellipse at center, ${pulse}55, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Unstoppable aura — a breathing gold vignette around the portrait */}
        {card.statuses.some((s) => s.id === 'unstoppable') && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 0.65, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(circle at center, transparent 35%, ${poster.you}40 60%, ${poster.you}73 78%, ${poster.you}b3 100%)`,
              boxShadow: `inset 0 0 24px ${poster.you}80`,
              pointerEvents: 'none',
            }}
          />
        )}

        {!isCorpse && (
          <div style={{ position: 'absolute', top: 5, right: 5 }}>
            <LevelRing
              level={card.level ?? 1}
              exp={card.exp ?? 0}
              size={compact ? 22 : 28}
            />
          </div>
        )}
      </div>

      {/* Role band — an ink tag printed across the tile, keyed at its left
          edge by the hero's identity colour (as the draft dossier does). */}
      <div style={{
        flexShrink: 0,
        padding: compact ? '3px 8px' : '4px 9px',
        background: poster.ink,
        color: poster.cream,
        borderLeft: `3px solid ${identity.primary}`,
        fontFamily: fonts.display,
        fontSize: compact ? 9.5 : 10.5,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        lineHeight: 1.2,
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {role}
      </div>

      {/* Cream label band — name + stats row. The stencil name is the headline
          above the smaller role band. */}
      <div style={{
        flexShrink: 0,
        background: poster.paperBand,
        color: poster.ink,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: bodyPadding,
        minHeight: 0,
      }}>
        <div style={{
          fontFamily: fonts.display,
          fontSize: compact ? 11 : 13,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: poster.ink,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.1,
        }}>
          {data.name}
        </div>
        {isCorpse ? (
          // A corpse has no meaningful combat line — "⚔ 4 ♥ 0" read like a
          // live hero at zero HP. The respawn ring above carries the timer.
          <div style={{
            marginTop: 3,
            ...text.label,
            fontSize: compact ? 10 : 11,
            color: poster.inkDim,
          }}>
            Fell in battle
          </div>
        ) : (
        <div style={{
          marginTop: 3,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {/* BP + HP numbers pulse + colour-flash on change. The icons stay
              static (the stat's ink anchor) — only the value text animates. */}
          <span style={{ ...statRow.pair(statSize) }}>
            <SwordIcon size={iconSize} color={poster.stat.atk} />
            <motion.span
              style={{ color: atkColor, display: 'inline-block' }}
              animate={bpTick
                ? { scale: [1, 1.35, 1],
                    color: [atkColor, bpTick === 'up' ? poster.stat.atkBright : poster.stat.atkDim, atkColor] }
                : { scale: 1, color: atkColor }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >{atk}</motion.span>
          </span>
          {shieldValue > 0 && (
            <span style={{ ...statRow.pair(statSize) }}>
              <ShieldIcon size={iconSize} color={poster.stat.shield} />
              <motion.span
                style={{ color: poster.stat.shield, display: 'inline-block' }}
                animate={shieldTick
                  ? { scale: [1, 1.4, 1],
                      color: [poster.stat.shield, shieldTick === 'down' ? poster.stat.atkDim : poster.green, poster.stat.shield] }
                  : { scale: 1, color: poster.stat.shield }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >{shieldValue}</motion.span>
            </span>
          )}
          <span style={{ ...statRow.pair(statSize) }}>
            <HeartIcon size={iconSize} color={poster.stat.hp} />
            <motion.span
              style={{ color: hpColor, display: 'inline-block' }}
              animate={hpTick
                ? { scale: [1, 1.35, 1],
                    color: [hpColor, hpTick === 'up' ? poster.stat.hpBright : poster.stat.hpDim, hpColor] }
                : { scale: 1, color: hpColor }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >{card.hp}</motion.span>
          </span>
        </div>
        )}
      </div>
    </motion.button>
  );
}

/** Corner numeral on an equipment chip — a tiny flat sticker. */
function chipPill(compact: boolean | undefined): CSSProperties {
  return {
    position: 'absolute', right: 0, bottom: 0,
    minWidth: compact ? 9 : 11,
    padding: '0 1px',
    ...text.label,
    fontSize: compact ? 8 : 9,
    letterSpacing: 0,
    lineHeight: compact ? '9px' : '11px',
    textAlign: 'center',
    color: poster.paper,
    borderTopLeftRadius: 3,
    pointerEvents: 'none',
  };
}

/**
 * Renders the in-slot respawn state over the greyed portrait: a dim wash, a
 * slow rotating cream clock ring, an hourglass glyph and a red countdown
 * sticker. On the last turn (1T) the wash turns green and pulses faster to
 * signal "about to revive."
 */
function RespawnOverlay({ turnsLeft, compact }: { turnsLeft: number; compact: boolean }) {
  const isLast = turnsLeft === 1;
  const wash = isLast ? poster.green : poster.red;
  const ringSize = compact ? 56 : 78;
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      gap: compact ? 6 : 10,
    }}>
      {/* Dim wash — red while waiting, green on the last turn */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isLast ? [0.30, 0.55, 0.30] : [0.18, 0.32, 0.18] }}
        transition={{ duration: isLast ? 0.9 : 2.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at center, ${wash}cc, ${wash}55 55%, transparent 85%)`,
        }}
      />
      {/* Slow rotating cream ring with tick marks (Deadlock "respawn clock" feel) */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: isLast ? 6 : 14, repeat: Infinity, ease: 'linear' }}
        style={{ position: 'relative', width: ringSize, height: ringSize }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <circle cx="50" cy="50" r="44" fill="none" stroke={poster.cream} strokeWidth="2" opacity="0.85" />
          <circle cx="50" cy="50" r="48" fill="none" stroke={poster.cream} strokeWidth="0.7" opacity="0.5" />
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 50 + Math.cos(rad) * 44;
            const y1 = 50 + Math.sin(rad) * 44;
            const x2 = 50 + Math.cos(rad) * 48;
            const y2 = 50 + Math.sin(rad) * 48;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={poster.cream} strokeWidth={deg % 90 === 0 ? 1.8 : 1} opacity="0.8" />;
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
            fill={poster.cream} stroke={poster.ink} strokeWidth="2.5" strokeLinejoin="round" />
          {/* Bulbs — two triangles meeting at a narrow neck */}
          <path
            d="M24 20 L76 20 L54 50 L76 80 L24 80 L46 50 Z"
            fill={poster.cream} stroke={poster.ink} strokeWidth="2.5" strokeLinejoin="round" />
          {/* Sand pile at the bottom (the part that's already drained) */}
          <path
            d="M34 78 L66 78 L58 70 L42 70 Z"
            fill={poster.ink} opacity="0.55" />
          {/* Sand stream falling through the neck */}
          <line x1="50" y1="46" x2="50" y2="60"
            stroke={poster.ink} strokeWidth="2" strokeLinecap="round" />
          {/* Bottom frame bar */}
          <rect x="18" y="80" width="64" height="6" rx="1.5"
            fill={poster.cream} stroke={poster.ink} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </div>
      {/* Countdown sticker — RESPAWN (3), the poster's red action sticker */}
      <div style={{
        position: 'absolute',
        bottom: compact ? 10 : 18,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: compact ? '3px 8px' : '4px 10px',
        background: poster.red,
        color: poster.paper,
        borderRadius: 3,
        fontFamily: fonts.display,
        fontSize: compact ? 9 : 10,
        letterSpacing: '0.24em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        <span>Respawn</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>({turnsLeft})</span>
      </div>
    </div>
  );
}

