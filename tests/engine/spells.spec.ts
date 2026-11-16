/**
 * Spells (docs/card-design.md §1; src/engine/actions/hand.ts `castSpell`,
 * legality.ts `playBlocked` / `spellTargets` / `spellCaster`): an active item
 * is a spell. It is played from the hand for its price, on the target its
 * card allows or on nothing; its effect resolves at once and the card goes to
 * the discard pile. It is never worn, has no cooldown and no charges, and
 * spends no hero's ability: a side plays as many as its souls pay for. The
 * side's standing Active is the caster. (Until 2026-11-15 an active item was
 * worn and used again on a cooldown; this file restates those tests.)
 */
import { describe, expect, it } from 'vitest';
import type { GameState, PlayerID } from '@/engine/types';
import { INVALID, perform, type Action } from '@/engine/engine';
import { blocked, legalActions, playBlocked, skillBlocked, spellCaster, spellTargets } from '@/engine/legality';
import { itemPrice, otherPlayer, wornItems } from '@/engine/query';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { addStatus } from '@/engine/statusOps';
import { EXP_ON_KILL, PRICE } from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, makeAttack, useItem } from './_helpers';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';

/** End `pid`'s turn, pass the rival's whole turn and begin `pid`'s next own
 *  turn. */
function nextOwnTurn(G: GameState, pid: PlayerID) {
  const rival = otherPlayer(pid);
  endTurnEffects(G, pid);
  beginTurn(G, rival, G.turnNumber + 1);
  endTurnEffects(G, rival);
  beginTurn(G, pid, G.turnNumber + 1);
}

const cast = (G: GameState, pid: PlayerID, cardIid: string, heroIid?: string) =>
  perform(G, pid, heroIid === undefined ? { type: 'playCard', cardIid } : { type: 'playCard', cardIid, heroIid });

