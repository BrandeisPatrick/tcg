/**
 * Lesson 8, The Map — the structures, a kill that pushes, and the empty lane,
 * in one turn of round 4.
 *
 * Kelvin against a Lash down to one point; the rival's track is short — a
 * Guardian of 2 and a Patron of 1 — so the lesson is won in one turn:
 *   1  Kelvin's sheet: the coach shows the tracks.
 *   2  Frost Grenade, then its target: it fells Lash, and the kill pushes his
 *      level + 1 — 2 — into the rival's Guardian, which falls (a kill and a
 *      fall pay no souls).
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
 * the others: one tap a step.
 */
import type { StorySetup } from '@/storage/matchConfig';
import type { CardInstance, PlayerID } from '@/engine/types';
import { cardName } from '@/cards';
import { effectiveAtk, isRespawning, structureOf } from '@/engine/query';
import { BOSS_RETALIATION, MID_BOSS_ENABLED, REVIVE_CREDITS } from '@/engine/constants';
import type { CoachStep, CoachView, Lesson } from './lessons';
import { PATRON_NAMES } from '@/ui/board/patrons';

type Text = string | ((v: CoachView) => string);

/** The step builders of lessons.ts this lesson is made of. */
export interface LessonKit {
  fight: (over?: Partial<StorySetup>) => StorySetup;
  open: (id: string, body: Text, rival?: Text) => CoachStep;
  skill: (id: string, body: Text) => CoachStep;
  aim: (id: string, what: 'skill' | 'ult', body: Text) => CoachStep;
  attack: (id: string, n: number, body: Text) => CoachStep;
  endTurn: (id: string, n: number, body: Text) => CoachStep;
  lit: (step: CoachStep, more: (v: CoachView) => string[]) => CoachStep;
}

const RIVAL: PlayerID = '1';
const hero = (c: CardInstance | null | undefined) => (c && !isRespawning(c) ? c : null);
const mine = (v: CoachView) => hero(v.G.players[v.me].active);
const theirs = (v: CoachView) => hero(v.G.players[RIVAL].active);
const name = (c: CardInstance | null) => (c ? cardName(c.cardId) : 'your hero');
const patronHp = (v: CoachView) => structureOf(v.G.players[RIVAL], 'patron').hp;
/** The rival's rule, where its structures are printed. On a phone the coach
 *  plate moves down from over it while a step lights it (CoachPlate.tsx). */
const RIVAL_RULE = `${PATRON_NAMES.rival}:`;
const rule = () => [RIVAL_RULE];

/** The rival's standing structures as the coach says them: "Guardian 2, Patron 1". */
function rivalTrack(v: CoachView): string {
  return v.G.players[RIVAL].structures
    .filter((s) => s.hp > 0)
    .map((s) => `${s.kind[0].toUpperCase()}${s.kind.slice(1)} ${s.hp}`)
    .join(', ');
}

/** The lesson; `midBoss` (MID_BOSS_ENABLED unless said) brings back its
 *  Mid-Boss part. */
export function mapLesson(kit: LessonKit, midBoss: boolean = MID_BOSS_ENABLED): Lesson {
  return {
    id: 'map',
    number: 8,
    title: 'The Map',
    blurb: midBoss ? 'Structures, a kill that pushes, and the Mid-Boss.' : 'Fell the Patron. Kills and an empty lane push it.',
    face: 'hero_kelvin',
    learned: midBoss
      ? [
        'A push hits the front structure first: Guardian, Walker, Patron.',
        'A kill pushes the fallen hero\'s level + 1. Fell the Patron to win.',
        `Take the Mid-Boss for the Rejuvenator: ${REVIVE_CREDITS} revives.`,
      ]
      : [
        'A push hits the front structure first: Guardian, Walker, Patron.',
        'A kill pushes the fallen hero\'s level + 1, and pays you souls.',
        'With no rival hero in the lane, your hero pushes its Bullet Power at the end of your turn.',
      ],
    // Round 4, your turn first (engine turn 7) — the round the Mid-Boss rises
    // in, when there is one. Lash stands on one point, alone; the rival's
    // track is a Guardian of 2 and a Patron of 1 — the kill's push of 2 fells
    // the Guardian, and Kelvin's push of his bullet power, 1, into the empty
    // lane at the End fells the Patron. Frost Grenade costs no souls. The
    // kill pays round 4's bounty, 2.
    setup: () => kit.fight({
      startTurn: 7,
      enemyHeroStats: [{ hp: 1, hpMax: 3 }],
      structures: { guardian: 4, walker: 6, patron: 8 },
      enemyStructures: { guardian: 2, patron: 1 },
      midBoss,
    }),
    steps: [
      kit.lit(kit.open('open', (v) => `The rival's structures are lit: ${rivalTrack(v)}. Fell its Patron to win.${midBoss ? ' The Mid-Boss has risen in the pit.' : ''}`), rule),
      kit.skill('skill', 'A kill pushes the dead hero\'s level + 1 into the front structure.'),
      kit.lit(kit.aim('aim', 'skill', (v) => `${name(theirs(v))} is Level ${theirs(v)?.level ?? 1}: a push of ${(theirs(v)?.level ?? 1) + 1}. Watch the Guardian.`), rule),
      ...(midBoss ? bossEnd(kit) : [emptyLane(kit)]),
    ],
  };
}

/** No rival hero stands, so there is nothing to attack: the player ends the
 *  turn, and the End pushes the Active's bullet power into the empty lane.
 *  The turn button and the rival's rule are lit. */
function emptyLane(kit: LessonKit): CoachStep {
  return kit.lit(kit.endTurn('end', 1, (v) => `No rival hero is left. At your turn's end, ${name(mine(v))}'s Bullet Power, ${mine(v) ? effectiveAtk(mine(v)!) : 0}, hits the Patron on ${patronHp(v)}.`), rule);
}

/** With the Mid-Boss on: the attack goes into it (the only target left), and
 *  the End follows the attack on its own — nothing to tap; the rival's rule is
 *  lit, to watch the push land on its Patron. */
function bossEnd(kit: LessonKit): CoachStep[] {
  return [
    kit.attack('attack', 1, `The lane is empty, so shoot the Mid-Boss. It hits back for ${BOSS_RETALIATION} at the end of your turn.`),
    {
      id: 'end',
      title: 'Watch the Patron',
      body: (v) => `No rival hero stands: ${name(mine(v))} pushes Bullet Power into the empty lane, onto the Patron on ${patronHp(v)}.`,
      task: (v) => v.seen.turnsEnded >= 1,
      spot: () => [RIVAL_RULE],
      allow: () => [],
    },
  ];
}
