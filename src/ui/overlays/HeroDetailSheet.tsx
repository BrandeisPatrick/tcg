/**
 * The hero sheet — Pokémon TCG Pocket's action view, worn in Deadlock's own
 * interface: the dark teal-black panel of its tooltips, framed in the side's
 * colour (amber for yours, sapphire for the rival's). Tapping a hero lifts
 * its card, enlarged, low and centred over the dimmed board:
 *
 *   art board      the hero's portrait, whole (face and shoulders), at the
 *                  right under the level ring; beside it the hero's state
 *                  right now — its name, its health as Deadlock's segmented
 *                  bar with the plain number (a Shield as pale steel
 *                  segments), its attack, and every status on it as a chip;
 *                  an "i" (top left) opens the hero's paperwork
 *   inventory      the worn items as a row of Deadlock's shop tiles under
 *                  the art; a tap explains one (and casts an active one), and
 *                  a "+n" tile opens the rest when they do not all fit
 *   abilities      one Deadlock ability tile each — a coloured header band
 *                  with the name and the price, the rules in cream under it:
 *                  a passive (cream band), the skill(s), the ultimate and the
 *                  attack. A usable one is ringed in its colour (a charged
 *                  ultimate glows and wears the ultimate mark); a held one
 *                  is flat and dimmed with its one reason; a used one says USED
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
import { poster, scrimStyle, printEdge, shopInk } from '../poster';
import {
  scale as T, Souls, HpSegments, hpNumberStyle, ultimateGlyph, panelStyle, plateStyle, bandStyle, chargedGlow, DecoRule,
} from '../hud';
import { SwordIcon } from '../card/Icons';
import { Explain } from '../explain/Explain';
import { statusContent } from '../explain/content';
import { RuleText, type Scale } from '../card/RuleText';
import { useViewport } from '../hooks/useViewport';
import { useFxCalm } from '../effects/fx/FxMotionContext';

/** Stencil eyebrow — section labels, chips. */
const eyebrow = {
  fontFamily: fonts.display,
  fontSize: T.label,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  lineHeight: 1,
} as const;

/** The panel's margin round the art board, in px. */
const PAD = 6;
/** A hairline on the dark panel. */
const RULE_DARK = 'rgba(232, 224, 204, 0.16)';
/** The marks (dials, pips, locks) on the dark panel. */
const MARKS_DARK = { ink: poster.cream, track: 'rgba(232, 224, 204, 0.28)', faint: poster.creamFaint };
/** An inventory tile's side and the gap between tiles. */
const TILE = 40;
const TILE_GAP = 6;

/** Your Active's attack, offered on its sheet: a swing at the rival Active for
 *  its bullet damage. Free and one-way, one a turn — and it ends the turn's
 *  Act, so abilities and a Retreat come before it (a hero may use its ability
 *  and then attack). A hero with reach may name any living rival: the tile
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
 *  can't be used, shown inside its tile. */
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
  /** The player tapped this ability's tile. */
  onUseSkill?: (skillId: AbilityId) => void;
  /** Each worn active item's offer, by item iid. */
  items?: Record<string, SkillOffer>;
  /** The player tapped this active item's Use. */
  onUseItem?: (itemIid: string) => void;
  /** The Attack tile — on the local player's Active only. */
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
/** A reason that says the souls are short ("Need 2 souls", "Not enough souls"). */
const shortOfSouls = (reason?: string) => !!reason && /soul/i.test(reason) && /^(need|not enough)/i.test(reason);

/** An ability's band colour, read off its own rule: Deadlock's weapon orange
 *  for bullet damage, its spirit purple for spirit damage, vitality green for
 *  a heal or a Shield with no damage in it; `fallback` when the rule says
 *  none of these. */
