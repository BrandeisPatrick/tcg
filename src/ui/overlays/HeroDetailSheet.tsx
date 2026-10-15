import { motion } from 'framer-motion';
import type { AbilityId, CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import type { HeroAbilityDef } from '@/abilities';
import { STATUSES_BY_ID } from '@/statuses';
import { effectiveAtk, effectiveSpirit, heroAbilities } from '@/engine/query';
import { SKILL_COST } from '@/engine/constants';
import { HeroPortrait, HeroBadge } from '@/cards/art/heroArt';
import { StatusIcon } from '../card/StatusIcon';
import { LevelRing } from '../card/LevelRing';
import { LevelTrim } from '../card/LevelTrim';
import { spring, text, fonts } from '../tokens';
import { poster, chamfer, sheetStyle, clipBoth, scrimStyle } from '../poster';
import { PosterButton } from '../chrome';
import { RuleText, type Scale } from '../card/RuleText';
import { useViewport } from '../hooks/useViewport';

/** Stencil eyebrow — block titles, rail headers, stat labels and chips. */
const eyebrow = {
  fontFamily: fonts.display,
  fontSize: 10.5,
  letterSpacing: '0.22em',
  textTransform: 'uppercase' as const,
  lineHeight: 1,
} as const;

/** The turn's attack, offered on your Active's sheet: a swing at the rival
 *  Active for its bullet damage. Free, one-way, one a turn — and the Active
 *  makes it or uses its skill, not both. A hero with reach may name any living
 *  rival: the plate then still speaks for the default target (the first the
 *  engine lists), and tapping it closes the sheet and asks who (`onAttack`; the
 *  board arms the targeting, see board/attackAim.ts). */
export interface AttackOffer {
  /** What the swing would do ("Hits Dynamo for 2 bullet damage"), while it
   *  can be made — at the default target. */
  line?: string;
  /** Why it cannot be made right now ("No attacks on Turn 1"), printed in
   *  the line's place. */
  blockedReason?: string;
  /** This hero made the turn's attack. */
  made?: boolean;
  onAttack: () => void;
}

/** One of the hero's skills as the sheet offers it: every gate for using it
 *  is open (its turn, the hero's one skill of the turn, statuses, cooldown,
 *  souls, a target), or the short reason it can't be used, shown inside its
 *  skill card. */
export interface SkillOffer {
  canUse: boolean;
  blockedReason?: string;
}

interface Props {
  card: CardInstance;
  /** True if this hero belongs to the local player. Drives the Skill action. */
  isMine?: boolean;
  /** Each skill's offer, by ability id. A skill with none is not usable. */
  skills?: Record<AbilityId, SkillOffer>;
  /** The player tapped this skill's card. */
  onUseSkill?: (skillId: AbilityId) => void;
  /** The Attack plate — on the local player's Active only. */
  attack?: AttackOffer;
  /** Retreat lives on your Active's sheet: he goes to the bench and a bench
   *  hero takes the fight. Absent when nobody on the bench can step in. */
  retreat?: {
    cost: number;
    /** Who comes in, when exactly one hero can — printed on the button. With
     *  more than one, the player picks after tapping. */
    incomingName?: string;
    /** Why it cannot be done right now ("Need 2 souls"). The button prints
     *  the reason and stays inert. */
    blockedReason?: string;
  };
  onRetreat?: () => void;
  onClose: () => void;
}

export function HeroDetailSheet({
  card, isMine, skills: skillOffers, onUseSkill, attack,
  retreat, onRetreat, onClose,
}: Props) {
  const { isMobile, width: vw, height: vh } = useViewport();

  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') return null;

  // The hero's kit, skills first: a card for each skill (tap to use), a panel
  // for each passive. Each ability names itself (`name`).
  const kit = heroAbilities(data);
  const skillAbilities = kit.filter((x) => x.kind === 'skill').map((x) => x.ability);
  const passiveAbilities = kit.filter((x) => x.kind === 'passive').map((x) => x.ability);
  const attached = card.attached ?? [];

  // The panels print the ability's own card text, sentence-cased — the same
  // marked words the card prints, so a number that scales with Spirit (or
  // Bullet) Power is drawn in its colour with this hero's live figures behind
  // it: base + what the hero has now.
  const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const describe = (a: HeroAbilityDef) => sentence(a.text);
  const scale: Scale = { spirit: effectiveSpirit(card), bullet: effectiveAtk(card), who: data.name };
  // Which skill the hero has used this turn, so only that card reads USED.
  const usedSkill = card.skillUsedThisTurn ? (card.lastSkillUsed ?? data.skills[0]) : undefined;

  // The card at the trading-card ratio (5:7). On desktop it stands as tall
  // as the window allows, up to 600, leaving room under it for Retreat and
  // Close; the rail sits beside it. Phones stack the card above the rail, so
  // there it takes as much of the width as fits.
  const cardH = isMobile
    ? Math.round(Math.min(428, vw - 32) * 7 / 5)
    : Math.max(420, Math.min(600, vh - 190));
  const cardW = Math.round(cardH * 5 / 7);
  // The art board keeps its share of the card as the card grows. Phones give
  // the rules a little more of it: their narrower plates wrap to more lines.
  const artH = Math.round(cardH * (isMobile ? 0.38 : 0.42));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        ...scrimStyle,
        zIndex: 95,
        // Phones stack the card above the rail and may exceed the viewport, so
        // pin to the top and scroll instead of clipping — starting below the
        // system gear, which a full-width card would otherwise run under.
        alignItems: isMobile ? 'flex-start' : 'center',
        padding: isMobile ? '64px 16px 24px' : '24px 16px',
        overflowY: isMobile ? 'auto' : undefined,
      }}
    >
      {/* Three columns: the card (pure hero face — art + ability text), its
          action controls beneath it, and the satellite stat rail. Everything
          that isn't the hero's printed face lives OUTSIDE the card frame. */}
      <div
        role="dialog"
        aria-label="Hero sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'center' : 'flex-start',
          gap: 14, maxWidth: '100%',
        }}
      >
      {/* Card column: the card itself + its action buttons below the frame. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* The hero as a flat charcoal-framed print: art board + cream text
          board (Skill/Passive). The Skill is tap-to-use; Retreat/Close live
          below the card. */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={spring.snappy}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: cardW, height: cardH,
          display: 'flex', flexDirection: 'column',
          background: poster.frame,          // charcoal frame, same as CardFrame
          borderRadius: 10,
          border: `2px solid ${poster.edge}`,
          boxShadow: '0 14px 26px rgba(0, 0, 0, 0.35), 0 3px 8px rgba(0, 0, 0, 0.25)',
          color: poster.ink,
          overflow: 'hidden',
        }}
      >
        {/* ART BOARD — the portrait printed edge to edge inside the frame's
            6px margin, with the recessed inner edge every poster card shares.
            Sized so the rules (Skill/Passive, and the Attack on your Active)
            fit the text board below without scrolling. */}
        <div style={{
          position: 'relative', height: artH, flexShrink: 0, overflow: 'hidden',
          margin: '6px 6px 0', borderRadius: 6,
          background: '#0f1214',
        }}>
          <HeroPortrait cardId={data.id} full />
          {/* Inner edge — the print sits slightly recessed in its frame. */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 -18px 24px -12px rgba(0, 0, 0, 0.5)',
            zIndex: 2,
          }} />
          {/* Name band — cream label along the base of the print.
              Level / BP / HP / SPI live in the right-side stat rail, off-card. */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '8px 12px 9px',
            background: poster.paperBand,
            zIndex: 3,
          }}>
            <span style={{
              fontFamily: fonts.display, fontSize: 18, color: poster.ink,
              letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1,
              display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{data.name}</span>
          </div>
        </div>

        {/* TEXT BOARD — the cream rules band under the art. Holds the hero's
            own ability (Skill/Passive) and, on your Active, the turn's
            Attack. The Ultimate is NOT shown here (it's cast from hand), so
            the content fits without scrolling. */}
        <div style={{
          flex: '1 1 auto', minHeight: 0,
          display: 'flex', flexDirection: 'column',
          margin: 6, borderRadius: 6,
          border: `1px solid ${poster.inkRule}`,
          overflow: 'hidden',
          background: poster.paperBand,
          position: 'relative',
        }}>
          {/* Rules content — Skill (tap-to-use) or Passive, then the Attack
              on your Active. The overflowY is a safety for an unusually long
              skill; with no ultimate here it does not normally scroll. */}
          <div style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
            color: poster.ink,
            padding: '13px 13px 8px',
          }}>
            {/* Skills — tap one to use it (the hero uses one a turn); then
                the non-actionable Passive blocks. */}
            {skillAbilities.length > 0 && (
              <Block title={skillAbilities.length > 1 ? 'Skills' : 'Skill'}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {skillAbilities.map((ability) => {
                    const offer = skillOffers?.[ability.id];
                    return (
                      <SkillActionCard
                        key={ability.id}
                        name={ability.name}
                        description={describe(ability)}
                        scale={scale}
                        mine={!!isMine}
                        used={usedSkill === ability.id}
                        canUse={!!offer?.canUse}
                        blockedReason={offer?.blockedReason}
                        onUse={onUseSkill ? () => { onUseSkill(ability.id); onClose(); } : undefined}
                      />
                    );
                  })}
                </div>
              </Block>
            )}
            {passiveAbilities.map((ability) => (
              <Block key={ability.id} title="Passive">
                <PassivePanel
                  name={ability.name}
                  description={describe(ability)}
                  scale={scale}
                  trigger={ability.trigger}
                />
              </Block>
            ))}
            {/* The Attack — your Active's other move. Beside a skill the two
                are split by an "or": the Active does one a turn, and using
                either spends the other. */}
            {attack && (
              <>
                {skillAbilities.length > 0 && <OrRule />}
                <AttackPlate offer={attack} onAttack={() => { attack.onAttack(); onClose(); }} />
              </>
            )}
          </div>
        </div>

        {/* The level bezel, in the frame's charcoal margin as on the tile. */}
        <LevelTrim level={card.level ?? 1} radius={8} />
      </motion.div>

      {/* Action controls — below the card, outside the frame. The Skill itself
          is tapped inside the card; Retreat + Close live here. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: cardW }}>
        {/* Retreat sends this sheet's hero — the Active — to the bench. The
            headline names the move; the line under it says who goes where,
            or why it cannot be done yet. */}
        {retreat && onRetreat && (
          <ActionButton
            onClick={() => { onRetreat(); onClose(); }}
            disabled={!!retreat.blockedReason}
            icon="↻"
            label="Retreat to bench"
            caption={retreat.blockedReason
              ?? (retreat.incomingName
                ? `${data.name} to bench · ${retreat.incomingName} to Active`
                : `${data.name} to bench · you pick who goes in`)}
            ariaLabel={`Retreat ${data.name} to the bench — costs ${retreat.cost} souls`}
            badge={`−${retreat.cost}`}
          />
        )}
        <PosterButton variant="ghost" size="sm" onClick={onClose} style={{ width: '100%' }}>
          Close
        </PosterButton>
      </div>
      </div>{/* end card column */}

      {/* Satellite rail — the hero's live game-state (level, stats, buffs, gear)
          as tokens beside the card, off the card face. Always present (every
          hero has stats); effects/equipment panels mount only when relevant. */}
      {(
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ ...spring.snappy, delay: 0.05 }}
          style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            // On phones the rail sits below the card and flows with the page
            // scroll (no inner cap); on desktop it's a fixed-width side rail.
            width: isMobile ? cardW : 280,
            maxHeight: isMobile ? undefined : cardH,
            overflowY: isMobile ? undefined : 'auto',
          }}
        >
          {/* Stats — Level + BP / HP / SPI, pulled off the card face */}
          <SidePanel title="Stats">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <LevelRing level={card.level ?? 1} exp={card.exp ?? 0} size={42} />
              <div style={{ ...eyebrow, fontSize: 14, letterSpacing: '0.12em', color: poster.ink }}>
                Level {card.level ?? 1}
              </div>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-around', alignItems: 'center',
              marginTop: 4, paddingTop: 11,
              borderTop: `1px solid ${poster.inkRule}`,
            }}>
              <RailStat label="BP" value={effectiveAtk(card)} color={poster.stat.atk} />
              <RailStat label="HP" value={`${card.hp}/${card.hpMax}`} color={poster.stat.hp} />
              <RailStat label="SPI" value={effectiveSpirit(card)} color={poster.stat.spirit} />
            </div>
          </SidePanel>

          {card.statuses.length > 0 && (
            <SidePanel title="Active Effects">
              {card.statuses.map((s, i) => {
                const def = STATUSES_BY_ID[s.id];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {/* Pill + title on one row; description spans the FULL panel
                        width below so it reads without cramped wrapping. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <StatusIcon id={s.id} value={s.value} duration={s.duration} size="large" />
                      <div style={{ ...text.label, color: poster.ink, minWidth: 0 }}>
                        {def?.title ?? s.id}
                      </div>
                    </div>
                    <div style={{ ...text.body, fontSize: 12, color: poster.inkDim }}>
                      {def?.desc.replace('<value>', String(s.value))}{' '}
                      <span style={{ color: poster.inkFaint }}>({s.duration}) left</span>
                    </div>
                  </div>
                );
              })}
            </SidePanel>
          )}

          {attached.length > 0 && (
            <SidePanel title="Equipment">
              {attached.map((eq) => {
                const eqData = CARDS_BY_ID[eq.cardId];
                const merged = eqData?.type === 'hero';
                const acc = merged ? poster.status.buff : poster.edge;
                return (
                  <div key={eq.iid} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 32, height: 32, flexShrink: 0,
                      borderRadius: 6, overflow: 'hidden',
                      background: poster.frame, border: `1.5px solid ${acc}`,
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
                    }}>
                      {merged ? (
                        <HeroBadge cardId={eq.cardId} size={32} />
                      ) : (
                        <img src={`${import.meta.env.BASE_URL}items/${eq.cardId}.webp`} alt="" loading="lazy" decoding="async"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ ...text.label, color: poster.ink }}>
                        {eqData?.name ?? eq.cardId}
                      </div>
                      {/* What the item does — the panel should explain the effect,
                          not just name it. */}
                      {!merged && eqData?.text && (
                        <div style={{ ...text.body, fontSize: 12, color: poster.inkDim }}>
                          <RuleText text={eqData.text} />
                        </div>
                      )}
                      {merged && eq.remMergeTurnsLeft != null && (
                        <div style={{ ...text.body, fontSize: 12, color: poster.status.buff }}>
                          merged · {eq.remMergeTurnsLeft}t left
                        </div>
                      )}
                      {!merged && eq.charges != null && (
                        <div style={{ ...text.body, fontSize: 12, color: poster.inkFaint }}>
                          {eq.charges} charge{eq.charges === 1 ? '' : 's'} left
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </SidePanel>
          )}
        </motion.div>
      )}
      </div>{/* end card + rail row */}
    </motion.div>
  );
}

// ----- Sub-components -----

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...eyebrow, color: poster.inkDim, marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  );
}

