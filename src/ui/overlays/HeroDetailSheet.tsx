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
  /** True if this hero belongs to the local player. Drives the "Use Skill" + "Retreat" buttons. */
  isMine?: boolean;
  /** All gates for the USE SKILL button satisfied (player flag, per-hero, CC). */
  canUseSkill?: boolean;
  /** Short reason why the button is disabled, shown as a subtitle. */
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
          padding: '24px 22px calc(24px + env(safe-area-inset-bottom))',
          color: palette.text,
          boxShadow: shadow.xl,
          maxHeight: '88vh',
          overflow: 'auto',
        }}
      >
        {/* Header — portrait + name + stats row */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
          <div style={{
            width: 88, height: 88, borderRadius: radius.md, overflow: 'hidden',
            border: `1.5px solid ${palette.borderStrong}`,
            flexShrink: 0,
          }}>
            <HeroPortrait cardId={data.id} full />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...text.label, color: palette.text }}>{data.name}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              <Stat label="ATK" value={effectiveAtk(card)} color={palette.atk} />
              <Stat label="HP" value={`${card.hp}/${card.hpMax}`} color={palette.hp} />
              <Stat label="SPI" value={card.spiritMod} color={palette.spirit} />
            </div>
          </div>
        </div>

        {/* Hero flavor / passive description */}
        {data.text && (
          <p style={{
            ...text.body, color: palette.textDim, marginBottom: 18,
          }}>
            <RuleText text={data.text} />
          </p>
        )}

        {/* Active effects */}
        <Block title="Active Effects">
          {card.statuses.length === 0 ? (
            <Empty>No active effects.</Empty>
          ) : (
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
          )}
        </Block>

        {/* Skill OR Passive — each hero has exactly one. Render whichever exists. */}
        {skillAbility ? (
          <Block title="Skill">
            <AbilityPanel
              name={extractAbilityName(skillAbility.prompt) ?? data.name}
              description={extractAbilityDesc(skillAbility.prompt) ?? skillAbility.prompt ?? ''}
              targetLabel={TARGET_LABELS[skillAbility.target] ?? skillAbility.target}
              statusChip={card.skillUsedThisTurn ? { label: 'USED', color: palette.textFaint } : { label: 'READY', color: palette.success }}
              ability={skillAbility}
              hero={card}
            />
          </Block>
        ) : passiveAbility ? (
          <Block title="Passive">
            <PassivePanel
              name={extractAbilityName(passiveAbility.prompt) ?? `${data.name}'s Passive`}
              description={extractAbilityDesc(passiveAbility.prompt) ?? passiveAbility.prompt ?? data.text ?? ''}
              trigger={passiveAbility.trigger}
            />
          </Block>
        ) : null}

        {/* Ultimate — same shape as Skill */}
        <Block title="Ultimate">
          {ult && ultAbility ? (
            <AbilityPanel
              name={ult.name}
              description={ult.text ?? ''}
              targetLabel={TARGET_LABELS[ultAbility.target] ?? ultAbility.target}
              ability={ultAbility}
              hero={card}
            />
          ) : <Empty>No ultimate.</Empty>}
        </Block>

        {/* Equipment */}
        <Block title="Equipment">
          {attached.length === 0 ? (
            <Empty>No equipment attached.</Empty>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {attached.map((eq) => (
                <span key={eq.iid} style={{
                  padding: '7px 12px',
                  background: `${palette.type.equipment.accent}1a`,
                  border: `1px solid ${palette.type.equipment.accent}66`,
                  borderRadius: 999,
                  ...text.label, color: palette.type.equipment.accent,
                }}>
                  {CARDS_BY_ID[eq.cardId]?.name ?? eq.cardId}
                </span>
              ))}
            </div>
          )}
        </Block>

        {/* Action buttons */}
        {isMine && skillAbility && onUseSkill && (
          <ActionButton
            primary
            disabled={!canUseSkill}
            disabledReason={skillBlockedReason}
            onClick={() => { onUseSkill(); onClose(); }}
            icon="◎"
            label="Use Skill"
          />
        )}
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
            padding: '13px',
            background: palette.bg2,
            border: `1px solid ${palette.border}`,
            borderRadius: radius.md,
            cursor: 'pointer',
            ...text.label, color: palette.textDim,
          }}
        >Close</button>
      </motion.div>
    </motion.div>
  );
}

// ----- Sub-components -----

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ ...text.label, color: palette.textFaint, marginBottom: 10 }}>{title}</div>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ ...text.body, color: palette.textFaint }}>{children}</div>;
}

