/**
 * The hero sheet — Pokémon TCG Pocket's action view, worn in Deadlock's own
 * interface (its dark teal-black panel, framed in the side's colour: amber
 * for yours, sapphire for the rival's). It answers one question — what can I
 * do with this hero right now? — so it says each fact once:
 *
 *   header     the portrait, the name, the level ring, the health bar and
 *              its number; the "i" opens the whole card (every rule, the
 *              stats, the effects on it)
 *   strip      ONE row of small tiles: the worn items (Deadlock's shop
 *              tiles) and the statuses (their tokens); a tap explains one
 *              in a popover over the sheet, and "+n" opens the rest
 *   actions    one row each, all alike: a square tile (the ability's own
 *              art, or its kind's mark) framed in its colour, the name, one
 *              short line, and one number at the right — the souls it costs,
 *              or the attack's damage. A row you cannot use now is dimmed
 *              and says its one reason in the number's place. A passive is
 *              a quiet line with its name; a tap shows its rule.
 *
 * Under the card, Retreat (with its price) and Close are pills. A rival's
 * hero, or one with nothing to offer, prints the same rows, read-only.
 */
import { useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { motion } from 'framer-motion';
import type { AbilityId, CardId, CardInstance, HeroCard, ItemSlot, StatusInstance } from '@/engine/types';
import { CARDS_BY_ID, itemCard } from '@/cards';
import type { HeroAbilityDef } from '@/abilities';
import { STATUSES_BY_ID } from '@/statuses';
import {
  activeCooldown, effectiveAtk, effectiveSpirit, hasSpike, heroAbilities, itemCooldown, kitCost, ultimateCard, ultPrice,
} from '@/engine/query';
import { HARD_CC_CHARGES, LEVEL_THRESHOLDS, MAX_LEVEL, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { HeroPortrait, HeroBadge, heroForm } from '@/cards/art/heroArt';
import { ultIconSrc } from '@/art/assets';
import { ItemIcon } from '../card/ItemIcon';
import { SpikeMark } from '../board/SpikeMark';
import { CATEGORY_WORD } from '../shop/itemFacts';
import { ChargePips, CooldownDial } from './AbilityDial';
import { StatusIcon } from '../card/StatusIcon';
import { LevelRing } from '../card/LevelRing';
import { spring, text, fonts } from '../tokens';
import { poster, scrimStyle, printEdge, shopInk } from '../poster';
import {
  scale as T, Souls, HpSegments, hpNumberStyle, ultimateGlyph, panelStyle, plateStyle, bandStyle, chargedGlow,
} from '../hud';
import { SwordIcon, SpiritIcon, ShieldIcon } from '../card/Icons';
import { Explain } from '../explain/Explain';
import { statusContent } from '../explain/content';
import { RuleText, type Scale } from '../card/RuleText';
import { parseMarkup, shownNumber } from '../card/scaling';
import { useViewport } from '../hooks/useViewport';
import { useFxCalm } from '../effects/fx/FxMotionContext';

// ---- The sheet's three text styles: a name, a caption, a number. ----
const NAME: CSSProperties = {
  fontFamily: fonts.display, fontSize: T.number, letterSpacing: '0.05em',
  textTransform: 'uppercase', lineHeight: 1.1, color: poster.cream,
};
const CAPTION: CSSProperties = {
  fontFamily: fonts.ui, fontSize: T.label, fontWeight: 500, lineHeight: 1.3, color: poster.creamDim,
};
const NUMBER = (size: number): CSSProperties => ({
  fontFamily: fonts.ui, fontWeight: 800, fontSize: size, lineHeight: 1,
  fontVariantNumeric: 'tabular-nums', color: poster.cream,
});
/** A caption cut to its one line. */
const ONE_LINE: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 };

/** Stencil eyebrow — the "i" view's section labels. */
const eyebrow = {
  fontFamily: fonts.display,
  fontSize: T.label,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  lineHeight: 1,
} as const;

/** The panel's margin, in px. */
const PAD = 8;
/** The header's height: the portrait's, at the card art's 280×380. */
const HEAD = 118;
/** A hairline on the dark panel. */
const RULE_DARK = 'rgba(232, 224, 204, 0.16)';
/** The marks (dials, pips) on the dark panel. */
const MARKS_DARK = { ink: poster.cream, track: 'rgba(232, 224, 204, 0.28)', faint: poster.creamFaint };
/** A strip tile's side and the gap between tiles. */
const TILE = 30;
const TILE_GAP = 5;
/** An action row's picture tile. */
const ART = 44;

/** Your Active's attack, offered on its sheet: a swing at the rival Active for
 *  its bullet damage. Free and one-way, one a turn — and it ends the turn's
 *  Act, so abilities and a Retreat come before it (a hero may use its ability
 *  and then attack). A hero with reach may name any living rival: the row
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
 *  can't be used, shown in its row. */
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
  /** The player tapped this ability's row. */
  onUseSkill?: (skillId: AbilityId) => void;
  /** Each worn active item's offer, by item iid. */
  items?: Record<string, SkillOffer>;
  /** The player tapped this active item's Use. */
  onUseItem?: (itemIid: string) => void;
  /** The Attack row — on the local player's Active only. */
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
/** A reason in the fewest of its own words: "Used", "Level 2". */
const shortReason = (reason: string) =>
  /^(already used|used\b)/i.test(reason) ? 'Used' : reason.replace(/^Unlocks at (Level \d+)$/, '$1');

/** A rule's first sentence as plain words, its scaling numbers read live. */
function firstSentence(rule: string, scale: Scale): string {
  const plain = parseMarkup(rule).map((t) => (t.type === 'text' ? t.text : shownNumber(t, scale))).join('');
  const m = plain.match(/^.*?[.!?](?=\s|$)/);
  return sentence((m ? m[0] : plain).trim());
}

/** A row's one line: the rule's first sentence in its fewest words. No
 *  bracketed reminder, no scene-setting before a colon when the effect
 *  follows it, no "to the enemy Active" (an attack's usual target); and one
 *  longer than the `max` letters the row holds ends at a clause, never
 *  mid-word. The whole rule is on the "i" card. */
function shortLine(rule: string, scale: Scale, max: number): string {
  let s = firstSentence(rule, scale).replace(/\s*\([^)]*\)/g, '');
  const lead = s.match(/^[^:]+:\s+((?:deal|shield|heal|stun)\b.*)$/i);
  if (lead) s = lead[1];
  s = s.replace(' to the enemy Active', '');
  if (s.length > max) {
    const head = s.slice(0, max + 1);
    const clause = Math.max(head.lastIndexOf(': '), head.lastIndexOf(', '), head.lastIndexOf(' and '));
    const at = clause > 16 ? clause : head.lastIndexOf(' ');
    s = `${s.slice(0, at).replace(/[,;:]$/, '')}\u2026`;
  }
  return sentence(s);
}

