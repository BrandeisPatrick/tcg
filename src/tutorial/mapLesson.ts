/**
 * Lesson 5, The Map — the structures, a kill that pushes, and the Mid-Boss,
 * in one turn of round 4 (the round the Mid-Boss rises in).
 *
 * Kelvin against a Lash down to one point; the rival's track is short — a
 * Guardian of 2 and a Patron of 2 — so the lesson is won in one turn:
 *   1  Kelvin's sheet: the coach shows the tracks.
 *   2  Frost Grenade fells Lash: the kill pushes his level + 1 — 2 — into the
 *      rival's Guardian, which falls (a kill and a fall pay no souls).
 *   3  The lane is empty, so Kelvin shoots the Mid-Boss (the only target): its
 *      damage counts toward taking it, and it will hit him back at the End.
 *   4  The End follows the attack on its own (no tap): with no rival hero
 *      standing, Kelvin pushes his bullet power — 2 — into the empty lane, and
 *      the rival's Patron falls. The coach lights the rival's rule to watch.
 *
 * The step builders are lessons.ts's own, handed in where the lesson is
 * registered (`LESSONS`), so the coach reads this lesson exactly as it reads
 * the others.
 */
import type { StorySetup } from '@/storage/matchConfig';
import type { CardInstance, PlayerID } from '@/engine/types';
import { cardName } from '@/cards';
import { isRespawning, structureOf } from '@/engine/query';
import { BOSS_RETALIATION, REVIVE_CREDITS } from '@/engine/constants';
import type { CoachStep, CoachView, Lesson } from './lessons';
import { PATRON_NAMES } from '@/ui/board/patrons';

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

/** The rival's standing structures as the coach says them: "Guardian 2 · Patron 2". */
function rivalTrack(v: CoachView): string {
  return v.G.players[RIVAL].structures
    .filter((s) => s.hp > 0)
    .map((s) => `${s.kind[0].toUpperCase()}${s.kind.slice(1)} ${s.hp}`)
    .join(' · ');
}

export function mapLesson(kit: LessonKit): Lesson {
  return {
    id: 'map',
    number: 5,
    title: 'The Map',
    blurb: 'Structures, a kill that pushes, and the Mid-Boss.',
    face: 'hero_kelvin',
    outro: `A kill pushes the fallen hero's level + 1 into its side's structures, front first; fell the Patron to win. Take the Mid-Boss for the Rejuvenator — ${REVIVE_CREDITS} revives.`,
    // Round 4, your turn first (engine turn 7): the Mid-Boss rises as it opens.
    // Lash stands on one point, alone; the rival's track is a Guardian of 2 and
    // a Patron of 1 — the kill's push of 2 fells the Guardian, and Kelvin's
    // push of his bullet power, 1, into the empty lane at the End fells the
    // Patron. Frost Grenade costs three of the turn's five souls.
    setup: () => kit.fight({
      startTurn: 7,
      enemyHeroStats: [{ hp: 1, hpMax: 3 }],
      structures: { guardian: 4, walker: 6, patron: 8 },
      enemyStructures: { guardian: 2, patron: 1 },
    }),
    steps: [
      kit.look('look', 'The Map', mine, (v) => `Each side has a track of structures on its rule — Guardian, Walker, Patron; the rival's is short today: ${rivalTrack(v)}. Fell its Patron to win. It is round 4: the Mid-Boss has risen in the pit between the Actives. Tap ${name(mine(v))} to open his sheet.`),
      kit.useSkill('A Kill Pushes', () => `A kill pushes the fallen hero's level + 1 into his side's front structure. Lash is on one point: Frost Grenade fells him and pushes 2 into the Guardian, which falls.`),
      kit.attack((v) => (structureOf(v.G.players[RIVAL], 'guardian').hp > 0
        ? `${name(mine(v))} attacks.`
        : `The Guardian is down, and the lane is empty. Shoot the Mid-Boss: only attacks hurt it, and the side that deals it more takes it when it falls. It hits back for ${BOSS_RETALIATION} at your End, which follows the attack on its own.`)),
      // Nothing to tap: the attack ended the Act and the End follows on its
      // own. The rival's rule is lit, to watch the push land on its Patron.
      {
        id: 'end',
        title: 'The Empty Lane',
        body: (v) => `No rival hero stands. Your End follows the attack on its own: ${name(mine(v))} pushes his bullet power into the empty lane — onto the Patron, on ${structureOf(v.G.players[RIVAL], 'patron').hp} HP.`,
        task: (v) => v.seen.turnsEnded >= 1,
        spot: () => [`${PATRON_NAMES.rival}:`],
        allow: () => [],
      },
    ],
  };
}
