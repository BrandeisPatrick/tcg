import { describe, it, expect } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { attackBlocked, planAttackPhase } from '@/engine/combat';
import { addStatus } from '@/engine/statusOps';
import type { GameState, PlayerID } from '@/engine/types';
import { attackBlockReason, attackLine, readyHeroes, skillBlocked } from '@/ui/board/heroActions';
import { freshReadyGame } from '../engine/_helpers';

// The board, the hero sheet and the tutorial read what a hero can still do
// this turn from `heroActions`, never from their own copy of the rules. These
// pin it to the engine: a skill the UI offers is one `useSkill` takes, and
// one it holds back is one `useSkill` refuses.

function runMove(name: string, G: GameState, pid: PlayerID, ...args: unknown[]) {
  const fn = (DeadlockGame.moves as any)[name];
  return fn({ G, ctx: { currentPlayer: pid, numPlayers: 2, turn: 1 } as any, playerID: pid, events: {} as any, random: {} as any }, ...args);
}

/** P0 = Haze (Active, passive only), Vindicta / Lash / Paige on the bench. */
const LASH = (G: GameState) => G.players['0'].bench[1]!;

describe('skillBlocked mirrors the engine', () => {
  const cases: [string, (G: GameState) => void][] = [
    ['ready', () => {}],
    ['used its skill', (G) => { LASH(G).skillUsedThisTurn = true; }],
    ['made the attack', (G) => { LASH(G).attackedThisTurn = true; }],
    ['stunned', (G) => { addStatus(G, LASH(G), 'stun', 1, 1); }],
    ['silenced', (G) => { addStatus(G, LASH(G), 'silenced', 1, 2); }],
    ['asleep', (G) => { addStatus(G, LASH(G), 'sleep', 6, 2); }],
    ['channelling heavy', (G) => { addStatus(G, LASH(G), 'casting', 3, 3); }],
    ['channelling light', (G) => { addStatus(G, LASH(G), 'casting_light', 3, 3); }],
    ['short of souls', (G) => { G.players['0'].souls = 0; }],
    ['down', (G) => { LASH(G).hp = 0; LASH(G).respawnTurnsLeft = 2; }],
  ];
  for (const [label, doctor] of cases) {
    it(`${label}: offered exactly when the engine takes it`, () => {
      const G = freshReadyGame();
      G.players['0'].souls = 3;
      doctor(G);
      const lash = LASH(G);
      const offered = skillBlocked(G, '0', lash) === null;
      const taken = runMove('useSkill', G, '0', lash.iid, G.players['1'].active!.iid) !== 'INVALID_MOVE';
      expect(offered, label).toBe(taken);
    });
  }

  it('a passive-only hero has no skill to offer, and the engine agrees', () => {
    const G = freshReadyGame();
    G.players['0'].souls = 3;
    const haze = G.players['0'].active!;
    expect(skillBlocked(G, '0', haze)).toBe('noSkill');
    expect(runMove('useSkill', G, '0', haze.iid, G.players['1'].active!.iid)).toBe('INVALID_MOVE');
  });
});

describe('the attack, as the sheet words it', () => {
  it('says what the swing does, Extra Attacks included', () => {
    const G = freshReadyGame(); // Haze swings, and Fixation adds a second swing
    const abrams = G.players['1'].active!;
    abrams.hp = abrams.hpMax = 30; // stands through both
    const plan = planAttackPhase(G, '0');
    expect(plan.steps.length).toBe(2);
    const dealt = plan.steps.reduce((n, s) => n + s.finalDamage, 0);
    expect(attackLine(plan)).toBe(`Hits Abrams for ${dealt} bullet damage in 2 swings`);
  });

  it('calls a knockout', () => {
    const G = freshReadyGame();
    G.players['1'].active!.hp = 1;
    expect(attackLine(planAttackPhase(G, '0'))).toBe(`Hits Abrams for ${planAttackPhase(G, '0').steps[0].finalDamage} bullet damage — a knockout`);
  });

  it('tells the attacker from the hero who came in after it', () => {
    const G = freshReadyGame();
    const haze = G.players['0'].active!;
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(attackBlocked(G, '0')).toBe('used');
    expect(attackBlockReason('used', haze)).toBe('Attacked this turn');
    expect(attackBlockReason('used', LASH(G))).toBe("This turn's attack is spent");
  });
});

describe('the ready glint', () => {
  it('marks the Active while its attack is open, and every hero whose skill can be used now', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 0; // no skills: only the attack is left
    expect([...readyHeroes(G, '0', true)]).toEqual([me.active!.iid]);
    expect(readyHeroes(G, '0', false).size).toBe(0);

    me.souls = 1; // the bench's skills come up
    const ready = readyHeroes(G, '0', false);
    expect(ready.has(LASH(G).iid)).toBe(true);
    expect(ready.has(me.bench[2]!.iid)).toBe(true); // Paige
    expect(ready.has(me.active!.iid)).toBe(false);  // Haze is passive only
  });
});