/** Stat readout for the off-card stat rail: big tabular number in its stat
 *  ink over a small stencil label. */
function RailStat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
      <span style={{ ...text.numeric, fontSize: 20, color }}>{value}</span>
      <span style={{ ...eyebrow, fontSize: 10, color: poster.inkDim }}>{label}</span>
    </div>
  );
}

/** A satellite panel beside the card (stats / buffs / gear): a small cream
 *  sheet with an ink-tag header, so it reads as the card's paperwork without
 *  being inside its frame. */
function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      ...sheetStyle,
      borderRadius: 10,
      overflow: 'hidden',
      color: poster.ink,
    }}>
      <div style={{
        padding: '8px 12px',
        background: poster.ink,
        ...eyebrow, color: poster.paper,
      }}>{title}</div>
      <div style={{ padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {children}
      </div>
    </div>
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
 * Passive ability block: name + trigger chip + description. No action — passives
 * just fire when their trigger condition is met.
 */
function PassivePanel({ name, description, scale, trigger }: { name: string; description: string; scale: Scale; trigger: string }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 6,
      background: 'transparent', border: `1px solid ${poster.inkRule}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <span style={{ fontFamily: fonts.display, fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.1, color: poster.ink }}>{name}</span>
        <span style={{ flexShrink: 0, ...eyebrow, fontSize: 10, color: poster.status.buff }}>{TRIGGER_LABELS[trigger] ?? trigger}</span>
      </div>
      {description && (
        <div style={{ ...text.body, color: poster.inkDim }}>
          <RuleText text={description} scale={scale} />
        </div>
      )}
    </div>
  );
}

/**
 * The Skill card IS the "use skill" button. When the skill is usable (it's the
 * player's hero and all gates pass) the whole card is a pressable red action
 * plate; otherwise it renders as a flat, outlined info card (USED / blocked
 * reason / enemy hero). The chip prints what it costs.
 */
function SkillActionCard({
  name, description, scale, mine, used, canUse, blockedReason, onUse,
}: {
  name: string;
  description: string;
  scale: Scale;
  mine: boolean;
  used: boolean;
  canUse: boolean;
  blockedReason?: string;
  onUse?: () => void;
}) {
  const interactive = mine && !!onUse && canUse && !used;

  // Ink on the outlined plate; cream on the red action plate.
  const fg = interactive ? poster.paper : poster.ink;
  const fgDim = interactive ? poster.paper : poster.inkDim;
  const chip = used
    ? { label: 'USED', color: poster.inkFaint }
    : { label: `${SKILL_COST} soul${SKILL_COST === 1 ? '' : 's'}`, color: interactive ? poster.paper : poster.inkDim };

  return (
    <motion.div
      role={interactive ? 'button' : undefined}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      onClick={interactive ? (e) => { e.stopPropagation(); onUse!(); } : undefined}
      style={{
        padding: '14px 14px 12px',
        ...(interactive
          ? {
              background: poster.red,
              border: `2px solid ${poster.red}`,
              ...clipBoth(chamfer(8)),
            }
          : {
              background: 'transparent',
              border: `1px solid ${poster.inkRule}`,
              borderRadius: 6,
            }),
        color: fg,
        cursor: interactive ? 'pointer' : 'default',
        opacity: used ? 0.7 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <span style={{ fontFamily: fonts.display, fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.1, color: fg }}>{name}</span>
        <span style={{ flexShrink: 0, ...eyebrow, fontSize: 10, color: chip.color }}>{chip.label}</span>
      </div>
      {description && (
        <div style={{ ...text.body, color: fgDim }}>
          <RuleText text={description} keywordColor={interactive ? fg : undefined} scale={scale} />
        </div>
      )}

      {/* When the skill can't be used for a stated reason (e.g. "Not your
          turn"), show it. Usable skills need no prompt — the red action plate
          + READY chip already invite the tap; the used state is the USED chip. */}
      {!interactive && mine && !canUse && !used && blockedReason && (
        <div style={{
          marginTop: 10, paddingTop: 8, borderTop: `1px solid ${poster.inkRule}`,
          textAlign: 'center', ...text.body, color: poster.inkDim,
        }}>{blockedReason}</div>
      )}
    </motion.div>
  );
}

/** The either/or between your Active's skill and its attack: one a turn. */
function OrRule() {
  return (
    <div role="separator" aria-label="or — one a turn" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '-4px 0 10px' }}>
      <span aria-hidden style={{ flex: 1, height: 1, background: poster.inkRule }} />
      <span aria-hidden style={{ ...eyebrow, fontSize: 10, color: poster.inkDim }}>or · one a turn</span>
      <span aria-hidden style={{ flex: 1, height: 1, background: poster.inkRule }} />
    </div>
  );
}

/**
 * The Attack plate: your Active swings at the rival Active for its bullet
 * damage. Free, so it carries no cost — the chip says so. Ready, the whole
 * plate is the button, printed in ink so it never reads as the skill's red
 * plate beside it, and its line says what the swing would do. Otherwise it
 * is the same flat outlined card a skill turns into, and the line is the
 * reason. Its accessible name starts with "Attack", which is how the
 * tutorial's gate finds it.
 */
function AttackPlate({ offer, onAttack }: { offer: AttackOffer; onAttack: () => void }) {
  const interactive = !offer.blockedReason && !offer.made;
  const line = interactive ? offer.line : offer.blockedReason;
  const fg = interactive ? poster.paper : poster.ink;
  const chip = offer.made
    ? { label: 'USED', color: poster.inkFaint }
    : { label: 'Free', color: interactive ? poster.gold : poster.inkDim };
  const go = (e: React.SyntheticEvent) => { e.stopPropagation(); onAttack(); };
  return (
    <motion.div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Attack: ${line}. Free.` : undefined}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      onClick={interactive ? go : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } } : undefined}
      style={{
        padding: '12px 14px 11px',
        ...(interactive
          ? {
              background: poster.ink,
              border: `2px solid ${poster.ink}`,
              ...clipBoth(chamfer(8)),
            }
          : {
              background: 'transparent',
              border: `1px solid ${poster.inkRule}`,
              borderRadius: 6,
            }),
        color: fg,
        cursor: interactive ? 'pointer' : 'default',
        opacity: offer.made ? 0.7 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <span style={{ fontFamily: fonts.display, fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.1, color: fg }}>Attack</span>
        <span style={{ flexShrink: 0, ...eyebrow, fontSize: 10, color: chip.color }}>{chip.label}</span>
      </div>
      {line && <div style={{ ...text.body, color: interactive ? poster.cream : poster.inkDim }}>{line}</div>}
    </motion.div>
  );
}

