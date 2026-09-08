import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { STATUSES_BY_ID } from '@/statuses';
import { effectiveAtk } from '@/engine/util';
import { HeroPortrait, HeroBadge } from '@/cards/art/heroArt';
import { StatusIcon } from '../card/StatusIcon';
import { LevelRing } from '../card/LevelRing';
import { spring, text, fonts } from '../tokens';
import { poster, chamfer, sheetStyle, clipBoth } from '../poster';
import { PosterButton } from '../chrome';
import { RuleText } from '../card/RuleText';
import { useViewport } from '../hooks/useViewport';

/** Stencil eyebrow — block titles, rail headers, stat labels and chips. */
const eyebrow = {
  fontFamily: fonts.display,
  fontSize: 10.5,
  letterSpacing: '0.22em',
  textTransform: 'uppercase' as const,
  lineHeight: 1,
} as const;

interface Props {
  card: CardInstance;
  /** True if this hero belongs to the local player. Drives the Skill action + Retreat. */
  isMine?: boolean;
  /** All gates for using the skill satisfied (player flag, per-hero, CC). */
  canUseSkill?: boolean;
  /** Short reason why the skill can't be used, shown inside the skill card. */
  skillBlockedReason?: string;
  onUseSkill?: () => void;
  canRetreat?: boolean;
  retreatCost?: number;
  onRetreat?: () => void;
  onClose: () => void;
}

export function HeroDetailSheet({
  card, isMine, canUseSkill, skillBlockedReason, onUseSkill,
  canRetreat, retreatCost = 2, onRetreat, onClose,
}: Props) {
  const { isMobile } = useViewport();

  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') return null;

  const skillAbility = data.skill ? getAbility(data.skill) : null;
  const passiveAbility = data.passives?.[0] ? getAbility(data.passives[0]) : null;
  const attached = card.attached ?? [];

  // Ability names carry the hero prefix ("Paige Plot Armor"); strip it so the
  // skill/passive reads as just the ability ("Plot Armor") — the card already
  // names the hero.
  const stripHero = (n: string) => (n.startsWith(`${data.name} `) ? n.slice(data.name.length + 1) : n);
  const skillName = skillAbility ? stripHero(extractAbilityName(skillAbility.prompt) ?? data.name) : '';
  const passiveName = passiveAbility ? stripHero(extractAbilityName(passiveAbility.prompt) ?? `${data.name}'s Passive`) : '';
  // Ability prompts read "Hero Name — trigger: effect." — the extracted desc
  // fragment starts lowercase; sentence-case it for the panel.
  const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const skillDesc = sentence(skillAbility ? (extractAbilityDesc(skillAbility.prompt) ?? skillAbility.prompt ?? '') : '');
  const passiveDesc = sentence(passiveAbility ? (extractAbilityDesc(passiveAbility.prompt) ?? passiveAbility.prompt ?? data.text ?? '') : '');

  // Phones can't fit the 340 card + 280 rail side by side (634px), so the
  // card+rail row stacks vertically and the card itself shrinks a touch.
  const cardW = isMobile ? 300 : 340;
  const cardH = isMobile ? 420 : 476;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: poster.scrim,
        backdropFilter: 'blur(6px)', zIndex: 95,
        display: 'flex',
        // Phones stack the card above the rail and may exceed the viewport, so
        // pin to the top and scroll instead of clipping.
        alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'center',
        padding: '24px 16px',
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
          // Fixed TCG trading-card ratio (5:7 ≈ 0.714).
          width: cardW, height: cardH,
          maxHeight: `min(${cardH}px, 92vh)`,
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
            Sized so the rules (Skill/Passive, no ultimate) fit the text board
            below without scrolling. */}
        <div style={{
          position: 'relative', height: 188, flexShrink: 0, overflow: 'hidden',
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
            own ability (Skill/Passive). The Ultimate is NOT shown here (it's
            cast from hand), so the content fits without scrolling. */}
        <div style={{
          flex: '1 1 auto', minHeight: 0,
          display: 'flex', flexDirection: 'column',
          margin: 6, borderRadius: 6,
          border: `1px solid ${poster.inkRule}`,
          overflow: 'hidden',
          background: poster.paperBand,
          position: 'relative',
        }}>
          {/* Rules content — Skill (tap-to-use) or Passive. The overflowY is a
              safety for an unusually long skill; with no ultimate here it does
              not normally scroll. */}
          <div style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
            color: poster.ink,
            padding: '13px 13px 8px',
          }}>
            {/* Skill — tap to use; or a non-actionable Passive block. */}
            {skillAbility ? (
              <Block title="Skill">
                <SkillActionCard
                  name={skillName}
                  description={skillDesc}
                  mine={!!isMine}
                  used={!!card.skillUsedThisTurn}
                  canUse={!!canUseSkill}
                  blockedReason={skillBlockedReason}
                  onUse={onUseSkill ? () => { onUseSkill(); onClose(); } : undefined}
                />
              </Block>
            ) : passiveAbility ? (
              <Block title="Passive">
                <PassivePanel
                  name={passiveName}
                  description={passiveDesc}
                  trigger={passiveAbility.trigger}
                />
              </Block>
            ) : null}
          </div>
        </div>
      </motion.div>

      {/* Action controls — below the card, outside the frame. The Skill itself
          is tapped inside the card; Retreat + Close live here. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: cardW }}>
        {canRetreat && onRetreat && (
          <ActionButton
            onClick={() => { onRetreat(); onClose(); }}
            icon="↻"
            label="Retreat to Active"
            badge={`−${retreatCost}`}
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
            maxHeight: isMobile ? undefined : 'min(476px, 92vh)',
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
              <RailStat label="SPI" value={card.spiritMod} color={poster.stat.spirit} />
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
function PassivePanel({ name, description, trigger }: { name: string; description: string; trigger: string }) {
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
          <RuleText text={description} />
        </div>
      )}
    </div>
  );
}

/**
 * The Skill card IS the "use skill" button. When the skill is usable (it's the
 * player's hero and all gates pass) the whole card is a pressable red action
 * plate; otherwise it renders as a flat, outlined info card (USED / blocked
 * reason / enemy hero).
 */
function SkillActionCard({
  name, description, mine, used, canUse, blockedReason, onUse,
}: {
  name: string;
  description: string;
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
    : { label: 'READY', color: interactive ? poster.paper : poster.status.buff };

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
          <RuleText text={description} />
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

/** Secondary action (Retreat): the poster's paper button, full width, with
 *  the soul cost on a red sticker. The click stops here so the backdrop's
 *  dismiss never sees it. */
function ActionButton({
  onClick, icon, label, badge,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  badge?: string;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, width: '100%' }}>
      <PosterButton
        variant="paper"
        onClick={onClick}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
      >
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
        {badge && (
          <span style={{
            padding: '3px 8px 4px', borderRadius: 3,
            background: poster.red, color: poster.paper,
            fontFamily: fonts.display, fontSize: 11, letterSpacing: '0.12em', lineHeight: 1,
          }}>{badge}</span>
        )}
      </PosterButton>
    </div>
  );
}

// Split "Name — description" prompts into title + body for the panels.
function extractAbilityName(prompt?: string): string | null {
  if (!prompt) return null;
  const idx = prompt.indexOf(' — ');
  return idx > 0 ? prompt.slice(0, idx).trim() : null;
}
function extractAbilityDesc(prompt?: string): string | null {
  if (!prompt) return null;
  const idx = prompt.indexOf(' — ');
  return idx > 0 ? prompt.slice(idx + 3).trim() : null;
}
