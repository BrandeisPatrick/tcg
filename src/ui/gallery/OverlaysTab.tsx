/**
 * Overlays — the hero detail sheet, opened in each state it can be in, the
 * sheet that asks for a new Active, and the trigger prompt.
 */
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardInstance, GameState, PendingTrigger } from '@/engine/types';
import { HEROES } from '@/cards';
import { allocatorFor, newCounters } from '@/engine/ids';
import { buildPlayer, freshMap } from '@/engine/actions/setup';
import { HeroDetailSheet, type SkillOffer } from '../overlays/HeroDetailSheet';
import { PromotionOverlay } from '../overlays/PromotionOverlay';
import { TriggerPrompt } from '../overlays/TriggerPrompt';
import { poster } from '../poster';
import { mockHeroInstance, mockEquipInstance } from './mock';
import { Section, Caption } from './primitives';

const SHEET_SCENARIOS: { id: string; label: string; hint: string }[] = [
  { id: 'ready',    label: 'Your Active, all ready',  hint: 'Skill, Ultimate and Attack: each plate is its button, and the “then” before the Attack says abilities come first.' },
  { id: 'skilled',  label: 'Skill used',              hint: 'The skill reads USED and the Ultimate waits for the next turn; the Attack is still there.' },
  { id: 'attacked', label: 'Attacked',                hint: 'The Attack reads USED; every ability goes flat with “The attack ended your turn”.' },
  { id: 'turn1',    label: 'Turn 1',                  hint: 'The skill is there; the Attack is flat with “No attacks on Turn 1”.' },
  { id: 'locked',   label: 'Ultimate locked',         hint: 'Below Level 2 the Ultimate plate is flat, chipped “Lv 2”: “Unlocks at Level 2”.' },
  { id: 'passive',  label: 'Passive-only Active',     hint: 'No skill to use: the Passive panel, and the Attack under it.' },
  { id: 'bench',    label: 'A bench hero',            hint: 'Its skill can be used from the bench. No Attack — only the Active swings.' },
  { id: 'blocked',  label: 'Not your turn',           hint: 'Both plates flat, with the reason.' },
  { id: 'enemy',    label: 'Rival hero',              hint: 'Read-only. No action.' },
  { id: 'loaded',   label: 'Statuses, equipment, retreat', hint: 'Active Effects, Equipment and Retreat all shown. Retreat is on the Active’s sheet only.' },
  { id: 'broke',    label: 'Retreat, short of souls', hint: 'The button stays on the sheet, inert, and says what is missing.' },
  { id: 'charged',  label: 'Charged, in Wolf form',   hint: 'Nine damage counted: a charged ultimate (Victor, Silver) prints its price coming down. Silver wears her wolf while the form lasts.' },
];

/** The passive-only hero the "Passive-only Active" state falls back to when
 *  the picked hero has a skill. */
const PASSIVE_STAND_IN = 'hero_abrams';

/** What the promotion sheet's Retreat costs: Kelvin is the one leaving. */
const KELVIN_RETREAT = HEROES.find((h) => h.id === 'hero_kelvin')?.retreat ?? 1;

