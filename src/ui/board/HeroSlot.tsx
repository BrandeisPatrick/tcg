import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { animate, motion, type AnimationPlaybackControls } from 'framer-motion';
import type { CardInstance, PlayerID, StatusInstance } from '@/engine/types';
import { useFxHold } from '../effects/fx/FxTimingContext';
import { LIFT_VAR, TILT_PERSPECTIVE, fromHere, kickFor, useFxImpulse } from '../effects/fx/FxImpulse';
import { useFxCalm } from '../effects/fx/FxMotionContext';
import { useDelayedValue } from '../hooks/useDelayedValue';
import { useAmbientLoop, type Loop } from '../hooks/useAmbientLoop';
import { CARDS_BY_ID } from '@/cards';
import { effectiveAtk, hasSpike, itemCooldown } from '@/engine/query';
import { HeroBadge, heroForm } from '@/cards/art/heroArt';
import { STATUSES_BY_ID } from '@/statuses';
import { ItemIcon } from '../card/ItemIcon';
import { StatusIcon } from '../card/StatusIcon';
import { Explain } from '../explain/Explain';
import { statusContent } from '../explain/content';
import { SwordIcon, ShieldIcon } from '../card/Icons';
import { fonts, spring, text } from '../tokens';
import { atkInk, levelFrame, levelFrameKeylines, poster } from '../poster';
import { CardFrame, SIZES } from '../card/CardFrame';
import { LevelRing } from '../card/LevelRing';
import { useStatTick } from './useStatTick';
import { SpikeMark } from './SpikeMark';
import { FlexSocket } from './FlexSocket';
import { HP_ROOM, boardCols } from './BoardTable';
import type { ArmedPlay } from '../helpers';

/**
 * A hero on the table — a MINIATURE OF ITS REAL CARD (CardFrame, the hand
 * size scaled to the slot), as Pokémon TCG Pocket shows each Pokémon, in a
 * frame of its LEVEL GREEN (poster.ts `levelFrame`: the lightest at Level 1,
 * darker each level to the cap). Its HP floats above the card's top-right
 * corner as a big number with a thin green bar under it — the most prominent
 * number on the table — and its Shield beside it. The live Bullet Power is a
 * small pill at the card's foot, the level ring sits in the top-right corner,
 * the status chips ride the top-left edge and the worn items the bottom-left
 * edge, all small, on the card's edge. One component renders both the Active
 * and the `compact` bench card.
 *
 * The frame is the level's alone. Every state is a HALO outside it (`Halo`):
 * a pulsing green one while the card is a legal target, a pulsing red one
 * while its own skill or attack is armed, and a soft pulsing gold one while
 * the hero can still do something this turn (`ready`) — what can be acted on
 * pulses, and nothing else shouts.
 *
 * The slot box the row gives it includes HP_ROOM above the card; the card
 * itself (the FX layer's rest box, `data-fx-rest`) fills the rest.
 */

// One dark drop under every card — the print floats a hair off the table.
// The drop reads the lift variable a kick animates (FxImpulse): as a card
// comes up off the table its shadow falls further away and softens.
const TILE_SHADOW = `0 calc(10px + var(${LIFT_VAR}, 0) * 22px) calc(20px + var(${LIFT_VAR}, 0) * 30px) rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.25)`;

interface Props {
  card: CardInstance;
  owner: PlayerID;
  myId: PlayerID;
  pending: ArmedPlay | null;
  isTargetable: boolean;
  isCurrentTurn?: boolean;
  compact?: boolean;
  onTap: (c: CardInstance, owner: PlayerID) => void;
  onLongPress?: (c: CardInstance) => void;
  onEquipmentHover?: (eq: CardInstance | null) => void;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  /** This hero can still do something this turn — use its skill, or (the
   *  Active) attack. A glint sweeps across the card and its halo breathes. */
  ready?: boolean;
  /** Its side has the flex slot (the enemy Walker fell): a fourth chip socket. */
  flexSlot?: boolean;
}

