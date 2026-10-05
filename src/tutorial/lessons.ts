/**
 * The tutorial — four short lessons, one thing each, and every lesson its
 * own small fight on the scripted path Story uses (`StorySetup`): fixed
 * rosters, no draft, no mulligan, and custom numbers on every hero so the
 * move being taught is exactly the move that wins:
 *
 *   1  The Skill        Kelvin vs a hurt Lash, no cards. Frost Grenade ends it.
 *   2  Souls and Gear   one card you cannot afford yet; next turn you can,
 *                       and the point of attack it adds is the kill.
 *   3  Level Up         Kelvin a point short of Level 2; gear tips him over,
 *                       and the levelled swing is the kill.
 *   4  The Bench        Kelvin spent at one health, Yamato fresh behind him;
 *                       retreat, and Yamato's swing is the kill.
 *
 * A turn is yours to spend on cards, skills and a retreat, with one attack
 * among them: your Active makes it from its sheet, and the turn button only
 * ends the turn. In lessons 2 to 4 the kill is the attack, so the last tap is
 * the Attack plate on your Active's sheet.
 *
 * Nothing is read and dismissed: every step is a tap on the real thing, and
 * every lesson ends on the victory screen. Each step names exactly the
 * control that performs it (the gate lets nothing else through), waits out
 * the rival's turn, and — should the player arrive short of souls — points
 * at the turn button instead of asking for a move that cannot be made.
 */