export function OverlaysTab() {
  const [heroId, setHeroId] = useState('hero_kelvin');
  const [scenario, setScenario] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const hero = HEROES.find((h) => h.id === heroId)!;

  function build(s: string): Parameters<typeof HeroDetailSheet>[0] {
    const shown = s === 'passive' && hero.skills.length > 0 ? HEROES.find((h) => h.id === PASSIVE_STAND_IN)! : hero;
    let card: CardInstance = mockHeroInstance(shown);
    const props: Parameters<typeof HeroDetailSheet>[0] = {
      card,
      isMine: true,
      onUseSkill: () => setToast('Skill activated'),
      // The plan's line as the board prints it, against a stand-in rival.
      attack: { line: `Hits Lash for ${shown.atk} bullet damage`, onAttack: () => setToast('Attacked') },
      onClose: () => setScenario(null),
    };
    const attackBlocked = (blockedReason: string, made = false) => {
      props.attack = { ...props.attack!, line: undefined, blockedReason, made };
    };
    // Every ability of the hero shown (its skills and its ultimate), in one state.
    const eachSkill = (offer: SkillOffer) => {
      props.skills = Object.fromEntries([...shown.skills, ...(shown.ult ? [shown.ult] : [])].map((id) => [id, offer]));
    };
    // The ultimate is unlocked (Level 2) unless the state says otherwise.
    card = { ...card, level: 2 };
    eachSkill({ canUse: true });
    if (s === 'skilled') {
      card = { ...card, skillUsedThisTurn: true, lastSkillUsed: shown.skills[0] ?? shown.ult };
      eachSkill({ canUse: false, blockedReason: 'Used its skill this turn' });
    }
    if (s === 'attacked') {
      eachSkill({ canUse: false, blockedReason: 'The attack ended your turn' });
      attackBlocked('Attacked this turn', true);
    }
    if (s === 'locked') {
      card = { ...card, level: 1 };
      if (shown.ult) props.skills = { ...props.skills, [shown.ult]: { canUse: false, blockedReason: 'Unlocks at Level 2' } };
    }
    if (s === 'turn1') attackBlocked('No attacks on Turn 1');
    if (s === 'bench') { card = { ...card, zone: 'bench', slot: 1 }; props.attack = undefined; }
    if (s === 'blocked') {
      eachSkill({ canUse: false, blockedReason: 'Not your turn' });
      attackBlocked('Not your turn');
    }
    if (s === 'enemy') { props.isMine = false; eachSkill({ canUse: false }); props.attack = undefined; }
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
      props.retreat = { cost: shown.retreat, incomingName: 'Yamato' };
      props.onRetreat = () => setToast('Retreated');
    }
    if (s === 'charged' && shown.ult) {
      card = {
        ...card,
        tally: { [shown.ult]: 9 },
        statuses: [{ id: 'wolf_form', value: 1, duration: 2 }, { id: 'weapon_power', value: 3, duration: 2 }, { id: 'shield', value: 6, duration: 999 }],
      };
    }
    if (s === 'broke') {
      const cost = Math.max(1, shown.retreat);
      props.retreat = { cost, blockedReason: `Need ${cost} soul${cost === 1 ? '' : 's'}` };
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
        skill card to use the skill, or from Level 2 the Ultimate button printed on the card (any of your
        heroes, one ability a turn, for the souls on its plate), and on your Active tap Attack to swing at
        their Active — free, one-way, and the end of the turn. A hero with a passive shows a Passive block that cannot be pressed. Pick a hero, then a state.
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
    <TriggerPromptDemo />
    </>
  );
}

/** A board where your Victor (Level 2, 13 damage counted, 9 souls in hand)
 *  has just fallen, and the prompt asks about Shocking Reanimation. */
function fallenVictor(): { G: GameState; prompt: PendingTrigger } {
  const counters = newCounters();
  const ids = allocatorFor(counters);
  const G: GameState = {
    counters,
    players: { '0': buildPlayer(ids, '0', ['hero_victor', 'hero_haze']), '1': buildPlayer(ids, '1', ['hero_silver']) },
    turnNumber: 4, firstMover: '1', humanSeat: '0', log: [], draft: null, draftTurnsOffset: 0, seed: 1,
    attackUsed: true, retreatUsed: false, ...freshMap(), action: null, fx: [],
  };
  const victor = G.players['0'].active!;
  victor.level = 2;
  victor.hp = 0;
  victor.tally = { eff_ult_victor: 13 };
  G.players['0'].souls = 9;
  const prompt: PendingTrigger = { pid: '0', moment: 'onFall', subjectIid: victor.iid, offers: [{ heroIid: victor.iid, abilityId: 'eff_ult_victor' }] };
  G.triggers = [prompt];
  return { G, prompt };
}

/** The trigger prompt (engine/prompts.ts): a "may" whose moment has come. */
function TriggerPromptDemo() {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const board = fallenVictor();
  return (
    <Section title="Trigger prompt">
      <Caption>
        A card that says you <strong>may</strong> use it when something happens asks at that moment, on
        either player's turn, and only when it can be used: the right level, not waiting, souls enough. The
        game waits for the answer. Here Silver has just felled your Victor, whose revive has come down from
        20 to 7 souls.
      </Caption>
      <div className="gal-pick">
        <button type="button" className="gal-pick__item" onClick={() => { setSaid(null); setOpen(true); }}>
          <b>Victor falls</b>
          <span>Use Shocking Reanimation, or pass and let the knockout happen.</span>
        </button>
      </div>
      {said && <p className="gal-cap" style={{ marginTop: 12, color: poster.stat.atkBright, fontWeight: 700 }}>{said}</p>}
      <AnimatePresence>
        {open && (
          <TriggerPrompt
            key="victor"
            G={board.G}
            me="0"
            prompt={board.prompt}
            onUse={() => { setOpen(false); setSaid('Used: Victor gets back up with half his HP.'); }}
            onPass={() => { setOpen(false); setSaid('Passed: Victor falls.'); }}
          />
        )}
      </AnimatePresence>
    </Section>
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
            retreat={mode === 'retreat' ? { cost: KELVIN_RETREAT, onCancel: () => setMode(null) } : undefined}
            onPick={() => setMode(null)}
          />
        )}
      </AnimatePresence>
    </Section>
  );
}