// The server renderer (a test) warns about layout effects; there is nothing to lay out.
const useLayoutEffectSafe = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function HeroSlot({
  card, owner, myId, pending, isTargetable, compact,
  onTap, onLongPress, onEquipmentHover, registerSlotRef, ready, flexSlot,
}: Props) {
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressFired = false;
  const data = CARDS_BY_ID[card.cardId];
  const frameW = compact ? 2 : 3;
  // The card's width inside its frame, measured (the gallery gives it other
  // boxes than the board's); the board's own sizes until it is.
  const [contentW, setContentW] = useState(0);
  const tileRef = useRef<HTMLElement | null>(null);
  useLayoutEffectSafe(() => {
    const el = tileRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setContentW(el.clientWidth));
    ro.observe(el);
    setContentW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const innerW = contentW || (compact ? boardCols.bench : boardCols.active) - frameW * 2;
  const cardScale = innerW / SIZES.hand.w;
  const isAlly = owner === myId;
  // Board-FX hold: while a skill's bolt is still on its way to this card the
  // numbers, the status chips and the corpse look keep showing the pre-hit
  // state, and switch the moment the impact lands (Board derives the delay
  // from the fresh FX batch; zero when nothing is in flight). Interaction
  // guards read the live card, only the print lags.
  const hold = useFxHold(card.iid);
  // Recoil: when a blow lands (the FX layer's or the choreographer's impact
  // beat) the whole card takes it like a card on a table — shoved along the
  // shot with its far edge rocking up, twisted on a kill, lifted on a heal,
  // kicked back as it fires (see FxImpulse's kickFor for every shape).
  // Driven imperatively so nothing remounts; skipped under calm motion.
  const kickCtl = useRef<AnimationPlaybackControls | null>(null);
  const calm = useFxCalm();
  useFxImpulse(card.iid, (impulse) => {
    const el = tileRef.current;
    if (calm || !el) return;
    kickCtl.current?.stop();
    const { keyframes, duration, times } = kickFor(impulse);
    kickCtl.current = animate(el, fromHere(keyframes), { duration, times, ease: 'easeOut' });
  });
  useEffect(() => () => kickCtl.current?.stop(), []);
  const shownHp = useDelayedValue(card.hp, hold.impact);
  const shownStatuses = useDelayedValue(card.statuses, hold.impact);
  // Outgoing attack value as it will resolve in combat: effectiveAtk is the
  // engine's attack power (Weaken and Frenzy included), so the displayed BP is
  // what the hero actually swings for.
  const atk = useDelayedValue(effectiveAtk(card), hold.impact);
  const bpTick = useStatTick(atk);
  // Corpse: dead hero waiting to respawn in this slot. A KO'd hero keeps its
  // living print until the impact's shatter has played, then turns.
  const respawnLeft = useDelayedValue(card.respawnTurnsLeft ?? 0, hold.settle);
  if (!data || data.type !== 'hero') {
    return <div style={{ aspectRatio: '134 / 188', border: `1.5px dashed ${poster.inkFaint}`, borderRadius: 10 }} />;
  }
  const baseAtk = data.atk;
  const atkColor = atkInk(atk, baseAtk);
  // Another form while a status gives one (Silver's Wolf form): its art and
  // a badge instead of a chip; when it ends the card shows the hero again.
  const form = heroForm({ ...card, statuses: shownStatuses });
  const chipStatuses = form ? shownStatuses.filter((s) => !STATUSES_BY_ID[s.id]?.form) : shownStatuses;
  const shieldValue = shownStatuses.find((s) => s.id === 'shield')?.value ?? 0;
  const isCorpse = respawnLeft > 0;
  // The hero whose skill, or whose attack, is armed and waiting for a target.
  const isArmedSource = !!pending && (pending.kind === 'useSkill' || pending.kind === 'attack') && pending.iid === card.iid;
  // Worn items stay on through a death: a corpse shows its gear too, greyed.
  const attached = card.attached ?? [];
  // The flex slot's empty fourth socket: the side has it and the hero wears
  // fewer than four items (a riding Rem is no item).
  const flexSocket = !!flexSlot && attached.filter((a) => CARDS_BY_ID[a.cardId]?.type !== 'hero').length < 4;
  const chipDim = compact ? 18 : 22;
  const level = card.level ?? 1;
  const ringSize = compact ? 18 : 22;

  // The frame is the level's (its green); the states go outside it, in
  // priority order: a legal target, the armed source, a hero that can act.
  const halo: { color: string; pulse: boolean; soft: boolean } | null = isTargetable
    ? { color: poster.target, pulse: true, soft: false }
    : isArmedSource
      ? { color: poster.red, pulse: true, soft: false }
      : ready && isAlly && !isCorpse
        ? { color: poster.you, pulse: true, soft: true }
        : null;
  // Soft pulse behind the portrait: green while this card is a legal target,
  // red while its own skill or attack is armed and waiting for one.
  const pulse = isTargetable ? poster.target : isArmedSource ? poster.red : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    {/* The perspective a kick tips the card in sits on this wrapper, so the
        card's own transform stays `none` at rest — and the wrapper, which
        never moves, is the box the FX layer measures (geometry's restRect). */}
    <div data-fx-rest style={{ position: 'absolute', left: 0, right: 0, top: HP_ROOM, bottom: 0, perspective: TILT_PERSPECTIVE }}>
    {halo && <Halo color={halo.color} pulse={halo.pulse && !calm} soft={halo.soft} />}
    <motion.button
      layoutId={`hero-${card.iid}`}
      ref={(el) => { tileRef.current = el; registerSlotRef?.(card.iid, el); }}
      aria-label={isCorpse
        ? `${data.name} — down, respawns in ${respawnLeft} turn${respawnLeft === 1 ? '' : 's'}`
        : `${data.name} — ${atk} attack, ${shownHp} health`}
      onClick={() => { if (!pressFired) onTap(card, owner); pressFired = false; }}
      onPointerDown={() => {
        pressFired = false;
        if (onLongPress) {
          pressTimer = setTimeout(() => { pressFired = true; onLongPress(card); }, 420);
        }
      }}
      onPointerUp={() => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; } }}
      onPointerLeave={() => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = undefined; } }}
      whileHover={isAlly && !isCorpse ? { y: -3, scale: 1.015 } : undefined}
      transition={spring.snappy}
      whileTap={isCorpse ? undefined : { scale: 0.97 }}
      style={{
        position: 'absolute', inset: 0,
        width: '100%',
        height: '100%',
        // Rounded, not chamfered: the FX layer's clipped washes use this radius and the
        // combat choreographer clips its overlays to it.
        borderRadius: 8,
        ...levelFrame(level, frameW),
        background: poster.frame,   // charcoal frame, peeks at the edges
        boxShadow: `${levelFrameKeylines}, ${TILE_SHADOW}`,
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        color: poster.cream,
        fontFamily: fonts.ui,
        display: 'block',
        textAlign: 'left',
      }}
    >
      {/* "Card got hit" and every other reaction is drawn over the card by
          the board's FxLayer (effects/fx), anchored to this slot's rect; the
          card itself only recoils (FxImpulse). */}

      {/* THE CARD — the real card, printed at the hand size and scaled to the
          slot; its own frame and shadow left off (the frame here is the
          level's). A corpse is greyed and dimmed. */}
      <div style={{
        position: 'absolute', left: 0, top: 0,
        width: SIZES.hand.w, height: SIZES.hand.h,
        transform: `scale(${cardScale})`, transformOrigin: 'top left',
        filter: isCorpse ? 'grayscale(0.95) brightness(0.4) contrast(0.9)' : undefined,
        transition: 'filter 600ms ease',
        pointerEvents: 'none',
      }}>
        <CardFrame
          cardId={card.cardId}
          size="hand"
          physical={false}
          tapExplains={false}
          hideStats
          art={isCorpse ? undefined : form?.art}
          style={{ border: 'none', borderRadius: 0, boxShadow: 'none', transform: 'none', transition: 'none' }}
        />
      </div>

      {!isCorpse && chipStatuses.length > 0 && (
        <StatusRow statuses={chipStatuses} compact={!!compact} ringSize={ringSize} passTaps={!!pending} />
      )}
      {!isCorpse && form && (
        <FormBadge label={form.label} turns={form.turns} compact={!!compact}
          bottom={attached.length > 0 || flexSocket ? chipDim + 8 : 6} />
      )}

      {/* Worn chips — along the foot of the card, every item the hero
          wears (a fourth in the flex slot too): its icon on a keyline of
          its category's colour, the turns its cooldown has left over a
          dimmed face, or a hard crowd-control item's charges as pips. A
          riding hero (Rem · Tag Along) shows her portrait and the turns
          her ride has left. Once the side has the flex slot (it felled the
          enemy Walker) an empty fourth socket waits beside them, a chip's
          size. A Spirit spike, which no number on the card shows, is marked
          beside them. The BP pill keeps the foot's right end. */}
      {(attached.length > 0 || flexSocket) && (
        <div style={{
          position: 'absolute', left: 3, right: compact ? 30 : 36, bottom: 3,
          display: 'flex', flexWrap: 'wrap-reverse', alignItems: 'center', gap: 2,
          pointerEvents: 'none',
          ...(isCorpse ? { filter: 'grayscale(1) brightness(0.7)', opacity: 0.8 } : {}),
        }}>
          {attached.map((eq) => {
            const eqData = CARDS_BY_ID[eq.cardId];
            const isMerged = eqData?.type === 'hero'; // Rem riding (Tag Along)
            const dim = chipDim;
            const cooldown = isMerged ? 0 : itemCooldown(eq);
            return (
              <div key={eq.iid}
                data-worn
                data-worn-iid={eq.iid}
                onMouseEnter={(e) => { e.stopPropagation(); onEquipmentHover?.(eq); }}
                onMouseLeave={(e) => { e.stopPropagation(); onEquipmentHover?.(null); }}
                onPointerDown={(e) => e.stopPropagation()}
                // A tap previews the item too — a phone has no hover to
                // enter (Board makes the tap's preview the held kind).
                onClick={(e) => { e.stopPropagation(); onEquipmentHover?.(eq); }}
                style={{
                  position: 'relative',
                  width: dim,
                  height: dim,
                  flexShrink: 0,
                  borderRadius: Math.max(3, Math.round(dim * 0.18)),
                  cursor: 'help',
                  pointerEvents: 'auto',
                  // A dark drop lifts the chip off the card behind it.
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
                  ...(isMerged ? {
                    background: poster.frame,
                    border: `1.5px solid ${poster.green}`,
                    overflow: 'hidden',
                  } : {}),
                }}
                title={isMerged
                  ? `${eqData?.name} rides — back to the bench in ${eq.remMergeTurnsLeft ?? 0} turn${eq.remMergeTurnsLeft === 1 ? '' : 's'}`
                  : eq.charges != null ? `${eqData?.name} — ${eq.charges} charge${eq.charges === 1 ? '' : 's'} left`
                  : cooldown > 0 ? `${eqData?.name} — ready in ${cooldown} turn${cooldown === 1 ? '' : 's'}`
                  : eqData?.name}>
                {isMerged ? (
                  <HeroBadge cardId={eq.cardId} size={dim - 3} />
                ) : (
                  <ItemIcon
                    itemId={eq.cardId}
                    size={dim}
                    chip
                    marks={{ cooldown: cooldown > 0 ? cooldown : undefined, charges: eq.charges ?? undefined }}
                  />
                )}
                {/* The ride's turns left (Rem) — green sticker in the corner. */}
                {isMerged && eq.remMergeTurnsLeft != null && (
                  <span aria-label={`${eq.remMergeTurnsLeft} turns left`} style={{
                    ...chipPill(compact),
                    background: poster.green,
                  }}>{eq.remMergeTurnsLeft}</span>
                )}
              </div>
            );
          })}
          {flexSocket && <span data-worn style={{ display: 'inline-flex' }}><FlexSocket size={chipDim} /></span>}
          {hasSpike(card, 'spirit') && (
            <span data-worn style={{ display: 'inline-flex', pointerEvents: 'auto' }}><SpikeMark slot="spirit" size={compact ? 10 : 12} /></span>
          )}
        </div>
      )}

      {/* The live Bullet Power — a small ink pill at the card's foot, right.
          The number pulses and colour-flashes on change; the icon stays. */}
      {!isCorpse && (
        <span aria-hidden style={{
          position: 'absolute', right: 3, bottom: 3,
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: compact ? '1px 4px' : '2px 5px',
          background: poster.ink, color: poster.cream,
          border: `1px solid ${poster.creamFaint}`,
          borderRadius: 3,
          fontWeight: 700, fontSize: compact ? 10 : 12, lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
        }}>
          <SwordIcon size={compact ? 9 : 11} color={poster.cream} />
          <motion.span
            style={{ color: atkColor === poster.stat.atk ? poster.cream : atkColor, display: 'inline-block' }}
            animate={bpTick
              ? { scale: [1, 1.35, 1], color: [poster.cream, bpTick === 'up' ? poster.stat.atkBright : poster.stat.atkDim, poster.cream] }
              : { scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >{atk}</motion.span>
          {hasSpike(card, 'weapon') && <SpikeMark slot="weapon" size={compact ? 8 : 10} style={{ marginLeft: 1 }} />}
        </span>
      )}

      {/* Respawn overlay — corpse: clock ring + countdown, hero stays in slot but greyed */}
      {isCorpse && (
        <RespawnOverlay turnsLeft={respawnLeft} compact={!!compact} />
      )}

      {/* Ready glint — this hero still has a move this turn; sweeps across
          the card (suppressed while its skill is armed). */}
      {!isCorpse && ready && !isArmedSource && <ReadyGlint />}

      {/* State pulse — green while this card is a legal target, red while
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

      {/* Unstoppable aura — a breathing gold vignette around the card */}
      {shownStatuses.some((s) => s.id === 'unstoppable') && (
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
        <div style={{ position: 'absolute', top: 3, right: 3, lineHeight: 0 }}>
          <LevelRing
            level={level}
            exp={card.exp ?? 0}
            size={ringSize}
          />
        </div>
      )}
    </motion.button>
    </div>

    {/* HP — floats above the card's top-right corner: the number, the thin
        green bar under it, and the Shield beside it. Not on a corpse. */}
    {!isCorpse && (
      <HpFloat hp={shownHp} hpMax={card.hpMax} shield={shieldValue} compact={!!compact} vitalitySpike={hasSpike(card, 'vitality')} />
    )}
    </div>
  );
}

