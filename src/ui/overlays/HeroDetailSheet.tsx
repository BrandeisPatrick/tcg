import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { getAbility, type AbilityDef } from '@/abilities';
import { STATUSES_BY_ID } from '@/statuses';
import { effectiveAtk } from '@/engine/util';
import { HeroPortrait } from '@/cards/art/heroArt';
import { StatusIcon } from '../card/StatusIcon';
import { palette, radius, spring, shadow, text } from '../tokens';
import { RuleText } from '../card/RuleText';

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

const TARGET_LABELS: Record<string, string> = {
  noTarget:    'No target',
  self:        'Self',
  allyAny:     'Any ally',
  allyHero:    'Ally hero',
  enemyAny:    'Any enemy',
  enemyHero:   'Enemy hero',
  enemyActive: 'Enemy Active',
  anyBoard:    'Any hero',
};

export function HeroDetailSheet({
  card, isMine, canUseSkill, skillBlockedReason, onUseSkill,
  canRetreat, retreatCost = 2, onRetreat, onClose,
}: Props) {
  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') return null;

  const skillAbility = data.skill ? getAbility(data.skill) : null;
  const passiveAbility = data.passives?.[0] ? getAbility(data.passives[0]) : null;
  const ult = data.ult ? CARDS_BY_ID[data.ult] : null;
  const ultAbility = (ult && ult.type === 'ultimate' && ult.abilities[0]) ? getAbility(ult.abilities[0]) : null;
  const attached = card.attached ?? [];

  const skillName = skillAbility ? (extractAbilityName(skillAbility.prompt) ?? data.name) : '';
  const skillDesc = skillAbility ? (extractAbilityDesc(skillAbility.prompt) ?? skillAbility.prompt ?? '') : '';
  const passiveDesc = passiveAbility ? (extractAbilityDesc(passiveAbility.prompt) ?? passiveAbility.prompt ?? data.text ?? '') : '';

  // The hero's flavor line often just restates the skill/passive — only show it
  // when it adds something new, so the sheet doesn't say the same thing twice.
  const norm = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const showFlavor = !!data.text && norm(data.text) !== norm(skillDesc) && norm(data.text) !== norm(passiveDesc);

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
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring.snappy}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540,
          background: palette.bg1,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          border: `2px solid #5a3f1c`,
          borderBottom: 'none',
          padding: '22px 20px calc(20px + env(safe-area-inset-bottom))',
          color: palette.text,
          boxShadow: shadow.xl,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        {/* Header — portrait + name + stats row */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: showFlavor ? 14 : 18 }}>
          <div style={{
            width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden',
            border: `1.5px solid ${palette.borderStrong}`,
            flexShrink: 0,
          }}>
            <HeroPortrait cardId={data.id} full />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ ...text.label, color: palette.text }}>{data.name}</span>
              <span style={{
                padding: '1px 8px', borderRadius: 999,
                background: 'rgba(120, 80, 30, 0.10)',
                border: `1px solid ${palette.border}`,
                ...text.label, color: palette.textDim,
                fontVariantNumeric: 'tabular-nums',
              }}>Lv {card.level ?? 1}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              <Stat label="BP" value={effectiveAtk(card)} color={palette.atk} />
              <Stat label="HP" value={`${card.hp}/${card.hpMax}`} color={palette.hp} />
              <Stat label="SPI" value={card.spiritMod} color={palette.spirit} />
            </div>
          </div>
        </div>

        {/* Hero flavor — only when it isn't a restatement of the skill/passive */}
        {showFlavor && (
          <p style={{ ...text.body, color: palette.textDim, marginBottom: 18 }}>
            <RuleText text={data.text!} />
          </p>
        )}

        {/* Active effects — hidden entirely when there are none (less clutter) */}
        {card.statuses.length > 0 && (
          <Block title="Active Effects">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {card.statuses.map((s, i) => {
                const def = STATUSES_BY_ID[s.id];
                return (
                  <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <StatusIcon id={s.id} value={s.value} duration={s.duration} size="large" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...text.label, color: palette.text }}>{def?.title ?? s.id}</div>
                      <div style={{ ...text.body, color: palette.textDim }}>
                        {def?.desc.replace('<value>', String(s.value))}{' '}
                        <span style={{ color: palette.textFaint }}>({s.duration}) left</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Block>
        )}

        {/* Skill — the card itself is the action. Tap it to use the skill. */}
        {skillAbility ? (
          <Block title="Skill">
            <SkillActionCard
              name={skillName}
              description={skillDesc}
              targetLabel={TARGET_LABELS[skillAbility.target] ?? skillAbility.target}
              ability={skillAbility}
              hero={card}
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
              name={extractAbilityName(passiveAbility.prompt) ?? `${data.name}'s Passive`}
              description={passiveDesc}
              trigger={passiveAbility.trigger}
            />
          </Block>
        ) : null}

        {/* Ultimate — informational (ults are cast from hand, not here) */}
        {ult && ultAbility && (
          <Block title="Ultimate">
            <AbilityPanel
              name={ult.name}
              description={ult.text ?? ''}
              targetLabel={TARGET_LABELS[ultAbility.target] ?? ultAbility.target}
              ability={ultAbility}
              hero={card}
            />
          </Block>
        )}

        {/* Equipment — hidden when none attached. A merged hero (Rem) shows
            tinted as a buff with its remaining turns. */}
        {attached.length > 0 && (
          <Block title="Equipment">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {attached.map((eq) => {
                const merged = CARDS_BY_ID[eq.cardId]?.type === 'hero';
                const accent = merged ? palette.status.buff : palette.type.equipment.accent;
                return (
                  <span key={eq.iid} style={{
                    padding: '7px 12px',
                    background: `${accent}1a`,
                    border: `1px solid ${accent}66`,
                    borderRadius: 999,
                    ...text.label, color: accent,
                  }}>
                    {CARDS_BY_ID[eq.cardId]?.name ?? eq.cardId}
                    {merged && eq.remMergeTurnsLeft != null && ` · ${eq.remMergeTurnsLeft}t`}
                  </span>
                );
              })}
            </div>
          </Block>
        )}

        {/* Secondary actions */}
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
            marginTop: 10, width: '100%',
            padding: '12px',
            background: 'transparent',
            border: `1px solid ${palette.border}`,
            borderRadius: radius.md,
            cursor: 'pointer',
            ...text.label, color: palette.textFaint,
          }}
        >Close</button>
      </motion.div>
    </motion.div>
  );
}