import type { CardId, CardInstance, GameState, PlayerID } from '@/engine/types';
import type { StorySetup } from '@/storage/matchConfig';
import { CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { effectiveAtk, isRespawning, stepInCandidates } from '@/engine/query';
import { attackBlocked, cardCost, playBlocked, skillBlocked } from '@/engine/legality';
import { RETREAT_COST, SKILL_COST } from '@/engine/constants';
import { PATRON_NAMES } from '@/ui/board/patrons';
import { retreatBlock } from '@/ui/board/heroActions';
import { END_TURN } from '@/ui/board/BoardControls';

/* ------------------------------------------------------------------ */
/* The matches                                                         */
/* ------------------------------------------------------------------ */

/** A lesson's fight: one or two heroes of yours against Lash, nobody holding
 *  cards unless the lesson deals them, and no scaling on the rival. Decks
 *  are dealt top-down (`orderedPlayerDeck`) because the scripts name the
 *  cards they ask for. */
function fight(over: Partial<StorySetup> = {}): StorySetup {
  return {
    playerHeroes: ['hero_kelvin'],
    playerDeck: [],
    enemyHeroes: ['hero_lash'],
    enemyDeck: [],
    enemyBuff: { atk: 0, hp: 0 },
    patronHp: 4,
    orderedPlayerDeck: true,
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* Reading the board                                                   */
/* ------------------------------------------------------------------ */

/** Monotonic latches the coach sets as it watches play — once set, they
 *  stay set, so a step can't un-complete when the turn rolls over. */
export interface CoachSeen {
  playedCard: boolean;
  equipped: boolean;
  usedSkill: boolean;
  castUlt: boolean;
  swapped: boolean;
  /** How many attacks you have made. */
  attacks: number;
  /** How many of your turns you have ended. */
  turnsEnded: number;
}

export const emptySeen: CoachSeen = {
  playedCard: false,
  equipped: false,
  usedSkill: false,
  castUlt: false,
  swapped: false,
  attacks: 0,
  turnsEnded: 0,
};

export interface CoachView {
  G: GameState;
  me: PlayerID;
  isMyTurn: boolean;
  seen: CoachSeen;
  /** A card or skill is armed and waiting for its target. */
  targeting: boolean;
  /** Your attack is being walked, before the engine makes it. */
  attacking: boolean;
  /** The hero detail sheet is open (where Skill, Attack and Retreat live). */
  sheetOpen: boolean;
  /** …and whose it is. */
  sheetHero: CardId | null;
  /** Taps on cards the player could not pay for, so far. */
  refusals: number;
  /** The id of the last tap-to-continue step the player answered. */
  acked: string | null;
}

/**
 * A gate spec names something on screen by its accessible name:
 *   `Kelvin —`                 first element whose aria-label starts with this
 *   `*Healing Rite`            every element whose aria-label starts with this
 *   `~Retreat`                 first button whose text contains this
 *   `Amber Hand: >> Souls:`    the second, looked up inside the first
 */
export type GateSpec = string;

const RIVAL: PlayerID = '1';
const alive = (c: CardInstance | null | undefined): c is CardInstance => !!c && !isRespawning(c);
const nameOf = (c: CardInstance | null | undefined) =>
  c ? CARDS_BY_ID[c.cardId]?.name ?? c.cardId : '';
/** The hero tile announces itself as "Kelvin — 2 attack, 6 health". */
const tile = (c: CardInstance | null | undefined) => (c ? `${nameOf(c)} —` : '');
/** The Attack plate on the open hero sheet; its accessible name starts
 *  "Attack". Looked up inside the sheet, so nothing else on the board can
 *  answer to it. */
const ATTACK_PLATE: GateSpec = 'Hero sheet >> Attack';

function activeOf(G: GameState, pid: PlayerID): CardInstance | null {
  const a = G.players[pid].active;
  return alive(a) ? a : null;
}
function benchOf(G: GameState, pid: PlayerID): CardInstance | null {
  return G.players[pid].bench.find(alive) ?? null;
}
function inHand(G: GameState, me: PlayerID, id: CardId): boolean {
  return G.players[me].hand.some((c) => c.cardId === id);
}
/** "Frost Grenade" — the skill's own name, hero prefix stripped, exactly as
 *  the sheet prints it. */
function skillNameOf(c: CardInstance | null): string {
  if (!c) return 'the skill';
  const data = CARDS_BY_ID[c.cardId];
  if (data?.type !== 'hero' || !data.skill) return 'the skill';
  const prompt = getAbility(data.skill)?.prompt ?? '';
  const head = prompt.split(' — ')[0]?.trim() ?? '';
  const name = head.startsWith(`${data.name} `) ? head.slice(data.name.length + 1) : head;
  return name || 'the skill';
}

/** The copy of a card in your hand, if you hold one. */
function held(G: GameState, me: PlayerID, id: CardId): CardInstance | undefined {
  return G.players[me].hand.find((c) => c.cardId === id);
}
/** What that copy costs to play — the engine's `cardCost`, as the hand prints
 *  it. Once it has left your hand (a step's words stay up a beat after the
 *  card is played) the printed cost stands in, so the line does not change. */
function costOf(G: GameState, me: PlayerID, id: CardId): number {
  const card = held(G, me, id);
  if (card) return cardCost(card);
  const data = CARDS_BY_ID[id];
  return data && data.type !== 'hero' ? data.cost ?? 0 : 0;
}
/** A count of souls, in the coach's voice: "two souls". */
function soulsText(n: number): string {
  const word = ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n);
  return `${word} soul${n === 1 ? '' : 's'}`;
}
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** True once any hero of yours is wearing a piece of equipment. */
export function hasEquipment(G: GameState, me: PlayerID): boolean {
  const ps = G.players[me];
  return [ps.active, ...ps.bench].some((c) => {
    if (!c) return false;
    return (c.attached ?? []).some((a) => CARDS_BY_ID[a.cardId]?.type === 'equipment');
  });
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

type Text = string | ((v: CoachView) => string);

export interface CoachStep {
  id: string;
  /** Stencil heading — two or three words. */
  title: string;
  /** One or two short lines, ending in the tap it asks for. */
  body: Text;
  /** Completes when this reads true. Every step has one. */
  task: (v: CoachView) => boolean;
  /** Can the move be made right now? When not, the plate shows `blocked`
   *  and opens the turn button instead — a short soul pocket must never
   *  trap the player in a step they cannot finish. */
  ready?: (v: CoachView) => boolean;
  blocked?: Text;
  /** Returns a line to hold on while something plays out (the rival's turn),
   *  or null to proceed. Steps wait for your turn by default. */
  wait?: (v: CoachView) => string | null;
  /** What is lit through the scrim. Empty = the whole board is sealed. */
  spot: (v: CoachView) => GateSpec[];
  /** What may be tapped. Defaults to `spot`. */
  allow?: (v: CoachView) => GateSpec[];
  /** The lit things are not controls (a rule, a fallen hero): a tap on any
   *  of them is the answer, and `task` reads `acked`. */
  tap?: boolean;
}

export const RIVAL_TURN = "Rival's turn. Watch — their Active gets one move too: its skill, or an attack on yours.";

/** The turn button, by its name. */
export const TURN_BUTTON: GateSpec = END_TURN;

const YOU = `${PATRON_NAMES.you}:`;

const mine = (v: CoachView) => activeOf(v.G, v.me);
const theirs = (v: CoachView) => activeOf(v.G, RIVAL);
const myBench = (v: CoachView) => benchOf(v.G, v.me);
const hpOf = (c: CardInstance | null) => (c ? `${c.hp} of ${c.hpMax}` : '');
const atkOf = (c: CardInstance | null) => (c ? effectiveAtk(c) : 0);
const souls = (v: CoachView) => v.G.players[v.me].souls;

/** End the turn — the n-th time this lesson. */
function endTurn(n: number, body: Text): CoachStep {
  return {
    id: `end${n}`,
    title: 'End the Turn',
    body,
    task: (v) => v.seen.turnsEnded >= n,
    wait: () => null,
    spot: () => [TURN_BUTTON],
  };
}

/** Make the turn's attack: your Active swings at theirs, from the Attack
 *  plate on his sheet. In every lesson that asks for it the attack is the
 *  kill, so the match ends under this step. Like the skill, the line follows
 *  where the player is and names the next tap only — none while the swing
 *  is in the air. */
function attack(lead: (v: CoachView) => string): CoachStep {
  return {
    id: 'attack',
    title: 'Attack',
    body: (v) => (v.attacking ? lead(v)
      : v.sheetOpen ? `${lead(v)} Tap Attack.`
      : `${lead(v)} Tap ${nameOf(mine(v)) || 'your Active'} to open his sheet.`),
    task: (v) => v.seen.attacks >= 1,
    ready: (v) => attackBlocked(v.G, v.me) === null,
    blocked: 'No attack left this turn. End the turn; the next one has its own.',
    spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(mine(v))]),
    allow: (v) => (v.sheetOpen ? [ATTACK_PLATE] : [tile(mine(v))]),
  };
}

/** Open a hero's sheet — the one place his numbers, skill, level and gear
 *  are all printed. Completes the moment it is open. */
function look(id: string, title: string, who: (v: CoachView) => CardInstance | null, body: Text): CoachStep {
  return {
    id,
    title,
    body,
    task: (v) => v.sheetHero !== null && v.sheetHero === who(v)?.cardId,
    ready: (v) => !!who(v),
    blocked: 'Nothing to look at there any more. End the turn.',
    spot: (v) => [tile(who(v))].filter(Boolean),
  };
}

/** …and close it again, having read what it says. */
function close(id: string, title: string, body: Text): CoachStep {
  return {
    id,
    title,
    body,
    task: (v) => !v.sheetOpen,
    wait: () => null,
    spot: () => ['Hero sheet'],
    allow: () => ['~Close'],
  };
}

/** Use your Active's skill on their Active — the three-tap flow through the
 *  hero sheet, gated tap by tap. The line follows the phase the player is
 *  in, so it always names the next tap and only the next tap. */
function useSkill(title: string, lead: (v: CoachView) => string): CoachStep {
  return {
    id: 'skill',
    title,
    body: (v) => {
      const me = mine(v), them = theirs(v);
      const skill = skillNameOf(me);
      if (v.targeting) return `${lead(v)} Now tap ${nameOf(them) || 'their Active'}.`;
      if (v.sheetOpen) return `${lead(v)} Tap ${skill}, then tap ${nameOf(them) || 'their Active'}.`;
      return `${lead(v)} Tap ${nameOf(me) || 'your Active'} to open the sheet, tap ${skill}, then tap ${nameOf(them) || 'their Active'}.`;
    },
    task: (v) => v.seen.usedSkill,
    ready: (v) => {
      const me = mine(v), them = theirs(v);
      return !!me && !!them && skillBlocked(v.G, v.me, me, them.iid) === null;
    },
    blocked: (v) => {
      const me = mine(v);
      return me && skillBlocked(v.G, v.me, me) === 'status'
        ? `${nameOf(me)} is locked down and cannot act. End the turn.`
        : `A skill costs ${SKILL_COST} soul and needs a fresh turn. End the turn — souls refill.`;
    },
    spot: (v) =>
      v.targeting ? [tile(theirs(v))]
      : v.sheetOpen ? ['Hero sheet']
      : [tile(mine(v))],
    allow: (v) =>
      v.targeting ? [tile(theirs(v))]
      : v.sheetOpen ? [`~${skillNameOf(mine(v))}`]
      : [tile(mine(v))],
  };
}

/** Play a card from hand onto your Active: tap it, then tap him. */
function playOnActive(id: string, title: string, cardId: CardId, cardName: string, lead: (v: CoachView) => string, done: (v: CoachView) => boolean): CoachStep {
  return {
    id,
    title,
    body: (v) => (v.targeting
      ? `${lead(v)} Now tap ${nameOf(mine(v)) || 'your Active'}.`
      : `${lead(v)} Tap ${cardName}, then tap ${nameOf(mine(v)) || 'your Active'}.`),
    task: done,
    // The engine's own question: in hand, paid for, and aimed at your Active.
    ready: (v) => {
      const card = held(v.G, v.me, cardId), target = mine(v);
      return !!card && !!target && playBlocked(v.G, v.me, card.iid, target.iid) === null;
    },
    blocked: `${cardName} costs more than you have left. End the turn — souls refill.`,
    spot: (v) => (v.targeting ? [tile(mine(v))] : [`*${cardName}`]),
  };
}

/* ------------------------------------------------------------------ */
/* The lessons                                                         */
/* ------------------------------------------------------------------ */

export type LessonId = 'skill' | 'souls' | 'level' | 'bench';

export interface Lesson {
  id: LessonId;
  /** 1-based; printed as "Lesson 2". */
  number: number;
  title: string;
  /** One line under the title on the list. */
  blurb: string;
  /** The hero whose portrait fronts the lesson on the list. */
  face: CardId;
  /** The lesson's own closing line — printed over the verdict when it is
   *  won, and on the coach's closing card should the script run out first. */
  outro: string;
  setup: () => StorySetup;
  steps: CoachStep[];
}

export const LESSONS: Lesson[] = [
  {
    id: 'skill',
    number: 1,
    title: 'The Skill',
    blurb: "One on one, no cards. Kelvin's skill ends it.",
    face: 'hero_kelvin',
    outro: 'A skill costs one soul, and it comes back every turn.',
    // Lash already hurt to a single point: Frost Grenade's one spirit damage
    // is the whole fight.
    setup: () => fight({ enemyHeroStats: [{ hp: 1, hpMax: 3 }] }),
    steps: [
      look('look', 'One on One', mine, (v) => `${nameOf(mine(v))} against ${nameOf(theirs(v))}, no cards. ${nameOf(theirs(v))} is already hurt: ${hpOf(theirs(v))}. Every hero carries a skill on his sheet. Tap ${nameOf(mine(v))} to open his sheet.`),
      useSkill('Use the Skill', (v) => `${skillNameOf(mine(v))}: one spirit damage to their Active. It costs one soul, and you have ${souls(v)}.`),
    ],
  },

  {
    id: 'souls',
    number: 2,
    title: 'Souls and Gear',
    blurb: "One card you can't afford yet. Then you can.",
    face: 'hero_kelvin',
    outro: 'Souls refill at the start of your turn, one more each time. Gear stays on.',
    // Lash at three: Kelvin's plain swing of two would not finish him, and
    // with the magazine's point on top it does. The rival's attack is
    // one-way, so nothing wears Lash down in between — the gear is the kill.
    setup: () => fight({
      playerDeck: ['extended_magazine'],
      enemyHeroStats: [{ hp: 3 }],
    }),
    steps: [
      {
        id: 'broke',
        title: 'Souls',
        body: (v) => `Cards cost souls. The rail on your rule says you have ${souls(v)}, and Extended Magazine costs ${soulsText(costOf(v.G, v.me, 'extended_magazine'))}. Tap Extended Magazine.`,
        task: (v) => v.refusals >= 1 || souls(v) >= costOf(v.G, v.me, 'extended_magazine') || !inHand(v.G, v.me, 'extended_magazine'),
        spot: () => [`${YOU} >> Souls:`, '*Extended Magazine'],
        allow: () => ['*Extended Magazine'],
      },
      endTurn(1, 'Refused. Souls refill at the start of each of your turns, one more each time — two next turn. Nobody attacks on the first turn, so tap End Turn.'),
      playOnActive('gear', 'Gear', 'extended_magazine', 'Extended Magazine',
        (v) => `${sentence(soulsText(costOf(v.G, v.me, 'extended_magazine')))} this turn. Extended Magazine is +1 attack, and gear stays on the hero.`,
        (v) => v.seen.equipped),
      attack((v) => `${nameOf(mine(v))} swings for ${atkOf(mine(v))} now, and ${nameOf(theirs(v))} is at ${hpOf(theirs(v))}. Your Active does one thing a turn — its skill or an attack — and the attack is free.`),
    ],
  },

  {
    id: 'level',
    number: 3,
    title: 'Level Up',
    blurb: 'A point of experience short. Gear tips him over.',
    face: 'hero_kelvin',
    outro: 'Gear, kills and standing the turn all earn experience. A level raises the numbers.',
    // Kelvin one point short of Level 2 and Lash at three: the point that
    // comes with the gear is the level, and the level is the point of attack
    // that finishes the fight. Turn two, so there is an attack to make.
    setup: () => fight({
      startTurn: 2,
      playerDeck: ['extra_health'],
      playerHeroStats: [{ exp: 4 }],
      enemyHeroStats: [{ hpMax: 3 }],
    }),
    steps: [
      look('look', 'Nearly There', mine, (v) => `The ring in the corner of ${nameOf(mine(v))}'s card is experience. He is one point short of Level 2. Tap ${nameOf(mine(v))} to see the ring.`),
      close('close', 'Level 1', 'Level 1, the ring nearly full. Gear counts as experience: attaching an item gives the bearer a point. Tap Close.'),
      playOnActive('gear', 'Tip It Over', 'extra_health', 'Extra Health',
        (v) => `${sentence(soulsText(costOf(v.G, v.me, 'extra_health')))}, one item. Extra Health's point is the one he needs — Level 2, and his attack goes up with it.`,
        (v) => v.seen.equipped),
      attack((v) => `${nameOf(mine(v))} swings for ${atkOf(mine(v))} now, and ${nameOf(theirs(v))} is at ${hpOf(theirs(v))}.`),
    ],
  },

  {
    id: 'bench',
    number: 4,
    title: 'The Bench',
    blurb: 'Kelvin is spent. Send Yamato in and finish it.',
    face: 'hero_yamato',
    outro: 'Rotate. A worn Active on the bench is a hero saved.',
    // Kelvin at one point of health with Yamato fresh behind him, Lash at
    // three: Kelvin's swing of two cannot finish Lash, and Lash's next attack
    // would finish Kelvin. Yamato swings for three, and his swing kills Lash.
    // Turn three, so there are exactly the two souls a retreat costs — none
    // left over for a skill.
    setup: () => fight({
      startTurn: 3,
      playerHeroes: ['hero_kelvin', 'hero_yamato'],
      playerHeroStats: [{ hp: 1 }, { atk: 3 }],
      enemyHeroStats: [{ hp: 3 }],
    }),
    steps: [
      look('look', 'Spent', mine, (v) => `${nameOf(mine(v))} is at ${hpOf(mine(v))}: ${nameOf(theirs(v))}'s next attack finishes him, and his own swing of ${atkOf(mine(v))} cannot finish ${nameOf(theirs(v))}. ${nameOf(myBench(v))} waits fresh on your bench. Tap ${nameOf(mine(v))}.`),
      // Retreat is the Active's own move and lives on his sheet, which the
      // step before has just opened. Should it be closed, the step opens it
      // again first.
      {
        id: 'retreat',
        title: 'Retreat',
        body: (v) => (v.seen.swapped
          ? `${nameOf(mine(v))} is in. ${nameOf(myBench(v))} is on the bench, out of the fight.`
          : v.sheetOpen
            ? `Attacks only ever hit the Active. Retreat costs ${RETREAT_COST} souls and swaps the two. Tap Retreat.`
            : `Tap ${nameOf(mine(v)) || 'your Active'}, then Retreat: ${RETREAT_COST} souls swap him with ${nameOf(myBench(v)) || 'your bench hero'}.`),
        task: (v) => v.seen.swapped,
        // The engine's own question: is a swap with the bench open to you now?
        ready: (v) => {
          const stepIns = stepInCandidates(v.G.players[v.me]);
          return stepIns.length > 0 && retreatBlock(v.G, v.me, stepIns) === null;
        },
        blocked: `Retreat costs ${RETREAT_COST} souls. End the turn to refill, then come back to it.`,
        spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(mine(v))]),
        allow: (v) => (v.sheetOpen ? ['~Retreat'] : [tile(mine(v))]),
      },
      attack((v) => `${nameOf(mine(v))} swings for ${atkOf(mine(v))}, and ${nameOf(theirs(v))} is at ${hpOf(theirs(v))}. ${nameOf(myBench(v))} sits it out on the bench.`),
    ],
  },
];

export function lessonById(id: string | undefined | null): Lesson | undefined {
  return id ? LESSONS.find((l) => l.id === id) : undefined;
}

export function nextLesson(id: string): Lesson | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}
