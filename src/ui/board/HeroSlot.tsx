import { useEffect, useRef, type CSSProperties } from 'react';
import { animate, motion, type AnimationPlaybackControls } from 'framer-motion';
import type { CardInstance, PlayerID } from '@/engine/types';
import { useFxHold } from '../effects/fx/FxTimingContext';
import { LIFT_VAR, TILT_PERSPECTIVE, fromHere, kickFor, useFxImpulse } from '../effects/fx/FxImpulse';
import { useFxCalm } from '../effects/fx/FxMotionContext';
import { useDelayedValue } from '../hooks/useDelayedValue';
import { CARDS_BY_ID } from '@/cards';
import { effectiveAtk, hasSpike, itemCooldown } from '@/engine/query';
import { HeroBadge, HeroPortrait, heroForm } from '@/cards/art/heroArt';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { STATUSES_BY_ID } from '@/statuses';
import { ItemIcon } from '../card/ItemIcon';
import { StatusIcon, statusChipText } from '../card/StatusIcon';
import { Explain } from '../explain/Explain';
import { statusContent } from '../explain/content';
import { HeartIcon, ShieldIcon, SwordIcon } from '../card/Icons';
import { fonts, spring, statRow, text } from '../tokens';
import { atkInk, levelFrame, poster } from '../poster';
import { HpSegments, scale } from '../hud';
import { LevelRing } from '../card/LevelRing';
import { useStatTick } from './useStatTick';
import { SpikeMark } from './SpikeMark';
import { FlexSocket } from './FlexSocket';
import type { ArmedPlay } from '../helpers';

/**
 * A hero on the table — ONE CARD, the same on the Active and the bench
 * (`compact`), on your side and the rival's. The old printed face, with three
 * things from the later builds laid on it:
 *
 *   top strip   the health bar, cut into one block per HP point: green for
 *               your heroes, red for the rival's, grey where health is lost,
 *               pale steel for a Shield.
 *   art         the hero, edge to edge. The level ring in its top-right
 *               corner; the items it wears as tiles in their category's
 *               colour in one row along its foot, capped with "+n".
 *   type band   the hero's role, an ink tag keyed by its colour (left off a
 *               tile too short to hold it).
 *   label       the name, then the attack at the foot-left and the heart and
 *               health number at the foot-right, in ink on cream.
 *   left edge   status tokens riding the card's edge beside the art, capped
 *               with "+n" so they never reach the name or the numbers.
 *
 * The frame is the level's green (poster.ts `levelFrame`). Every state is a
 * flat RING outside it (`Ring`): green while the card is a legal target, red
 * while its own skill or attack is armed, gold while the hero can still do
 * something this turn (`ready`).
 *
 * A hero that is DOWN and waiting to respawn keeps its art, greyed, and its
 * top strip turns into one small tag: "Back in 2", then "Next turn".
 */

// The card's shadow on the sheet: a short soft drop. It reads the lift
// variable a kick animates (FxImpulse): as a card comes up off the table its
// shadow falls further away and softens.
const TILE_SHADOW = `0 calc(5px + var(${LIFT_VAR}, 0) * 22px) calc(10px + var(${LIFT_VAR}, 0) * 30px) rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.28)`;
// The print sits slightly recessed in its frame.
const PRINT_EDGE = 'inset 0 0 0 1px rgba(0, 0, 0, 0.35)';

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
  /** The tile's height, px (it fills its cell; this is what its bands are
   *  measured for). Unset: a bench tile's or a lane tile's usual height. */
  tall?: number;
  onTap: (c: CardInstance, owner: PlayerID) => void;
  onLongPress?: (c: CardInstance) => void;
  onEquipmentHover?: (eq: CardInstance | null) => void;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  /** This hero can still do something this turn — use its skill, or (the
   *  Active) attack. A gold ring breathes round the card. */
  ready?: boolean;
  /** Its side has the flex slot (the enemy Walker fell): a fourth chip socket. */
  flexSlot?: boolean;
}

