/**
 * The tutorial — five short lessons, one thing each, and every lesson its
 * own small fight on the scripted path Story uses (`StorySetup`): fixed
 * rosters on the board, no draft, a deck the lesson names (most of them none:
 * nothing is drawn but what the lesson deals), and custom numbers on every
 * hero so the move being taught is exactly the move that wins. Every turn runs
 * Income → Act → End, the beats the dial under the turn number lights: the
 * souls arrive and count up and a card is drawn, then the player plays from
 * the hand (a hero onto the bench for free, an item onto a hero for its price:
 * a tap on it and a tap on the hero) and the heroes act (abilities, a Retreat,
 * the attack — which ends the Act, and the turn's End follows on its own).
 *
 *   1  The Skill        Kelvin vs a hurt Lash. Frost Grenade ends it.
 *   2  The Hand         Yamato draws Extended Magazine (a tier 1 item, two of
 *                       the turn's five souls); he puts it on, and the swing
 *                       it adds is the kill — the attack ends the Act.
 *   3  Active Items     Kelvin holds Cold Front, a gift. Put on, it starts on
 *                       cooldown — ready in two turns — so today Frost
 *                       Grenade and the attack finish Lash: an ability, then
 *                       the one attack that ends the Act.
 *   4  The Bench        Kelvin spent at one health, Yamato fresh behind him;
 *                       retreat, and Yamato's swing is the kill.
 *   5  The Map          Round 4: Frost Grenade's kill pushes the rival's
 *                       Guardian down, the attack goes into the Mid-Boss, and
 *                       the End that follows pushes the empty lane into the
 *                       Patron (mapLesson.ts).
 *
 * In lessons 1–4 the rival's patron has one point left, so the kill is the
 * win (lesson 5 sets both tracks itself). Nothing is read and dismissed:
 * every step is a tap on the real thing (lesson 5's last is the End that
 * follows the attack on its own, watched), and every lesson ends on the
 * victory screen. Each step names exactly the control that performs it (the
 * gate lets nothing else through), waits out the rival's turn, and — should
 * the move be out of reach — points at the turn button instead of asking for
 * a move that cannot be made.
 */
import type { CardId, CardInstance, GameState, PlayerID } from '@/engine/types';
import type { StorySetup } from '@/storage/matchConfig';
import { CARDS_BY_ID, cardName } from '@/cards';
import { effectiveAtk, heroAbilities, isRespawning, itemPrice, stepInCandidates, wornItems } from '@/engine/query';
import { attackBlocked, playBlocked, skillBlocked } from '@/engine/legality';
import { ACTIVE_COOLDOWN, LANE_INCOME, RETREAT_COST } from '@/engine/constants';
import { retreatBlock } from '@/ui/board/heroActions';
import { END_TURN } from '@/ui/board/BoardControls';
import { inHandLabel } from '@/ui/board/Hand';
import { mapLesson } from './mapLesson';

/* ------------------------------------------------------------------ */
/* The matches                                                         */
/* ------------------------------------------------------------------ */

/** A lesson's fight: one or two heroes of yours against Lash, no scaling on
 *  the rival. The rival's patron is down to its last point, so the one kill
 *  each lesson builds to is the win (a wiped board alone is not). Both decks
 *  are empty and nobody draws an opening hand, so nothing comes to hand but
 *  what the lesson deals. */