/** The HP number over the card's top-right corner with its bar, Pocket's
 *  way: ink on paper, outlined in cream so it reads over the card's edge too.
 *  The bar goes green → amber → red as the hero is hurt. */
function HpFloat({ hp, hpMax, shield, compact, vitalitySpike }: {
  hp: number; hpMax: number; shield: number; compact: boolean; vitalitySpike: boolean;
}) {
  const hpTick = useStatTick(hp);
  const shieldTick = useStatTick(shield);
  const frac = hpMax > 0 ? Math.max(0, Math.min(1, hp / hpMax)) : 0;
  const barInk = frac > 0.5 ? poster.green : frac > 0.25 ? poster.gold : poster.red;
  const size = compact ? 15 : 20;
  const barW = compact ? 30 : 44;
  const outline = `1px 0 0 ${poster.paper}, -1px 0 0 ${poster.paper}, 0 1px 0 ${poster.paper}, 0 -1px 0 ${poster.paper}, 1px 1px 0 ${poster.paper}, -1px -1px 0 ${poster.paper}, 1px -1px 0 ${poster.paper}, -1px 1px 0 ${poster.paper}`;
  return (
    <div
      aria-label={`${hp} of ${hpMax} HP${shield > 0 ? `, Shield ${shield}` : ''}`}
      style={{
        position: 'absolute', top: 0, right: -3,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1,
        pointerEvents: 'none', zIndex: 3,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: compact ? 3 : 4 }}>
        {shield > 0 && (
          <motion.span
            aria-hidden
            animate={shieldTick ? { scale: [1, 1.4, 1] } : { scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 1,
              fontFamily: fonts.ui, fontWeight: 800, fontSize: Math.round(size * 0.7), lineHeight: 1,
              color: poster.stat.shield, textShadow: outline, fontVariantNumeric: 'tabular-nums',
            }}
          >
            <ShieldIcon size={Math.round(size * 0.6)} color={poster.stat.shield} />
            {shield}
          </motion.span>
        )}
        <motion.span
          aria-hidden
          animate={hpTick ? { scale: [1, 1.3, 1], color: [poster.ink, hpTick === 'up' ? poster.green : poster.red, poster.ink] } : { scale: 1, color: poster.ink }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'inline-block',
            fontFamily: fonts.ui, fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: '-0.02em',
            color: poster.ink, textShadow: outline, fontVariantNumeric: 'tabular-nums',
            transformOrigin: 'bottom right',
          }}
        >{hp}</motion.span>
        {vitalitySpike && <SpikeMark slot="vitality" size={compact ? 9 : 11} style={{ alignSelf: 'flex-start' }} />}
      </span>
      <span aria-hidden style={{
        width: barW, height: 3, borderRadius: 2, marginRight: 2,
        background: 'rgba(23, 20, 16, 0.22)', boxShadow: `0 0 0 1px ${poster.paper}`,
        overflow: 'hidden',
      }}>
        <span style={{ display: 'block', height: '100%', width: `${frac * 100}%`, background: barInk, transition: 'width 320ms ease, background 320ms ease' }} />
      </span>
    </div>
  );
}

