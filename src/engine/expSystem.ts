/**
 * Hero leveling. Heroes start at Lv1, climb to Lv4 (cap). Step costs are
 * 3 → 6 → 9 exp (cumulative cap 18). Exp earned at end of owner's turn,
 * on equipment attach, and on kill blow. Persists across respawn.
 */
import type { CardInstance, GameState } from './types';
import { CARDS_BY_ID } from '@/cards';
import { pushLog } from './util';

export const LEVEL_THRESHOLDS = [3, 6, 9] as const;
export const START_LEVEL = 1 as const;
export const MAX_LEVEL = 4 as const;

export const LEVEL_ATK_BONUS = 1 as const;
export const LEVEL_HP_BONUS = 1 as const;
export const LEVEL_SPIRIT_BONUS = 0 as const;

/** Returns the number of levels gained (0 if no level-up). */
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
    card.atkMod += atkGain;
    card.hpMax += hpGain;
    card.hp += hpGain;
    pushLog(G, `${data.name} reached Level ${level} (+${atkGain} Bullet Power, +${hpGain} HP).`);
  }
  return gained;
}

export function resetExpOnDeath(card: CardInstance) {
  card.exp = 0;
  card.level = START_LEVEL;
}
