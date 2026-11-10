/**
 * Hero leveling. Heroes start at Lv1 and climb to the cap (the numbers are in
 * constants.ts). Exp comes from the lane: the Active earns more at the end of
 * its owner's turn than a bench hero does, and attaching equipment and landing
 * a kill blow earn more still. It persists across respawn. Each level adds the
 * hero's own `growth` (docs/hero-design.md §2). A hero that reaches
 * ULT_UNLOCK_LEVEL has unlocked its ultimate, the button on its card
 * (legality's `skillBlocked` reads the level); the log says so.
 */
import type { CardInstance, GameState } from './types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { pushLog } from './log';
import { pushFx } from './fx';
import { isRespawning, ultimateCard } from './query';
import { LEVEL_THRESHOLDS, MAX_LEVEL, START_LEVEL, ULT_UNLOCK_LEVEL } from './constants';

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
