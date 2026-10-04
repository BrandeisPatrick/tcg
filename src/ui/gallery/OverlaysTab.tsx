/**
 * Overlays — the hero detail sheet, opened in each state it can be in, and
 * the sheet that asks for a new Active.
 */
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { HEROES } from '@/cards';
import { RETREAT_COST } from '@/engine/game';
import { HeroDetailSheet } from '../overlays/HeroDetailSheet';
import { PromotionOverlay } from '../overlays/PromotionOverlay';
import { poster } from '../poster';
import { mockHeroInstance, mockEquipInstance } from './mock';
import { Section, Caption } from './primitives';

const SHEET_SCENARIOS: { id: string; label: string; hint: string }[] = [
  { id: 'ready',    label: 'Your Active, both ready', hint: 'Skill or Attack: each plate is its button, and the “or” between them says the Active does one a turn.' },
  { id: 'skilled',  label: 'Skill used',              hint: 'The skill reads USED; the Attack goes flat with “Used its skill this turn”.' },
  { id: 'attacked', label: 'Attacked',                hint: 'The Attack reads USED; the skill goes flat with “Attacked this turn”.' },
  { id: 'turn1',    label: 'Turn 1',                  hint: 'The skill is there; the Attack is flat with “No attacks on Turn 1”.' },
  { id: 'passive',  label: 'Passive-only Active',     hint: 'No skill to use: the Passive panel, and the Attack under it.' },
  { id: 'bench',    label: 'A bench hero',            hint: 'Its skill can be used from the bench. No Attack — only the Active swings.' },
  { id: 'blocked',  label: 'Not your turn',           hint: 'Both plates flat, with the reason.' },
  { id: 'enemy',    label: 'Rival hero',              hint: 'Read-only. No action.' },
  { id: 'loaded',   label: 'Statuses, equipment, retreat', hint: 'Active Effects, Equipment and Retreat all shown. Retreat is on the Active’s sheet only.' },
  { id: 'broke',    label: 'Retreat, short of souls', hint: 'The button stays on the sheet, inert, and says what is missing.' },
];

/** The passive-only hero the "Passive-only Active" state falls back to when
 *  the picked hero has a skill. */
const PASSIVE_STAND_IN = 'hero_abrams';

