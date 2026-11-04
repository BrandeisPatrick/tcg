import { describe, it, expect } from 'vitest';
import { DeadlockGame } from '@/engine/game';
import { attackBlocked, skillBlocked } from '@/engine/legality';
import { forecastAttack } from '@/engine/forecast';
import { addStatus } from '@/engine/statusOps';
import type { GameState, PlayerID } from '@/engine/types';
import { attackBlockReason, attackLine, readyHeroes } from '@/ui/board/heroActions';
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
    ['the turn\'s attack made', (G) => { G.attackUsed = true; }],
    ['her ultimate used', (G) => { LASH(G).level = 2; LASH(G).skillUsedThisTurn = true; LASH(G).lastSkillUsed = 'eff_ult_lash'; }],
    ['on cooldown', (G) => { LASH(G).cooldowns = { skill_lash: 1 }; }],
    ['stunned', (G) => { addStatus(G, LASH(G), 'stun', 1, 1); }],
    ['silenced', (G) => { addStatus(G, LASH(G), 'silenced', 1, 2); }],
    ['asleep', (G) => { addStatus(G, LASH(G), 'sleep', 6, 2); }],
    ['channelling heavy', (G) => { addStatus(G, LASH(G), 'casting', 3, 3); }],
    ['channelling light', (G) => { addStatus(G, LASH(G), 'casting_light', 3, 3); }],
    ['with no souls (abilities are free)', (G) => { G.players['0'].souls = 0; }],
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
    const G = freshReadyGame(); // Haze swings, and from Level 3 Fixation adds a second swing
    G.players['0'].active!.level = 3;
    const abrams = G.players['1'].active!;
    abrams.hp = abrams.hpMax = 30; // stands through both
    const plan = forecastAttack(G, '0');
    expect(plan.steps.length).toBe(2);
    const dealt = plan.steps.reduce((n, s) => n + s.finalDamage, 0);
    expect(attackLine(plan)).toBe(`Hits Abrams for ${dealt} bullet damage in 2 swings`);
  });

  it('calls a knockout', () => {
    const G = freshReadyGame();
    G.players['1'].active!.hp = 1;
    expect(attackLine(forecastAttack(G, '0'))).toBe(`Hits Abrams for ${forecastAttack(G, '0').steps[0].finalDamage} bullet damage — a knockout`);
  });

  it('says the attack is made; the hero a Retreat brings in before it makes it, and nothing moves after it', () => {
    const G = freshReadyGame();
    const lash = LASH(G);
    G.players['0'].souls = 2;
    expect(runMove('moveHero', G, '0', 2, 0)).not.toBe('INVALID_MOVE'); // Lash steps in
    expect(G.players['0'].active!.iid).toBe(lash.iid);
    expect(attackBlocked(G, '0')).toBeNull();
    expect(runMove('attack', G, '0')).not.toBe('INVALID_MOVE');
    expect(attackBlocked(G, '0')).toBe('used');
    expect(attackBlockReason('used')).toBe('Attacked this turn');
    expect(runMove('moveHero', G, '0', 2, 0)).toBe('INVALID_MOVE');
  });
});

describe('the ready glint', () => {
  it('marks the Active while its attack is open, and every hero with an ability it can use now', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 0; // abilities are free: the bench's skills are up with no souls
    const ready = readyHeroes(G, '0', false);
    expect(ready.has(LASH(G).iid)).toBe(true);
    expect(ready.has(me.bench[2]!.iid)).toBe(true); // Paige
    expect(ready.has(me.active!.iid)).toBe(false);  // Haze is passive only, her ultimate locked at Level 1

    for (const b of me.bench) if (b) b.skillUsedThisTurn = true; // the bench has used its skills: only the attack is left
    expect([...readyHeroes(G, '0', true)]).toEqual([me.active!.iid]);
    expect(readyHeroes(G, '0', false).size).toBe(0);

    me.active!.level = 2; // Haze's ultimate unlocks: she has an ability to use too
    expect(readyHeroes(G, '0', false).has(me.active!.iid)).toBe(true);
  });
});