/** Secondary action (Retreat): the poster's paper button, full width, with
 *  the soul cost on a red sticker and an optional plain-type line under the
 *  headline saying what the move does. Disabled, it drops to the cream
 *  outline the dark scrim needs and the line says why. The click stops here
 *  so the backdrop's dismiss never sees it. */
function ActionButton({
  onClick, icon, label, caption, badge, ariaLabel, disabled = false,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  caption?: string;
  badge?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, width: '100%' }}>
      <PosterButton
        variant="paper"
        onClick={onClick}
        disabled={disabled}
        ariaLabel={ariaLabel}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          ...(caption ? { padding: '11px 16px 12px' } : {}),
          ...(disabled ? { color: poster.creamDim, border: `2px solid ${poster.edge}` } : {}),
        }}
      >
        <span aria-hidden>{icon}</span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, minWidth: 0, textAlign: 'left' }}>
          <span style={caption ? { fontSize: 15, letterSpacing: '0.14em' } : undefined}>{label}</span>
          {caption && (
            <span style={{
              fontFamily: fonts.ui, fontSize: 12, fontWeight: 500, letterSpacing: 'normal',
              textTransform: 'none', lineHeight: 1.25, color: disabled ? poster.creamDim : poster.inkDim,
            }}>{caption}</span>
          )}
        </span>
        {badge && (
          <span style={{
            padding: '3px 8px 4px', borderRadius: 3,
            background: disabled ? 'transparent' : poster.red,
            border: `1px solid ${disabled ? poster.creamFaint : poster.red}`,
            color: disabled ? poster.creamDim : poster.paper,
            fontFamily: fonts.display, fontSize: 11, letterSpacing: '0.12em', lineHeight: 1,
          }}>{badge}</span>
        )}
      </PosterButton>
    </div>
  );
}