export function OverlaysTab() {
  const [heroId, setHeroId] = useState('hero_kelvin');
  const [scenario, setScenario] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const hero = HEROES.find((h) => h.id === heroId)!;

  function build(s: string): Parameters<typeof HeroDetailSheet>[0] {
    const shown = s === 'passive' && hero.skill ? HEROES.find((h) => h.id === PASSIVE_STAND_IN)! : hero;
    let card: CardInstance = mockHeroInstance(shown);
    const props: Parameters<typeof HeroDetailSheet>[0] = {
      card,
      isMine: true,
      canUseSkill: true,
      onUseSkill: () => setToast('Skill activated'),
      // The plan's line as the board prints it, against a stand-in rival.
      attack: { line: `Hits Lash for ${shown.atk} bullet damage`, onAttack: () => setToast('Attacked') },
      onClose: () => setScenario(null),
    };
    const attackBlocked = (blockedReason: string, made = false) => {
      props.attack = { ...props.attack!, line: undefined, blockedReason, made };
    };
    if (s === 'skilled') {
      card = { ...card, skillUsedThisTurn: true };
      props.canUseSkill = false;
      attackBlocked('Used its skill this turn');
    }
    if (s === 'attacked') {
      card = { ...card, attackedThisTurn: true };
      props.canUseSkill = false;
      props.skillBlockedReason = 'Attacked this turn';
      attackBlocked('Attacked this turn', true);
    }
    if (s === 'turn1') attackBlocked('No attacks on Turn 1');
    if (s === 'bench') { card = { ...card, zone: 'bench', slot: 1 }; props.attack = undefined; }
    if (s === 'blocked') {
      props.canUseSkill = false;
      props.skillBlockedReason = 'Not your turn';
      attackBlocked('Not your turn');
    }
    if (s === 'enemy') { props.isMine = false; props.canUseSkill = false; props.attack = undefined; }
    if (s === 'loaded') {
      card = {
        ...card,
        statuses: [
          { id: 'bleed', value: 3, duration: 2 },
          { id: 'shield', value: 5, duration: 999 },
          { id: 'spirit_power', value: 2, duration: 2 },
        ],
        attached: [mockEquipInstance('titanic_magazine'), mockEquipInstance('improved_cooldown', 2)],
      };
      props.retreat = { cost: RETREAT_COST, incomingName: 'Yamato' };
      props.onRetreat = () => setToast('Retreated');
    }
    if (s === 'broke') {
      props.retreat = { cost: RETREAT_COST, blockedReason: `Need ${RETREAT_COST} souls` };
      props.onRetreat = () => {};
    }
    props.card = card;
    return props;
  }

  const built = scenario ? build(scenario) : null;

  return (
    <>
    <Section
      title="Hero detail sheet"
      aside={(
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Hero
          <select className="gal-select" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
            {HEROES.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
      )}
    >
      <Caption>
        The sheet that rises when a hero is tapped. Its plates <strong>are</strong> the actions: tap the
        skill card to use the skill (any of your heroes, once a turn, a soul each), and on your Active tap
        Attack to swing at their Active — free, one-way, and instead of the skill, not as well. A hero with a
        passive shows a Passive block that cannot be pressed. Pick a hero, then a state.
      </Caption>

      <div className="gal-pick">
        {SHEET_SCENARIOS.map((sc) => (
          <button key={sc.id} type="button" className="gal-pick__item" onClick={() => { setToast(null); setScenario(sc.id); }}>
            <b>{sc.label}</b>
            <span>{sc.hint}</span>
          </button>
        ))}
      </div>

      {toast && (
        <p className="gal-cap" style={{ marginTop: 12, color: poster.stat.atkBright, fontWeight: 700 }}>
          {toast}. The sheet closed, as it does in a match.
        </p>
      )}

      <AnimatePresence>
        {built && <HeroDetailSheet key={`${heroId}-${scenario}`} {...built} />}
      </AnimatePresence>
    </Section>

    <NewActiveDemo />
    </>
  );
}

const CHOOSER_BENCH = ['hero_yamato', 'hero_abrams', 'hero_haze'];

/** The "choose your new Active" sheet, in the two ways it is reached. */
function NewActiveDemo() {
  const [mode, setMode] = useState<'fell' | 'retreat' | null>(null);
  const candidates = CHOOSER_BENCH
    .map((id) => HEROES.find((h) => h.id === id))
    .filter((h): h is NonNullable<typeof h> => !!h)
    .map((h) => mockHeroInstance(h));
  return (
    <Section title="New Active">
      <Caption>
        One sheet asks who takes the lane. After a knockout it is owed, so it cannot be dismissed. On a
        retreat with more than one hero able to go in it is a choice: it prints the cost and backs out on
        Cancel, Escape or a tap outside.
      </Caption>
      <div className="gal-pick">
        <button type="button" className="gal-pick__item" onClick={() => setMode('fell')}>
          <b>After a knockout</b>
          <span>Your Active fell. Pick who steps up; there is no way out but a pick.</span>
        </button>
        <button type="button" className="gal-pick__item" onClick={() => setMode('retreat')}>
          <b>Retreat, three on the bench</b>
          <span>Opened from the Active’s sheet when more than one hero can go in.</span>
        </button>
      </div>
      <AnimatePresence>
        {mode && (
          <PromotionOverlay
            key={mode}
            candidates={candidates}
            leavingName="Kelvin"
            retreat={mode === 'retreat' ? { cost: RETREAT_COST, onCancel: () => setMode(null) } : undefined}
            onPick={() => setMode(null)}
          />
        )}
      </AnimatePresence>
    </Section>
  );
}
