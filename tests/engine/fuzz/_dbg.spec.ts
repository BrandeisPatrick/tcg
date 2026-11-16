import { it } from 'vitest';
import { runInvariantMix } from './collect';
import { MIXES } from './collect';
it('dbg', () => {
  for (let i = 0; i < MIXES.length; i++) {
    const { games } = runInvariantMix(i, 80);
    const steps = (games as any[]).map((g) => g.steps); const turns = (games as any[]).map((g) => g.turns);
    console.log('MIX', i, 'minSteps', Math.min(...steps), 'minTurns', Math.min(...turns), 'short', (games as any[]).filter((g) => g.steps <= 20).map((g) => `${g.seed}:${g.steps}/${g.turns}`).join(','));
  }
}, 120000);
