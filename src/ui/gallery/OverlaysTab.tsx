/**
 * Overlays — the hero detail sheet, opened in each state it can be in, the
 * sheet that asks for a new Active, and the trigger prompt.
 */
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardInstance, GameState, PendingTrigger } from '@/engine/types';
import { HEROES } from '@/cards';
import { getAbility } from '@/abilities';
import { skillWait, ultCharge, ultimateCard, ultWait } from '@/engine/query';
import { skillIconSrc, ultIconSrc } from '@/art/assets';
import { skillBlockReason } from '../board/heroActions';
import { AbilityTile } from '../overlays/AbilityDial';
import { dialLabel, type DialModel } from '../overlays/abilityDialModel';
import { allocatorFor, newCounters } from '@/engine/ids';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { buildPlayer, freshMap } from '@/engine/actions/setup';
import { HeroDetailSheet, type SkillOffer } from '../overlays/HeroDetailSheet';
import { PromotionOverlay } from '../overlays/PromotionOverlay';
import { TriggerPrompt } from '../overlays/TriggerPrompt';
import { poster, shopInk } from '../poster';
import { mockHeroInstance, mockEquipInstance } from './mock';
import { Section, Caption } from './primitives';

const SHEET_SCENARIOS: { id: string; label: string; hint: string }[] = [
  { id: 'ready',    label: 'Your Active, all ready',  hint: 'Skill, Ultimate and Attack: one row each, the row is the button, its price or damage at the right.' },
  { id: 'skilled',  label: 'Skill used',              hint: 'Both ability rows go dim and read “Used”; the Attack is still there.' },
  { id: 'attacked', label: 'Attacked',                hint: 'The Attack reads “Used”; the turn goes on, so the abilities stay lit.' },
  { id: 'turn1',    label: 'Turn 1',                  hint: 'The skill is there; the Attack row is dim with “No attacks on Turn 1”.' },
  { id: 'locked',   label: 'Ultimate locked',         hint: 'Below Level 3 the Ultimate row is dim and reads “Level 3” where its price would be.' },
  { id: 'passive',  label: 'Passive-only Active',     hint: 'No skill to use: the passive is printed as a skill is — its icon, its rule — but is no button and has no wait.' },
  { id: 'bench',    label: 'A bench hero',            hint: 'Its skill can be used from the bench. No Attack — only the Active swings.' },
  { id: 'blocked',  label: 'Not your turn',           hint: 'Every row dim, each with the one reason in place of its price.' },
  { id: 'enemy',    label: 'Rival hero',              hint: 'Read-only: the same rows, none a button, and Close.' },
  { id: 'loaded',   label: 'Statuses, equipment, retreat', hint: 'Worn items and statuses as one strip of small tiles under the header. Retreat is in the foot of the Active’s sheet only.' },
  { id: 'broke',    label: 'Retreat, short of souls', hint: 'Retreat stays in the foot, inert, and says what is missing.' },
  { id: 'charged',  label: 'Charged, in Wolf form',   hint: 'Nine damage counted: a charged ultimate (Victor, Silver) prints its price coming down. Silver wears her wolf while the form lasts.' },
  { id: 'cool-full', label: 'Cooling: just used',      hint: 'The turn it was used: the wipe covers the whole glyph, every frame segment is still to come, the number is the full wait.' },
  { id: 'cool-mid',  label: 'Cooling: one turn served', hint: 'The skill has served one turn of its wait (2 of 3 left); the ultimate has one turn left. The wipe opens clockwise from twelve.' },
  { id: 'cool-last', label: 'Cooling: one turn left',  hint: 'The skill is a turn from ready. Open “all ready” next with the same hero to see the ready moment.' },
  { id: 'charges',   label: 'Charged skill, 1 charge left', hint: 'A skill that holds charges (Kelvin, Shiv, Vindicta): one in hand, so the row is lit; the next pip is a small clock of its wait.' },
  { id: 'charges-out', label: 'Charged skill, none left', hint: 'Both charges spent: the tile wears the full dial for the next charge, and the pips are empty.' },
  { id: 'ult-charge', label: 'Charged ultimate, part filled', hint: 'An ultimate that waits on damage (Victor, Silver): the glyph fills from the foot and the frame has a segment a point.' },
  { id: 'cool-rival', label: 'Rival hero, cooling',    hint: 'Read-only, and the dials still say what the rival is waiting on.' },
];