function fight(over: Partial<StorySetup> = {}): StorySetup {
  return {
    playerHeroes: ['hero_kelvin'],
    enemyHeroes: ['hero_lash'],
    enemyBuff: { atk: 0, hp: 0 },
    patronHp: 4,
    enemyPatronHp: 1,
    playerDeck: [],
    enemyDeck: [],
    openingHand: 0,
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* Reading the board                                                   */
/* ------------------------------------------------------------------ */

/** Monotonic latches the coach sets as it watches play — once set, they
 *  stay set, so a step can't un-complete when the turn rolls over. */
export interface CoachSeen {
  /** Some hero of yours wears an item. */
  equipped: boolean;
  usedSkill: boolean;
  /** You used an active item. */
  usedItem: boolean;
  castUlt: boolean;
  swapped: boolean;
  /** How many attacks you have made. */
  attacks: number;
  /** How many of your turns you have ended. */
  turnsEnded: number;
}

export const emptySeen: CoachSeen = {
  equipped: false,
  usedSkill: false,
  usedItem: false,
  castUlt: false,
  swapped: false,
  attacks: 0,
  turnsEnded: 0,
};

export interface CoachView {
  G: GameState;
  me: PlayerID;
  seen: CoachSeen;
  /** A skill or item is armed and waiting for its target. */
  targeting: boolean;
  /** Your attack is being walked, before the engine makes it. */
  attacking: boolean;
  /** The hero detail sheet is open (where Skill, Attack and Retreat live). */
  sheetOpen: boolean;
  /** …and whose it is. */
  sheetHero: CardId | null;
}

/**
 * A gate spec names something on screen by its accessible name:
 *   `Kelvin —`                 first element whose aria-label starts with this
 *   `*Grit, in`                every element whose aria-label starts with this
 *   `~Retreat`                 first button whose text contains this
 *   `Shop sheet >> Souls:`     the second, looked up inside the first
 */
export type GateSpec = string;

const RIVAL: PlayerID = '1';
const alive = (c: CardInstance | null | undefined): c is CardInstance => !!c && !isRespawning(c);
const nameOf = (c: CardInstance | null | undefined) =>
  c ? cardName(c.cardId) : '';
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
/** "Frost Grenade" — the hero's first skill by its own name, exactly as the
 *  sheet prints it. */
function skillNameOf(c: CardInstance | null): string {
  if (!c) return 'the skill';
  const data = CARDS_BY_ID[c.cardId];
  if (data?.type !== 'hero') return 'the skill';
  return heroAbilities(data).find((x) => x.kind === 'skill')?.ability.name || 'the skill';
}

/** A number in the coach's voice: "two". */
const word = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
/** A count of souls, in the coach's voice: "two souls". */
function soulsText(n: number): string {
  return `${word(n)} soul${n === 1 ? '' : 's'}`;
}

/** True once any hero of yours wears an item. */
export function hasEquipment(G: GameState, me: PlayerID): boolean {
  const ps = G.players[me];
  return [ps.active, ...ps.bench].some((c) => !!c && wornItems(c).length > 0);
}

/** True when your hero `who` wears the item `id`. */
function wears(c: CardInstance | null, id: CardId): boolean {
  return !!c && wornItems(c).some((it) => it.cardId === id);
}

/** Your card `id` in the hand, if one is there. */
function inHand(v: CoachView, id: CardId): CardInstance | undefined {
  return v.G.players[v.me].hand.find((c) => c.cardId === id);
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
}

export const RIVAL_TURN = "Rival's turn. Watch its beats pass on the dial: Income, Act — cards, abilities, then the attack — and End.";

/** The turn button, by its name. */
export const TURN_BUTTON: GateSpec = END_TURN;

const mine = (v: CoachView) => activeOf(v.G, v.me);
const theirs = (v: CoachView) => activeOf(v.G, RIVAL);
const myBench = (v: CoachView) => benchOf(v.G, v.me);
const hpOf = (c: CardInstance | null) => (c ? `${c.hp} of ${c.hpMax}` : '');
const atkOf = (c: CardInstance | null) => (c ? effectiveAtk(c) : 0);
const souls = (v: CoachView) => v.G.players[v.me].souls;

/** Make your Active's attack: it swings at theirs, from the Attack
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
    blocked: 'Your attack is spent this turn. End the turn; the next one has its own.',
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
        : 'That skill needs a fresh turn. End the turn; it comes back.';
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

/** Put the card `itemId` from your hand on your Active: a tap on the card,
 *  then a tap on the hero — it costs its price, and is no ability of his. */
function play(id: string, title: string, itemId: CardId, lead: (v: CoachView) => string): CoachStep {
  const label = cardName(itemId);
  return {
    id,
    title,
    body: (v) => (v.targeting
      ? `${lead(v)} Now tap ${nameOf(mine(v)) || 'your Active'}.`
      : `${lead(v)} Tap ${label} in your hand, under the board, then tap ${nameOf(mine(v)) || 'your Active'}.`),
    task: (v) => wears(mine(v), itemId),
    // The engine's own question: the card in the hand, and room on the hero.
    ready: (v) => {
      const card = inHand(v, itemId), me = mine(v);
      return !!card && !!me && playBlocked(v.G, v.me, card.iid, me.iid) === null;
    },
    blocked: `${label} cannot go on now. End the turn; it waits in your hand, and ${word(LANE_INCOME)} more souls arrive.`,
    spot: (v) => (v.targeting ? [tile(mine(v))] : [inHandLabel(label)]),
    allow: (v) => (v.targeting ? [tile(mine(v))] : [inHandLabel(label)]),
  };
}

/* ------------------------------------------------------------------ */
/* The lessons                                                         */
/* ------------------------------------------------------------------ */

export type LessonId = 'skill' | 'souls' | 'level' | 'bench' | 'map';

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
    blurb: "Income, Act, End. Kelvin's skill ends it.",
    face: 'hero_kelvin',
    outro: 'Every turn runs Income, Act, End — the dial lights each one. A skill costs nothing, and it comes back every turn.',
    // Lash already hurt to a single point: Frost Grenade's one spirit damage
    // is the whole fight.
    setup: () => fight({ enemyHeroStats: [{ hp: 1, hpMax: 3 }] }),
    steps: [
      look('look', 'One on One', mine, (v) => `Every turn runs three beats, lit on the dial: Income (souls and a card), Act, End. Income just paid you ${soulsText(LANE_INCOME)} (you hold ${souls(v)}). ${nameOf(mine(v))} faces ${nameOf(theirs(v))}, who is already hurt: ${hpOf(theirs(v))}. Tap ${nameOf(mine(v))} to open his sheet.`),
      useSkill('Use the Skill', (v) => `${skillNameOf(mine(v))}: one spirit damage to their Active. Skills cost no souls.`),
    ],
  },

  {
    id: 'souls',
    number: 2,
    title: 'The Hand',
    blurb: 'A card drawn, two souls: put it on. Its swing is the kill.',
    face: 'hero_yamato',
    outro: `Every turn pays ${soulsText(LANE_INCOME)} and draws a card. Souls carry over: what you do not spend stays. An item waits in your hand until you pay to put it on a hero; once on, it stays, through death too. A hero you draw goes on the bench for free.`,
    // Yamato swings for 2 at a Lash on 3. His deck is one card, Extended
    // Magazine — his build's first item, a tier 1 for two of the turn's five
    // souls — drawn as the turn opens; on him it makes his swing 3, and the
    // swing that ends the Act is the kill. Turn two, so there is an attack.
    setup: () => fight({
      startTurn: 2,
      playerHeroes: ['hero_yamato'],
      playerDeck: ['extended_magazine'],
      enemyHeroStats: [{ hp: 3 }],
    }),
    steps: [
      play('play', 'Put It On', 'extended_magazine', (v) => `Income paid you ${soulsText(LANE_INCOME)} (you hold ${souls(v)}) and drew you a card: Extended Magazine, tier 1, +1 Bullet Power. Its price, ${soulsText(itemPrice('extended_magazine'))}, is on its coin. Played, it also makes one of its upgrades for your deck: pick either.`),
      attack((v) => `${nameOf(mine(v))} swings for ${atkOf(mine(v))} now, and ${nameOf(theirs(v))} is at ${hpOf(theirs(v))}. The attack is free, and it comes last: it ends the Act, and the turn's End follows on its own.`),
    ],
  },

  {
    id: 'level',
    number: 3,
    title: 'Active Items',
    blurb: 'Kelvin holds Cold Front. Put it on; it needs time.',
    face: 'hero_kelvin',
    outro: `An active item is the hero's one ability that turn, like a skill. It goes on cooling down — ready in ${word(ACTIVE_COOLDOWN.low)} turns — and cools down again after each use; hard crowd control has charges instead.`,
    // Kelvin holds Cold Front, a gift: put on, it starts on its cooldown, so it
    // cannot be the kill today. Lash stands at three: Frost Grenade's one
    // spirit damage, then Kelvin's swing of two, finish him — an ability, then
    // the attack that ends the Act. Turn two, so there is an attack.
    setup: () => fight({
      startTurn: 2,
      playerItems: ['cold_front'],
      enemyHeroStats: [{ hp: 3 }],
    }),
    steps: [
      play('play', 'Put It On', 'cold_front', () => `Cold Front waits in your hand, under the board — a gift, an active item; its card bears a bolt, and its price is ${soulsText(itemPrice('cold_front'))}. An active item works from the hero who wears it.`),
      useSkill('Cooling Down', (v) => `Cold Front is on, and like every active item it starts on cooldown: ready in ${word(ACTIVE_COOLDOWN.low)} turns — its plate on ${nameOf(mine(v))}'s sheet shows the dial. Today his skill does it: ${skillNameOf(mine(v))}, one spirit damage.`),
      attack((v) => `${nameOf(theirs(v))} is at ${hpOf(theirs(v))}, and ${nameOf(mine(v))} swings for ${atkOf(mine(v))}. One ability each, then one attack — it ends the Act.`),
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
    // Turn three, so the attack is open; the turn's income pays the retreat.
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
            ? `Attacks only ever hit the Active. Retreat costs ${soulsText(RETREAT_COST)} and swaps the two — one a turn, before the attack — and the hero who steps in makes your attack. Tap Retreat.`
            : `Tap ${nameOf(mine(v)) || 'your Active'}, then Retreat: ${soulsText(RETREAT_COST)} swaps him with ${nameOf(myBench(v)) || 'your bench hero'}.`),
        task: (v) => v.seen.swapped,
        // The engine's own question: is a swap with the bench open to you now?
        ready: (v) => {
          const stepIns = stepInCandidates(v.G.players[v.me]);
          return stepIns.length > 0 && retreatBlock(v.G, v.me, stepIns) === null;
        },
        blocked: `Retreat costs ${soulsText(RETREAT_COST)}, one a turn, before the attack. End the turn, then come back to it.`,
        spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(mine(v))]),
        allow: (v) => (v.sheetOpen ? ['~Retreat'] : [tile(mine(v))]),
      },
      attack((v) => `${nameOf(mine(v))} swings for ${atkOf(mine(v))}, and ${nameOf(theirs(v))} is at ${hpOf(theirs(v))}. ${nameOf(myBench(v))} sits it out on the bench.`),
    ],
  },

  // 5 The Map — its own file (mapLesson.ts), made of the builders above.
  mapLesson({ fight, look, useSkill, attack }),
];

export function lessonById(id: string | undefined | null): Lesson | undefined {
  return id ? LESSONS.find((l) => l.id === id) : undefined;
}

export function nextLesson(id: string): Lesson | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}
