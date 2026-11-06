/**
 * Hero leveling. Heroes start at Lv1 and climb to the cap (the numbers are in
 * constants.ts). Exp comes from the lane: the Active earns more at the end of
 * its owner's turn than a bench hero does, and attaching equipment and landing
 * a kill blow earn more still. It persists across respawn. A hero that reaches
 * ULT_UNLOCK_LEVEL has unlocked its ultimate, a kit ability it uses from its
 * sheet (legality's `skillBlocked` reads the level); the log says so.
 */
import type { CardInstance, GameState } from './types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { pushLog } from './log';
import { pushFx } from './fx';
import { isRespawning, ultimateCard } from './query';
import {
  LEVEL_ATK_BONUS, LEVEL_HP_BONUS, LEVEL_SPIRIT_BONUS, LEVEL_THRESHOLDS, MAX_LEVEL, START_LEVEL, ULT_UNLOCK_LEVEL,
} from './constants';

/** Returns the number of levels gained (0 if no level-up). */
export function grantExp(G: GameState, card: CardInstance, amount: number): number {
  if (amount <= 0) return 0;
  if (isRespawning(card)) return 0;
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
    if (data.ult && startLevel < ULT_UNLOCK_LEVEL && level >= ULT_UNLOCK_LEVEL) {
      pushLog(G, `${data.name} unlocked ${cardName(ultimateCard(data.ult)?.id ?? data.ult)}.`);
    }
  }
  return gained;
}
