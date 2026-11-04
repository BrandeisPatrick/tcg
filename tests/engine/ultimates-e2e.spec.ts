/**
 * Ultimates are kit abilities: each hero's `ult` names an ability it uses from
 * its sheet through `useSkill`, free, once it has reached ULT_UNLOCK_LEVEL, and
 * then not again for ULT_COOLDOWN of its owner's turns. It is the hero's one
 * ability that turn (skill or ultimate), and the Active may still attack after
 * it. Sinclair's ultimate borrows the rival Active's: a one-shot kit ability.
 */
import { describe, it, expect } from 'vitest';
import { INVALID_MOVE } from 'boardgame.io/core';
import { DeadlockGame } from '@/engine/game';
import { HEROES, CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { tickCooldowns } from '@/engine/statusOps';
import { skillBlocked } from '@/engine/legality';
import { ULT_COOLDOWN, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { makeAttack } from './_helpers';

let seq = 0;
function makeHero(cardId: string, ownerId: PlayerID, zone: CardInstance['zone'], slot: 0 | 1 | 2 | 3, level: 1 | 2 | 3 | 4 = ULT_UNLOCK_LEVEL): CardInstance {
  const d = CARDS_BY_ID[cardId] as any;
  return {
    iid: `h${seq++}`, cardId, ownerId, zone, slot,
    hp: d.hp, hpMax: d.hp, atkMod: 0, spiritMod: 0,
    statuses: [], attached: [], exhausted: false, skillUsedThisTurn: false,
    exp: 0, level,
  };
}

function freshG(casterHero: string, enemyHero = 'hero_abrams', level: 1 | 2 | 3 | 4 = ULT_UNLOCK_LEVEL): GameState {
  const G = JSON.parse(JSON.stringify(
    (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } }),
  )) as GameState;
  G.draft = null;
  G.turnNumber = 2;
  G.firstMover = '1';
  const p0 = G.players['0'], p1 = G.players['1'];
  p0.active = makeHero(casterHero, '0', 'active', 0, level);
  p0.bench = [makeHero('hero_kelvin', '0', 'bench', 1), null, null];
  p1.active = makeHero(enemyHero, '1', 'active', 0);
  p1.bench = [makeHero('hero_lash', '1', 'bench', 1), makeHero('hero_seven', '1', 'bench', 2), null];
  // Enemy HP high so no ultimate lands a kill (a KO would pay a bounty and skew the souls check).
  for (const e of [p1.active, ...p1.bench]) if (e) { e.hp = 99; e.hpMax = 99; }
  p0.souls = 0; p1.souls = 0;
  return G;
}

function use(G: GameState, hero: CardInstance, abilityId: string, targetIid?: string) {
  return (DeadlockGame as any).moves.useSkill(
    { G, ctx: { currentPlayer: '0', numPlayers: 2, turn: 2 }, playerID: '0' },
    hero.iid, targetIid, abilityId,
  );
}

function targetIid(G: GameState, t: string): string | undefined {
  if (t === 'self' || t === 'allyHero') return G.players['0'].active?.iid;
  if (t === 'enemyActive' || t === 'enemyAny' || t === 'anyBoard') return G.players['1'].active?.iid;
  return undefined;
}

describe('ultimates resolve through the real useSkill flow, free, as kit abilities', () => {
  for (const hero of HEROES) {
    it(`${hero.id}: ${hero.ult} at Level ${ULT_UNLOCK_LEVEL}, for 0 souls, then on cooldown`, () => {
      const G = freshG(hero.id, 'hero_abrams');
      const caster = G.players['0'].active!;
      const ability = getAbility(hero.ult!)!;
      expect(ability, hero.id).toBeTruthy();

      const res = use(G, caster, hero.ult!, targetIid(G, ability.target));

      expect(res).not.toBe(INVALID_MOVE);
      expect(G.players['0'].souls).toBe(0);                    // nothing paid
      expect(caster.cooldowns?.[hero.ult!]).toBe(ULT_COOLDOWN); // on its cooldown
      expect(caster.skillUsedThisTurn).toBe(true);              // the hero's one ability this turn
      expect(G.action?.kind).toBe('ult');
      expect(G.players['0'].hand.some((c) => CARDS_BY_ID[c.cardId]?.type === 'ultimate')).toBe(false);
    });
  }

  it('is locked below Level 2', () => {
    const G = freshG('hero_paige', 'hero_abrams', 1);
    const paige = G.players['0'].active!;
    expect(skillBlocked(G, '0', paige, undefined, 'eff_ult_paige')).toBe('locked');
    expect(use(G, paige, 'eff_ult_paige')).toBe(INVALID_MOVE);
  });

  it('waits out ULT_COOLDOWN of its owner\'s turns before it may be used again', () => {
    const G = freshG('hero_paige');
    const paige = G.players['0'].active!;
    expect(use(G, paige, 'eff_ult_paige')).not.toBe(INVALID_MOVE);
    paige.skillUsedThisTurn = false; // the turn ends
    for (let turn = 1; turn < ULT_COOLDOWN; turn++) {
      tickCooldowns(G.players['0']);
      expect(skillBlocked(G, '0', paige, undefined, 'eff_ult_paige'), `own turn ${turn} after`).toBe('cooldown');
    }
    tickCooldowns(G.players['0']);
    expect(skillBlocked(G, '0', paige, undefined, 'eff_ult_paige')).toBeNull();
  });

  it('is the hero\'s one ability this turn: no skill after it, but the Active still attacks', () => {
    const G = freshG('hero_paige');
    const paige = G.players['0'].active!;
    expect(use(G, paige, 'eff_ult_paige')).not.toBe(INVALID_MOVE);
    expect(skillBlocked(G, '0', paige, G.players['0'].active!.iid, 'skill_paige')).toBe('used');
    makeAttack(G, '0');
    expect(G.attackUsed).toBe(true);
  });

  it('Sinclair borrows the rival Active\'s ultimate: free, once, on a later turn', () => {
    const G = freshG('hero_sinclair', 'hero_lash');
    const sinclair = G.players['0'].active!;
    expect(use(G, sinclair, 'eff_ult_sinclair')).not.toBe(INVALID_MOVE);
    expect(sinclair.borrowedUlt).toBe('eff_ult_lash');
    // It is his one ability this turn; next turn the copy is his to use, for nothing.
    expect(skillBlocked(G, '0', sinclair, undefined, 'eff_ult_lash')).toBe('used');
    sinclair.skillUsedThisTurn = false;
    tickCooldowns(G.players['0']);
    const foe = G.players['1'].active!;
    const before = foe.hp;
    expect(use(G, sinclair, 'eff_ult_lash')).not.toBe(INVALID_MOVE);
    expect(foe.hp).toBeLessThan(before);                     // Death Slam landed
    expect(foe.statuses.some((s) => s.id === 'stun')).toBe(true);
    expect(sinclair.borrowedUlt).toBeUndefined();            // spent
    expect(sinclair.cooldowns?.eff_ult_lash).toBeUndefined(); // a borrowed one has no cooldown
    expect(G.players['0'].souls).toBe(0);
  });

  it('a borrowed channel is channelled by the hero who borrowed it', () => {
    const G = freshG('hero_sinclair', 'hero_dynamo');
    const sinclair = G.players['0'].active!;
    sinclair.borrowedUlt = 'eff_ult_dynamo';
    expect(use(G, sinclair, 'eff_ult_dynamo')).not.toBe(INVALID_MOVE);
    expect(sinclair.statuses.some((s) => s.id === 'casting')).toBe(true);
  });
});
