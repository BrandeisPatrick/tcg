/**
 * Overlays — the hero detail sheet, opened in each state it can be in.
 */
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { HEROES } from '@/cards';
import { HeroDetailSheet } from '../overlays/HeroDetailSheet';
import { poster } from '../poster';
import { mockHeroInstance, mockEquipInstance } from './mock';
import { Section, Caption } from './primitives';

const SHEET_SCENARIOS: { id: string; label: string; hint: string }[] = [
  { id: 'ready',   label: 'Skill ready (yours)', hint: 'The skill card is the button: tap it to use the skill.' },
  { id: 'used',    label: 'Skill used',          hint: 'Dimmed, with “already used this turn”.' },
  { id: 'blocked', label: 'Skill blocked',       hint: 'A flat card and the reason (“Not your turn”).' },
  { id: 'enemy',   label: 'Enemy hero',          hint: 'Read-only. No action.' },
  { id: 'loaded',  label: 'Statuses, equipment, retreat', hint: 'Active Effects, Equipment and Retreat all shown.' },
];

export function OverlaysTab() {
  const [heroId, setHeroId] = useState('hero_kelvin');
  const [scenario, setScenario] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const hero = HEROES.find((h) => h.id === heroId)!;

  function build(s: string): Parameters<typeof HeroDetailSheet>[0] {
    let card: CardInstance = mockHeroInstance(hero);
    const props: Parameters<typeof HeroDetailSheet>[0] = {
      card,
      isMine: true,
      canUseSkill: true,
      onUseSkill: () => setToast('Skill activated'),
      onClose: () => setScenario(null),
    };
    if (s === 'used') { card = { ...card, skillUsedThisTurn: true }; props.canUseSkill = false; }
    if (s === 'blocked') { props.canUseSkill = false; props.skillBlockedReason = 'Not your turn'; }
    if (s === 'enemy') { props.isMine = false; props.canUseSkill = false; }
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
      props.canRetreat = true;
      props.retreatCost = 2;
      props.onRetreat = () => setToast('Retreated');
    }
    props.card = card;
    return props;
  }

  const built = scenario ? build(scenario) : null;

  return (
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
        The sheet that rises when a hero is tapped. The Skill section <strong>is</strong> the action: tap the
        skill card to use it. A hero with a passive shows a Passive block that cannot be pressed. Pick a
        hero, then a state.
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
  );
}
