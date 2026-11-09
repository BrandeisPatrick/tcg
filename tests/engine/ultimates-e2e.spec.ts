/**
 * Ultimates are kit abilities: each hero's `ult` names an ability it uses from
 * its sheet through `useSkill` once it has reached ULT_UNLOCK_LEVEL, for its
 * card's size in souls (`kitCost`: ULT_COST small 4, medium 8, large 12), and
 * then not again for ULT_COOLDOWN of its owner's turns. It is the hero's one
 * ability that turn (skill or ultimate), and the Active may still attack after
 * it. Sinclair's ultimate casts the rival Active's at once, as his own.
 */
import { describe, it, expect } from 'vitest';
import { INVALID_MOVE } from 'boardgame.io/core';
import { DeadlockGame } from '@/engine/game';
import { HEROES, CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { tickCooldowns } from '@/engine/statusOps';
import { skillBlocked, skillTargets } from '@/engine/legality';
import { kitAbilityIds, kitCost, ultimateCard } from '@/engine/query';
import { ULT_COOLDOWN, ULT_COST, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { makeAttack } from './_helpers';

let seq = 0;
const SOULS = 20;
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
  // Enemy HP high so no ultimate lands a kill (a KO would push the map and skew the board checks).
  for (const e of [p1.active, ...p1.bench]) if (e) { e.hp = 99; e.hpMax = 99; }
  // Souls enough for any ultimate (a large one is 12); the checks read what was paid.
  p0.souls = SOULS; p1.souls = 0;
  return G;
}

/** The ultimates' cards anywhere on `pid`'s side of the board — its heroes and
 *  what they wear: none ever, an ultimate being a kit ability. */
function ultCardsOnBoard(G: GameState, pid: PlayerID): string[] {
  const out: string[] = [];
  const walk = (c: CardInstance) => {
    if (CARDS_BY_ID[c.cardId]?.type === 'ultimate') out.push(c.cardId);
    for (const a of c.attached ?? []) walk(a);
  };
  for (const c of [G.players[pid].active, ...G.players[pid].bench]) if (c) walk(c);
  return out;
}

function use(G: GameState, hero: CardInstance, abilityId: string, targetIid?: string) {
  return (DeadlockGame as any).moves.useSkill(
    { G, ctx: { currentPlayer: '0', numPlayers: 2, turn: 2 }, playerID: '0' },
    hero.iid, targetIid, abilityId,
  );
}

/** The first card the engine lets `hero` aim its ultimate at (`skillTargets`:
 *  its fixed filter, or the one its `aim` reads off the board — Traveler a
 *  bench ally, Audience Participation as the ultimate it copies), or nothing
 *  for one that takes no target. */
function targetIid(G: GameState, hero: CardInstance, abilityId: string): string | undefined {
  const targets = skillTargets(G, '0', hero, abilityId);
  return targets === 'none' ? undefined : targets[0]?.iid;
}

describe('ultimates resolve through the real useSkill flow, for their size in souls, as kit abilities', () => {
  for (const hero of HEROES) {
    it(`${hero.id}: ${hero.ult} at Level ${ULT_UNLOCK_LEVEL}, for its size's souls, then on cooldown`, () => {
      const G = freshG(hero.id, 'hero_abrams');
      const caster = G.players['0'].active!;
      const ability = getAbility(hero.ult!)!;
      expect(ability, hero.id).toBeTruthy();
      const price = ULT_COST[ultimateCard(hero.ult!)!.size];

      const res = use(G, caster, hero.ult!, targetIid(G, caster, hero.ult!));

      expect(res).not.toBe(INVALID_MOVE);
      expect(kitCost(caster, hero.ult!)).toBe(price);
      expect(G.players['0'].souls).toBe(SOULS - price);         // its size's price, paid
      expect(caster.cooldowns?.[hero.ult!]).toBe(ULT_COOLDOWN); // on its cooldown
      expect(caster.skillUsedThisTurn).toBe(true);              // the hero's one ability this turn
      expect(G.action?.kind).toBe('ult');
      expect(kitAbilityIds(caster)).toContain(hero.ult!);       // a kit ability…
      expect(ultCardsOnBoard(G, '0')).toEqual([]);              // …and no card of it anywhere
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

  it('Sinclair casts the rival Active\'s ultimate at once as his own: it lands now, for his price, on his cooldown, and leaves nothing behind', () => {
    const G = freshG('hero_sinclair', 'hero_lash');
    const sinclair = G.players['0'].active!;
    const foes = [G.players['1'].active!, ...G.players['1'].bench.filter((c): c is CardInstance => !!c)];
    const before = foes.map((f) => f.hp);
    expect(use(G, sinclair, 'eff_ult_sinclair')).not.toBe(INVALID_MOVE);
    // Death Slam, cast by Sinclair this turn: {sp:3} to every enemy, each stunned.
    foes.forEach((f, i) => {
      expect(f.hp, f.cardId).toBe(before[i] - 3);
      expect(f.statuses.some((s) => s.id === 'stun'), f.cardId).toBe(true);
    });
    // Paid as Audience Participation (medium), on its cooldown; Death Slam is
    // no ability of his, now or later — no copy is kept.
    expect(G.players['0'].souls).toBe(SOULS - ULT_COST.medium);
    expect(sinclair.cooldowns?.eff_ult_sinclair).toBe(ULT_COOLDOWN);
    expect(sinclair.cooldowns?.eff_ult_lash).toBeUndefined();
    expect((sinclair as unknown as Record<string, unknown>).borrowedUlt).toBeUndefined();
    sinclair.skillUsedThisTurn = false;
    expect(skillBlocked(G, '0', sinclair, undefined, 'eff_ult_lash')).toBe('noSkill');
    expect(kitAbilityIds(sinclair)).not.toContain('eff_ult_lash');
  });

  it('a copied ultimate is cast at once by Sinclair, scaled by his Spirit: Singularity stuns and hits now, with no channel', () => {
    const G = freshG('hero_sinclair', 'hero_dynamo');
    const sinclair = G.players['0'].active!;
    sinclair.spiritMod = 2;
    const foe = G.players['1'].active!;
    const before = foe.hp;
    expect(use(G, sinclair, 'eff_ult_sinclair')).not.toBe(INVALID_MOVE);
    expect(foe.hp).toBe(before - (2 + 2));                    // {sp:2} with Sinclair's Spirit 2
    expect(foe.statuses.some((s) => s.id === 'stun')).toBe(true);
    expect(sinclair.statuses.some((s) => s.id === 'casting' || s.id === 'casting_light')).toBe(false);
  });
});