function abilityInk(rule: string, fallback: string): string {
  const t = rule.toLowerCase();
  if (/bullet damage/.test(t)) return shopInk('weapon').ink;
  if (/spirit damage/.test(t)) return shopInk('spirit').ink;
  if (!/damage/.test(t) && /\b(heal|heals|shield|restore|restores)\b/.test(t)) return shopInk('vitality').ink;
  return fallback;
}

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
  const [allItems, setAllItems] = useState(false);

  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') return null;

  const mine = !!isMine;
  const side = mine ? poster.you : poster.rival;
  const kit = heroAbilities(data);
  const skillAbilities = kit.filter((x) => x.kind === 'skill').map((x) => x.ability);
  const passiveAbilities = kit.filter((x) => x.kind === 'passive').map((x) => x.ability);
  const attached = card.attached ?? [];

  // The rules print the ability's own card text, its scaling numbers read
  // against this hero's live Spirit (Bullet) Power.
  const describe = (a: HeroAbilityDef) => sentence(a.text);
  const scale: Scale = { spirit: effectiveSpirit(card), bullet: effectiveAtk(card), who: data.name };
  // Which ability the hero has used this turn, so only that tile reads USED.
  const usedSkill = card.skillUsedThisTurn ? (card.lastSkillUsed ?? data.skills[0]) : undefined;
  // What a kit ability costs (`kitCost`, the engine's own price), as the soul
  // wisp and its number. A charged ultimate shows its printed price coming
  // down: "16 → 7" (named "16 → 7 souls").
  const price = (abilityId: AbilityId, short: boolean): ReactNode => {
    const n = kitCost(card, abilityId);
    const face = abilityId === data.ult ? ultimateCard(abilityId) : undefined;
    const tone = short ? 'short' : 'mint';
    if (face?.charged && n !== ultPrice(face)) {
      return (
        <span role="img" aria-label={`${ultPrice(face)} → ${souls(n)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span aria-hidden style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: T.label, lineHeight: 1, textDecoration: 'line-through', opacity: 0.7 }}>{ultPrice(face)}</span>
          <Souls n={n} size={T.body} tone={tone} plate />
        </span>
      );
    }
    if (n > 0) return <span role="img" aria-label={souls(n)} style={{ display: 'inline-flex' }}><Souls n={n} size={T.body} tone={tone} plate /></span>;
    return face?.charged ? 'Free' : undefined;
  };
  // How an action prints: a rival's always reads quietly; yours is lit while
  // every gate is open, USED the turn it went, and dimmed with its reason.
  const modeOf = (usable: boolean, used: boolean, reason?: string): PlateMode =>
    !mine ? 'quiet' : used ? 'used' : usable ? 'ready' : reason ? 'blocked' : 'quiet';

  const form = heroForm(card);
  const level = card.level ?? 1;
  const ultFull = Math.max(1, ULT_COOLDOWN - cooldownCut(card, 'ult'));
  const ultFace = ultimateCard(data.ult);

  // ---- Geometry: the trading-card width, as wide as the screen allows; the
  //      height is the content's own. ----
  const cardW = isMobile ? Math.min(vw - 32, 360) : 360;
  const artH = Math.round(cardW * 7 / 5 * 0.42);
  // The portrait keeps the card art's own shape (280×380), so the hero is
  // shown whole — never a strip across the eyes.
  const portraitW = Math.round(artH * 280 / 380);
  const shield = card.statuses.find((st) => st.id === 'shield')?.value ?? 0;
  const shownStatuses = card.statuses.filter((st) => st.id !== 'shield');
  // The readout's width beside the portrait, and the name's step to fit it.
  const readoutW = cardW - 2 * PAD - 2 - portraitW - 16;
  const nameSize = [T.title, T.number, T.body].find((sz) => data.name.length * sz * 0.74 <= readoutW) ?? T.body;

  // ---- The actions, in Pocket's order: passive, skill(s), ultimate, attack. ----
  const rows: { key: string; node: ReactNode }[] = [];
  const spiritInk = shopInk('spirit').ink;
  const weaponInk = shopInk('weapon').ink;

  for (const ability of passiveAbilities) {
    rows.push({
      key: ability.id,
      node: <PassiveTile name={ability.name} trigger={ability.trigger} description={describe(ability)} scale={scale} />,
    });
  }

  for (const ability of skillAbilities) {
    const offer = skillOffers?.[ability.id];
    const used = usedSkill === ability.id;
    const usable = mine && !!onUseSkill && !!offer?.canUse && !used;
    const mode = modeOf(usable, used, offer?.blockedReason);
    const left = card.cooldowns?.[ability.id] ?? 0;
    const full = Math.max(left, ability.cooldown ?? 1);
    const reason = mode === 'blocked' ? offer?.blockedReason : undefined;
    rows.push({
      key: ability.id,
      node: (
        <AbilityTile
          kind="skill" ink={abilityInk(ability.text, spiritInk)} mode={mode} calm={calm} scale={scale}
          name={ability.name}
          body={describe(ability)}
          cost={price(ability.id, shortOfSouls(reason))}
          used={used}
          status={left > 0 ? <CooldownDial left={left} full={full} size={26} ink={MARKS_DARK.ink} track={MARKS_DARK.track} label={readyIn(left, full)} /> : undefined}
          reason={reason}
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
    const reason = mode === 'blocked' ? offer?.blockedReason : undefined;
    rows.push({
      key: abilityId,
      node: (
        <AbilityTile
          kind="ult" ink={abilityInk(ultFace.text ?? '', spiritInk)} mode={mode} calm={calm} scale={scale}
          name={ultFace.name}
          // A charged ultimate is named so: its price is its own, not its size's.
          ultLabel={`Ultimate · ${ultFace.charged ? 'charged' : ultFace.size}`}
          body={sentence(ultFace.text ?? '')}
          note={ultFace.charged?.text}
          cost={price(abilityId, shortOfSouls(reason))}
          used={used}
          status={!locked && left > 0
            ? <CooldownDial left={left} full={ultFull} size={26} ink={MARKS_DARK.ink} track={MARKS_DARK.track} label={readyIn(left, ultFull)} />
            : undefined}
          art={<UltArt heroId={ultFace.linkedHero} locked={locked} ink={abilityInk(ultFace.text ?? '', spiritInk)} />}
          reason={reason}
          onUse={onUseSkill ? () => { onUseSkill(abilityId); onClose(); } : undefined}
        />
      ),
    });
  }

  if (attack) {
    // The attack ends the turn's Act: the abilities come first.
    if (skillAbilities.length > 0 || !!ultFace) rows.push({ key: 'then', node: <ThenRule /> });
    const usable = mine && !attack.blockedReason && !attack.made;
    const mode: PlateMode = !mine ? 'quiet' : attack.made ? 'used' : usable ? 'ready' : 'blocked';
    rows.push({
      key: 'attack',
      node: (
        <AbilityTile
          kind="attack" ink={weaponInk} mode={mode} calm={calm} scale={scale}
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

  // ---- Inventory: as many tiles as the row holds; past that, a "+n" tile
  //      opens the rest. ----
  const rowW = cardW - 2 * PAD - 2 - 8;
  const fit = Math.max(1, Math.floor((rowW + TILE_GAP) / (TILE + TILE_GAP)));
  const overflow = attached.length > fit && !allItems;
  const shownItems = overflow ? attached.slice(0, fit - 1) : attached;
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
      <div aria-hidden style={{ flex: `${isMobile ? 3 : 2} 1 0px`, minHeight: isMobile ? 48 : 24, width: '100%' }} />
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
        {/* THE CARD — Deadlock's dark panel, framed in the side's colour. */}
        <div
          data-hero-card
          onClick={() => setOpenChip(null)}
          style={{
            ...panelStyle,
            position: 'relative',
            width: cardW, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column',
            padding: PAD, borderRadius: 12,
            border: `1px solid ${side}`,
            boxShadow: `${panelStyle.boxShadow}, inset 0 0 0 1px rgba(0, 0, 0, 0.5)`,
          }}
        >
          {/* ART BOARD — portrait, form badge, the hero's readout; the "i" and
              the level ring in its top corners. */}
          <div style={{
            position: 'relative', height: artH, flexShrink: 0, overflow: 'hidden',
            borderRadius: 7, background: poster.ground,
          }}>
            {/* The portrait, whole, at the right. */}
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: portraitW }}>
              <HeroPortrait cardId={data.id} art={form?.art} />
              <div aria-hidden style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `linear-gradient(90deg, ${poster.ground} 0%, transparent 18%)`,
              }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: printEdge, zIndex: 2 }} />
            {form && (
              <span role="note" style={{
                position: 'absolute', top: 10, left: 44, zIndex: 3,
                padding: '4px 8px', background: poster.ink, color: poster.cream,
                border: `1.5px solid ${poster.status.buff}`, borderRadius: 3,
                ...eyebrow, letterSpacing: '0.12em',
              }}>{`${form.label} · ${form.turns} turn${form.turns === 1 ? '' : 's'}`}</span>
            )}
            {/* The hero right now: name, health, attack, statuses — beside the
                portrait (never over it), under the "i". */}
            <div data-hero-readout style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: readoutW + 12, zIndex: 3,
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 7,
              padding: '42px 0 10px 10px', boxSizing: 'border-box',
            }}>
              <span style={{
                fontFamily: fonts.display, fontSize: nameSize, color: poster.cream,
                letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap',
              }}>{data.name}</span>
              <div role="img" aria-label={`${card.hp} of ${card.hpMax} HP${shield > 0 ? `, Shield ${shield}` : ''}`}
                style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span aria-hidden style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={hpNumberStyle(T.display)}>{card.hp}</span>
                  <span style={{ ...hpNumberStyle(T.body), color: poster.creamDim }}>{`/ ${card.hpMax}`}</span>
                  {shield > 0 && (
                    <span style={{ ...hpNumberStyle(T.body), color: poster.shield, marginLeft: 4 }}>{`+${shield}`}</span>
                  )}
                </span>
                <HpSegments hp={card.hp} max={card.hpMax} shield={shield} width="calc(100% - 4px)" height={9} style={{ marginLeft: 2 }} />
              </div>
              <span role="img" aria-label={`${scale.bullet} attack`} style={{
                ...plateStyle,
                alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 8px',
              }}>
                <SwordIcon size={13} color={poster.cream} />
                <span style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: T.number, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{scale.bullet}</span>
                {hasSpike(card, 'weapon') && <SpikeMark slot="weapon" size={11} />}
              </span>
              {shownStatuses.length > 0 && (
                <div data-hero-statuses style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {shownStatuses.map((st, i) => (
                    <Explain key={i} content={statusContent(st.id, { value: st.value, duration: st.duration })} style={{ display: 'inline-flex' }}>
                      <StatusIcon id={st.id} value={st.value} duration={st.duration} titled={false} size="compact" />
                    </Explain>
                  ))}
                </div>
              )}
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
                background: infoOpen ? poster.cream : 'rgba(8, 20, 19, 0.85)',
                color: infoOpen ? poster.ink : poster.cream,
                border: `1.5px solid ${poster.cream}`,
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
                fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 700, fontSize: T.number, lineHeight: 1,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >i</button>
            <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 9, lineHeight: 0 }}>
              <LevelRing level={level} exp={card.exp ?? 0} size={34} />
            </div>
          </div>

          {/* INVENTORY — the worn items as Deadlock's shop tiles, in a row;
              a tap explains one under the row. */}
          {attached.length > 0 && (
            <div data-hero-items role="group" aria-label="Worn items" style={{
              display: 'flex', flexWrap: 'wrap', gap: TILE_GAP, padding: '8px 4px 2px',
            }}>
              {shownItems.map((eq) => {
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
                      position: 'relative', width: TILE, height: TILE, padding: 0, flexShrink: 0,
                      border: 'none', background: 'transparent', lineHeight: 0, borderRadius: 7,
                      boxShadow: open ? `0 0 0 2px ${poster.cream}, 0 0 10px 1px rgba(232, 224, 204, 0.45)` : undefined,
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {rider ? (
                      <span style={{ ...plateStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', width: TILE, height: TILE, boxSizing: 'border-box', borderColor: poster.status.buff }}>
                        <HeroBadge cardId={eq.cardId} size={TILE - 8} />
                      </span>
                    ) : (
                      <ItemIcon itemId={eq.cardId} size={TILE} marks={{ cooldown: left || undefined, charges: eq.charges ?? undefined }} />
                    )}
                  </button>
                );
              })}
              {(overflow || allItems) && attached.length > fit && (
                <button
                  type="button"
                  aria-label={allItems ? 'Show fewer items' : `${attached.length - shownItems.length} more items`}
                  aria-expanded={allItems}
                  onClick={(e) => { e.stopPropagation(); setAllItems((v) => !v); }}
                  style={{
                    ...plateStyle,
                    width: TILE, height: TILE, padding: 0, flexShrink: 0, boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderStyle: 'dashed', borderColor: poster.creamDim,
                    fontFamily: fonts.ui, fontWeight: 800, fontSize: T.number, lineHeight: 1,
                    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  }}
                >{allItems ? '−' : `+${attached.length - shownItems.length}`}</button>
              )}
            </div>
          )}
          {opened >= 0 && (
            <ItemPopover
              item={attached[opened]}
              bearer={card}
              scale={scale}
              mine={mine}
              usedId={usedSkill}
              offer={itemOffers?.[attached[opened].iid]}
              onUse={onUseItem ? closeTo(() => onUseItem(attached[opened].iid)) : undefined}
              style={{ margin: '8px 2px 0' }}
            />
          )}

          <DecoRule color={`color-mix(in srgb, ${side} 55%, transparent)`} style={{ margin: '10px 0 2px' }} />

          {/* ABILITIES — one Deadlock ability tile each. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0 0' }}>
            {rows.map((r) => <div key={r.key}>{r.node}</div>)}
          </div>

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
              label={(
                <>
                  <span>Retreat</span>
                  {retreat.cost > 0
                    ? <Souls n={retreat.cost} size={T.body} tone={shortOfSouls(retreat.blockedReason) ? 'short' : 'mint'} plate />
                    : <span style={{ fontSize: T.label, opacity: 0.8 }}>Free</span>}
                </>
              )}
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
 * One ability as Deadlock's tooltip draws it — a skill, the ultimate or the
 * attack: a header band in the ability's colour (its name at the left, its
 * price at the right), the rules in cream on the dark panel under it.
 *
 *   ready    the tile is the button: ringed in its colour, lit; a charged
 *            ultimate glows (`chargedGlow`) and wears the ultimate mark
 *   used     flat and dimmed, the band says USED
 *   blocked  flat and dimmed, the one reason at full strength under it
 *   quiet    the tile as it reads (a rival's hero): no ring, not a button
 *
 * The name stays the tile's first words — the tile is found by its text.
 */
function AbilityTile({
  kind, ink, mode, name, ultLabel, body, note, cost, used, status, art, reason, scale, onUse, ariaLabel, calm,
}: {
  kind: 'skill' | 'ult' | 'attack';
  /** The band's colour. */
  ink: string;
  mode: PlateMode;
  name: string;
  /** The ultimate's name for its mark: "Ultimate · charged". */
  ultLabel?: string;
  body?: string;
  /** A rule on its own line under the effect (a charged ultimate's). */
  note?: string;
  /** The price: a Souls tag, "Free". */
  cost?: ReactNode;
  used?: boolean;
  /** What holds it, drawn: a cooldown dial. */
  status?: ReactNode;
  /** The tile's picture, at its left: the ultimate's icon. */
  art?: ReactNode;
  reason?: string;
  scale: Scale;
  onUse?: () => void;
  ariaLabel?: string;
  calm: boolean;
}) {
  const ready = mode === 'ready' && !!onUse;
  const flat = mode === 'used' || mode === 'blocked';
  const go = (e: SyntheticEvent) => { e.stopPropagation(); onUse?.(); };
  const glow = kind === 'ult' && ready;

  const band = (
    <div style={{
      ...bandStyle(ink),
      display: 'flex', alignItems: 'center', gap: 6,
      minHeight: 28, padding: '4px 6px 4px 9px', boxSizing: 'border-box',
    }}>
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.1 }}>{name}</span>
      {/* After the name in reading order (the tile is found by its name),
          before it on screen. */}
      {kind === 'ult' && ultLabel && (
        <span role="img" aria-label={ultLabel} style={{ ...ultimateGlyph(15, poster.ink), order: -1, opacity: glow ? 1 : 0.55 }} />
      )}
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: T.label, letterSpacing: '0.12em' }}>
        {used ? 'USED' : cost}
      </span>
    </div>
  );

  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px 9px' }}>
      {art && <span style={{ flexShrink: 0, lineHeight: 0, paddingTop: 1 }}>{art}</span>}
      {(body || note) && (
        <div style={{ flex: 1, minWidth: 0 }}>
          {body && (
            <div style={{ ...text.body, fontSize: T.body, lineHeight: 1.4, color: poster.cream }}>
              {/* The attack's line is the board's own sentence, printed as it
                  is; an ability's rule scales against the hero's live powers. */}
              {kind === 'attack' ? body : <RuleText text={body} keywordColor={poster.cream} scale={scale} />}
            </div>
          )}
          {note && (
            <div style={{ ...text.body, fontSize: T.label, lineHeight: 1.35, marginTop: 4, fontStyle: 'italic', color: poster.creamDim }}>
              <RuleText text={note} keywordColor={poster.cream} scale={scale} />
            </div>
          )}
        </div>
      )}
      {!body && !note && <div style={{ flex: 1 }} />}
      {status && <span style={{ flexShrink: 0, lineHeight: 0 }}>{status}</span>}
    </div>
  );
  const hasBody = !!(body || note || art || status);

  const shell: CSSProperties = {
    ...plateStyle,
    position: 'relative',
    overflow: 'hidden',
    borderColor: ready ? ink : 'rgba(232, 224, 204, 0.16)',
    boxShadow: glow ? chargedGlow(ink) : ready ? `0 0 0 1px ${ink}, 0 4px 12px rgba(0, 0, 0, 0.45)` : 'none',
  };

  if (!ready) {
    return (
      <div style={{ ...shell, background: flat ? 'rgba(8, 20, 19, 0.6)' : shell.background }}>
        <div style={flat ? { opacity: 0.5, filter: 'saturate(0.55)' } : undefined}>
          {band}
          {hasBody && content}
        </div>
        {reason && (
          <div style={{
            padding: '6px 10px 7px', borderTop: `1px solid ${RULE_DARK}`,
            ...text.body, fontSize: T.label, lineHeight: 1.3, color: poster.cream, textAlign: 'center',
          }}>{reason}</div>
        )}
      </div>
    );
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      whileTap={calm ? undefined : { scale: 0.975, filter: 'brightness(1.15)' }}
      animate={glow && !calm ? { boxShadow: [chargedGlow(ink), `0 0 0 1.5px ${ink}, 0 0 22px 3px color-mix(in srgb, ${ink} 80%, transparent), inset 0 0 14px color-mix(in srgb, ${ink} 34%, transparent)`, chargedGlow(ink)] } : undefined}
      transition={glow && !calm ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } }}
      style={{ ...shell, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
    >
      {band}
      {hasBody && content}
    </motion.div>
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

/** A passive: it fires on its own, so its tile is never a button — a cream
 *  band with its name and when it fires, its rules under it. */
function PassiveTile({ name, trigger, description, scale }: { name: string; trigger: string; description: string; scale: Scale }) {
  return (
    <div style={{ ...plateStyle, overflow: 'hidden' }}>
      <div style={{
        ...bandStyle(poster.cream),
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        minHeight: 28, padding: '4px 9px', boxSizing: 'border-box',
      }}>
        <span style={{ minWidth: 0, lineHeight: 1.1 }}>{name}</span>
        <span style={{ flexShrink: 0, fontSize: T.floor, letterSpacing: '0.12em', opacity: 0.75 }}>{`Passive · ${TRIGGER_LABELS[trigger] ?? trigger}`}</span>
      </div>
      {description && (
        <div style={{ ...text.body, fontSize: T.body, lineHeight: 1.4, padding: '8px 10px 9px', color: poster.cream }}>
          <RuleText text={description} keywordColor={poster.cream} scale={scale} />
        </div>
      )}
    </div>
  );
}

/** Between your Active's abilities and its attack: the abilities come first,
 *  and the attack ends the turn's Act. */
function ThenRule() {
  const line: CSSProperties = { flex: 1, height: 1, background: RULE_DARK };
  return (
    <div role="separator" aria-label="then — the attack ends the turn" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '1px 0' }}>
      <span aria-hidden style={line} />
      <span aria-hidden style={{ ...eyebrow, fontSize: T.floor, letterSpacing: '0.14em', color: poster.creamDim }}>then · the attack ends the turn</span>
      <span aria-hidden style={line} />
    </div>
  );
}

/** The ultimate's face on its tile: the hero's own Deadlock ultimate icon
 *  (a white glyph, `public/ult`) on ink, keyed in the ability's colour;
 *  below Level 2, dimmed under a lock. */
function UltArt({ heroId, locked, ink }: { heroId: CardId; locked: boolean; ink: string }) {
  return (
    <span
      role={locked ? 'img' : undefined}
      aria-label={locked ? `Unlocks at Level ${ULT_UNLOCK_LEVEL}` : undefined}
      aria-hidden={locked ? undefined : true}
      style={{
        position: 'relative', display: 'inline-block', width: 40, height: 40,
        borderRadius: 7, overflow: 'hidden', lineHeight: 0,
        background: poster.ink,
        boxShadow: `0 0 0 1.5px ${ink}, 0 2px 4px rgba(0, 0, 0, 0.35)`,
      }}
    >
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
 * What a worn item does, under the inventory row, as Deadlock's item tooltip:
 * a band in its category's colour with its name and tier, its rules in cream,
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
    ...plateStyle,
    ...style,
    boxSizing: 'border-box',
    overflow: 'hidden',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.5)',
  };
  const bandRow = (ink: string, name: string, tag?: string) => (
    <div style={{
      ...bandStyle(ink),
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      minHeight: 28, padding: '4px 9px', boxSizing: 'border-box',
    }}>
      <span style={{ minWidth: 0, lineHeight: 1.1 }}>{name}</span>
      {tag && <span style={{ flexShrink: 0, fontSize: T.floor, letterSpacing: '0.12em', opacity: 0.8 }}>{tag}</span>}
    </div>
  );
  const bodyStyle: CSSProperties = { padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 7 };

  if (data?.type === 'hero') {
    const turns = item.remMergeTurnsLeft;
    return (
      <div role="group" aria-label={`${data.name}, riding`} onClick={(e) => e.stopPropagation()} style={shell}>
        {bandRow(poster.status.buff, data.name, 'Riding')}
        {turns != null && (
          <div style={{ ...bodyStyle, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <HeroBadge cardId={item.cardId} size={30} />
            <span style={{ ...text.body, fontSize: T.body, lineHeight: 1.35, color: poster.cream }}>
              {`Back to the bench in ${turns} turn${turns === 1 ? '' : 's'}.`}
            </span>
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
  const ink = face ? shopInk(face.slot).ink : poster.cream;

  return (
    <div role="group" aria-label={data?.name ?? item.cardId} onClick={(e) => e.stopPropagation()} style={shell}>
      {bandRow(ink, data?.name ?? item.cardId, face ? `${CATEGORY_WORD[face.slot]} · T${face.tier}${active ? ' · Active' : ''}` : undefined)}
      <div style={bodyStyle}>
        {face?.text && (
          <div style={{ ...text.body, fontSize: T.body, lineHeight: 1.4, color: poster.cream }}>
            <RuleText text={sentence(face.text)} keywordColor={poster.cream} scale={scale} />
          </div>
        )}
        {(charges !== undefined || left > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...text.body, fontSize: T.label, color: poster.creamDim }}>
            {charges !== undefined ? (
              <>
                <ChargePips left={charges} total={hardCC ? HARD_CC_CHARGES : Math.max(charges, 1)} ink={MARKS_DARK.ink} faint={MARKS_DARK.faint} label={`${charges} charge${charges === 1 ? '' : 's'} left`} />
                <span>{`${charges} charge${charges === 1 ? '' : 's'} left`}</span>
              </>
            ) : (
              <>
                <CooldownDial left={left} full={full} size={22} ink={MARKS_DARK.ink} track={MARKS_DARK.track} label={readyIn(left, full)} />
                <span>{`Ready in ${left} turn${left === 1 ? '' : 's'}`}</span>
              </>
            )}
          </div>
        )}
        {mine && active && onUse && (
          usable ? (
            <motion.button
              type="button"
              aria-label={`Use ${data?.name ?? item.cardId}`}
              whileTap={{ scale: 0.97 }}
              onClick={(e) => { e.stopPropagation(); onUse(); }}
              style={{
                ...bandStyle(ink),
                alignSelf: 'stretch', marginTop: 2, minHeight: 36, borderRadius: 5, border: 'none',
                boxShadow: `${bandStyle(ink).boxShadow}, 0 0 0 1px ${ink}, 0 0 10px color-mix(in srgb, ${ink} 50%, transparent)`,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >Use</motion.button>
          ) : (used || offer?.blockedReason) ? (
            <div style={{
              paddingTop: 7, borderTop: `1px solid ${RULE_DARK}`,
              ...text.body, fontSize: T.label, lineHeight: 1.3, color: poster.cream, textAlign: 'center',
            }}>{used ? 'Used this turn' : offer?.blockedReason}</div>
          ) : null
        )}
      </div>
    </div>
  );
}

// ----- The hero's paperwork -----

/**
 * Behind the "i": the level, the live stats (BP / HP / SPI and the category
 * spikes), what the card is built from, and the effects on it now — one
 * column on the dark panel, each part under its eyebrow, hairlines between.
 */
function InfoPanel({ card, data, level, onClose }: { card: CardInstance; data: HeroCard; level: number; onClose: () => void }) {
  const spike = (slot: ItemSlot) => (hasSpike(card, slot) ? <SpikeMark slot={slot} size={12} style={{ marginTop: 1 }} /> : undefined);
  const atMax = level >= MAX_LEVEL;
  const need = LEVEL_THRESHOLDS[Math.max(0, Math.min(LEVEL_THRESHOLDS.length - 1, level - 1))];
  const section = (label: string) => (
    <div style={{ ...eyebrow, fontSize: T.floor, color: poster.creamDim }}>{label}</div>
  );
  const rule = <div aria-hidden style={{ height: 1, background: RULE_DARK }} />;
  return (
    <div
      role="region"
      aria-label={`${data.name} details`}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{
        position: 'absolute', top: PAD, left: PAD, right: PAD, zIndex: 8,
        maxHeight: `calc(100% - ${PAD * 2}px)`, overflowY: 'auto', boxSizing: 'border-box',
        padding: '10px 14px 14px',
        background: poster.slate, color: poster.cream,
        border: `1px solid ${RULE_DARK}`,
        borderRadius: 7,
        boxShadow: '0 10px 26px rgba(0, 0, 0, 0.45)',
        display: 'flex', flexDirection: 'column', gap: 10,
        cursor: 'default',
      }}
    >
      {/* Header beside the "i" and under the level ring. */}
      <div style={{ minHeight: 28, display: 'flex', alignItems: 'center', margin: '-1px 40px 0 34px' }}>
        <span style={{ ...eyebrow, color: poster.cream }}>
          {atMax ? `Level ${level} · max` : `Level ${level} · ${card.exp ?? 0}/${need} exp`}
        </span>
      </div>
      {rule}
      {section('Stats')}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
        <InfoStat label="BP" value={effectiveAtk(card)} color={shopInk('weapon').ink} mark={spike('weapon')} />
        <InfoStat label="HP" value={`${card.hp}/${card.hpMax}`} color="#ffffff" mark={spike('vitality')} />
        <InfoStat label="SPI" value={effectiveSpirit(card)} color={shopInk('spirit').ink} mark={spike('spirit')} />
      </div>
      {rule}
      {section('Profile')}
      <div style={{ ...text.body, fontSize: T.body, lineHeight: 1.4, color: poster.creamDim }}>
        {`${data.profile.role} · peaks ${data.profile.curve} · each level ${growthLine(data.growth)} · Retreat `}
        {data.retreat === 0
          ? 'free'
          : <span role="img" aria-label={souls(data.retreat)} style={{ display: 'inline-flex', verticalAlign: 'middle' }}><Souls n={data.retreat} size={T.body} /></span>}
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
                  <span style={{ ...text.label, fontSize: T.label, color: poster.cream, minWidth: 0 }}>{def?.title ?? s.id}</span>
                </div>
                {def?.desc && (
                  <div style={{ ...text.body, fontSize: T.body, lineHeight: 1.35, color: poster.creamDim }}>
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
        <span style={{ ...text.numeric, fontSize: T.title, color }}>{value}</span>
        {mark}
      </span>
      <span style={{ ...eyebrow, fontSize: T.floor, color: poster.creamDim }}>{label}</span>
    </div>
  );
}

// ----- Under the card -----

/** Pocket's pill: Retreat (a dark plate edged in your amber, its price on it,
 *  the reason or who goes in under it) and Close (an outline on the scrim). A
 *  real <button>, so a blocked one is `disabled`. */
function Pill({
  label, caption, onClick, disabled = false, ghost = false, grow = false, ariaLabel,
}: {
  label: ReactNode;
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
        padding: caption ? '7px 18px 8px' : '0 22px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
        borderRadius: 999,
        background: flat ? 'transparent' : plateStyle.background,
        color: flat ? (disabled ? poster.creamDim : poster.cream) : poster.cream,
        border: `1.5px solid ${flat ? (ghost && !disabled ? poster.creamDim : poster.creamFaint) : poster.you}`,
        boxShadow: flat ? 'none' : `0 6px 16px rgba(0, 0, 0, 0.35), inset 0 0 10px color-mix(in srgb, ${poster.you} 18%, transparent)`,
        cursor: disabled ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: fonts.display, fontSize: T.body, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1 }}>{label}</span>
      {caption && (
        <span style={{ fontFamily: fonts.ui, fontSize: T.label, fontWeight: 500, lineHeight: 1.2, opacity: disabled ? 1 : 0.7 }}>{caption}</span>
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