export function HeroSlot({
  card, owner, myId, pending, isTargetable, compact, tall,
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
  const hpTick = useStatTick(shownHp);
  const shieldValue = shownStatuses.find((s) => s.id === 'shield')?.value ?? 0;
  const shieldTick = useStatTick(shieldValue);
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
  // Shield is printed in the health bar and beside the HP number, so it takes
  // no token of its own.
  const chipStatuses = shownStatuses.filter((s) => s.id !== 'shield' && !(form && STATUSES_BY_ID[s.id]?.form));
  const isCorpse = respawnLeft > 0;
  // The hero whose skill, or whose attack, is armed and waiting for a target.
  const isArmedSource = !!pending && (pending.kind === 'useSkill' || pending.kind === 'attack') && pending.iid === card.iid;
  // Worn items stay on through a death: a corpse shows its gear too, greyed.
  const attached = card.attached ?? [];
  // The flex slot's empty fourth socket: the side has it and the hero wears
  // fewer than four items (a riding Rem is no item).
  const flexSocket = !!flexSlot && attached.filter((a) => CARDS_BY_ID[a.cardId]?.type !== 'hero').length < 4;
  const level = card.level ?? 1;
  // The role band: the hero's first keyword, keyed at its left edge by the
  // hero's identity colour (as the draft dossier does).
  const identity = getHeroIdentity(card.cardId);
  const role = identity.keywords[0] ?? 'Hero';

  // The card's measures, at the slot's own size (nothing is scaled, so the
  // type stays crisp). A tile too short for all of it gives up the role band
  // first, so the art keeps a window.
  const height = tall ?? (compact ? 150 : 206);
  const dense = height < 132;
  const radius = 8 - frameW;
  const hpStrip = compact ? 10 : 12;
  const typeH = dense ? 0 : compact ? 15 : 17;
  const statSize = compact ? 12 : 15;
  const iconSize = compact ? 11 : 13;
  const nameSize = compact ? 11 : 13;
  const labelPad = compact ? [3, 6, 4] : [5, 8, 6];
  const labelH = labelPad[0] + Math.ceil(nameSize * 1.1) + 3 + statSize + 2 + labelPad[2];
  const artH = Math.max(0, height - frameW * 2 - hpStrip - typeH - labelH);
  const ringSize = compact ? 20 : 24;
  const tokenDim = 16;
  // How far a token hangs off the card's left edge; the rest laps the art.
  const tokenOut = 6;
  const chipDim = compact ? 18 : 20;
  const hasWorn = attached.length > 0 || flexSocket;
  // Worn tiles: three in the row along the art's foot (the empty flex socket
  // takes a seat), the rest behind "+n".
  const worn = capTokens(attached, flexSocket ? 3 : 4);
  // Status tokens stop above the worn row and short of the bands under the
  // art: they never reach the name or the numbers.
  const tokenRoom = artH - 3 - (hasWorn ? chipDim + 5 : 0);
  const tokens = capTokens(chipStatuses, Math.max(1, Math.min(compact ? 4 : 5, Math.floor((tokenRoom + 2) / (tokenDim + 2)))));
  const spiritSpike = hasSpike(card, 'spirit');

  // The frame is the level's (its green); the states go outside it, in
  // priority order: a legal target, the armed source, a hero that can act.
  const ring: { color: string; soft: boolean } | null = isTargetable
    ? { color: poster.target, soft: false }
    : isArmedSource
      ? { color: poster.red, soft: false }
      : ready && isAlly && !isCorpse
        ? { color: poster.you, soft: true }
        : null;
  // A flat tint over the portrait: green while this card is a legal target,
  // red while its own skill or attack is armed and waiting for one.
  const pulse = isTargetable ? poster.target : isArmedSource ? poster.red : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    {/* The perspective a kick tips the card in sits on this wrapper, so the
        card's own transform stays `none` at rest — and the wrapper, which
        never moves, is the box the FX layer measures (geometry's restRect). */}
    <div data-fx-rest style={{ position: 'absolute', inset: 0, perspective: TILT_PERSPECTIVE }}>
    {ring && <Ring color={ring.color} pulse={!calm} soft={ring.soft} />}
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
        boxSizing: 'border-box',
        // Rounded, not chamfered: the FX layer's clipped washes use this radius and the
        // combat choreographer clips its overlays to it.
        borderRadius: 8,
        ...levelFrame(level, frameW),
        // A hero that is down loses its level green: the frame goes grey.
        ...(isCorpse ? { borderColor: '#8a8d88' } : {}),
        background: poster.paperBand,
        boxShadow: TILE_SHADOW,
        padding: 0,
        // Not clipped: the status tokens ride the left edge. Each band
        // inside clips itself to the frame's inner corners.
        overflow: 'visible',
        cursor: 'pointer',
        color: poster.ink,
        fontFamily: fonts.ui,
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
      }}
    >
      {/* "Card got hit" and every other reaction is drawn over the card by
          the board's FxLayer (effects/fx), anchored to this slot's rect; the
          card itself only recoils (FxImpulse). */}

      {/* THE TOP STRIP — health, cut into blocks. A hero that is down wears
          one small tag there instead. */}
      {isCorpse ? (
        <RespawnTag turnsLeft={respawnLeft} height={hpStrip + 4} radius={radius} />
      ) : (
        <motion.span
          data-hp
          role="img"
          aria-label={`${shownHp} of ${card.hpMax} HP${shieldValue > 0 ? `, Shield ${shieldValue}` : ''}`}
          animate={shieldTick ? { scaleY: [1, 1.5, 1] } : { scaleY: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'flex', flex: `0 0 ${hpStrip}px`, transformOrigin: 'top center', pointerEvents: 'none' }}
        >
          <HpSegments
            hp={shownHp} max={card.hpMax} shield={shieldValue}
            side={isAlly ? 'you' : 'rival'}
            width="100%" height={hpStrip}
            style={{ padding: 2, borderRadius: `${radius}px ${radius}px 0 0` }}
          />
        </motion.span>
      )}

      {/* THE ART — the portrait printed edge to edge on a dark ground; a
          hero that is down keeps it, greyed and dimmed. */}
      <div data-face style={{
        position: 'relative',
        flex: '1 1 0',
        minHeight: 0,
        overflow: 'hidden',
        background: '#0f1214',
      }}>
        <div style={{
          width: '100%', height: '100%',
          filter: isCorpse ? 'grayscale(0.95) brightness(0.5) contrast(0.9)' : undefined,
          transition: 'filter 600ms ease',
        }}>
          <HeroPortrait cardId={card.cardId} art={isCorpse ? undefined : form?.art} />
        </div>
        <div aria-hidden style={{ position: 'absolute', inset: 0, boxShadow: PRINT_EDGE, pointerEvents: 'none' }} />

        {/* State tint — flat, breathing: green while this card is a legal
            target, red while its own skill is armed and waiting for one. */}
        {pulse && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0.12 }}
            animate={calm ? { opacity: 0.25 } : { opacity: [0.12, 0.34, 0.12] }}
            transition={calm ? { duration: 0.2 } : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0, background: pulse, pointerEvents: 'none' }}
          />
        )}

        {/* Unstoppable — a flat gold keyline round the portrait, breathing. */}
        {shownStatuses.some((s) => s.id === 'unstoppable') && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0.45 }}
            animate={calm ? { opacity: 0.9 } : { opacity: [0.45, 1, 0.45] }}
            transition={calm ? { duration: 0.2 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 0 3px ${poster.you}`, pointerEvents: 'none' }}
          />
        )}

        {!isCorpse && form && (
          <FormBadge label={compact ? form.label.split(' ')[0] : form.label} full={form.label} turns={form.turns}
            bottom={hasWorn ? chipDim + 7 : 4} />
        )}

        {!isCorpse && (
          <div style={{ position: 'absolute', top: 3, right: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none' }}>
            <LevelRing level={level} exp={card.exp ?? 0} size={ringSize} bold />
            {/* A Spirit spike, which no number on the card shows, is marked
                under the ring. */}
            {spiritSpike && (
              <span data-worn style={{ display: 'inline-flex', pointerEvents: 'auto' }}><SpikeMark slot="spirit" size={compact ? 10 : 12} /></span>
            )}
          </div>
        )}

        {/* WORN ITEMS — one row along the foot of the art: every item the
            hero wears (a fourth in the flex slot too) as an inventory tile,
            its icon in a frame of its category's colour, the turns its
            cooldown has left over a dimmed face, or a hard crowd-control
            item's charges as pips. A riding hero (Rem · Tag Along) shows her
            portrait and the turns her ride has left. Once the side has the
            flex slot (it felled the enemy Walker) an empty fourth socket
            waits beside them. */}
        {hasWorn && (
          <div data-worn-row style={{
            position: 'absolute', left: 3, right: 3, bottom: 3, height: chipDim,
            display: 'flex', alignItems: 'center', gap: 3,
            pointerEvents: 'none',
            ...(isCorpse ? { filter: 'grayscale(1) brightness(0.8)' } : {}),
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
                    boxShadow: `0 0 0 1px ${poster.ink}`,
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
      </div>

      {/* THE TYPE BAND — an ink tag printed across the card, keyed at its
          left edge by the hero's identity colour. */}
      {!dense && (
        <div style={{
          flex: `0 0 ${typeH}px`,
          boxSizing: 'border-box',
          display: 'flex', alignItems: 'center',
          padding: compact ? '0 6px' : '0 8px',
          background: poster.ink,
          color: poster.cream,
          borderLeft: `3px solid ${isCorpse ? '#8a8d88' : identity.primary}`,
          fontFamily: fonts.display,
          fontSize: scale.floor,
          letterSpacing: compact ? '0.14em' : '0.2em',
          textTransform: 'uppercase',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{role}</span>
        </div>
      )}

      {/* THE LABEL — the name, then the numbers: attack at the foot-left,
          the heart and the health at the foot-right, in ink on cream. */}
      <div style={{
        flex: `0 0 ${labelH}px`,
        boxSizing: 'border-box',
        padding: `${labelPad[0]}px ${labelPad[1]}px ${labelPad[2]}px`,
        background: poster.paperBand,
        color: poster.ink,
        borderRadius: `0 0 ${radius}px ${radius}px`,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: fonts.display,
          fontSize: nameSize,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          textAlign: 'center',
          color: isCorpse ? poster.inkDim : poster.ink,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.1,
        }}>
          {data.name}
        </div>
        {isCorpse ? (
          // A hero that is down has no combat line; the tag above carries
          // the timer.
          <div style={{ marginTop: 3, ...text.label, fontSize: compact ? scale.floor : scale.label, lineHeight: `${statSize + 2}px`, textAlign: 'center', color: poster.inkDim, whiteSpace: 'nowrap' }}>
            Fell in battle
          </div>
        ) : (
          <div style={{ marginTop: 3, height: statSize + 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* The numbers pulse and colour-flash on change; the icons stay. */}
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
              {hasSpike(card, 'weapon') && <SpikeMark slot="weapon" size={compact ? 10 : 12} style={{ alignSelf: 'flex-start', marginLeft: -1 }} />}
            </span>
            {shieldValue > 0 && (
              <span style={{ ...statRow.pair(statSize) }}>
                <ShieldIcon size={iconSize} color={poster.stat.shield} />
                <span style={{ color: poster.stat.shield }}>{shieldValue}</span>
              </span>
            )}
            <span style={{ ...statRow.pair(statSize) }}>
              <HeartIcon size={iconSize} color={poster.stat.hp} />
              <motion.span
                style={{ color: poster.ink, display: 'inline-block' }}
                animate={hpTick
                  ? { scale: [1, 1.35, 1],
                      color: [poster.ink, hpTick === 'up' ? poster.stat.atkBright : poster.red, poster.ink] }
                  : { scale: 1, color: poster.ink }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >{shownHp}</motion.span>
              {hasSpike(card, 'vitality') && <SpikeMark slot="vitality" size={compact ? 10 : 12} style={{ alignSelf: 'flex-start', marginLeft: -1 }} />}
            </span>
          </div>
        )}
      </div>

      {/* STATUS TOKENS — riding the card's left edge beside the art: each a
          round mark in its class colour (the Active's with its value); a tap
          says what it is (Explain) — except while something is armed, when a
          tap on a token is a tap on the card and picks the target. */}
      {!isCorpse && chipStatuses.length > 0 && (
        <div data-status-tokens style={{
          position: 'absolute', left: -(tokenOut + frameW), top: hpStrip + 3,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
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
    </motion.button>
    </div>
    </div>
  );
}

/** The one tag on a hero that is down, in the top strip's seat: how long
 *  until it is back. Quiet cream while it waits, green on its last turn. */
function RespawnTag({ turnsLeft, height, radius }: { turnsLeft: number; height: number; radius: number }) {
  const isLast = turnsLeft <= 1;
  return (
    <div aria-hidden data-respawn style={{
      flex: `0 0 ${height}px`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: poster.ink,
      borderRadius: `${radius}px ${radius}px 0 0`,
      fontFamily: fonts.display, fontSize: scale.floor, lineHeight: 1,
      letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      color: isLast ? poster.gold : poster.cream,
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
      background: poster.ink, color: poster.paper,
      border: `1px solid ${poster.paper}`,
      fontFamily: fonts.ui, fontWeight: 800, fontSize: scale.floor, lineHeight: 1, letterSpacing: '-0.02em',
      fontVariantNumeric: 'tabular-nums',
    }}>+{n}</span>
  );
}

/**
 * A state's ring round the card, outside the level frame: a paper keyline
 * against the frame, then a flat ring in the state's colour. It breathes
 * (`pulse`; steady under calm motion); a hero that can act wears a thinner
 * one (`soft`).
 */
function Ring({ color, pulse, soft }: { color: string; pulse: boolean; soft: boolean }) {
  const ring = soft
    ? `0 0 0 1.5px ${poster.paper}, 0 0 0 3.5px ${color}`
    : `0 0 0 1.5px ${poster.paper}, 0 0 0 5px ${color}`;
  const range: [number, number] = soft ? [0.35, 0.95] : [0.55, 1];
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
        background: poster.ink, color: poster.paper,
        border: `1px solid ${poster.paper}`,
        borderRadius: 3,
        fontFamily: fonts.display, fontSize: scale.floor, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      <span>{label}</span>
      <span style={{ color: poster.gold, fontVariantNumeric: 'tabular-nums' }}>{turns}t</span>
    </div>
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