// Display labels for ability triggers — shown as a chip in PassivePanel so the
// player knows when the passive fires.
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
 * Passive ability block: name + trigger chip + description. No target, no
 * scaling, no USE button — passives just sit on the hero and fire when their
 * trigger condition is met (or "Always" for ongoing damage hooks like Haze's
 * Fixation or Wraith's mixed bullets).
 */
function PassivePanel({ name, description, trigger }: { name: string; description: string; trigger: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <span style={{ ...text.label, color: palette.text }}>{name}</span>
        <span style={{ ...text.label, color: palette.success }}>{TRIGGER_LABELS[trigger] ?? trigger}</span>
      </div>
      {description && (
        <div style={{ ...text.body, color: palette.textDim, marginBottom: 6 }}>
          <RuleText text={description} />
        </div>
      )}
    </div>
  );
}

/**
 * Shared layout for Skill and Ultimate: bold name, description body, target chip,
 * and the scaling preview block. Same shape for both = visual parity.
 */
function AbilityPanel({
  name, description, targetLabel, statusChip, ability, hero,
}: {
  name: string;
  description: string;
  targetLabel: string;
  statusChip?: { label: string; color: string };
  ability: AbilityDef;
  hero: CardInstance;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <span style={{ ...text.label, color: palette.text }}>{name}</span>
        {statusChip && (
          <span style={{ flexShrink: 0, ...text.label, color: statusChip.color }}>{statusChip.label}</span>
        )}
      </div>
      {description && (
        <div style={{ ...text.body, color: palette.textDim, marginBottom: 6 }}>
          <RuleText text={description} />
        </div>
      )}
      <div style={{
        display: 'inline-block',
        padding: '2px 8px',
        background: 'rgba(120, 80, 30, 0.10)',
        border: `1px solid ${palette.border}`,
        borderRadius: 999,
        ...text.label, color: palette.textFaint,
      }}>Target · {targetLabel}</div>
      <ScalingPreview ability={ability} hero={hero} />
    </div>
  );
}

function ScalingPreview({ ability, hero }: { ability: AbilityDef; hero: CardInstance }) {
  const base = ability.base ?? null;
  const baseLabel = ability.baseLabel ?? 'effect';
  const scalesSpirit = !!ability.scalesSpirit;

  // If neither a base value nor any scaling, this is a pure utility ability — skip the block.
  if (base === null && !scalesSpirit) {
    return (
      <div style={{
        marginTop: 10, padding: '8px 12px',
        background: 'rgba(120, 80, 30, 0.06)',
        border: `1px dashed ${palette.border}`,
        borderRadius: 6,
        ...text.body, color: palette.textFaint,
      }}>Pure utility — no damage or scaling.</div>
    );
  }

  const baseVal = base ?? 0;
  const spi = hero.spiritMod;
  const total = baseVal + (scalesSpirit ? spi : 0);

  return (
    <div style={{
      marginTop: 10, padding: '10px 12px',
      background: 'rgba(120, 80, 30, 0.06)',
      border: `1px solid ${palette.border}`,
      borderRadius: 6,
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <Row label="Base" value={`${baseVal} ${baseLabel}`} color={palette.textDim} />
      {scalesSpirit && (
        <Row label="+ Spirit" value={`+${spi}`} color={palette.spirit} hint={`(${spi} SPI)`} />
      )}
      {scalesSpirit && (
        <div style={{
          marginTop: 4, paddingTop: 6,
          borderTop: `1px dashed ${palette.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span style={{ ...text.label, color: palette.textDim }}>= Total</span>
          <span style={{ ...text.numeric, color: palette.accentWarm }}>{total}</span>
        </div>
      )}
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

/**
 * Shared action button used for Use Skill + Retreat. Brass gradient, prominent.
 * `primary` makes it slightly bigger (Use Skill); `disabled` dims and shows reason.
 */
function ActionButton({
  primary, disabled, disabledReason, onClick, icon, label, badge,
}: {
  primary?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
  icon: string;
  label: string;
  badge?: string;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onClick();
  };
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      style={{
        marginTop: 10, width: '100%',
        padding: primary ? '16px' : '14px',
        background: disabled
          ? palette.bg2
          : `linear-gradient(180deg, ${palette.accent}cc, ${palette.accent}77)`,
        border: `1.5px solid ${disabled ? palette.border : palette.accent}`,
        borderRadius: radius.md,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        boxShadow: disabled ? 'none' : `0 2px 8px rgba(40, 20, 0, 0.25), 0 0 14px ${palette.accent}55`,
        opacity: disabled ? 0.7 : 1,
        ...text.label, color: disabled ? palette.textFaint : '#1a1208',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
        {badge && (
          <span style={{
            padding: '2px 8px', borderRadius: 999,
            background: 'rgba(0,0,0,0.25)',
            ...text.label,
          }}>{badge}</span>
        )}
      </span>
      {disabled && disabledReason && (
        <span style={{ ...text.body, color: palette.textFaint }}>{disabledReason}</span>
      )}
    </button>
  );
}

// Split "Name — description" prompts into title + body for the Skill panel.
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
