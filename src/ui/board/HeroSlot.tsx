import { useEffect, useRef, type CSSProperties } from 'react';
import { animate, motion, type AnimationPlaybackControls } from 'framer-motion';
import type { CardInstance, PlayerID } from '@/engine/types';
import { useFxHold } from '../effects/fx/FxTimingContext';
import { LIFT_VAR, TILT_PERSPECTIVE, fromHere, kickFor, useFxImpulse } from '../effects/fx/FxImpulse';
import { useFxCalm } from '../effects/fx/FxMotionContext';
import { useDelayedValue } from '../hooks/useDelayedValue';
import { useAmbientLoop, type Loop } from '../hooks/useAmbientLoop';
import { CARDS_BY_ID } from '@/cards';
import { effectiveAtk, hasSpike, itemCooldown } from '@/engine/query';
import { HeroBadge, HeroPortrait, heroForm } from '@/cards/art/heroArt';
import { STATUSES_BY_ID } from '@/statuses';
import { ItemIcon } from '../card/ItemIcon';
import { StatusIcon, statusChipText } from '../card/StatusIcon';
import { Explain } from '../explain/Explain';
import { statusContent } from '../explain/content';
import { SwordIcon } from '../card/Icons';
import { fonts, spring, text } from '../tokens';
import { atkInk, levelFrame, poster } from '../poster';
import { HpSegments, hpNumberStyle, scale } from '../hud';
import { LevelRing } from '../card/LevelRing';
import { useStatTick } from './useStatTick';
import { SpikeMark } from './SpikeMark';
import { FlexSocket } from './FlexSocket';
import type { ArmedPlay } from '../helpers';

/**
 * A hero on the table — ONE CARD, the same on the Active and the bench
 * (`compact`), on your side and the rival's: straight edges, the art clear.
 *
 *   top strip   Deadlock's health: the level ring, the green bar cut into one
 *               segment per HP point (a Shield as steel segments after it)
 *               and the plain number, on the HUD's dark green plate.
 *   art         the hero, nothing over the face but the live Bullet Power in
 *               the top-right corner. No name: the art names the hero, a tap
 *               opens its sheet.
 *   foot strip  the items it wears as inventory tiles in their category's
 *               colour, inside the card, capped with "+n". Only when it
 *               wears something.
 *   left edge   status tokens, hanging mostly outside the card in the gutter
 *               beside it, capped with "+n".
 *
 * The frame is the level's green (poster.ts `levelFrame`). Every state is a
 * HALO outside it (`Halo`): a pulsing green one while the card is a legal
 * target, a pulsing red one while its own skill or attack is armed, and a
 * soft gold one while the hero can still do something this turn (`ready`).
 *
 * A hero that is DOWN and waiting to respawn keeps its art, dimmed and
 * greyed, and its top strip turns into one small tag: "Back in 2", then
 * "Next turn".
 */

// A thin rim of light round the card and a CONTACT shadow under it: a tight
// dark line where it meets the table and a short soft drop. The drop reads
// the lift variable a kick animates (FxImpulse): as a card comes up off the
// table its shadow falls further away and softens.
const CARD_RIM = 'inset 0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(232, 224, 204, 0.22)';
const TILE_SHADOW = `0 calc(4px + var(${LIFT_VAR}, 0) * 22px) calc(8px + var(${LIFT_VAR}, 0) * 30px) rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.6)`;

/** At most `cap` tokens: the list whole if it fits, else `cap − 1` of it and
 *  how many are left for the "+n". */
function capTokens<T>(list: T[], cap: number): { shown: T[]; more: number } {
  if (list.length <= cap) return { shown: list, more: 0 };
  return { shown: list.slice(0, cap - 1), more: list.length - (cap - 1) };
}

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