type Kind = 'weapon' | 'spirit' | 'vitality';
/** An ability's kind, read off its own rule: bullet damage is Deadlock's
 *  weapon orange, spirit damage its spirit purple, a heal or a Shield with no
 *  damage in it vitality green; spirit when the rule says none of these. */
function abilityKind(rule: string): Kind {
  const t = rule.toLowerCase();
  if (/bullet damage/.test(t)) return 'weapon';
  if (/spirit damage/.test(t)) return 'spirit';
  if (!/damage/.test(t) && /\b(heal|heals|shield|restore|restores)\b/.test(t)) return 'vitality';
  return 'spirit';
}
const KIND_ICON: Record<Kind, (size: number, color: string) => ReactNode> = {
  weapon: (size, color) => <SwordIcon size={size} color={color} />,
  spirit: (size, color) => <SpiritIcon size={size} color={color} />,
  vitality: (size, color) => <ShieldIcon size={size} color={color} />,
};

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [passiveOpen, setPassiveOpen] = useState<string | null>(null);

  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') return null;

  const mine = !!isMine;
  const side = mine ? poster.you : poster.rival;
  const kit = heroAbilities(data);
  const skillAbilities = kit.filter((x) => x.kind === 'skill').map((x) => x.ability);
  const passiveAbilities = kit.filter((x) => x.kind === 'passive').map((x) => x.ability);
  const attached = card.attached ?? [];

  const scale: Scale = { spirit: effectiveSpirit(card), bullet: effectiveAtk(card), who: data.name };
  // Which ability the hero has used this turn, so only that row reads Used.
  const usedSkill = card.skillUsedThisTurn ? (card.lastSkillUsed ?? data.skills[0]) : undefined;
  // What a kit ability costs (`kitCost`, the engine's own price): ONE number,
  // the soul wisp and what it costs now. A charged ultimate's coming down is
  // named for a screen reader ("16 → 7 souls").
  const price = (abilityId: AbilityId, short: boolean): ReactNode => {
    const n = kitCost(card, abilityId);
    const face = abilityId === data.ult ? ultimateCard(abilityId) : undefined;
    const label = face?.charged && n !== ultPrice(face) ? `${ultPrice(face)} → ${souls(n)}` : souls(n);
    if (n <= 0 && !face?.charged) return undefined;
    return (
      <span role="img" aria-label={label} style={{ display: 'inline-flex' }}>
        <Souls n={n} size={T.number} tone={short ? 'short' : 'mint'} />
      </span>
    );
  };
  // How an action prints: a rival's always reads quietly; yours is lit while
  // every gate is open, Used the turn it went, and dimmed with its reason.
  const modeOf = (usable: boolean, used: boolean, reason?: string): PlateMode =>
    !mine ? 'quiet' : used ? 'used' : usable ? 'ready' : reason ? 'blocked' : 'quiet';

  const form = heroForm(card);
  const level = card.level ?? 1;
  const ultFace = ultimateCard(data.ult);

  const cardW = isMobile ? Math.min(vw - 32, 360) : 360;
  // The letters an action row's line holds: its width less the tile and the
  // number, at the caption's size.
  const lineMax = Math.floor((cardW - 124) / 5.2);
  const portraitW = Math.round(HEAD * 280 / 380);
  const shield = card.statuses.find((st) => st.id === 'shield')?.value ?? 0;
  const shownStatuses = card.statuses.filter((st) => st.id !== 'shield');

  // ---- The actions: skill(s), ultimate, attack — then the passive line. ----
  const rows: { key: string; node: ReactNode }[] = [];

  for (const ability of skillAbilities) {
    const offer = skillOffers?.[ability.id];
    const used = usedSkill === ability.id;
    const usable = mine && !!onUseSkill && !!offer?.canUse && !used;
    const mode = modeOf(usable, used, offer?.blockedReason);
    const reason = mode === 'used' ? 'Used' : mode === 'blocked' ? offer?.blockedReason : undefined;
    const kind = abilityKind(ability.text);
    rows.push({
      key: ability.id,
      node: (
        <ActionRow
          ink={shopInk(kind).ink} mode={mode} calm={calm}
          name={ability.name}
          art={KIND_ICON[kind](20, poster.cream)}
          line={shortLine(ability.text, scale, lineMax)}
          right={price(ability.id, shortOfSouls(reason))}
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
    const locked = level < ULT_UNLOCK_LEVEL;
    // A rival's locked ultimate reads dimmed too: it is a fact, not a reason.
    const mode = !mine && locked ? 'blocked' : modeOf(usable, used, offer?.blockedReason);
    const reason = mode === 'used' ? 'Used' : mine && mode === 'blocked' ? offer?.blockedReason : undefined;
    const ink = shopInk(abilityKind(ultFace.text ?? '')).ink;
    rows.push({
      key: abilityId,
      node: (
        <ActionRow
          ult ink={ink} mode={mode} calm={calm}
          name={ultFace.name}
          // A charged ultimate is named so: its price is its own, not its size's.
          ultLabel={`Ultimate · ${ultFace.charged ? 'charged' : ultFace.size}`}
          art={<img src={ultIconSrc(ultFace.linkedHero)} alt="" draggable={false} style={{ display: 'block', width: ART - 10, height: ART - 10, objectFit: 'contain' }} />}
          line={shortLine(ultFace.text ?? '', scale, lineMax)}
          right={price(abilityId, shortOfSouls(reason))}
          reason={reason}
          onUse={onUseSkill ? () => { onUseSkill(abilityId); onClose(); } : undefined}
        />
      ),
    });
  }

  if (attack) {
    const usable = mine && !attack.blockedReason && !attack.made;
    const mode: PlateMode = !mine ? 'quiet' : attack.made ? 'used' : usable ? 'ready' : 'blocked';
    // The hero's Bullet Power: what its attack deals, as the card says it
    // (a target's Shield or resist is the board's to show when it lands).
    const dmg = scale.bullet;
    const weapon = shopInk('weapon').ink;
    rows.push({
      key: 'attack',
      node: (
        <ActionRow
          ink={weapon} mode={mode} calm={calm}
          name="Attack"
          art={<SwordIcon size={20} color={poster.cream} />}
          line={usable || mode === 'quiet' ? `Deal ${dmg} bullet damage. Ends your turn.` : undefined}
          right={<span style={NUMBER(T.display)}>{dmg}</span>}
          reason={mode === 'used' ? 'Used' : mode === 'blocked' ? attack.blockedReason : undefined}
          reasonBelow
          ariaLabel={usable ? `Attack: ${attack.line}. Free.` : undefined}
          onUse={() => { attack.onAttack(); onClose(); }}
        />
      ),
    });
  }

  // ---- The strip: items, then statuses, as many as one row holds. ----
  type Tile = { key: string; w: number; node: ReactNode };
  const tileOf = (eq: CardInstance): Tile => {
    const eqData = CARDS_BY_ID[eq.cardId];
    const rider = eqData?.type === 'hero';
    const open = openChip === eq.iid;
    const left = itemCooldown(eq);
    return {
      key: eq.iid, w: TILE,
      node: (
        <button
          key={eq.iid}
          type="button"
          aria-label={eqData?.name ?? eq.cardId}
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); setInfoOpen(false); setMoreOpen(false); setOpenChip(open ? null : eq.iid); }}
          style={{
            position: 'relative', width: TILE, height: TILE, padding: 0, flexShrink: 0,
            border: 'none', background: 'transparent', lineHeight: 0, borderRadius: 6,
            boxShadow: open ? `0 0 0 2px ${poster.cream}` : undefined,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          {rider ? (
            <span style={{ ...plateStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', width: TILE, height: TILE, boxSizing: 'border-box', borderColor: poster.status.buff }}>
              <HeroBadge cardId={eq.cardId} size={TILE - 6} />
            </span>
          ) : (
            <ItemIcon itemId={eq.cardId} size={TILE} chip marks={{ cooldown: left || undefined, charges: eq.charges ?? undefined }} />
          )}
        </button>
      ),
    };
  };
  const statusOf = (st: StatusInstance, i: number): Tile => {
    return {
      // A token's width is its mark and, for most, its value: allow for both.
      key: `s${i}`, w: TILE + 8,
      node: (
        <Explain key={`s${i}`} content={statusContent(st.id, { value: st.value, duration: st.duration })} style={{ display: 'inline-flex', flexShrink: 0 }}>
          <StatusIcon id={st.id} value={st.value} duration={st.duration} titled={false} token={TILE - 4} />
        </Explain>
      ),
    };
  };
  const tiles: Tile[] = [...attached.map(tileOf), ...shownStatuses.map(statusOf)];
  const stripW = cardW - 2 * PAD - 2;
  let used = 0;
  let fit = 0;
  for (const t of tiles) {
    const next = used + (fit > 0 ? TILE_GAP : 0) + t.w;
    if (next > stripW) break;
    used = next;
    fit += 1;
  }
  const overflow = fit < tiles.length;
  // Room for the "+n" tile: drop the last that fit until it does.
  let shown = fit;
  if (overflow) {
    let w = used;
    while (shown > 0 && w + TILE_GAP + TILE > stripW) { w -= tiles[shown - 1].w + TILE_GAP; shown -= 1; }
  }
  const hidden = tiles.slice(shown);
  const opened = attached.findIndex((eq) => eq.iid === openChip);

  const closeTo = (fn: () => void) => () => { fn(); onClose(); };
  const closePops = () => { setOpenChip(null); setMoreOpen(false); };

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
      <div aria-hidden style={{ flex: `${isMobile ? 3 : 2} 1 0px`, minHeight: isMobile ? 40 : 24, width: '100%' }} />
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
          onClick={closePops}
          style={{
            ...panelStyle,
            position: 'relative',
            width: cardW, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: 8,
            padding: PAD, borderRadius: 12,
            border: `1px solid ${side}`,
          }}
        >
          {/* HEADER — portrait, name, level, health; the "i". */}
          <div data-hero-readout style={{ display: 'flex', gap: 12, height: HEAD }}>
            <div style={{
              position: 'relative', width: portraitW, height: HEAD, flexShrink: 0,
              borderRadius: 7, overflow: 'hidden', background: poster.ground,
              boxShadow: `0 0 0 1px ${side}`,
            }}>
              <HeroPortrait cardId={data.id} art={form?.art} />
              <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: printEdge }} />
              {form && (
                <span role="note" style={{
                  ...CAPTION, ...ONE_LINE, position: 'absolute', left: 0, right: 0, bottom: 0,
                  padding: '3px 4px', textAlign: 'center', color: poster.cream,
                  background: 'rgba(8, 20, 19, 0.85)', borderTop: `1px solid ${poster.status.buff}`,
                }}>{`${form.label} · ${form.turns}`}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2px 0 6px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ ...NAME, flex: 1, paddingTop: 6, overflowWrap: 'anywhere' }}>{data.name}</span>
                <span style={{ lineHeight: 0, flexShrink: 0 }}><LevelRing level={level} exp={card.exp ?? 0} size={30} /></span>
                <button
                  type="button"
                  aria-label={infoOpen ? 'Hide hero details' : 'Hero details'}
                  aria-expanded={infoOpen}
                  onClick={(e) => { e.stopPropagation(); closePops(); setInfoOpen((v) => !v); }}
                  style={{
                    position: 'relative', zIndex: 9, flexShrink: 0,
                    width: 30, height: 30, padding: 0, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: infoOpen ? poster.cream : 'transparent',
                    color: infoOpen ? poster.ink : poster.cream,
                    border: `1.5px solid ${poster.creamDim}`,
                    fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 700, fontSize: T.number, lineHeight: 1,
                    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  }}
                >i</button>
              </div>
              <div role="img" aria-label={`${card.hp} of ${card.hpMax} HP${shield > 0 ? `, Shield ${shield}` : ''}`}
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span aria-hidden style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={hpNumberStyle(T.display)}>{card.hp}</span>
                  <span style={{ ...CAPTION }}>{`/ ${card.hpMax}`}</span>
                </span>
                <HpSegments hp={card.hp} max={card.hpMax} shield={shield} width="calc(100% - 4px)" height={10} style={{ marginLeft: 2 }} />
              </div>
            </div>
          </div>

          {/* STRIP — worn items and statuses, one row; a tap explains one
              over the sheet. */}
          {tiles.length > 0 && (
            <div style={{ position: 'relative' }}>
              <div data-hero-items data-hero-statuses role="group" aria-label="Worn items and effects" style={{
                display: 'flex', alignItems: 'center', gap: TILE_GAP, height: TILE, overflow: 'visible',
              }}>
                {tiles.slice(0, shown).map((t) => t.node)}
                {overflow && (
                  <button
                    type="button"
                    aria-label={`${hidden.length} more`}
                    aria-expanded={moreOpen}
                    onClick={(e) => { e.stopPropagation(); setOpenChip(null); setMoreOpen((v) => !v); }}
                    style={{
                      ...plateStyle, ...NUMBER(T.body),
                      width: TILE, height: TILE, padding: 0, flexShrink: 0, boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderStyle: 'dashed', borderColor: poster.creamDim,
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}
                  >{`+${hidden.length}`}</button>
                )}
              </div>
              {moreOpen && overflow && (
                <div onClick={(e) => e.stopPropagation()} style={{
                  ...plateStyle, position: 'absolute', zIndex: 10, top: TILE + 6, left: 0, right: 0,
                  padding: 8, display: 'flex', flexWrap: 'wrap', gap: TILE_GAP,
                  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.55)',
                }}>
                  {hidden.map((t) => t.node)}
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
                  style={{ position: 'absolute', zIndex: 11, top: TILE + 6, left: 0, right: 0 }}
                />
              )}
            </div>
          )}

          {/* ACTIONS — one row each, all alike. */}
          {rows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map((r) => <div key={r.key}>{r.node}</div>)}
            </div>
          )}

          {/* PASSIVES — a quiet line each, its name; a tap shows the rule. */}
          {passiveAbilities.map((ability) => {
            const open = passiveOpen === ability.id;
            return (
              <button
                key={ability.id}
                type="button"
                aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); setPassiveOpen(open ? null : ability.id); }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4,
                  padding: '4px 4px 2px', background: 'transparent', border: 'none', textAlign: 'left',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent', color: 'inherit',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden style={{ width: 6, height: 6, transform: 'rotate(45deg)', background: poster.creamDim, flexShrink: 0 }} />
                  <span style={{ ...NAME, fontSize: T.body, color: poster.creamDim, flex: 1 }}>{ability.name}</span>
                  <span aria-hidden style={{ ...CAPTION, fontSize: T.body }}>{open ? '−' : '+'}</span>
                </span>
                {open && <span style={{ ...CAPTION, paddingLeft: 14 }}>{sentence(plainRule(ability.text, scale))}</span>}
              </button>
            );
          })}

          {/* The whole card, over the sheet while the "i" is on. */}
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
              ariaLabel={`Retreat ${data.name} to the bench — ${retreat.cost > 0 ? `costs ${souls(retreat.cost)}` : 'free'}${retreat.incomingName ? `; ${retreat.incomingName} goes in` : ''}`}
              label={(
                <>
                  <span>Retreat</span>
                  {retreat.cost > 0
                    ? <Souls n={retreat.cost} size={T.body} tone={shortOfSouls(retreat.blockedReason) ? 'short' : 'mint'} />
                    : <span style={{ fontSize: T.label, opacity: 0.8 }}>Free</span>}
                </>
              )}
              caption={retreat.blockedReason ?? undefined}
            />
          )}
          <Pill ghost onClick={onClose} label="Close" />
        </div>
      </motion.div>
      <div aria-hidden style={{ flex: '1 1 0px', minHeight: isMobile ? 16 : 24, width: '100%' }} />
    </motion.div>
  );
}

