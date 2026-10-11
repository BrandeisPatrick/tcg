/**
 * Hero leveling, and the ultimate a level earns. Heroes start at Lv1 and climb
 * to the cap (the numbers are in constants.ts). Exp comes from the lane: the
 * Active earns more at the end of its owner's turn than a bench hero does, and
 * attaching equipment and landing a kill blow earn more still. It persists
 * across respawn. A hero that reaches ULT_UNLOCK_LEVEL has earned its
 * ultimate: the card is dealt to its owner's hand the moment it happens.
 */
import type { CardInstance, GameState, PlayerState } from './types';
import { CARDS_BY_ID } from '@/cards';
import { pushLog } from './log';
import { pushFx } from './fx';
import { allocatorOf } from './ids';
import { makeInstance } from './deckOps';
import { liveBoardCards } from './query';
import {
  LEVEL_ATK_BONUS, LEVEL_HP_BONUS, LEVEL_SPIRIT_BONUS, LEVEL_THRESHOLDS, MAX_HAND, MAX_LEVEL, START_LEVEL,
  ULT_UNLOCK_LEVEL,
} from './constants';

/** Returns the number of levels gained (0 if no level-up). A level-up deals
 *  the ultimate it may have earned (see `dealEarnedUltimates`). */
export function grantExp(G: GameState, card: CardInstance, amount: number): number {
  if (amount <= 0) return 0;
  if ((card.respawnTurnsLeft ?? 0) > 0) return 0;
  const data = CARDS_BY_ID[card.cardId];
  if (!data || data.type !== 'hero') return 0;
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
    const atkGain = gained * LEVEL_ATK_BONUS;
    const hpGain = gained * LEVEL_HP_BONUS;
    const spiritGain = gained * LEVEL_SPIRIT_BONUS;
    card.atkMod += atkGain;
    card.hpMax += hpGain;
    card.hp += hpGain;
    card.spiritMod += spiritGain;
    pushLog(G, `${data.name} reached Level ${level} (+${atkGain} Bullet Power, +${hpGain} HP, +${spiritGain} Spirit Power).`);
    pushFx(G, { kind: 'levelup', iid: card.iid, level });
    const ps = G.players[card.ownerId];
    if (ps) dealEarnedUltimates(G, ps);
  }
  return gained;
}

/**
 * Deal the ultimate of every living hero of `ps` that has earned it (reached
 * ULT_UNLOCK_LEVEL) and not yet received it — once per match per ult, hand
 * space permitting. Runs on every level-up, so the card arrives the moment it
 * is earned (mid-turn included), and at the start of each turn for one a full
 * hand held back.
 */
export function dealEarnedUltimates(G: GameState, ps: PlayerState) {
  const ids = allocatorOf(G);
  for (const hero of liveBoardCards(ps)) {
    const data = CARDS_BY_ID[hero.cardId];
    if (data?.type !== 'hero' || !data.ult) continue;
    if ((hero.level ?? START_LEVEL) < ULT_UNLOCK_LEVEL) continue;
    if (ps.ultsConsumed.includes(data.ult)) continue;
    if (ps.hand.length >= MAX_HAND) break;
    const ult = makeInstance(ids, data.ult, ps.id, 'hand');
    ps.hand.push(ult);
    ps.ultsConsumed.push(data.ult);
    pushLog(G, `P${ps.id} unlocked ${CARDS_BY_ID[data.ult]?.name ?? data.ult}.`);
  }
}
