import { useRef } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { STATUSES_BY_ID } from '@/statuses';
import { effectiveAtk } from '@/engine/util';
import { HeroPortrait, HeroBadge } from '@/cards/art/heroArt';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { StatusIcon } from '../card/StatusIcon';
import { LevelRing } from '../card/LevelRing';
import { CardShine } from '../card/RarityFX';
import { palette, radius, spring, shadow, text, fonts } from '../tokens';
import { RuleText } from '../card/RuleText';

const REDUCED = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
  // Pointer-driven tilt for the physical-card feel (framer owns the transform
  // here, so drive rotateX/rotateY through motion values + write the shine vars).
  const elRef = useRef<HTMLDivElement | null>(null);
  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const TILT_MAX = REDUCED ? 0 : 5;
  const onTiltMove = (e: React.PointerEvent) => {
    const el = elRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    rotY.set((px - 0.5) * 2 * TILT_MAX);
    rotX.set(-(py - 0.5) * 2 * TILT_MAX);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--glare', '1');
  };
  const onTiltLeave = () => {
    rotX.set(0);
    rotY.set(0);
    const el = elRef.current;
    if (el) {
      el.style.setProperty('--glare', '0');
      el.style.setProperty('--mx', '50%');
      el.style.setProperty('--my', '50%');
    }
  };

  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') return null;

  const accent = getHeroIdentity(data.id).primary;
  const goldInset = palette.rarity[4].fill;

  const skillAbility = data.skill ? getAbility(data.skill) : null;
  const passiveAbility = data.passives?.[0] ? getAbility(data.passives[0]) : null;
  const attached = card.attached ?? [];

  // Ability names carry the hero prefix ("Paige Plot Armor"); strip it so the
  // skill/passive reads as just the ability ("Plot Armor") — the card already
  // names the hero.
  const stripHero = (n: string) => (n.startsWith(`${data.name} `) ? n.slice(data.name.length + 1) : n);
  const skillName = skillAbility ? stripHero(extractAbilityName(skillAbility.prompt) ?? data.name) : '';
  const passiveName = passiveAbility ? stripHero(extractAbilityName(passiveAbility.prompt) ?? `${data.name}'s Passive`) : '';
  const skillDesc = skillAbility ? (extractAbilityDesc(skillAbility.prompt) ?? skillAbility.prompt ?? '') : '';
  const passiveDesc = passiveAbility ? (extractAbilityDesc(passiveAbility.prompt) ?? passiveAbility.prompt ?? data.text ?? '') : '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: palette.overlay,
        backdropFilter: 'blur(10px)', zIndex: 95,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
        perspective: 1400,
      }}
    >
      {/* Three columns: the card (pure hero face — art + ability text), its
          action controls beneath it, and the satellite stat rail. Everything
          that isn't the hero's printed face lives OUTSIDE the card frame. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 14, maxWidth: '100%' }}
      >
      {/* Card column: the card itself + its action buttons below the frame. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* The hero rendered as a physical card: framed art board + framed text
          board (Skill/Passive + flavor). Tilts toward the cursor + holo on
          hover. The Skill is tap-to-use; Retreat/Close live below the card. */}
      <motion.div
        ref={elRef}
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={spring.snappy}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={onTiltMove}
        onPointerLeave={onTiltLeave}
        style={{
          position: 'relative',
          // Fixed TCG trading-card ratio (5:7 ≈ 0.714).
          width: 340, height: 476,
          maxHeight: 'min(476px, 92vh)',
          display: 'flex', flexDirection: 'column',
          background: '#3a2810',            // mahogany frame, peeks at the edge
          borderRadius: 16,
          border: `2px solid ${accent}`,
          boxShadow: `${shadow.xl}, 0 0 32px ${accent}55`,
          color: palette.text,
          overflow: 'hidden',
          isolation: 'isolate',
          transformPerspective: 1400,
          rotateX: rotX,
          rotateY: rotY,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Inner gold inset — same hero/ult cue as the in-hand card frame */}
        <div style={{
          position: 'absolute', inset: 3, borderRadius: 12,
          border: `1px solid ${goldInset}66`,
          boxShadow: `inset 0 0 8px ${goldInset}22`,
          pointerEvents: 'none', zIndex: 4,
        }} />

        {/* ART BOARD — a framed illustration window (not a flush bleed). The
            8px margin reveals the mahogany shell as a bezel; a gold hairline +
            inset vignette push the portrait behind glass. Sized so the rules
            (Skill/Passive + flavor, no ultimate) fit the text board below
            without scrolling. */}
        <div style={{
          position: 'relative', height: 188, flexShrink: 0, overflow: 'hidden',
          margin: '8px 8px 0', borderRadius: 10,
          border: `1px solid ${goldInset}55`,
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.45), inset 0 0 16px rgba(8,6,3,0.5)',
        }}>
          <HeroPortrait cardId={data.id} full />
          {/* Vignette — feathers the four edges of the illustration window */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            boxShadow: 'inset 0 0 40px 8px rgba(8,6,3,0.5)', zIndex: 2,
          }} />
          {/* Nameplate scrim — hero name along the base of the window.
              Level / BP / HP / SPI live in the right-side stat rail, off-card. */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '24px 13px 9px',
            background: 'linear-gradient(to top, rgba(8,6,3,0.92), rgba(8,6,3,0.5) 55%, transparent)',
            zIndex: 3,
          }}>
            <span style={{
              fontFamily: fonts.ui, fontWeight: 700, fontSize: 20, color: '#fff',
              textShadow: '0 2px 6px rgba(0,0,0,0.8)', lineHeight: 1.05,
              display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{data.name}</span>
          </div>
        </div>


        {/* TEXT BOARD — a framed cream rules slab, distinct from the art board.
            Holds the hero's own ability (Skill/Passive) + flavor and a pinned
            footer. The Ultimate is NOT shown here (it's cast from hand), so the
            content fits without scrolling. */}
        <div style={{
          flex: '1 1 auto', minHeight: 0,
          display: 'flex', flexDirection: 'column',
          margin: '8px', borderRadius: 10,
          border: `1px solid ${palette.card.bodyBorder}88`,
          overflow: 'hidden',
          background: palette.card.body,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 4px rgba(40,20,0,0.22)',
          position: 'relative',
        }}>
          {/* Rules content — Skill (tap-to-use) or Passive, plus flavor. The
              overflowY is a safety for an unusually long skill; with no
              ultimate here it does not normally scroll. */}
          <div style={{
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
            color: palette.card.bodyText,
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

        {/* Card shine — rarity ring + pointer-driven glare/holo over the frame */}
        <CardShine rarity={data.rarity} />
      </motion.div>

      {/* Action controls — below the card, outside the frame. The Skill itself
          is tapped inside the card; Retreat + Close live here. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 340 }}>
        {canRetreat && onRetreat && (
          <ActionButton
            onClick={() => { onRetreat(); onClose(); }}
            icon="↻"
            label="Retreat to Active"
            badge={`−${retreatCost}`}
          />
        )}
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px',
            background: palette.bg2,
            border: `1px solid ${palette.borderStrong}`,
            borderRadius: radius.md,
            cursor: 'pointer',
            ...text.label, color: palette.textDim,
            boxShadow: shadow.sm,
          }}
        >Close</button>
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
            width: 280, maxHeight: 'min(476px, 92vh)', overflowY: 'auto',
          }}
        >
          {/* Stats — Level + BP / HP / SPI, pulled off the card face */}
          <SidePanel title="Stats">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <LevelRing level={card.level ?? 1} exp={card.exp ?? 0} size={42} />
              <div style={{ ...text.label, fontSize: 14, color: palette.card.bodyText }}>
                Level {card.level ?? 1}
              </div>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-around', alignItems: 'center',
              marginTop: 4, paddingTop: 11,
              borderTop: `1px solid ${palette.card.bodyBorder}33`,
            }}>
              <RailStat label="BP" value={effectiveAtk(card)} color={palette.atk} />
              <RailStat label="HP" value={`${card.hp}/${card.hpMax}`} color={palette.hp} />
              <RailStat label="SPI" value={card.spiritMod} color={palette.spirit} />
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
                      <div style={{ ...text.label, color: palette.card.bodyText, minWidth: 0 }}>
                        {def?.title ?? s.id}
                      </div>
                    </div>
                    <div style={{ ...text.body, fontSize: 12, color: palette.card.bodyTextDim }}>
                      {def?.desc.replace('<value>', String(s.value))}{' '}
                      <span style={{ color: palette.card.flavor }}>({s.duration}) left</span>
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
                const acc = merged ? palette.status.buff : palette.type.equipment.accent;
                return (
                  <div key={eq.iid} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 32, height: 32, flexShrink: 0,
                      borderRadius: 6, overflow: 'hidden',
                      background: '#1a1208', border: `1.5px solid ${acc}`,
                      boxShadow: merged ? `0 0 6px ${acc}88` : '0 1px 3px rgba(0,0,0,0.5)',
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
                      <div style={{ ...text.label, color: palette.card.bodyText }}>
                        {eqData?.name ?? eq.cardId}
                      </div>
                      {/* What the item does — the panel should explain the effect,
                          not just name it. */}
                      {!merged && eqData?.text && (
                        <div style={{ ...text.body, fontSize: 12, color: palette.card.bodyTextDim }}>
                          <RuleText text={eqData.text} />
                        </div>
                      )}
                      {merged && eq.remMergeTurnsLeft != null && (
                        <div style={{ ...text.body, fontSize: 12, color: palette.status.buff }}>
                          merged · {eq.remMergeTurnsLeft}t left
                        </div>
                      )}
                      {!merged && eq.charges != null && (
                        <div style={{ ...text.body, fontSize: 12, color: palette.card.flavor }}>
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
      <div style={{ ...text.label, color: '#9a7b48', marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  );
}

/** Stat readout for the off-card stat rail: big tabular number over a brass
 *  label, dark-on-cream for the panel. */
function RailStat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
      <span style={{ ...text.numeric, fontSize: 20, color }}>{value}</span>
      <span style={{ ...text.label, fontSize: 10, color: palette.card.flavor }}>{label}</span>
    </div>
  );
}

/** A satellite token-panel that floats beside the card (buffs / gear). Styled
 *  like a small slab of the same card-stock — cream face, mahogany edge, brass
 *  header — so it reads as related to the card without being inside its frame. */
function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: palette.card.body,
      border: '2px solid #5a3f1c',
      borderRadius: 12,
      boxShadow: shadow.lg,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '7px 12px',
        background: 'linear-gradient(180deg, #2a1d0e, #1d130a)',
        borderBottom: '1px solid rgba(0,0,0,0.4)',
        ...text.label, color: 'rgba(232,216,180,0.78)',
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
      padding: '12px 14px', borderRadius: radius.md,
      background: 'rgba(120, 80, 30, 0.05)', border: `1px solid ${palette.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <span style={{ ...text.label, color: palette.text }}>{name}</span>
        <span style={{ ...text.label, color: palette.success }}>{TRIGGER_LABELS[trigger] ?? trigger}</span>
      </div>
      {description && (
        <div style={{ ...text.body, color: palette.textDim }}>
          <RuleText text={description} />
        </div>
      )}
    </div>
  );
}

/**
 * The Skill card IS the "use skill" button. When the skill is usable (it's the
 * player's hero and all gates pass) the whole card is a pressable brass panel
 * with a footer CTA; otherwise it renders as a flat, non-interactive info card
 * (USED / blocked reason / enemy hero).
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
  const accent = palette.accent;

  const chip = used
    ? { label: 'USED', color: palette.textFaint }
    : { label: 'READY', color: palette.success };

  return (
    <motion.div
      role={interactive ? 'button' : undefined}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      onClick={interactive ? (e) => { e.stopPropagation(); onUse!(); } : undefined}
      style={{
        padding: '14px 14px 12px',
        borderRadius: radius.md,
        background: interactive
          ? `linear-gradient(180deg, ${accent}22, ${accent}0c)`
          : 'rgba(120, 80, 30, 0.05)',
        border: `1.5px solid ${interactive ? accent : palette.border}`,
        boxShadow: interactive ? `0 2px 10px rgba(40,20,0,0.18), 0 0 14px ${accent}40` : 'none',
        cursor: interactive ? 'pointer' : 'default',
        opacity: used ? 0.7 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <span style={{ ...text.label, color: palette.text }}>{name}</span>
        <span style={{ flexShrink: 0, ...text.label, color: chip.color }}>{chip.label}</span>
      </div>
      {description && (
        <div style={{ ...text.body, color: palette.textDim }}>
          <RuleText text={description} />
        </div>
      )}

      {/* When the skill can't be used for a stated reason (e.g. "Not your
          turn"), show it. Usable skills need no prompt — the brass press
          styling + READY chip already invite the tap; the used state is the
          USED chip. */}
      {!interactive && mine && !canUse && !used && blockedReason && (
        <div style={{
          marginTop: 10, paddingTop: 8, borderTop: `1px solid ${palette.border}`,
          textAlign: 'center', ...text.body, color: palette.textFaint,
        }}>{blockedReason}</div>
      )}
    </motion.div>
  );
}

/** Secondary action button (Retreat). Brass gradient, full width. */
function ActionButton({
  onClick, icon, label, badge,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        marginTop: 10, width: '100%',
        padding: '14px',
        background: `linear-gradient(180deg, ${palette.accent}cc, ${palette.accent}77)`,
        border: `1.5px solid ${palette.accent}`,
        borderRadius: radius.md,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        boxShadow: `0 2px 8px rgba(40, 20, 0, 0.25), 0 0 14px ${palette.accent}55`,
        ...text.label, color: '#1a1208',
      }}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
      {badge && (
        <span style={{
          padding: '2px 8px', borderRadius: 999,
          background: 'rgba(0,0,0,0.25)', ...text.label,
        }}>{badge}</span>
      )}
    </button>
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
