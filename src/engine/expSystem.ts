/**
 * Hero leveling. Heroes start at Lv1 and climb to the cap (the numbers are in
 * constants.ts). At the end of its owner's turn a side earns one point, and it
 * goes to one of its heroes on the board picked at random (`turnExpTaker`,
 * Patrick 2026-11-18: "+1 randomly for heroes on board"), so a wide board
 * spreads it thin. Attaching equipment and landing a kill blow earn more. It
 * stays on the card through a fall. Each level adds the
 * hero's own `growth` (docs/hero-design.md §2). A hero that reaches
 * ULT_UNLOCK_LEVEL has unlocked its ultimate, the button on its card
 * (legality's `skillBlocked` reads the level); the log says so.
 */
import type { CardInstance, GameState, PlayerState } from './types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { pushLog } from './log';
import { pushFx } from './fx';
import { nextRandom } from './deck';
import { isRespawning, ultimateCard } from './query';
import { LEVEL_THRESHOLDS, MAX_LEVEL, START_LEVEL, ULT_UNLOCK_LEVEL } from './constants';

/** Returns the number of levels gained (0 if no level-up). */
export function grantExp(G: GameState, card: CardInstance, amount: number): number {
  if (amount <= 0) return 0;
  if (isRespawning(card)) return 0;
  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero' || data.unit) return 0; // a unit earns nothing
  const startLevel = (card.level ?? START_LEVEL) as 1 | 2 | 3 | 4;
  if (startLevel >= MAX_LEVEL) return 0;

  let exp = (card.exp ?? 0) + amount;
  let level: 1 | 2 | 3 | 4 = startLevel;
  while (level < MAX_LEVEL) {
    const cost = LEVEL_THRESHOLDS[(level - 1) as 0 | 1 | 2];
    if (exp < cost) break;
    exp -= cost;
    level = (level + 1) as 1 | 2 | 3 | 4;
  }
  if (level >= MAX_LEVEL) exp = 0;

  card.exp = exp;
  card.level = level;
  const gained = level - startLevel;
  if (gained > 0) {
    // Each level adds the hero's own growth: its curve's points split between
    // Attack, HP and Spirit (docs/hero-design.md §2).
    const atkGain = gained * data.growth.atk;
    const hpGain = gained * data.growth.hp;
    const spiritGain = gained * data.growth.spirit;
    card.atkMod += atkGain;
    card.hpMax += hpGain;
    card.hp += hpGain;
    card.spiritMod += spiritGain;
    const gains = [
      atkGain ? `+${atkGain} Bullet Power` : '', hpGain ? `+${hpGain} HP` : '', spiritGain ? `+${spiritGain} Spirit Power` : '',
    ].filter(Boolean).join(', ');
    pushLog(G, `${data.name} reached Level ${level}${gains ? ` (${gains})` : ''}.`);
    pushFx(G, { kind: 'levelup', iid: card.iid, level });
    if (data.ult && startLevel < ULT_UNLOCK_LEVEL && level >= ULT_UNLOCK_LEVEL) {
      pushLog(G, `${data.name} unlocked ${cardName(ultimateCard(data.ult)?.id ?? data.ult)}.`);
    }
  }
  return gained;
}

/** Exp a hero has earned in all: the level steps behind it plus what fills the next. */
export function totalExp(card: CardInstance): number {
  const level = card.level ?? START_LEVEL;
  let sum = card.exp ?? 0;
  for (let l = START_LEVEL; l < level; l++) sum += LEVEL_THRESHOLDS[(l - 1) as 0 | 1 | 2];
  return sum;
}

/** Whether `card` can still earn exp: a living hero (no unit), not respawning, below the cap. */
function canEarnExp(card: CardInstance): boolean {
  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero' || data.unit) return false;
  return card.hp > 0 && !isRespawning(card) && (card.level ?? START_LEVEL) < MAX_LEVEL;
}

/** The hero that takes the turn's exp: one of `ps`'s heroes on the board
 *  (Active or bench) that can still earn, picked at random with the match's
 *  seeded dice; none if no hero can earn. A lone hero takes it every turn
 *  without a roll; a board of three, each about one turn in three. A hero at
 *  the cap, a fallen one and a unit are never picked, so the point is not lost. */
export function turnExpTaker(G: GameState, ps: PlayerState): CardInstance | undefined {
  const pool = [ps.active, ...ps.bench].filter((c): c is CardInstance => !!c && canEarnExp(c));
  if (pool.length <= 1) return pool[0];
  return pool[Math.floor(nextRandom(G) * pool.length)];
}