/** A rule as plain words, its scaling numbers read live — the whole of it. */
function plainRule(rule: string, scale: Scale): string {
  return parseMarkup(rule).map((t) => (t.type === 'text' ? t.text : shownNumber(t, scale))).join('');
}

// ----- The actions -----

/**
 * One action, as every action prints on the sheet: a square picture tile
 * framed in the ability's colour, the name, at most one line under it, and
 * one number at the right.
 *
 *   ready    the row is the button, edged in its colour; a usable ultimate
 *            glows (`chargedGlow`) and wears the ultimate mark
 *   used /   dimmed; the one reason ("Used", "Level 2", "Need 8 souls")
 *   blocked  stands in the number's place (the attack's under its name),
 *            and the line goes
 *   quiet    the row as it reads (a rival's hero): not a button
 *
 * The name stays the row's first words — the row is found by its text.
 */
function ActionRow({
  ult = false, ink, mode, name, ultLabel, art, line, right, reason, reasonBelow = false, onUse, ariaLabel, calm,
}: {
  ult?: boolean;
  /** The kind's colour: the picture tile's frame. */
  ink: string;
  mode: PlateMode;
  name: string;
  /** The ultimate's name for its mark: "Ultimate · charged". */
  ultLabel?: string;
  art: ReactNode;
  line?: string;
  /** The one number: a Souls price, the attack's damage. */
  right?: ReactNode;
  reason?: string;
  /** The reason goes under the name, the number stays (the attack). */
  reasonBelow?: boolean;
  onUse?: () => void;
  ariaLabel?: string;
  calm: boolean;
}) {
  const ready = mode === 'ready' && !!onUse;
  const dim = mode === 'used' || mode === 'blocked';
  const glow = ult && ready;
  const go = (e: SyntheticEvent) => { e.stopPropagation(); onUse?.(); };
  const said = reason ? shortReason(reason) : undefined;
  const caption = dim ? (reasonBelow ? said : undefined) : line;

  const inner = (
    <>
      <span style={{
        position: 'relative', width: ART, height: ART, flexShrink: 0, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7, background: poster.ink,
        boxShadow: `inset 0 0 0 2px ${ink}`,
        opacity: dim ? 0.45 : 1, filter: dim ? 'saturate(0.4)' : undefined,
      }}>
        {art}
        {ult && ultLabel && (
          <span role="img" aria-label={ultLabel} style={{
            position: 'absolute', right: -4, top: -4, width: 16, height: 16, borderRadius: '50%',
            display: glow ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
            background: ink, boxShadow: `0 0 0 1.5px ${poster.slate}`,
          }}>
            <span aria-hidden style={ultimateGlyph(12, poster.ink)} />
          </span>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ ...NAME, ...ONE_LINE, opacity: dim ? 0.5 : 1 }}>{name}</span>
        {caption && <span style={{ ...CAPTION, ...ONE_LINE, color: dim ? poster.cream : poster.creamDim }}>{caption}</span>}
      </span>
      <span style={{ flexShrink: 0, maxWidth: '42%', display: 'flex', justifyContent: 'flex-end' }}>
        {dim && !reasonBelow && said
          ? <span title={reason} style={{ ...CAPTION, ...ONE_LINE, color: poster.cream, textAlign: 'right' }}>{said}</span>
          : <span style={{ opacity: dim ? 0.45 : 1, display: 'inline-flex' }}>{right}</span>}
      </span>
    </>
  );

  const row: CSSProperties = {
    ...plateStyle,
    display: 'flex', alignItems: 'center', gap: 10,
    minHeight: 60, padding: '7px 12px 7px 8px', boxSizing: 'border-box',
    background: dim ? 'rgba(8, 20, 19, 0.55)' : plateStyle.background,
    borderColor: ready ? ink : 'rgba(232, 224, 204, 0.12)',
    boxShadow: glow ? chargedGlow(ink) : ready ? `0 0 0 1px ${ink}` : 'none',
  };

  if (!ready) return <div style={row}>{inner}</div>;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      whileTap={calm ? undefined : { scale: 0.98, filter: 'brightness(1.15)' }}
      animate={glow && !calm ? { boxShadow: [chargedGlow(ink), `0 0 0 1.5px ${ink}, 0 0 20px 3px color-mix(in srgb, ${ink} 75%, transparent), inset 0 0 14px color-mix(in srgb, ${ink} 30%, transparent)`, chargedGlow(ink)] } : undefined}
      transition={glow && !calm ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } }}
      style={{ ...row, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
    >
      {inner}
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

/**
 * Every rule the hero's kit prints, whole: its passives, its skills and its
 * ultimate (with a charged ultimate's own line) — the "i" view's Abilities,
 * where everything the sheet cuts down to one line is read in full.
 */
export function HeroRules({ card, data }: { card: CardInstance; data: HeroCard }) {
  const scale: Scale = { spirit: effectiveSpirit(card), bullet: effectiveAtk(card), who: data.name };
  const ult = ultimateCard(data.ult);
  const entry = (key: string, name: string, tag: string, rule: string, note?: string) => (
    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ ...NAME, fontSize: T.body }}>{name}</span>
        <span style={{ ...CAPTION, flexShrink: 0 }}>{tag}</span>
      </div>
      <div style={{ ...text.body, fontSize: T.body, lineHeight: 1.4, color: poster.creamDim }}>
        <RuleText text={sentence(rule)} keywordColor={poster.cream} scale={scale} />
      </div>
      {note && (
        <div style={{ ...CAPTION, fontStyle: 'italic' }}>
          <RuleText text={note} keywordColor={poster.cream} scale={scale} />
        </div>
      )}
    </div>
  );
  return (
    <>
      {heroAbilities(data).map(({ kind, ability }: { kind: 'skill' | 'passive'; ability: HeroAbilityDef }) =>
        entry(ability.id, ability.name, kind === 'passive' ? `Passive · ${TRIGGER_LABELS[ability.trigger] ?? ability.trigger}` : 'Skill', ability.text))}
      {ult && entry(ult.id, ult.name, `Ultimate · ${ult.charged ? 'charged' : ult.size} · Level ${ULT_UNLOCK_LEVEL}`, ult.text ?? '', ult.charged?.text)}
    </>
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
      {/* Header, clear of the "i" at the top right. */}
      <div style={{ minHeight: 28, display: 'flex', alignItems: 'center', margin: '-1px 40px 0 0' }}>
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
      {section('Abilities')}
      <HeroRules card={card} data={data} />
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

/** Pocket's pill: Retreat (a dark plate edged in your amber, its price on it;
 *  the one reason under it when it is blocked) and Close (an outline on the scrim). A
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