// ----- Sub-components -----

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...text.label, color: palette.textFaint, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
      <span style={{ ...text.numeric, color }}>{value}</span>
      <span style={{ ...text.label, color: palette.textFaint, marginTop: 3 }}>{label}</span>
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
  name, description, targetLabel, ability, hero,
  mine, used, canUse, blockedReason, onUse,
}: {
  name: string;
  description: string;
  targetLabel: string;
  ability: AbilityDef;
  hero: CardInstance;
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
        <div style={{ ...text.body, color: palette.textDim, marginBottom: 8 }}>
          <RuleText text={description} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px',
          background: 'rgba(120, 80, 30, 0.10)', border: `1px solid ${palette.border}`,
          borderRadius: 999, ...text.label, color: palette.textFaint,
        }}>Target · {targetLabel}</span>
        <ScalingChip ability={ability} hero={hero} />
      </div>
      <ScalingBreakdown ability={ability} hero={hero} />

      {/* Footer CTA / status — the "Use Skill" affordance lives in the card.
          Shows the soul cost like Retreat does (−2) so costs read consistently. */}
      {interactive ? (
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: `1px solid ${accent}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          ...text.label, color: palette.textDim,
        }}>
          <span aria-hidden>◎</span><span>Tap to Use Skill</span>
          <span style={{
            padding: '2px 8px', borderRadius: 999,
            background: 'rgba(120, 80, 30, 0.12)',
            border: `1px solid ${palette.border}`,
            ...text.label, color: palette.textDim,
          }}>−1 soul</span>
        </div>
      ) : mine && !canUse && (blockedReason || used) ? (
        <div style={{
          marginTop: 10, paddingTop: 8, borderTop: `1px solid ${palette.border}`,
          textAlign: 'center', ...text.body, color: palette.textFaint,
        }}>{used ? 'Already used this turn' : blockedReason}</div>
      ) : null}
    </motion.div>
  );
}

/**
 * Shared read-only layout for the Ultimate: bold name, description, target chip,
 * and (when relevant) the scaling breakdown.
 */
function AbilityPanel({
  name, description, targetLabel, ability, hero,
}: {
  name: string;
  description: string;
  targetLabel: string;
  ability: AbilityDef;
  hero: CardInstance;
}) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: radius.md,
      background: 'rgba(120, 80, 30, 0.05)', border: `1px solid ${palette.border}`,
    }}>
      <div style={{ ...text.label, color: palette.text, marginBottom: 4 }}>{name}</div>
      {description && (
        <div style={{ ...text.body, color: palette.textDim, marginBottom: 8 }}>
          <RuleText text={description} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px',
          background: 'rgba(120, 80, 30, 0.10)', border: `1px solid ${palette.border}`,
          borderRadius: 999, ...text.label, color: palette.textFaint,
        }}>Target · {targetLabel}</span>
        <ScalingChip ability={ability} hero={hero} />
      </div>
      <ScalingBreakdown ability={ability} hero={hero} />
    </div>
  );
}

/** Compact one-line value chip — shown only when there's a flat base and no
 *  active Spirit scaling (keeps simple effects from rendering a whole box). */
function ScalingChip({ ability, hero }: { ability: AbilityDef; hero: CardInstance }) {
  const base = ability.base ?? null;
  const scalesSpirit = !!ability.scalesSpirit;
  if (base === null) return null;            // pure utility → nothing
  if (scalesSpirit && hero.spiritMod !== 0) return null; // breakdown box handles it
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      background: 'rgba(120, 80, 30, 0.10)', border: `1px solid ${palette.border}`,
      borderRadius: 999, ...text.label, color: palette.textDim,
    }}>{base} {ability.baseLabel ?? 'effect'}</span>
  );
}

/** Full Base / +Spirit / Total box — only when Spirit is actively adding to it. */
function ScalingBreakdown({ ability, hero }: { ability: AbilityDef; hero: CardInstance }) {
  const base = ability.base ?? 0;
  const scalesSpirit = !!ability.scalesSpirit;
  const spi = hero.spiritMod;
  if (!scalesSpirit || spi === 0) return null;

  return (
    <div style={{
      marginTop: 10, padding: '10px 12px',
      background: 'rgba(120, 80, 30, 0.06)',
      border: `1px solid ${palette.border}`,
      borderRadius: 6,
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <Row label="Base" value={`${base} ${ability.baseLabel ?? 'effect'}`} color={palette.textDim} />
      <Row label="+ Spirit" value={`+${spi}`} color={palette.spirit} hint={`(${spi} SPI)`} />
      <div style={{
        marginTop: 4, paddingTop: 6,
        borderTop: `1px dashed ${palette.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <span style={{ ...text.label, color: palette.textDim }}>= Total</span>
        <span style={{ ...text.numeric, color: palette.textDim }}>{base + spi}</span>
      </div>
    </div>
  );
}

function Row({ label, value, color, hint }: { label: string; value: string; color: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ ...text.label, color: palette.textFaint }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
        {hint && <span style={{ ...text.body, color: palette.textFaint }}>{hint}</span>}
        <span style={{ ...text.numeric, color }}>{value}</span>
      </span>
    </div>
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