/** The passive-only hero the "Passive-only Active" state falls back to when
 *  the picked hero has a skill. */
const PASSIVE_STAND_IN = 'hero_abrams';
/** The heroes the dial states fall back to when the picked hero has no
 *  charged skill, or no charged ultimate. */
const CHARGES_STAND_IN = 'hero_kelvin';
const CHARGED_ULT_STAND_IN = 'hero_victor';
const hasCharges = (h: (typeof HEROES)[number]) => h.skills.some((id) => (getAbility(id)?.charges ?? 1) > 1);
const hasChargedUlt = (h: (typeof HEROES)[number]) => !!ultimateCard(h.ult)?.charged;

/** What the promotion sheet's Retreat costs: Kelvin is the one leaving. */
const KELVIN_RETREAT = HEROES.find((h) => h.id === 'hero_kelvin')?.retreat ?? 1;

export function OverlaysTab() {
  const [heroId, setHeroId] = useState('hero_kelvin');
  const [scenario, setScenario] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const hero = HEROES.find((h) => h.id === heroId)!;

  function build(s: string): Parameters<typeof HeroDetailSheet>[0] {
    const standIn = (id: string) => HEROES.find((h) => h.id === id)!;
    const shown = s === 'passive' && hero.skills.length > 0 ? standIn(PASSIVE_STAND_IN)
      : (s === 'charges' || s === 'charges-out') && !hasCharges(hero) ? standIn(CHARGES_STAND_IN)
      : s === 'ult-charge' && !hasChargedUlt(hero) ? standIn(CHARGED_ULT_STAND_IN)
      : hero;
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
    // The ultimate is unlocked (Level 3) unless the state says otherwise.
    card = { ...card, level: ULT_UNLOCK_LEVEL };
    eachSkill({ canUse: true });
    if (s === 'skilled') {
      card = { ...card, skillUsedThisTurn: true, lastSkillUsed: shown.skills[0] ?? shown.ult };
      eachSkill({ canUse: false, blockedReason: 'Used its skill this turn' });
    }
    if (s === 'attacked') {
      attackBlocked('Attacked this turn', true);
    }
    if (s === 'locked') {
      card = { ...card, level: 1 };
      if (shown.ult) props.skills = { ...props.skills, [shown.ult]: { canUse: false, blockedReason: `Unlocks at Level ${ULT_UNLOCK_LEVEL}` } };
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
          // A build-up two thirds full: its token's circle fills a segment a stack.
          { id: 'toxin', value: 2, duration: 3 },
        ],
        // Cheat Death mid-wait: its tile wears the wait as a dial with no number.
        attached: [mockEquipInstance('titanic_magazine'), mockEquipInstance('improved_cooldown', 2), { ...mockEquipInstance('cheat_death'), cooldowns: { eff_cheat_death: 2 } }],
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
    // ---- The dials: waits, charges, a charged ultimate's count. ----
    const skillId = shown.skills[0];
    const skillFull = skillId ? skillWait(getAbility(skillId)!) : 0;
    const ultFace = ultimateCard(shown.ult);
    const ultFull = ultFace && !ultFace.charged ? ultWait(ultFace) : 0;
    // Each ability's offer as the match would word it: blocked by its wait.
    const waiting = (ids: (string | undefined)[], block: 'cooldown' | 'charge' = 'cooldown') => {
      for (const id of ids) if (id) props.skills = { ...props.skills, [id]: { canUse: false, blockedReason: skillBlockReason(block, card, id) } };
    };
    const cool = (skillLeft: number, ultLeft: number) => {
      card = { ...card, cooldowns: { ...(skillId && skillLeft > 0 ? { [skillId]: skillLeft } : {}), ...(shown.ult && ultFull && ultLeft > 0 ? { [shown.ult]: ultLeft } : {}) } };
      // A charged skill with nothing in hand is what a wait holds back.
      if (skillId && (getAbility(skillId)?.charges ?? 1) > 1) card = { ...card, chargesSpent: { [skillId]: getAbility(skillId)!.charges! } };
      waiting([skillLeft > 0 ? skillId : undefined, ultFull && ultLeft > 0 ? shown.ult : undefined]);
    };
    if (s === 'cool-full') {
      cool(skillFull, Math.max(1, ultFull - 2));
      card = { ...card, skillUsedThisTurn: true, lastSkillUsed: skillId ?? shown.ult };
    }
    if (s === 'cool-mid') cool(Math.max(1, skillFull - 1), 1);
    if (s === 'cool-last') cool(1, Math.ceil(ultFull / 2));
    if (s === 'cool-rival') {
      cool(Math.max(1, skillFull - 1), Math.ceil(ultFull / 2));
      props.isMine = false; eachSkill({ canUse: false }); props.attack = undefined;
    }
    if (s === 'charges' && skillId) {
      card = { ...card, chargesSpent: { [skillId]: 1 }, cooldowns: { [skillId]: Math.max(1, skillFull - 2) } };
    }
    if (s === 'charges-out' && skillId) {
      card = { ...card, chargesSpent: { [skillId]: getAbility(skillId)?.charges ?? 2 }, cooldowns: { [skillId]: Math.max(1, skillFull - 1) } };
      waiting([skillId]);
    }
    if (s === 'ult-charge' && shown.ult) {
      card = { ...card, tally: { [shown.ult]: 6 } };
      if (ultCharge(card)) waiting([shown.ult], 'charge');
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
        The sheet that rises when a hero is tapped: a short header (portrait, name, level, HP), then one
        row per action. A row <strong>is</strong> its button, with one number at its right: the souls
        price, the attack's damage, or the reason it cannot be used. Full rules are behind the “i”.
        Pick a hero, then a state.
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

    <AbilityDialDemo heroId={heroId} />
    <NewActiveDemo />
    <TriggerPromptDemo />
    </>
  );
}

/** The ability dial alone, at each step of each thing it can say, on the
 *  sheet's paper; and one live tile to step through a wait turn by turn. */
function AbilityDialDemo({ heroId }: { heroId: string }) {
  const [calm, setCalm] = useState(false);
  const [big, setBig] = useState(false);
  const [run, setRun] = useState(0);
  const [left, setLeft] = useState(3);
  const size = big ? 88 : 44;
  const inks = { weapon: shopInk('weapon').ink, spirit: shopInk('spirit').ink, vitality: shopInk('vitality').ink };
  const wait = (l: number, full: number, charges?: { left: number; max: number }): DialModel => ({ kind: 'wait', left: l, full, ...(charges ? { charges } : {}) });
  const glyph = (ult = false) => (
    <img src={ult ? ultIconSrc(heroId) : skillIconSrc(heroId, HEROES.find((h) => h.id === heroId)?.skills[0])} alt="" draggable={false} style={{ display: 'block', width: size - (big ? 20 : 10), height: size - (big ? 20 : 10), objectFit: 'contain' }} />
  );
  const strips: { title: string; ink: string; ult?: boolean; steps: DialModel[] }[] = [
    { title: 'A skill that waits 3', ink: inks.spirit, steps: [wait(3, 3), wait(2, 3), wait(1, 3), wait(0, 3)] },
    { title: 'A skill that waits 5', ink: inks.weapon, steps: [wait(5, 5), wait(4, 5), wait(3, 5), wait(2, 5), wait(1, 5), wait(0, 5)] },
    { title: 'A large ultimate: waits 8', ink: inks.spirit, ult: true, steps: [wait(8, 8), wait(6, 8), wait(4, 8), wait(2, 8), wait(1, 8), wait(0, 8)] },
    {
      title: 'A charged skill: 2 charges, 4 turns each', ink: inks.vitality,
      steps: [wait(0, 4, { left: 2, max: 2 }), wait(4, 4, { left: 1, max: 2 }), wait(2, 4, { left: 1, max: 2 }), wait(4, 4, { left: 0, max: 2 }), wait(2, 4, { left: 0, max: 2 }), wait(1, 4, { left: 0, max: 2 })],
    },
    { title: 'With Rapid Recharge: 4 charges, 3 turns each', ink: inks.weapon, steps: [wait(2, 3, { left: 3, max: 4 }), wait(1, 3, { left: 1, max: 4 }), wait(2, 3, { left: 0, max: 4 })] },
    { title: 'A charged ultimate: needs 10 damage', ink: inks.spirit, ult: true, steps: [0, 3, 6, 9, 10].map((have) => ({ kind: 'charge', have, need: 10 }) as DialModel) },
  ];
  const chip = (on: boolean) => ({ fontWeight: on ? 700 : 400, textDecoration: on ? 'underline' : 'none' } as const);
  return (
    <Section title="Ability dial">
      <Caption>
        What a skill's or an ultimate's tile wears while something holds it. The <strong>frame</strong> is
        the gauge: one segment a turn of the wait, clockwise from twelve, inked as each turn is served.
        The <strong>wipe</strong> darkens the glyph for the wait that is left, and the <strong>number</strong>
        {' '}is the own turns to go. A charged skill adds its <strong>pips</strong>; a charged ultimate
        fills from the foot instead, because it waits on damage, not turns. Each strip reads left to
        right, from just used to ready.
      </Caption>
      <div className="gal-row" style={{ marginBottom: 12, gap: 14 }}>
        <button type="button" className="gal-pick__item" style={{ width: 'auto' }} data-dial-replay onClick={() => setRun((n) => n + 1)}><b>Replay the opening</b></button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" data-dial-calm checked={calm} onChange={(e) => setCalm(e.target.checked)} /> <span style={chip(calm)}>Reduced motion</span>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" data-dial-big checked={big} onChange={(e) => setBig(e.target.checked)} /> <span style={chip(big)}>Twice the size</span>
        </label>
      </div>
      <div data-dial-demo style={{
        display: 'flex', flexDirection: 'column', gap: 14, padding: 16, borderRadius: 10,
        background: poster.paper, border: `1.5px solid ${poster.ink}`, maxWidth: 720,
      }}>
        {strips.map((strip) => (
          <div key={strip.title} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ width: 190, font: '500 12px/1.3 var(--g-ui)', color: poster.inkDim }}>{strip.title}</span>
            <span style={{ display: 'flex', gap: big ? 20 : 12, padding: '6px 0' }}>
              {strip.steps.map((m, i) => (
                <span key={`${run}-${i}`} title={dialLabel(m)} style={{ display: 'inline-flex' }}>
                  <AbilityTile ink={strip.ink} size={size} dial={m} calm={calm}>{glyph(strip.ult)}</AbilityTile>
                </span>
              ))}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderTop: `1px solid ${poster.inkRule}`, paddingTop: 14 }}>
          <span style={{ width: 190, font: '500 12px/1.3 var(--g-ui)', color: poster.inkDim }}>Live: a wait of 3, turn by turn</span>
          <span data-dial-live style={{ display: 'inline-flex', padding: '6px 0' }}>
            <AbilityTile ink={inks.spirit} size={size} dial={wait(left, 3)} memo="gallery-live" calm={calm}>{glyph()}</AbilityTile>
          </span>
          <button type="button" className="gal-pick__item" style={{ width: 'auto' }} data-dial-step onClick={() => setLeft((n) => (n > 0 ? n - 1 : 3))}>
            <b>{left > 0 ? 'End the turn' : 'Use the skill'}</b>
            <span>{dialLabel(wait(left, 3))}</span>
          </button>
        </div>
      </div>
    </Section>
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

/** The "choose your new Active" sheet, in the three ways it is reached. */
function NewActiveDemo() {
  const [mode, setMode] = useState<'fell' | 'retreat' | 'ride' | null>(null);
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
        <button type="button" className="gal-pick__item" onClick={() => setMode('ride')}>
          <b>Rem rides off</b>
          <span>Tag Along from the lane left it empty: owed, like a knockout.</span>
        </button>
      </div>
      <AnimatePresence>
        {mode && (
          <PromotionOverlay
            key={mode}
            candidates={candidates}
            leavingName={mode === 'ride' ? 'Rem' : 'Kelvin'}
            retreat={mode === 'retreat' ? { cost: KELVIN_RETREAT, onCancel: () => setMode(null) } : undefined}
            ride={mode === 'ride' ? { bearerName: 'Yamato' } : undefined}
            onPick={() => setMode(null)}
          />
        )}
      </AnimatePresence>
    </Section>
  );
}