describe('a spell is played from the hand, and spends no hero\'s ability', () => {
  it('after a spell every hero\'s skill and ultimate are still open, and a second spell follows it in the same turn', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 20;
    const foe = G.players['1'].active!;
    foe.hpMax = foe.hp = 30;
    const [lash, paige] = [me.bench[1]!, me.bench[2]!];
    lash.level = ULT_UNLOCK_LEVEL; // its ultimate unlocked
    const front = giveCard(G, '0', 'cold_front');
    const grit = giveCard(G, '0', 'grit');
    expect(cast(G, '0', front.iid, foe.iid)).not.toBe(INVALID);
    for (const h of [me.active!, ...me.bench]) expect([h!.skillUsedThisTurn ?? false, h!.lastSkillUsed]).toEqual([false, undefined]);
    expect(skillBlocked(G, '0', lash, foe.iid)).toBeNull();
    expect(skillBlocked(G, '0', lash, undefined, 'eff_ult_lash')).toBeNull();
    expect(skillBlocked(G, '0', paige, me.active!.iid)).toBeNull();
    // A second spell the same turn, and then a hero's own skill.
    expect(cast(G, '0', grit.iid)).not.toBe(INVALID);
    expect(me.souls).toBe(20 - PRICE[2] - PRICE[1]);
    expect(perform(G, '0', { type: 'useSkill', heroIid: paige.iid, targetIid: me.active!.iid })).not.toBe(INVALID);
    expect(me.discard.map((c) => c.cardId)).toEqual(['cold_front', 'grit']);
  });

  it('the side\'s Active is the caster: the kill blow\'s experience and its own gear\'s reactions are its', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const [haze, vindicta] = [me.active!, me.bench[0]!];
    const foe = G.players['1'].active!;
    foe.hp = 2; // Cold Front's 2 fells it
    haze.hp -= 2;
    giveItem(G, haze, 'mystic_regeneration'); // after the bearer's skill / spell / ult damages an enemy: heal 1
    const [hazeHp, vinExp] = [haze.hp, vindicta.exp];
    expect(spellCaster(G, '0')).toBe(haze);
    useItem(G, '0', 'cold_front', foe.iid);
    expect(foe.respawnTurnsLeft).toBeGreaterThan(0);
    expect(haze.exp).toBe(EXP_ON_KILL);
    expect(vindicta.exp).toBe(vinExp);
    expect(haze.hp).toBe(hazeHp + 1);
    expect(G.fx.find((e) => e.kind === 'cast')).toMatchObject({ castKind: 'spell', by: '0', cardId: 'cold_front', iid: haze.iid, targetIid: foe.iid });
    expect(G.action).toMatchObject({ kind: 'item', by: '0', cardId: 'cold_front', state: 'begin' });
    expect([vindicta.skillUsedThisTurn ?? false, haze.skillUsedThisTurn ?? false]).toEqual([false, false]);
  });

  it('an attack does not end the turn (2026-11-16): a spell after it is played as before it', () => {
    const G = freshReadyGame();
    const front = giveCard(G, '0', 'cold_front');
    G.players['0'].souls = 20;
    G.players['1'].active!.hpMax = G.players['1'].active!.hp = 20;
    makeAttack(G, '0');
    const cast = { type: 'playCard' as const, cardIid: front.iid, heroIid: G.players['1'].active!.iid };
    expect(blocked(G, '0', cast)).toBeNull();
    expect(legalActions(G, '0')).toContainEqual(cast);
  });

  it('the refusals: a card not in the hand, no souls, a target the spell may not be played on, no target named, nobody standing to cast it', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const [haze, lash] = [me.active!, me.bench[1]!];
    const foe = G.players['1'];
    me.souls = 20;
    const theirs = giveCard(G, '1', 'cold_front');
    const front = giveCard(G, '0', 'cold_front');
    const cases: [string, string | undefined, string][] = [
      [theirs.iid, foe.active!.iid, 'notInHand'],
      ['no-such-iid', undefined, 'notInHand'],
      [front.iid, foe.bench[0]!.iid, 'target'],    // Cold Front hits the enemy Active only
      [front.iid, lash.iid, 'target'],
      [front.iid, undefined, 'target'],            // a spell that takes a target must be given one
    ];
    for (const [cardIid, targetIid, why] of cases) {
      const before = JSON.stringify(G);
      expect(playBlocked(G, '0', cardIid, targetIid), `${cardIid} → ${targetIid}`).toBe(why);
      expect(cast(G, '0', cardIid, targetIid)).toBe(INVALID);
      expect(JSON.stringify(G)).toBe(before);
    }
    // A soul short: refused, and nothing changes.
    me.souls = itemPrice('cold_front') - 1;
    expect(playBlocked(G, '0', front.iid, foe.active!.iid)).toBe('souls');
    me.souls = 20;
    // A status on a hero stops no spell: the player plays it, not the hero.
    addStatus(G, haze, 'silenced', 1, 1);
    addStatus(G, haze, 'stun', 1, 1);
    expect(playBlocked(G, '0', front.iid, foe.active!.iid)).toBeNull();
    // A spell that takes no target is played on nothing (a hero named with it is ignored).
    const grit = giveCard(G, '0', 'grit');
    expect(spellTargets(G, '0', 'grit')).toBe('none');
    expect(blocked(G, '0', { type: 'playCard', cardIid: grit.iid })).toBeNull();
    expect(blocked(G, '0', { type: 'playCard', cardIid: grit.iid, heroIid: lash.iid })).toBeNull();
    // Nobody standing: no caster, no spell.
    for (const h of [me.active!, ...me.bench]) { h!.hp = 0; h!.respawnTurnsLeft = 2; }
    expect(spellCaster(G, '0')).toBeUndefined();
    expect(playBlocked(G, '0', grit.iid)).toBe('noCaster');
  });
});