export function HeroSlot({
  card, owner, myId, pending, isTargetable, compact,
  onTap, onLongPress, onEquipmentHover, registerSlotRef, ready, flexSlot,
}: Props) {
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressFired = false;
  const data = CARDS_BY_ID[card.cardId];
  const frameW = 2;
  const tileRef = useRef<HTMLElement | null>(null);
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
  // Shield is printed beside the HP number, so it takes no token of its own.
  const chipStatuses = shownStatuses.filter((s) => s.id !== 'shield' && !(form && STATUSES_BY_ID[s.id]?.form));
  const shieldValue = shownStatuses.find((s) => s.id === 'shield')?.value ?? 0;
  const isCorpse = respawnLeft > 0;
  // The hero whose skill, or whose attack, is armed and waiting for a target.
  const isArmedSource = !!pending && (pending.kind === 'useSkill' || pending.kind === 'attack') && pending.iid === card.iid;
  // Worn items stay on through a death: a corpse shows its gear too, greyed.
  const attached = card.attached ?? [];
  // The flex slot's empty fourth socket: the side has it and the hero wears
  // fewer than four items (a riding Rem is no item).
  const flexSocket = !!flexSlot && attached.filter((a) => CARDS_BY_ID[a.cardId]?.type !== 'hero').length < 4;
  const level = card.level ?? 1;
  // The card's measures, at the slot's own size (nothing is scaled, so the
  // type stays crisp): the health strip, the ring in it, the tokens off the
  // left edge and the inventory strip along the foot.
  const radius = 8 - frameW;
  const band = compact ? 18 : 22;
  const ringSize = compact ? 16 : 18;
  const tokenDim = 16;
  // How far a token laps onto the face; the rest hangs in the gutter.
  const tokenIn = compact ? 5 : 4;
  const chipDim = compact ? 15 : 20;
  const footPad = compact ? 2 : 3;
  const hasFoot = attached.length > 0 || flexSocket;
  const foot = hasFoot ? chipDim + footPad * 2 : 0;
  // Worn tiles: four fit along the foot; the empty flex socket takes a seat.
  const worn = capTokens(attached, flexSocket ? 3 : 4);
  const tokens = capTokens(chipStatuses, compact ? 4 : 5);
  const spiritSpike = hasSpike(card, 'spirit');

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
    <div data-fx-rest style={{ position: 'absolute', inset: 0, perspective: TILT_PERSPECTIVE }}>
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
        // A hero that is down loses its level green: the frame goes grey.
        ...(isCorpse ? { borderColor: '#5c625f' } : {}),
        background: poster.frame,   // charcoal frame, peeks at the edges
        boxShadow: `${CARD_RIM}, ${TILE_SHADOW}`,
        padding: 0,
        // Not clipped: the status tokens hang off the left edge. The face
        // inside clips its own art.
        overflow: 'visible',
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

      {/* THE FACE — the art, clipped to the frame's inner corners, under the
          top strip. A hero that is down keeps its art, greyed and dimmed. */}
      <div data-face style={{
        position: 'absolute', inset: 0,
        borderRadius: radius,
        overflow: 'hidden',
        background: poster.frame,
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: band, bottom: 0,
          filter: isCorpse ? 'grayscale(0.9) brightness(0.62) contrast(0.9)' : undefined,
          transition: 'filter 600ms ease',
        }}>
          <HeroPortrait cardId={card.cardId} art={isCorpse ? undefined : form?.art} />
        </div>

        {!isCorpse && form && (
          <FormBadge label={compact ? form.label.split(' ')[0] : form.label} full={form.label} turns={form.turns}
            bottom={foot + 4} />
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
      </div>

      {/* THE TOP STRIP — health, Deadlock's way: the level ring, the
          segmented bar, the plain number. A hero that is down wears one
          small tag there instead. */}
      {isCorpse ? (
        <RespawnTag turnsLeft={respawnLeft} height={band} radius={radius} compact={!!compact} />
      ) : (
        <HpBand
          hp={shownHp} hpMax={card.hpMax} shield={shieldValue}
          level={level} exp={card.exp ?? 0}
          height={band} ring={ringSize} radius={radius} compact={!!compact}
          vitalitySpike={hasSpike(card, 'vitality')}
        />
      )}

      {/* The live Bullet Power — an ink pill at the art's top-right corner:
          the number pulses and colour-flashes on change; the icon stays. A
          Spirit spike, which no number on the card shows, is marked under
          it. */}
      {!isCorpse && (
        <span aria-hidden style={{
          position: 'absolute', right: 3, top: band + 3,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
          pointerEvents: 'none',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            padding: compact ? '1px 4px' : '2px 5px',
            background: 'rgba(8, 20, 19, 0.9)', color: poster.cream,
            border: `1px solid ${poster.creamFaint}`,
            borderRadius: 4,
            fontWeight: 800, fontSize: compact ? scale.body : scale.number, lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
          }}>
            <SwordIcon size={compact ? 10 : 12} color={poster.cream} />
            <motion.span
              style={{ color: atkColor === poster.stat.atk ? poster.cream : atkColor === poster.stat.atkBright ? poster.target : poster.creamDim, display: 'inline-block' }}
              animate={bpTick
                ? { scale: [1, 1.35, 1] }
                : { scale: 1 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >{atk}</motion.span>
            {hasSpike(card, 'weapon') && <SpikeMark slot="weapon" size={compact ? 8 : 10} style={{ marginLeft: 1 }} />}
          </span>
          {spiritSpike && (
            <span data-worn style={{ display: 'inline-flex', pointerEvents: 'auto' }}><SpikeMark slot="spirit" size={compact ? 10 : 12} /></span>
          )}
        </span>
      )}

      {/* STATUS TOKENS — hanging off the left edge, in the gutter beside the
          card and off the hero's face: each a round mark in its class colour
          (the Active's with its value); a tap says what it is (Explain) —
          except while something is armed, when a tap on a token is a tap on
          the card and picks the target. */}
      {!isCorpse && chipStatuses.length > 0 && (
        <div data-status-tokens style={{
          position: 'absolute', right: `calc(100% - ${tokenIn}px)`, top: band + 4,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
          pointerEvents: 'none',
        }}>
          {tokens.shown.map((st, i) => (
            <Explain
              key={i}
              content={statusContent(st.id, { value: st.value, duration: st.duration })}
              passTaps={!!pending}
              style={{ display: 'inline-flex', pointerEvents: 'auto' }}
            >
              <StatusIcon id={st.id} value={compact ? undefined : st.value} duration={st.duration} titled={false} token={tokenDim} />
            </Explain>
          ))}
          {tokens.more > 0 && (
            <MoreToken n={tokens.more} dim={tokenDim}
              title={chipStatuses.slice(tokens.shown.length).map((st) => statusChipText(st.id, st.value)).join(', ')} />
          )}
        </div>
      )}

      {/* THE FOOT STRIP — every item the hero wears (a fourth in the flex
          slot too), as inventory tiles inside the card: its icon in a frame
          of its category's colour, the turns its cooldown has left over a
          dimmed face, or a hard crowd-control item's charges as pips. A
          riding hero (Rem · Tag Along) shows her portrait and the turns her
          ride has left. Once the side has the flex slot (it felled the
          enemy Walker) an empty fourth socket waits beside them. */}
      {hasFoot && (
        <div data-worn-row style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: foot,
          display: 'flex', alignItems: 'center', gap: compact ? 2 : 3,
          padding: `0 ${footPad}px`, boxSizing: 'border-box',
          background: 'rgba(8, 20, 19, 0.9)',
          borderTop: '1px solid rgba(232, 224, 204, 0.18)',
          borderRadius: `0 0 ${radius}px ${radius}px`,
          pointerEvents: 'none',
          ...(isCorpse ? { filter: 'grayscale(1) brightness(0.7)' } : {}),
        }}>
          {worn.shown.map((eq) => {
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
                  ...(isMerged ? {
                    background: poster.frame,
                    border: `1.5px solid ${poster.green}`,
                    boxSizing: 'border-box',
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
                    ...chipPill,
                    background: poster.green,
                  }}>{eq.remMergeTurnsLeft}</span>
                )}
              </div>
            );
          })}
          {worn.more > 0 && (
            <MoreToken n={worn.more} dim={chipDim} square
              title={attached.slice(worn.shown.length).map((eq) => CARDS_BY_ID[eq.cardId]?.name ?? '').join(', ')} />
          )}
          {flexSocket && <span data-worn style={{ display: 'inline-flex' }}><FlexSocket size={chipDim} /></span>}
        </div>
      )}
    </motion.button>
    </div>
    </div>
  );
}

