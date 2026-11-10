/**
 * The hero sheet — Pokémon TCG Pocket's action view, printed in the poster
 * idiom. Tapping a hero lifts its card, enlarged, low and centred over the
 * dimmed board, and the card's lower half IS the turn's menu:
 *
 *   art board      the portrait, its name band, the level ring (top right)
 *                  and an "i" (top left) that opens the hero's paperwork —
 *                  stats, profile, active effects — over the card
 *   equipment      the worn items as small gold-framed icons riding the
 *                  card's left edge; a tap explains one, and an active item
 *                  is cast from there
 *   actions        a passive as a quiet row, then the skill(s), the ultimate
 *                  and the attack as big plates: a usable one is lit and
 *                  glows, a blocked one dims and says why, a used one says USED
 *
 * Under the card, Retreat (with its price) and Close are pills. A rival's
 * hero, or one with nothing to offer, prints the same card read-only.
 */
import { useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { motion } from 'framer-motion';
import type { AbilityId, CardId, CardInstance, HeroCard, ItemSlot } from '@/engine/types';
import { CARDS_BY_ID, itemCard } from '@/cards';
import type { HeroAbilityDef } from '@/abilities';
import { STATUSES_BY_ID } from '@/statuses';
import {
  activeCooldown, cooldownCut, effectiveAtk, effectiveSpirit, hasSpike, heroAbilities, itemCooldown, kitCost, ultimateCard, ultPrice,
} from '@/engine/query';
import { HARD_CC_CHARGES, LEVEL_THRESHOLDS, MAX_LEVEL, ULT_COOLDOWN, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { HeroPortrait, HeroBadge, heroForm } from '@/cards/art/heroArt';
import { ultIconSrc } from '@/art/assets';
import { ItemIcon } from '../card/ItemIcon';
import { SpikeMark } from '../board/SpikeMark';
import { CATEGORY_WORD } from '../shop/itemFacts';
import { ChargePips, CooldownDial, LockGlyph } from './AbilityDial';
import { StatusIcon } from '../card/StatusIcon';
import { LevelRing } from '../card/LevelRing';
import { spring, text, fonts } from '../tokens';
import { poster, chamfer, clipBoth, scrimStyle, levelFrame, levelFrameKeylines, printEdge, soulCoin } from '../poster';
import { PosterButton } from '../chrome';
import { RuleText, type Scale } from '../card/RuleText';
import { useViewport } from '../hooks/useViewport';
import { useFxCalm } from '../effects/fx/FxMotionContext';

/** Stencil eyebrow — plate subtitles, section labels, chips. */
const eyebrow = {
  fontFamily: fonts.display,
  fontSize: 10.5,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  lineHeight: 1,
} as const;

/** The card's green frame and the charcoal margin inside it, in px. */
const FRAME = 4;
const PAD = 5;
/** A hairline on the card's charcoal, and on the paper panels. */
const RULE_DARK = 'rgba(232, 224, 204, 0.16)';
/** The marks (dials, pips, locks) on the card's charcoal and its plates. */
const MARKS_DARK = { ink: poster.cream, track: 'rgba(232, 224, 204, 0.28)', faint: poster.creamFaint };
const MARKS_PAPER = { ink: poster.ink, track: poster.inkRule, faint: poster.inkFaint };

/** Your Active's attack, offered on its sheet: a swing at the rival Active for
 *  its bullet damage. Free and one-way, one a turn — and it ends the turn's
 *  Act, so abilities and a Retreat come before it (a hero may use its ability
 *  and then attack). A hero with reach may name any living rival: the plate
 *  then still speaks for the default target (the first the engine lists), and
 *  tapping it closes the sheet and asks who (`onAttack`; the board arms the
 *  targeting, see board/attackAim.ts). */
export interface AttackOffer {
  /** What the swing would do ("Hits Dynamo for 2 bullet damage"), while it
   *  can be made — at the default target. */
  line?: string;
  /** Why it cannot be made right now ("No attacks on Turn 1"), printed in
   *  the line's place. */
  blockedReason?: string;
  /** The turn's attack has been made, by this hero. */
  made?: boolean;
  onAttack: () => void;
}

/** One of the hero's kit abilities (its skill, its ultimate) or an active
 *  item it wears, as the sheet offers it: every gate for using it is open (its
 *  turn, the hero's one ability of the turn, the unlock level, statuses,
 *  cooldown or charges, the souls it costs, a target), or the short reason it
 *  can't be used, shown inside its plate. */
export interface SkillOffer {
  canUse: boolean;
  blockedReason?: string;
}

interface Props {
  card: CardInstance;
  /** True if this hero belongs to the local player. Drives the Skill action. */
  isMine?: boolean;
  /** Each kit ability's offer, by ability id: the skill and the ultimate. One
   *  with none is not usable. */
  skills?: Record<AbilityId, SkillOffer>;
  /** The player tapped this ability's plate. */
  onUseSkill?: (skillId: AbilityId) => void;
  /** Each worn active item's offer, by item iid. */
  items?: Record<string, SkillOffer>;
  /** The player tapped this active item's Use. */
  onUseItem?: (itemIid: string) => void;
  /** The Attack plate — on the local player's Active only. */
  attack?: AttackOffer;
  /** Retreat lives on your Active's sheet: he goes to the bench and a bench
   *  hero takes the fight. Absent when nobody on the bench can step in. */
  retreat?: {
    cost: number;
    /** Who comes in, when exactly one hero can — printed under the pill.
     *  With more than one, the player picks after tapping. */
    incomingName?: string;
    /** Why it cannot be done right now ("Need 2 souls"). The pill prints the
     *  reason and stays inert. */
    blockedReason?: string;
  };
  onRetreat?: () => void;
  onClose: () => void;
}

/** How an action prints: lit and pressable, used this turn, held back for a
 *  stated reason, or simply read (a rival's hero, a hero with no offer). */
type PlateMode = 'ready' | 'used' | 'blocked' | 'quiet';

const souls = (n: number) => `${n} soul${n === 1 ? '' : 's'}`;
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function HeroDetailSheet({
  card, isMine, skills: skillOffers, onUseSkill, items: itemOffers, onUseItem, attack,
  retreat, onRetreat, onClose,
}: Props) {
  const { isMobile, width: vw } = useViewport();
  // The match's reduced-motion choice (the Board fills this context from
  // useCalmMotion): no entrance spring, no pulsing glow.
  const calm = useFxCalm();
  const [infoOpen, setInfoOpen] = useState(false);
  const [openChip, setOpenChip] = useState<string | null>(null);

  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') return null;

  const mine = !!isMine;
  const kit = heroAbilities(data);
  const skillAbilities = kit.filter((x) => x.kind === 'skill').map((x) => x.ability);
  const passiveAbilities = kit.filter((x) => x.kind === 'passive').map((x) => x.ability);
  const attached = card.attached ?? [];

  // The rules print the ability's own card text, its scaling numbers read
  // against this hero's live Spirit (Bullet) Power.
  const describe = (a: HeroAbilityDef) => sentence(a.text);
  const scale: Scale = { spirit: effectiveSpirit(card), bullet: effectiveAtk(card), who: data.name };
  // Which ability the hero has used this turn, so only that plate reads USED.
  const usedSkill = card.skillUsedThisTurn ? (card.lastSkillUsed ?? data.skills[0]) : undefined;
  // What a kit ability costs (`kitCost`, the engine's own price). A charged
  // ultimate shows its printed price coming down: "16 → 7 souls".
  const price = (abilityId: AbilityId) => {
    const n = kitCost(card, abilityId);
    const face = abilityId === data.ult ? ultimateCard(abilityId) : undefined;
    if (face?.charged && n !== ultPrice(face)) return `${ultPrice(face)} → ${souls(n)}`;
    return n > 0 ? souls(n) : face?.charged ? 'Free' : undefined;
  };
  // How an action prints: a rival's always reads quietly; yours is lit while
  // every gate is open, USED the turn it went, and dimmed with its reason.
  const modeOf = (usable: boolean, used: boolean, reason?: string): PlateMode =>
    !mine ? 'quiet' : used ? 'used' : usable ? 'ready' : reason ? 'blocked' : 'quiet';

  const form = heroForm(card);
  const level = card.level ?? 1;
  const ultFull = Math.max(1, ULT_COOLDOWN - cooldownCut(card, 'ult'));
  const ultFace = ultimateCard(data.ult);

  // ---- Geometry: the trading-card ratio, as wide as the screen allows. ----
  const cardW = isMobile ? Math.min(vw - 32, 360) : 360;
  const cardH = Math.round(cardW * 7 / 5);
  const artH = Math.round(cardH * (isMobile ? 0.36 : 0.38));

  // ---- The actions, in Pocket's order: skill(s), ultimate, attack. ----
  const rows: { key: string; quiet: boolean; node: ReactNode }[] = [];

  for (const ability of passiveAbilities) {
    rows.push({
      key: ability.id, quiet: true,
      node: <PassiveRow name={ability.name} trigger={ability.trigger} description={describe(ability)} scale={scale} />,
    });
  }

  for (const ability of skillAbilities) {
    const offer = skillOffers?.[ability.id];
    const used = usedSkill === ability.id;
    const usable = mine && !!onUseSkill && !!offer?.canUse && !used;
    const mode = modeOf(usable, used, offer?.blockedReason);
    const left = card.cooldowns?.[ability.id] ?? 0;
    const full = Math.max(left, ability.cooldown ?? 1);
    rows.push({
      key: ability.id, quiet: mode === 'quiet',
      node: (
        <ActionPlate
          kind="skill" mode={mode} calm={calm} scale={scale}
          name={ability.name}
          body={describe(ability)}
          cost={price(ability.id)}
          used={used}
          status={left > 0 ? <CooldownDial left={left} full={full} ink={MARKS_DARK.ink} track={MARKS_DARK.track} label={readyIn(left, full)} /> : undefined}
          reason={mode === 'blocked' ? offer?.blockedReason : undefined}
          onUse={onUseSkill ? () => { onUseSkill(ability.id); onClose(); } : undefined}
        />
      ),
    });
  }

  if (data.ult && ultFace) {
    const abilityId = data.ult;
    const offer = skillOffers?.[abilityId];
    const used = usedSkill === abilityId;
    const usable = mine && !!onUseSkill && !!offer?.canUse && !used;
    const mode = modeOf(usable, used, offer?.blockedReason);
    const locked = level < ULT_UNLOCK_LEVEL;
    const left = card.cooldowns?.[abilityId] ?? 0;
    // Locked: a lock and "Lv 2" beside the price. On its cooldown: the dial.
    const status = locked ? (
      <span role="img" aria-label={`Unlocks at Level ${ULT_UNLOCK_LEVEL}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <LockGlyph size={12} color={MARKS_DARK.ink} />
        <span style={{ ...eyebrow, fontSize: 10, color: MARKS_DARK.ink }}>{`Lv ${ULT_UNLOCK_LEVEL}`}</span>
      </span>
    ) : left > 0 ? (
      <CooldownDial left={left} full={ultFull} ink={MARKS_DARK.ink} track={MARKS_DARK.track} label={readyIn(left, ultFull)} />
    ) : undefined;
    rows.push({
      key: abilityId, quiet: mode === 'quiet',
      node: (
        <ActionPlate
          kind="ult" mode={mode} calm={calm} scale={scale}
          name={ultFace.name}
          // A charged ultimate is named so: its price is its own, not its size's.
          subtitle={`Ultimate · ${ultFace.charged ? 'charged' : ultFace.size}`}
          body={sentence(ultFace.text ?? '')}
          note={ultFace.charged?.text}
          cost={price(abilityId)}
          used={used}
          status={status}
          art={<UltArt heroId={ultFace.linkedHero} locked={locked} />}
          reason={mode === 'blocked' ? offer?.blockedReason : undefined}
          onUse={onUseSkill ? () => { onUseSkill(abilityId); onClose(); } : undefined}
        />
      ),
    });
  }

  if (attack) {
    // The attack ends the turn's Act: the abilities come first.
    if (skillAbilities.length > 0 || !!ultFace) rows.push({ key: 'then', quiet: false, node: <ThenRule /> });
    const usable = mine && !attack.blockedReason && !attack.made;
    const mode: PlateMode = !mine ? 'quiet' : attack.made ? 'used' : usable ? 'ready' : 'blocked';
    rows.push({
      key: 'attack', quiet: mode === 'quiet',
      node: (
        <ActionPlate
          kind="attack" mode={mode} calm={calm} scale={scale}
          name="Attack"
          body={usable ? attack.line : undefined}
          cost="Free"
          used={!!attack.made}
          reason={usable ? undefined : attack.blockedReason}
          ariaLabel={usable ? `Attack: ${attack.line}. Free.` : undefined}
          onUse={() => { attack.onAttack(); onClose(); }}
        />
      ),
    });
  }

  // ---- Equipment: the worn items, on the card's left edge. ----
  const chipPitch = Math.min(42, Math.floor((artH - 12) / Math.max(1, attached.length)));
  const chipBox = chipPitch - 6;
  const chipLeft = -FRAME - 14;
  /** The top of chip `i` (attached[0] topmost), in the card's padding box:
   *  the stack ends 6px above the art board's foot, over the name band. */
  const chipTop = (i: number) => PAD + artH - (attached.length - i) * chipPitch;
  const opened = attached.findIndex((eq) => eq.iid === openChip);

  const closeTo = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: calm ? 0 : 0.18 }}
      onClick={onClose}
      style={{
        ...scrimStyle,
        zIndex: 95,
        // A column: the card sits low (more of the free height above it than
        // below), and a kit too long for the screen scrolls the scrim.
        flexDirection: 'column',
        justifyContent: 'flex-start',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '0 16px',
      }}
    >
      <div aria-hidden style={{ flex: `${isMobile ? 3 : 2} 1 0px`, minHeight: isMobile ? 56 : 24, width: '100%' }} />
      <motion.div
        role="dialog"
        aria-label="Hero sheet"
        onClick={(e) => e.stopPropagation()}
        initial={calm ? false : { opacity: 0, y: 40, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={calm ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
        transition={calm ? { duration: 0 } : spring.snappy}
        style={{ flexShrink: 0, width: cardW, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {/* THE CARD — green level frame, charcoal inside. Not clipped: the
            equipment rides over its left edge. */}
        <div
          onClick={() => setOpenChip(null)}
          style={{
            position: 'relative',
            width: cardW, minHeight: cardH, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column',
            padding: PAD, borderRadius: 14,
            background: poster.frame,
            ...levelFrame(level, FRAME),
            boxShadow: `${levelFrameKeylines}, 0 22px 44px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.35)`,
            color: poster.cream,
          }}
        >
          {/* ART BOARD — portrait, form badge, name band; the "i" and the
              level ring in its top corners. */}
          <div style={{
            position: 'relative', height: artH, flexShrink: 0, overflow: 'hidden',
            borderRadius: 8, background: poster.ground,
          }}>
            <HeroPortrait cardId={data.id} art={form?.art} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: printEdge, zIndex: 2 }} />
            {form && (
              <span role="note" style={{
                position: 'absolute', top: 10, left: 44, zIndex: 3,
                padding: '5px 9px', background: poster.ink, color: poster.cream,
                border: `1.5px solid ${poster.status.buff}`, borderRadius: 3,
                ...eyebrow, fontSize: 11,
              }}>{`${form.label} · ${form.turns} turn${form.turns === 1 ? '' : 's'}`}</span>
            )}
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
              padding: `8px 12px 9px ${attached.length > 0 ? 28 : 12}px`,
              background: poster.paperBand,
            }}>
              <span style={{
                fontFamily: fonts.display, fontSize: 19, color: poster.ink,
                letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1,
                display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{data.name}</span>
            </div>
            <button
              type="button"
              aria-label={infoOpen ? 'Hide hero details' : 'Hero details'}
              aria-expanded={infoOpen}
              onClick={(e) => { e.stopPropagation(); setOpenChip(null); setInfoOpen((v) => !v); }}
              style={{
                position: 'absolute', top: 8, left: 8, zIndex: 9,
                width: 28, height: 28, padding: 0, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: infoOpen ? poster.cream : 'rgba(23, 20, 16, 0.8)',
                color: infoOpen ? poster.ink : poster.cream,
                border: `1.5px solid ${poster.cream}`,
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
                fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 700, fontSize: 16, lineHeight: 1,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >i</button>
            <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 9, lineHeight: 0 }}>
              <LevelRing level={level} exp={card.exp ?? 0} size={34} />
            </div>
          </div>

          {/* ACTIONS — the lower half of the card: a passive reads quietly,
              then the skill(s), the ultimate and the attack as plates. */}
          <div style={{
            flex: '1 1 auto',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8,
            padding: '10px 5px 6px',
          }}>
            {rows.map((r, i) => (
              <div key={r.key} style={r.quiet && i > 0 && rows[i - 1].quiet ? { borderTop: `1px solid ${RULE_DARK}`, paddingTop: 8 } : undefined}>
                {r.node}
              </div>
            ))}
          </div>

          {/* EQUIPMENT — gold-framed chips over the card's left edge; a tap
              explains one beside it. */}
          {attached.map((eq, i) => {
            const eqData = CARDS_BY_ID[eq.cardId];
            const rider = eqData?.type === 'hero';
            const open = openChip === eq.iid;
            const left = itemCooldown(eq);
            return (
              <button
                key={eq.iid}
                type="button"
                aria-label={eqData?.name ?? eq.cardId}
                aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); setInfoOpen(false); setOpenChip(open ? null : eq.iid); }}
                style={{
                  position: 'absolute', left: chipLeft, top: chipTop(i), zIndex: 7,
                  width: chipBox, height: chipBox, padding: 2, boxSizing: 'border-box',
                  borderRadius: 8, border: 'none', lineHeight: 0,
                  background: poster.gold,
                  boxShadow: open
                    ? `0 0 0 2px ${poster.cream}, 0 0 12px 2px rgba(217, 182, 74, 0.7)`
                    : `0 0 0 1.5px ${poster.ink}, 0 3px 8px rgba(0, 0, 0, 0.5)`,
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                {rider ? (
                  <HeroBadge cardId={eq.cardId} size={chipBox - 4} />
                ) : (
                  <ItemIcon itemId={eq.cardId} size={chipBox - 4} marks={{ cooldown: left || undefined, charges: eq.charges ?? undefined }} />
                )}
              </button>
            );
          })}
          {opened >= 0 && (
            <ItemPopover
              item={attached[opened]}
              bearer={card}
              scale={scale}
              mine={mine}
              usedId={usedSkill}
              offer={itemOffers?.[attached[opened].iid]}
              onUse={onUseItem ? closeTo(() => onUseItem(attached[opened].iid)) : undefined}
              style={{
                position: 'absolute', zIndex: 10,
                left: chipLeft + chipBox + 8, top: chipTop(opened),
                width: Math.min(260, cardW - 56),
              }}
            />
          )}

          {/* The hero's paperwork, over the card while the "i" is on. */}
          {infoOpen && (
            <InfoPanel
              card={card}
              data={data}
              level={level}
              onClose={() => setInfoOpen(false)}
            />
          )}
        </div>

        {/* RETREAT and CLOSE — pills under the card, as Pocket's. */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {retreat && onRetreat && mine && (
            <Pill
              grow
              disabled={!!retreat.blockedReason}
              onClick={closeTo(onRetreat)}
              ariaLabel={`Retreat ${data.name} to the bench — ${retreat.cost > 0 ? `costs ${souls(retreat.cost)}` : 'free'}`}
              label={`Retreat · ${retreat.cost > 0 ? souls(retreat.cost) : 'free'}`}
              caption={retreat.blockedReason ?? (retreat.incomingName ? `${retreat.incomingName} goes in` : 'You pick who goes in')}
            />
          )}
          <Pill ghost onClick={onClose} label="Close" />
        </div>
      </motion.div>
      <div aria-hidden style={{ flex: '1 1 0px', minHeight: isMobile ? 20 : 24, width: '100%' }} />
    </motion.div>
  );
}

// ----- The actions -----

/**
 * One action on the card's lower half — a skill, the ultimate or the attack.
 *
 *   ready    a bright plate (red; gold-edged for the ultimate; ink for the
 *            attack) with a soft glow behind it, and the whole plate is the
 *            button
 *   used     the outlined plate, dimmed, chipped USED
 *   blocked  the outlined plate, dimmed, with the reason in a small line
 *   quiet    no plate: the name, cost and rules as a row (a rival's hero)
 *
 * The name stays the plate's first words — the plate is found by its text.
 */
function ActionPlate({
  kind, mode, name, subtitle, body, note, cost, used, status, art, reason, scale, onUse, ariaLabel, calm,
}: {
  kind: 'skill' | 'ult' | 'attack';
  mode: PlateMode;
  name: string;
  /** Under the name: "Ultimate · charged". */
  subtitle?: string;
  body?: string;
  /** A rule on its own line under the effect (a charged ultimate's). */
  note?: string;
  /** "2 souls", "16 → 7 souls", "Free". */
  cost?: string;
  used?: boolean;
  /** What holds it, drawn: a cooldown dial, the ultimate's lock. */
  status?: ReactNode;
  /** The plate's picture, at its left: the ultimate's icon. */
  art?: ReactNode;
  reason?: string;
  scale: Scale;
  onUse?: () => void;
  ariaLabel?: string;
  calm: boolean;
}) {
  const ready = mode === 'ready' && !!onUse;
  const go = (e: SyntheticEvent) => { e.stopPropagation(); onUse?.(); };
  const fg = ready ? poster.paper : poster.cream;
  const fgBody = ready ? (kind === 'attack' ? poster.cream : 'rgba(242, 230, 203, 0.94)') : poster.creamDim;
  const glow = kind === 'ult' ? poster.gold : kind === 'skill' ? poster.red : poster.cream;

  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
      {art && <span aria-hidden style={{ flexShrink: 0, lineHeight: 0, paddingTop: 1 }}>{art}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 20 }}>
          <span style={{
            fontFamily: fonts.display, fontSize: 16, letterSpacing: '0.06em', textTransform: 'uppercase',
            lineHeight: 1.1, color: fg, minWidth: 0,
          }}>{name}</span>
          <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {used
              ? <span style={{ ...eyebrow, fontSize: 10.5, color: poster.cream }}>USED</span>
              : cost && <Cost label={cost} ink={fg} />}
            {status}
          </span>
        </div>
        {subtitle && (
          <div style={{ ...eyebrow, fontSize: 9.5, marginTop: 3, color: ready ? 'rgba(242, 230, 203, 0.82)' : poster.gold }}>{subtitle}</div>
        )}
        {body && (
          <div style={{ ...text.body, fontSize: 13, lineHeight: 1.4, marginTop: 5, color: fgBody }}>
            {/* On a plate (and on the charcoal) a scaling number prints on its
                colour as a ground, so it reads on red and dark alike. The
                attack's line is the board's own sentence, printed as it is. */}
            {kind === 'attack' ? body : <RuleText text={body} keywordColor={fg} scale={scale} />}
          </div>
        )}
        {note && (
          <div style={{ ...text.body, fontSize: 12, lineHeight: 1.35, marginTop: 4, fontStyle: 'italic', color: fgBody }}>
            <RuleText text={note} keywordColor={fg} scale={scale} />
          </div>
        )}
      </div>
    </div>
  );

  if (mode === 'quiet') {
    return <div style={{ padding: '2px 2px 0' }}>{content}</div>;
  }

  if (!ready) {
    // Held back: the outlined plate, its words stepped back, the reason at
    // full strength under them.
    return (
      <div style={{
        padding: '10px 12px 10px',
        border: `1px solid ${kind === 'ult' ? 'rgba(217, 182, 74, 0.55)' : 'rgba(232, 224, 204, 0.26)'}`,
        borderRadius: 7,
      }}>
        <div style={{ opacity: 0.6 }}>{content}</div>
        {reason && (
          <div style={{
            marginTop: 8, paddingTop: 7, borderTop: `1px solid ${RULE_DARK}`,
            ...text.body, fontSize: 12, lineHeight: 1.3, color: poster.cream, textAlign: 'center',
          }}>{reason}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* The glow — a soft halo of the plate's colour behind it, breathing
          slowly unless motion is calm. */}
      <motion.span
        aria-hidden
        initial={false}
        animate={calm ? { opacity: 0.8 } : { opacity: [0.55, 1, 0.55] }}
        transition={calm ? { duration: 0 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: -3, borderRadius: 10,
          background: glow, filter: 'blur(8px)', pointerEvents: 'none',
        }}
      />
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        whileTap={calm ? undefined : { scale: 0.985 }}
        onClick={go}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } }}
        style={{
          position: 'relative',
          padding: '11px 13px 11px',
          background: kind === 'attack' ? poster.ink : poster.red,
          border: `2px solid ${kind === 'ult' ? poster.gold : kind === 'attack' ? poster.creamDim : poster.red}`,
          ...clipBoth(chamfer(8)),
          color: fg,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {content}
      </motion.div>
    </div>
  );
}

/** A plate's price: a soul coin and its words ("2 souls", "16 → 7 souls"),
 *  or just "Free". */
function Cost({ label, ink }: { label: string; ink: string }) {
  const free = label === 'Free';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {!free && <span aria-hidden style={soulCoin(10)} />}
      <span style={{ ...eyebrow, fontSize: 10.5, letterSpacing: '0.12em', color: ink, whiteSpace: 'nowrap' }}>{label}</span>
    </span>
  );
}

const TRIGGER_LABELS: Record<string, string> = {
  startOfTurn: 'Start of own turn',
  endOfTurn:   'End of own turn',
  onAttack:    'On attack',
  onDeath:     'On death',
  onPlay:      'On play',
  ongoing:     'Always',
  activate:    'Activate',
};

/** A passive: it fires on its own, so it is a quiet row above the plates —
 *  its name, when it fires, and its rules. */
function PassiveRow({ name, trigger, description, scale }: { name: string; trigger: string; description: string; scale: Scale }) {
  return (
    <div style={{ padding: '2px 2px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontFamily: fonts.display, fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.1, color: poster.cream }}>{name}</span>
        <span style={{ flexShrink: 0, ...eyebrow, fontSize: 9.5, color: poster.green }}>{`Passive · ${TRIGGER_LABELS[trigger] ?? trigger}`}</span>
      </div>
      {description && (
        <div style={{ ...text.body, fontSize: 13, lineHeight: 1.4, marginTop: 5, color: poster.creamDim }}>
          <RuleText text={description} keywordColor={poster.cream} scale={scale} />
        </div>
      )}
    </div>
  );
}

/** Between your Active's abilities and its attack: the abilities come first,
 *  and the attack ends the turn's Act. */
function ThenRule() {
  return (
    <div role="separator" aria-label="then — the attack ends the turn" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '1px 0' }}>
      <span aria-hidden style={{ flex: 1, height: 1, background: RULE_DARK }} />
      <span aria-hidden style={{ ...eyebrow, fontSize: 9, color: poster.creamFaint }}>then · the attack ends the turn</span>
      <span aria-hidden style={{ flex: 1, height: 1, background: RULE_DARK }} />
    </div>
  );
}

/** The ultimate's face on its plate: the hero's own Deadlock ultimate icon
 *  (a white glyph, `public/ult`) on ink, keyed in gold; below Level 2,
 *  dimmed under a lock. */
function UltArt({ heroId, locked }: { heroId: CardId; locked: boolean }) {
  return (
    <span style={{
      position: 'relative', display: 'inline-block', width: 40, height: 40,
      borderRadius: 7, overflow: 'hidden', lineHeight: 0,
      background: poster.ink,
      boxShadow: `0 0 0 1.5px ${poster.gold}, 0 2px 4px rgba(0, 0, 0, 0.35)`,
    }}>
      <img
        src={ultIconSrc(heroId)} alt="" draggable={false}
        style={{ display: 'block', width: 40, height: 40, padding: 5, boxSizing: 'border-box', objectFit: 'contain', opacity: locked ? 0.35 : 1 }}
      />
      {locked && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LockGlyph size={20} color={poster.cream} hole={poster.ink} />
        </span>
      )}
    </span>
  );
}

// ----- Equipment -----

/**
 * What a worn item does, beside its chip: its name, tab and tier, its rules,
 * how long it waits (or the charges it has left) — and for an active item of
 * yours, its Use (or why not). A riding Rem says when she rides back.
 */
function ItemPopover({
  item, bearer, scale, mine, usedId, offer, onUse, style,
}: {
  item: CardInstance;
  bearer: CardInstance;
  scale: Scale;
  mine: boolean;
  usedId?: AbilityId;
  offer?: SkillOffer;
  onUse?: () => void;
  style: CSSProperties;
}) {
  const data = CARDS_BY_ID[item.cardId];
  const face = itemCard(item.cardId);
  const shell: CSSProperties = {
    ...style,
    boxSizing: 'border-box',
    padding: '11px 13px 12px',
    background: poster.paper,
    color: poster.ink,
    borderRadius: 8,
    boxShadow: `0 0 0 1.5px ${poster.ink}, 0 14px 30px rgba(0, 0, 0, 0.5)`,
    display: 'flex', flexDirection: 'column', gap: 7,
  };
  const title = (name: string) => (
    <span style={{ fontFamily: fonts.display, fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.1 }}>{name}</span>
  );

  if (data?.type === 'hero') {
    const turns = item.remMergeTurnsLeft;
    return (
      <div role="group" aria-label={`${data.name}, riding`} onClick={(e) => e.stopPropagation()} style={shell}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HeroBadge cardId={item.cardId} size={34} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            {title(data.name)}
            <span style={{ ...eyebrow, fontSize: 9.5, color: poster.status.buff }}>Riding</span>
          </div>
        </div>
        {turns != null && (
          <div style={{ ...text.body, fontSize: 12.5, lineHeight: 1.35, color: poster.inkSoft }}>
            {`Back to the bench in ${turns} turn${turns === 1 ? '' : 's'}.`}
          </div>
        )}
      </div>
    );
  }

  const active = face?.type === 'spell';
  const left = itemCooldown(item);
  const full = Math.max(left, face ? activeCooldown(bearer, face.tier, active ? face.cooldown : undefined) : left);
  const hardCC = active && !!face.hardCC;
  const charges = hardCC ? item.charges ?? 0 : item.charges ?? undefined;
  const used = usedId === item.cardId;
  const usable = mine && active && !!onUse && !!offer?.canUse && !used;

  return (
    <div role="group" aria-label={data?.name ?? item.cardId} onClick={(e) => e.stopPropagation()} style={shell}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {title(data?.name ?? item.cardId)}
        {face && (
          <span style={{ ...eyebrow, fontSize: 9.5, color: poster.inkDim }}>
            {`${CATEGORY_WORD[face.slot]} · Tier ${face.tier}${active ? ' · Active' : ''}`}
          </span>
        )}
      </div>
      {face?.text && (
        <div style={{ ...text.body, fontSize: 12.5, lineHeight: 1.4, color: poster.inkSoft }}>
          <RuleText text={sentence(face.text)} scale={scale} />
        </div>
      )}
      {(charges !== undefined || left > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...text.body, fontSize: 12, color: poster.inkDim }}>
          {charges !== undefined ? (
            <>
              <ChargePips left={charges} total={hardCC ? HARD_CC_CHARGES : Math.max(charges, 1)} ink={MARKS_PAPER.ink} faint={MARKS_PAPER.faint} label={`${charges} charge${charges === 1 ? '' : 's'} left`} />
              <span>{`${charges} charge${charges === 1 ? '' : 's'} left`}</span>
            </>
          ) : (
            <>
              <CooldownDial left={left} full={full} size={22} ink={MARKS_PAPER.ink} track={MARKS_PAPER.track} label={readyIn(left, full)} />
              <span>{`Ready in ${left} turn${left === 1 ? '' : 's'}`}</span>
            </>
          )}
        </div>
      )}
      {mine && active && onUse && (
        usable ? (
          <PosterButton variant="red" size="sm" onClick={onUse} ariaLabel={`Use ${data?.name ?? item.cardId}`} style={{ alignSelf: 'stretch', marginTop: 2 }}>
            Use
          </PosterButton>
        ) : (used || offer?.blockedReason) ? (
          <div style={{
            paddingTop: 7, borderTop: `1px solid ${poster.inkRule}`,
            ...text.body, fontSize: 12, lineHeight: 1.3, color: poster.inkDim, textAlign: 'center',
          }}>{used ? 'Used this turn' : offer?.blockedReason}</div>
        ) : null
      )}
    </div>
  );
}

// ----- The hero's paperwork -----

/**
 * Behind the "i": the level, the live stats (BP / HP / SPI and the category
 * spikes), what the card is built from, and the effects on it now — one
 * column on the card's paper, each part under its eyebrow, hairlines between.
 */
function InfoPanel({ card, data, level, onClose }: { card: CardInstance; data: HeroCard; level: number; onClose: () => void }) {
  const spike = (slot: ItemSlot) => (hasSpike(card, slot) ? <SpikeMark slot={slot} size={12} style={{ marginTop: 1 }} /> : undefined);
  const atMax = level >= MAX_LEVEL;
  const need = LEVEL_THRESHOLDS[Math.max(0, Math.min(LEVEL_THRESHOLDS.length - 1, level - 1))];
  const section = (label: string) => (
    <div style={{ ...eyebrow, fontSize: 10, color: poster.inkDim }}>{label}</div>
  );
  const rule = <div aria-hidden style={{ height: 1, background: poster.inkRule }} />;
  return (
    <div
      role="region"
      aria-label={`${data.name} details`}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{
        position: 'absolute', top: PAD, left: PAD, right: PAD, zIndex: 8,
        maxHeight: `calc(100% - ${PAD * 2}px)`, overflowY: 'auto', boxSizing: 'border-box',
        padding: '10px 14px 14px',
        background: poster.paper, color: poster.ink,
        borderRadius: 8,
        boxShadow: '0 10px 26px rgba(0, 0, 0, 0.45)',
        display: 'flex', flexDirection: 'column', gap: 10,
        cursor: 'default',
      }}
    >
      {/* Header beside the "i" and under the level ring. */}
      <div style={{ minHeight: 28, display: 'flex', alignItems: 'center', margin: '-1px 40px 0 34px' }}>
        <span style={{ ...eyebrow, fontSize: 12, letterSpacing: '0.16em', color: poster.ink }}>
          {atMax ? `Level ${level} · max` : `Level ${level} · ${card.exp ?? 0}/${need} exp`}
        </span>
      </div>
      {rule}
      {section('Stats')}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
        <InfoStat label="BP" value={effectiveAtk(card)} color={poster.stat.atk} mark={spike('weapon')} />
        <InfoStat label="HP" value={`${card.hp}/${card.hpMax}`} color={poster.stat.hp} mark={spike('vitality')} />
        <InfoStat label="SPI" value={effectiveSpirit(card)} color={poster.stat.spirit} mark={spike('spirit')} />
      </div>
      {rule}
      {section('Profile')}
      <div style={{ ...text.body, fontSize: 12.5, lineHeight: 1.4, color: poster.inkSoft }}>
        {`${data.profile.role} · peaks ${data.profile.curve} · each level ${growthLine(data.growth)} · Retreat ${data.retreat === 0 ? 'free' : souls(data.retreat)}`}
      </div>
      {card.statuses.length > 0 && (
        <>
          {rule}
          {section('Active effects')}
          {card.statuses.map((s, i) => {
            const def = STATUSES_BY_ID[s.id];
            // A status of 99+ turns lasts until it is broken: no count.
            const turns = s.duration > 0 && s.duration < 99 ? ` ${s.duration} turn${s.duration === 1 ? '' : 's'} left.` : '';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {/* The turns left are said in words below, so the chip
                      carries the mark and the value only. */}
                  <StatusIcon id={s.id} value={s.value} />
                  <span style={{ ...text.label, fontSize: 12, color: poster.ink, minWidth: 0 }}>{def?.title ?? s.id}</span>
                </div>
                {def?.desc && (
                  <div style={{ ...text.body, fontSize: 12.5, lineHeight: 1.35, color: poster.inkSoft }}>
                    {`${def.desc.replace('<value>', String(s.value))}${turns}`}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/** One live stat: the number in its ink over its stencil label. */
function InfoStat({ label, value, color, mark }: { label: string; value: number | string; color: string; mark?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 3 }}>
        <span style={{ ...text.numeric, fontSize: 20, color }}>{value}</span>
        {mark}
      </span>
      <span style={{ ...eyebrow, fontSize: 10, color: poster.inkDim }}>{label}</span>
    </div>
  );
}

// ----- Under the card -----

/** Pocket's pill: Retreat (paper, its price on it, the reason or who goes
 *  in under it) and Close (an outline on the scrim). A real <button>, so a
 *  blocked one is `disabled`. */
function Pill({
  label, caption, onClick, disabled = false, ghost = false, grow = false, ariaLabel,
}: {
  label: string;
  caption?: string;
  onClick: () => void;
  disabled?: boolean;
  ghost?: boolean;
  grow?: boolean;
  ariaLabel?: string;
}) {
  const flat = ghost || disabled;
  return (
    <motion.button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      aria-label={ariaLabel}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      style={{
        flex: grow ? '1 1 auto' : '0 0 auto',
        minWidth: ghost ? 108 : 0, minHeight: 46,
        padding: caption ? '8px 20px 9px' : '0 22px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
        borderRadius: 999,
        background: flat ? 'transparent' : poster.paper,
        color: flat ? (disabled ? poster.creamDim : poster.cream) : poster.ink,
        border: `2px solid ${flat ? (ghost && !disabled ? poster.creamDim : poster.creamFaint) : poster.ink}`,
        boxShadow: flat ? 'none' : '0 6px 16px rgba(0, 0, 0, 0.35)',
        cursor: disabled ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontFamily: fonts.display, fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1 }}>{label}</span>
      {caption && (
        <span style={{ fontFamily: fonts.ui, fontSize: 11.5, fontWeight: 500, lineHeight: 1.2, opacity: disabled ? 1 : 0.7 }}>{caption}</span>
      )}
    </motion.button>
  );
}

/** What a level adds, in words: "+1 BP, +2 HP". */
function growthLine(g: { atk: number; hp: number; spirit: number }): string {
  return [g.atk && `+${g.atk} BP`, g.hp && `+${g.hp} HP`, g.spirit && `+${g.spirit} SPI`].filter(Boolean).join(', ');
}

/** A cooldown dial's name: "Ready in 2 turns · cooldown 3". */
const readyIn = (left: number, full: number) => `Ready in ${left} turn${left === 1 ? '' : 's'} · cooldown ${full}`;
