/**
 * Lesson 5, The Map — the structures, a kill that pushes, and the empty lane,
 * in one turn of round 4.
 *
 * Kelvin against a Lash down to one point; the rival's track is short — a
 * Guardian of 2 and a Patron of 1 — so the lesson is won in one turn:
 *   1  Kelvin's sheet: the coach shows the tracks.
 *   2  Frost Grenade fells Lash: the kill pushes his level + 1 — 2 — into the
 *      rival's Guardian, which falls (a kill and a fall pay no souls).
 *   3  No rival hero stands and Kelvin has nothing to attack: the player ends
 *      the turn, and at the End Kelvin pushes his bullet power — 1 — into the
 *      empty lane, and the rival's Patron falls. The coach lights the turn
 *      button and the rival's rule to watch.
 *
 * The Mid-Boss is off for now (MID_BOSS_ENABLED, Patrick 2026-11-09), and the
 * lesson's Mid-Boss part with it. Its steps are kept: with the Mid-Boss on
 * (`midBoss`), step 3 is the attack into the Mid-Boss — the only target, its
 * damage counting toward taking it, a blow back at the End — and the End then
 * follows the attack on its own, watched.
 *
 * The step builders are lessons.ts's own, handed in where the lesson is
 * registered (`LESSONS`), so the coach reads this lesson exactly as it reads
 * the others.
 */
import type { StorySetup } from '@/storage/matchConfig';
import type { CardInstance, PlayerID } from '@/engine/types';
import { cardName } from '@/cards';
import { effectiveAtk, isRespawning, structureOf } from '@/engine/query';
import { BOSS_RETALIATION, MID_BOSS_ENABLED, REVIVE_CREDITS } from '@/engine/constants';
import type { CoachStep, CoachView, Lesson } from './lessons';
import { PATRON_NAMES } from '@/ui/board/patrons';
import { END_TURN } from '@/ui/board/BoardControls';

/** The step builders of lessons.ts this lesson is made of. */
export interface LessonKit {
  fight: (over?: Partial<StorySetup>) => StorySetup;
  look: (id: string, title: string, who: (v: CoachView) => CardInstance | null, body: string | ((v: CoachView) => string)) => CoachStep;
  useSkill: (title: string, lead: (v: CoachView) => string) => CoachStep;
  attack: (lead: (v: CoachView) => string) => CoachStep;
}

const RIVAL: PlayerID = '1';
const hero = (c: CardInstance | null | undefined) => (c && !isRespawning(c) ? c : null);
const mine = (v: CoachView) => hero(v.G.players[v.me].active);
const name = (c: CardInstance | null) => (c ? cardName(c.cardId) : 'your Active');
const patronHp = (v: CoachView) => structureOf(v.G.players[RIVAL], 'patron').hp;

/** The rival's standing structures as the coach says them: "Guardian 2 · Patron 1". */
function rivalTrack(v: CoachView): string {
  return v.G.players[RIVAL].structures
    .filter((s) => s.hp > 0)
    .map((s) => `${s.kind[0].toUpperCase()}${s.kind.slice(1)} ${s.hp}`)
    .join(' · ');
}

/** The lesson; `midBoss` (MID_BOSS_ENABLED unless said) brings back its
 *  Mid-Boss part. */
export function mapLesson(kit: LessonKit, midBoss: boolean = MID_BOSS_ENABLED): Lesson {
  return {
    id: 'map',
    number: 5,
    title: 'The Map',
    blurb: midBoss ? 'Structures, a kill that pushes, and the Mid-Boss.' : 'Structures, a kill that pushes, and the empty lane.',
    face: 'hero_kelvin',
    outro: midBoss
      ? `A kill pushes the fallen hero's level + 1 into its side's structures, front first; fell the Patron to win. Take the Mid-Boss for the Rejuvenator — ${REVIVE_CREDITS} revives.`
      : "A kill pushes the fallen hero's level + 1 into its side's structures, front first, and an Active facing an empty lane pushes its bullet power at your End. Fell the Patron to win.",
    // Round 4, your turn first (engine turn 7) — the round the Mid-Boss rises
    // in, when there is one. Lash stands on one point, alone; the rival's
    // track is a Guardian of 2 and a Patron of 1 — the kill's push of 2 fells
    // the Guardian, and Kelvin's push of his bullet power, 1, into the empty
    // lane at the End fells the Patron. Frost Grenade costs three of the
    // turn's five souls.
    setup: () => kit.fight({
      startTurn: 7,
      enemyHeroStats: [{ hp: 1, hpMax: 3 }],
      structures: { guardian: 4, walker: 6, patron: 8 },
      enemyStructures: { guardian: 2, patron: 1 },
      midBoss,
    }),
    steps: [
      kit.look('look', 'The Map', mine, (v) => `Each side has a track of structures on its rule — Guardian, Walker, Patron; the rival's is short today: ${rivalTrack(v)}. Fell its Patron to win.${midBoss ? ' It is round 4: the Mid-Boss has risen in the pit between the Actives.' : ''} Tap ${name(mine(v))} to open his sheet.`),
      kit.useSkill('A Kill Pushes', () => `A kill pushes the fallen hero's level + 1 into his side's front structure. Lash is on one point: Frost Grenade fells him and pushes 2 into the Guardian, which falls.`),
      ...(midBoss ? bossEnd(kit) : [emptyLane()]),
    ],
  };
}

/** No rival hero stands, so there is nothing to attack: the player ends the
 *  turn, and the End pushes the Active's bullet power into the empty lane.
 *  The turn button and the rival's rule are lit. */
function emptyLane(): CoachStep {
  return {
    id: 'end',
    title: 'The Empty Lane',
    body: (v) => `The Guardian is down, and no rival hero stands: ${name(mine(v))} has nothing to attack. End the turn — at your End he pushes his bullet power, ${mine(v) ? effectiveAtk(mine(v)!) : 0}, into the empty lane, onto the Patron on ${patronHp(v)} HP. Tap ${END_TURN}.`,
    task: (v) => v.seen.turnsEnded >= 1,
    spot: () => [END_TURN, `${PATRON_NAMES.rival}:`],
    allow: () => [END_TURN],
  };
}

/** With the Mid-Boss on: the attack goes into it (the only target left), and
 *  the End follows the attack on its own — nothing to tap; the rival's rule is
 *  lit, to watch the push land on its Patron. */
function bossEnd(kit: LessonKit): CoachStep[] {
  return [
    kit.attack((v) => (structureOf(v.G.players[RIVAL], 'guardian').hp > 0
      ? `${name(mine(v))} attacks.`
      : `The Guardian is down, and the lane is empty. Shoot the Mid-Boss: only attacks hurt it, and the side that deals it more takes it when it falls. It hits back for ${BOSS_RETALIATION} at your End, which follows the attack on its own.`)),
    {
      id: 'end',
      title: 'The Empty Lane',
      body: (v) => `No rival hero stands. Your End follows the attack on its own: ${name(mine(v))} pushes his bullet power into the empty lane — onto the Patron, on ${patronHp(v)} HP.`,
      task: (v) => v.seen.turnsEnded >= 1,
      spot: () => [`${PATRON_NAMES.rival}:`],
      allow: () => [],
    },
  ];
}