/**
 * A hero's health, as the card's top strip: Deadlock's bar — green, cut into
 * a segment per HP point, a Shield as steel segments after it — between the
 * level ring and the plain white number, on the HUD's dark green plate. The
 * number pulses and flashes green or red as it changes; the bar jumps when a
 * Shield comes or goes.
 */
function HpBand({ hp, hpMax, shield, level, exp, height, ring, radius, compact, vitalitySpike }: {
  hp: number; hpMax: number; shield: number; level: number; exp: number;
  height: number; ring: number; radius: number; compact: boolean; vitalitySpike: boolean;
}) {
  const hpTick = useStatTick(hp);
  const shieldTick = useStatTick(shield);
  return (
    <div
      data-hp
      aria-label={`${hp} of ${hpMax} HP${shield > 0 ? `, Shield ${shield}` : ''}`}
      style={{
        position: 'absolute', left: 0, right: 0, top: 0, height,
        display: 'flex', alignItems: 'center', gap: compact ? 3 : 4,
        padding: compact ? '0 4px 0 1px' : '0 5px 0 2px', boxSizing: 'border-box',
        background: `linear-gradient(180deg, #143524 0%, ${poster.plate} 100%)`,
        borderBottom: `1px solid ${poster.plateEdge}`,
        borderRadius: `${radius}px ${radius}px 0 0`,
        pointerEvents: 'none',
      }}
    >
      <LevelRing level={level} exp={exp} size={ring} bold />
      <motion.span
        aria-hidden
        animate={shieldTick ? { scaleY: [1, 1.6, 1] } : { scaleY: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ flex: 1, minWidth: 0, display: 'flex', padding: '0 2px' }}
      >
        <HpSegments hp={hp} max={hpMax} shield={shield} width="100%" height={compact ? 8 : 9} />
      </motion.span>
      {vitalitySpike && <SpikeMark slot="vitality" size={compact ? 8 : 10} />}
      <motion.span
        aria-hidden
        animate={hpTick
          ? { scale: [1, 1.3, 1], color: ['#ffffff', hpTick === 'up' ? poster.green : '#ff6a55', '#ffffff'] }
          : { scale: 1, color: '#ffffff' }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{ ...hpNumberStyle(compact ? scale.body : scale.number), display: 'inline-block', transformOrigin: 'center right' }}
      >{hp}</motion.span>
    </div>
  );
}