/**
 * A state's halo round the card, outside the level frame: a cream hairline
 * against the frame, then a ring and a soft glow in the state's colour. A
 * target's and an armed source's breathe (`pulse`; steady under calm
 * motion); a hero that can act wears a softer one (`soft`).
 */
function Halo({ color, pulse, soft }: { color: string; pulse: boolean; soft: boolean }) {
  const ring = soft
    ? `0 0 0 2px ${color}, 0 0 14px 4px ${color}99`
    : `0 0 0 2px #fff4d8, 0 0 0 5px ${color}, 0 0 18px 6px ${color}`;
  const range: [number, number] = soft ? [0.35, 0.85] : [0.55, 1];
  return (
    <motion.div
      aria-hidden
      data-halo
      initial={{ opacity: pulse ? range[0] : 0.9 }}
      animate={pulse ? { opacity: [range[0], range[1], range[0]] } : { opacity: 0.9 }}
      transition={pulse ? { duration: soft ? 2.2 : 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      style={{
        position: 'absolute', inset: 0,
        borderRadius: 8,
        boxShadow: ring,
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * The status chips across the top of the card. The row starts at the left
 * and stops short of the level ring (top-right), so no chip ever prints under
 * it. A chip too wide for the row prints terse (mark, value, turns) and the
 * Explain still names it — on a bench card that is nearly every chip. Fit is
 * measured, not guessed: the row's width changes with the slot and the words
 * run from "Stun" to "Return Fire". Each change is measured with every chip
 * whole, before paint.
 */
function StatusRow({ statuses, compact, ringSize, passTaps }: {
  statuses: StatusInstance[];
  compact: boolean;
  ringSize: number;
  passTaps: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const shown = statuses.slice(0, compact ? 3 : 5);
  const [rowW, setRowW] = useState(0);
  useLayoutEffectSafe(() => {
    const el = row.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRowW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Which chips print terse, and for which row width + chip set that was
  // measured. A stale key renders every chip whole, so the measure below sees
  // the full widths; the layout effect settles it before the frame paints.
  const key = `${rowW}|${shown.map((s) => `${s.id}:${s.value}:${s.duration}`).join(',')}`;
  const [fit, setFit] = useState<{ key: string; terse: ReadonlySet<number> }>({ key: '', terse: new Set() });
  const measuring = fit.key !== key;
  useLayoutEffectSafe(() => {
    if (!measuring || !row.current) return;
    const room = row.current.clientWidth;
    const terse = new Set<number>();
    row.current.querySelectorAll<HTMLElement>('[data-status]').forEach((chip, i) => {
      if (room > 0 && chip.offsetWidth > room) terse.add(i);
    });
    setFit({ key, terse });
  });
  return (
    <div ref={row} style={{
      // Clear of the ring (top:3 right:3), with a hair of air before it.
      position: 'absolute', top: 4, left: 4, right: 4 + ringSize + 4,
      display: 'flex', flexWrap: 'wrap', gap: 3,
      justifyContent: 'flex-start',
      maxHeight: compact ? 34 : 50, overflow: 'hidden',
      // The row lets taps through to the card; each chip takes its own,
      // to say what it is (Explain) — except while something is armed,
      // when a tap on a chip is a tap on the card and picks the target.
      pointerEvents: 'none',
    }}>
      {shown.map((s, i) => (
        <Explain
          key={i}
          content={statusContent(s.id, { value: s.value, duration: s.duration })}
          passTaps={passTaps}
          style={{ display: 'inline-flex', pointerEvents: 'auto' }}
        >
          <StatusIcon
            id={s.id} value={s.value} duration={s.duration}
            size="compact"
            titled={false}
            terse={!measuring && fit.terse.has(i)}
          />
        </Explain>
      ))}
    </div>
  );
}

/** The badge of a form the hero has taken ("Wolf form"), stamped across the
 *  foot of its art with the turns it has left: the status's chip, made a
 *  label on the card itself, since the art has changed with it. */
function FormBadge({ label, turns, compact, bottom }: { label: string; turns: number; compact: boolean; bottom: number }) {
  return (
    <div
      role="note"
      aria-label={`${label}, ${turns} turn${turns === 1 ? '' : 's'} left`}
      title={`${label}: ${turns} turn${turns === 1 ? '' : 's'} left`}
      style={{
        position: 'absolute', left: 4, bottom,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: compact ? '2px 5px' : '3px 7px',
        background: poster.ink, color: poster.cream,
        border: `1.5px solid ${poster.status.buff}`,
        borderRadius: 3,
        fontFamily: fonts.display, fontSize: compact ? 8 : 10, letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
        pointerEvents: 'none',
      }}
    >
      <span>{label}</span>
      <span style={{ color: poster.status.buff, fontVariantNumeric: 'tabular-nums' }}>{turns}t</span>
    </div>
  );
}

/** The ready glint's sweep: 1.4s across, then 1.8s parked where it ends. */
const GLINT: Loop = {
  keyframes: [
    { transform: 'translateX(-120%)', offset: 0 },
    { transform: 'translateX(120%)', offset: 1.4 / 3.2 },
    { transform: 'translateX(120%)', offset: 1 },
  ],
  duration: 3200,
  easing: 'ease-in-out',
};

/** A band of your colour sweeping across the card. At rest (reduced
 *  motion) it sits where a sweep ends. */
function ReadyGlint() {
  const ref = useAmbientLoop<HTMLDivElement>(GLINT);
  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute', top: 0, bottom: 0, width: '40%',
        background: `linear-gradient(115deg, transparent 30%, ${poster.you}66 50%, transparent 70%)`,
        transform: 'translateX(120%)',
        pointerEvents: 'none',
      }}
    />
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
 * Renders the in-slot respawn state over the greyed card: a dim wash, a
 * slow rotating cream clock ring, an hourglass glyph and a red countdown
 * sticker. On the last turn (1T) the wash turns green and pulses faster to
 * signal "about to revive", and the sticker says the hero is back next turn.
 */
function RespawnOverlay({ turnsLeft, compact }: { turnsLeft: number; compact: boolean }) {
  const isLast = turnsLeft === 1;
  const wash = isLast ? poster.green : poster.red;
  const ringSize = compact ? 48 : 72;
  // The clock keeps the pace it started at, as it always has: a hero who
  // falls with one turn left spins fast from the start.
  const clock = useAmbientLoop<HTMLDivElement>({
    keyframes: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
    duration: isLast ? 6000 : 14000,
    easing: 'linear',
  });
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
      <div ref={clock} style={{ position: 'relative', width: ringSize, height: ringSize }}>
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
      </div>
      {/* Hourglass glyph in the center of the ring — "respawning" timer */}
      <div style={{
        position: 'absolute',
        width: ringSize * 0.5, height: ringSize * 0.5,
        opacity: 0.92,
      }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <rect x="18" y="14" width="64" height="6" rx="1.5"
            fill={poster.cream} stroke={poster.ink} strokeWidth="2.5" strokeLinejoin="round" />
          <path
            d="M24 20 L76 20 L54 50 L76 80 L24 80 L46 50 Z"
            fill={poster.cream} stroke={poster.ink} strokeWidth="2.5" strokeLinejoin="round" />
          <path
            d="M34 78 L66 78 L58 70 L42 70 Z"
            fill={poster.ink} opacity="0.55" />
          <line x1="50" y1="46" x2="50" y2="60"
            stroke={poster.ink} strokeWidth="2" strokeLinecap="round" />
          <rect x="18" y="80" width="64" height="6" rx="1.5"
            fill={poster.cream} stroke={poster.ink} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </div>
      {/* Countdown sticker — RESPAWN (3), the poster's red action sticker;
          on the last turn it turns the wash's green with ink type, and says
          the hero is back next turn. */}
      <div style={{
        position: 'absolute',
        bottom: compact ? 8 : 14,
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: compact ? '3px 6px' : '4px 9px',
        background: isLast ? poster.green : poster.red,
        color: isLast ? poster.ink : poster.paper,
        borderRadius: 3,
        boxShadow: '0 3px 8px rgba(0, 0, 0, 0.35)',
        fontFamily: fonts.display,
        fontSize: compact ? 8 : 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        {isLast ? <span>{compact ? 'Next turn' : 'Back next turn'}</span> : (
          <>
            <span>Respawn</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>({turnsLeft})</span>
          </>
        )}
      </div>
    </div>
  );
}