describe('one use: the price, then the discard pile', () => {
  it('a spell is playable the turn it is drawn, at every tier, for its tier\'s price; it is never worn and takes no slot', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const foe = G.players['1'].active!;
    foe.hpMax = foe.hp = 40;
    me.souls = PRICE[2] + PRICE[3] + PRICE[4];
    const t2 = giveCard(G, '0', 'cold_front');    // tier 2
    const t3 = giveCard(G, '0', 'heroic_aura');   // tier 3
    const t4 = giveCard(G, '0', 'refresher');     // tier 4
    expect([playBlocked(G, '0', t2.iid, foe.iid), playBlocked(G, '0', t3.iid), playBlocked(G, '0', t4.iid)]).toEqual([null, null, null]);
    expect(cast(G, '0', t2.iid, foe.iid)).not.toBe(INVALID);
    expect(cast(G, '0', t3.iid)).not.toBe(INVALID);
    expect(cast(G, '0', t4.iid)).not.toBe(INVALID);
    expect(me.souls).toBe(0);
    expect(me.hand).toEqual([]);
    expect(me.discard.map((c) => [c.cardId, c.zone])).toEqual([['cold_front', 'discard'], ['heroic_aura', 'discard'], ['refresher', 'discard']]);
    for (const h of [me.active!, ...me.bench]) expect(wornItems(h!)).toEqual([]);
    for (const c of me.discard) expect(c.cooldowns).toBeUndefined();
  });

  it('a played spell stays on the discard pile: nothing of it is left on the board, turn after turn', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const foe = G.players['1'].active!;
    foe.hpMax = foe.hp = 40;
    const card = useItem(G, '0', 'cold_front', foe.iid);
    expect(me.discard).toContain(card);
    nextOwnTurn(G, '0');
    nextOwnTurn(G, '0');
    expect(me.discard).toContain(card);
    expect(me.hand).not.toContain(card);
    expect(legalActions(G, '0').some((a) => a.type === 'playCard' && a.cardIid === card.iid)).toBe(false);
    expect(perform(G, '0', { type: 'playCard', cardIid: card.iid, heroIid: G.players['1'].active!.iid })).toBe(INVALID);
  });

  it('hard crowd control is a spell like any other: one play, its effect, the discard pile — a second needs a second card', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const price = itemPrice('knockdown');                    // 4: it prints its own (2026-11-16)
    me.souls = 2 * price;
    const [first, second] = [giveCard(G, '0', 'knockdown'), giveCard(G, '0', 'knockdown')]; // Stun the enemy Active for 1 turn
    const foe = G.players['1'].active!;
    expect(cast(G, '0', first.iid, foe.iid)).not.toBe(INVALID);
    expect(foe.statuses.some((s) => s.id === 'stun')).toBe(true);
    expect([me.souls, me.discard.map((c) => c.iid)]).toEqual([price, [first.iid]]);
    nextOwnTurn(G, '0');
    me.souls = price;
    expect(cast(G, '0', second.iid, G.players['1'].active!.iid)).not.toBe(INVALID);
    expect(me.discard.map((c) => c.iid)).toEqual([first.iid, second.iid]);
    expect(legalActions(G, '0').some((a) => a.type === 'playCard')).toBe(false);
  });
});

describe('the legal-action list', () => {
  it('lists one play per spell in the hand per legal target — on nothing for one that takes none — and equipment onto each hero; none while a discard is owed', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    me.souls = 30;
    const front = giveCard(G, '0', 'cold_front');     // the enemy Active
    const rite = giveCard(G, '0', 'healing_rite');    // any ally hero
    const grit = giveCard(G, '0', 'grit');            // no target
    const health = giveCard(G, '0', 'extra_health');  // equipment: onto one of your heroes
    const allies = [me.active!, ...me.bench].map((h) => h!.iid);
    const listed = legalActions(G, '0').filter((a): a is Extract<Action, { type: 'playCard' }> => a.type === 'playCard');
    expect(listed).toEqual([
      { type: 'playCard', cardIid: front.iid, heroIid: G.players['1'].active!.iid },
      ...allies.map((t) => ({ type: 'playCard', cardIid: rite.iid, heroIid: t })),
      { type: 'playCard', cardIid: grit.iid },
      ...allies.map((t) => ({ type: 'playCard', cardIid: health.iid, heroIid: t })),
    ]);
    for (const a of listed) expect(blocked(G, '0', a)).toBeNull();
    G.pendingDiscard = { pid: '0', count: 1, cardId: 'improved_cooldown' };
    expect(legalActions(G, '0').some((a) => a.type === 'playCard')).toBe(false);
  });
});