/** The one tag on a hero that is down, in the top strip's seat: how long
 *  until it is back. Quiet cream while it waits, green on its last turn. */
function RespawnTag({ turnsLeft, height, radius, compact }: { turnsLeft: number; height: number; radius: number; compact: boolean }) {
  const isLast = turnsLeft <= 1;
  return (
    <div aria-hidden data-respawn style={{
      position: 'absolute', left: 0, right: 0, top: 0, height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8, 20, 19, 0.96)',
      borderBottom: `1px solid ${isLast ? poster.plateEdge : 'rgba(232, 224, 204, 0.18)'}`,
      borderRadius: `${radius}px ${radius}px 0 0`,
      fontFamily: fonts.display, fontSize: compact ? scale.floor : scale.label, lineHeight: 1,
      letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      color: isLast ? poster.target : poster.creamDim,
      pointerEvents: 'none',
    }}>
      {isLast ? 'Next turn' : `Back in ${turnsLeft}`}
    </div>
  );
}

/** "+n": the tokens an edge had no room for. */
function MoreToken({ n, dim, square, title }: { n: number; dim: number; square?: boolean; title: string }) {
  return (
    <span data-more title={title} aria-label={`${n} more: ${title}`} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: dim, height: dim, padding: '0 1px', boxSizing: 'border-box', flexShrink: 0,
      borderRadius: square ? Math.max(3, Math.round(dim * 0.18)) : dim / 2,
      background: poster.slate, color: poster.cream,
      border: '1px solid rgba(232, 224, 204, 0.5)',
      fontFamily: fonts.ui, fontWeight: 800, fontSize: scale.floor, lineHeight: 1, letterSpacing: '-0.02em',
      fontVariantNumeric: 'tabular-nums',
    }}>+{n}</span>
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

/** The badge of a form the hero has taken ("Wolf form"), stamped across the
 *  foot of its art with the turns it has left: the status's chip, made a
 *  label on the card itself, since the art has changed with it. `label` is
 *  what the card has room to print; `full` is the form's whole name. */
function FormBadge({ label, full, turns, bottom }: { label: string; full: string; turns: number; bottom: number }) {
  return (
    <div
      role="note"
      aria-label={`${full}, ${turns} turn${turns === 1 ? '' : 's'} left`}
      title={`${full}: ${turns} turn${turns === 1 ? '' : 's'} left`}
      style={{
        position: 'absolute', left: 3, bottom,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 5px',
        background: 'rgba(8, 20, 19, 0.92)', color: poster.cream,
        border: `1px solid ${poster.target}`,
        borderRadius: 3,
        fontFamily: fonts.display, fontSize: scale.floor, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      <span>{label}</span>
      <span style={{ color: poster.target, fontVariantNumeric: 'tabular-nums' }}>{turns}t</span>
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

/** Corner numeral on a worn tile — a tiny flat sticker. */
const chipPill: CSSProperties = {
  position: 'absolute', right: 0, bottom: 0,
  minWidth: 10,
  padding: '0 1px',
  ...text.label,
  fontSize: scale.floor,
  letterSpacing: 0,
  lineHeight: '11px',
  textAlign: 'center',
  color: poster.ink,
  borderTopLeftRadius: 3,
  pointerEvents: 'none',
};
