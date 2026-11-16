/**
 * Patrick, 2026-11-16: "We should have some items that extend the duration of
 * CC, like Duration Extender … so we can have a control deck."
 *
 * Deadlock's Duration Extender and Superior Duration lengthen everything an
 * ability does, its crowd control included. Here:
 * - Duration Extender (Spirit T2): crowd control its bearer casts on an enemy,
 *   of 2 turns or more, lasts 1 turn longer (as its buffs of 2+ turns do).
 * - Superior Duration (Spirit T3, built from it): every crowd control its
 *   bearer casts lasts 1 turn longer: a 1-turn Stun becomes 2.
 * "Casts" is its skill, its ultimate or a spell it casts; an attack's or a
 * proc's crowd control is not stretched.
 */
import { describe, it, expect } from 'vitest';
import { itemCard } from '@/cards';
import { INVALID, perform } from '@/engine/engine';
import { addStatus } from '@/engine/statusOps';
import { withCast } from '@/engine/castContext';
import { freshReadyGame, giveCard, giveItem, makeHero } from './_helpers';

const status = (c: { statuses: { id: string; duration: number }[] }, id: string) => c.statuses.find((s) => s.id === id);

/** P0's Active made Seven (Static Charge), and the rival Active tough. */
function board() {
  const G = freshReadyGame();
  const me = G.players['0'];
  me.souls = 20;
  const caster = me.active!;
  const rival = G.players['1'].active!;
  rival.hp = rival.hpMax = 40;
  return { G, me, caster, rival };
}

describe('the Duration items stretch the crowd control their bearer casts', () => {
  it('Superior Duration: a 1-turn Stun its bearer casts lasts 2', () => {
    const { G, caster, rival } = board();
    giveItem(G, caster, 'superior_duration');
    withCast(caster, 'skill', () => addStatus(G, rival, 'stun', 1, 1));
    expect(status(rival, 'stun')?.duration).toBe(2);
  });

  it('Duration Extender: a 2-turn Disarm (Disarming Hex) lasts 3, a 1-turn Stun stays 1', () => {
    const { G, me, caster, rival } = board();
    giveItem(G, caster, 'duration_extender');
    const hex = giveCard(G, '0', 'disarming_hex');
    expect(perform(G, '0', { type: 'playCard', cardIid: hex.iid, heroIid: rival.iid })).not.toBe(INVALID);
    expect(status(rival, 'disarm')?.duration).toBe(3);
    withCast(caster, 'skill', () => addStatus(G, rival, 'stun', 1, 1));
    expect(status(rival, 'stun')?.duration).toBe(1);
    void me;
  });

  it("only what the bearer casts: not an attack's or a proc's, not on its own side, and nothing without the item", () => {
    const { G, caster, rival } = board();
    giveItem(G, caster, 'superior_duration');
    withCast(caster, 'attack', () => addStatus(G, rival, 'rooted', 1, 1));
    expect(status(rival, 'rooted')?.duration).toBe(1);
    withCast(caster, 'proc', () => addStatus(G, rival, 'silenced', 1, 1));
    expect(status(rival, 'silenced')?.duration).toBe(1);
    const ally = G.players['0'].bench[0]!;
    withCast(caster, 'skill', () => addStatus(G, ally, 'rooted', 1, 1));
    expect(status(ally, 'rooted')?.duration).toBe(1);
    const other = board();
    withCast(other.caster, 'skill', () => addStatus(other.G, other.rival, 'stun', 1, 1));
    expect(status(other.rival, 'stun')?.duration).toBe(1);
  });

  it("a skill's own crowd control: Graves's Grasping Hands roots 2 turns with Superior Duration", () => {
    const { G, me, rival } = board();
    const graves = me.active = makeHero('hero_graves', '0', 'active', 0);
    giveItem(G, graves, 'superior_duration');
    expect(perform(G, '0', { type: 'useSkill', heroIid: graves.iid, skillId: 'skill_graves', targetIid: rival.iid })).not.toBe(INVALID);
    expect(status(rival, 'rooted')?.duration).toBe(2);
  });

  it('the cards say so, and keep their tab, tier and line', () => {
    expect(itemCard('duration_extender')).toMatchObject({ type: 'equipment', slot: 'spirit', tier: 2 });
    expect(itemCard('superior_duration')).toMatchObject({ type: 'equipment', slot: 'spirit', tier: 3, upgradesFrom: 'duration_extender' });
    expect(itemCard('duration_extender')!.text).toBe('Buffs on the bearer, and crowd control it casts on an enemy, last 1 turn longer if they last 2 turns or more.');
    expect(itemCard('superior_duration')!.text).toBe('Buffs on the bearer last 2 turns longer, and crowd control it casts on an enemy 1 turn longer.');
  });
});
