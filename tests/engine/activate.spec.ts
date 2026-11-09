/**
 * Active items (rules §5; src/engine/actions/activate.ts, legality.ts
 * `activateBlocked` / `activateTargets`): a hero uses an active item it wears
 * as its one ability of the turn — skill, item and ultimate share it — from
 * the Active slot or the bench; the bearer is the caster. A bought active
 * starts on its full cooldown (2 own turns for tiers 1–2, 3 for tiers 3–4),
 * which ticks at its owner's turn start, on a corpse too; hard crowd control
 * has 2 charges a match instead and stays worn, spent, once they are gone.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, PlayerID } from '@/engine/types';
import { INVALID, perform, type Action } from '@/engine/engine';
import { activateBlocked, activateTargets, blocked, legalActions, skillBlocked } from '@/engine/legality';
import { findWornItem, itemCooldown, otherPlayer } from '@/engine/query';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { damageUnit } from '@/engine/damage';
import { resolve } from '@/engine/death';
import { addStatus } from '@/engine/statusOps';
import { ACTIVE_COOLDOWN, EXP_ON_KILL, HARD_CC_CHARGES } from '@/engine/constants';
import { freshReadyGame, giveCard, giveItem, makeAttack, playNew, useItem } from './_helpers';

/** End `pid`'s turn, pass the rival's whole turn and begin `pid`'s next own
 *  turn. */
function nextOwnTurn(G: GameState, pid: PlayerID) {
  const rival = otherPlayer(pid);
  endTurnEffects(G, pid);
  beginTurn(G, rival, G.turnNumber + 1);
  endTurnEffects(G, rival);
  beginTurn(G, pid, G.turnNumber + 1);
}

const activate = (G: GameState, pid: PlayerID, itemIid: string, targetIid?: string) =>
  perform(G, pid, { type: 'activate', itemIid, targetIid });

describe('an active item is its bearer\'s one ability of the turn', () => {
  it('after the item, the bearer\'s skill and ultimate are spent — after a skill, its items — and the other heroes are free', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const foe = G.players['1'].active!;
    const [lash, paige] = [me.bench[1]!, me.bench[2]!];
    lash.level = 2; // its ultimate unlocked
    const front = giveItem(G, lash, 'cold_front');
    expect(activate(G, '0', front.iid, foe.iid)).not.toBe(INVALID);
    expect([lash.skillUsedThisTurn, lash.lastSkillUsed]).toEqual([true, 'cold_front']);
    expect(skillBlocked(G, '0', lash, foe.iid)).toBe('used');
    expect(skillBlocked(G, '0', lash, undefined, 'eff_ult_lash')).toBe('used');
    expect(skillBlocked(G, '0', paige, me.active!.iid)).toBeNull();

    const grit = giveItem(G, paige, 'grit');
    expect(perform(G, '0', { type: 'useSkill', heroIid: paige.iid, targetIid: me.active!.iid })).not.toBe(INVALID);
    expect(activateBlocked(G, '0', grit.iid)).toBe('used');
    // Both spent: the next turn of theirs gives each its ability back.
    nextOwnTurn(G, '0');
    expect(activateBlocked(G, '0', grit.iid)).toBeNull();
    expect(skillBlocked(G, '0', lash, foe.iid)).toBeNull();
  });

  it('the bearer is the caster, on the bench too: the kill blow\'s experience and its own gear\'s reactions are its', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const [haze, vindicta] = [me.active!, me.bench[0]!];
    const foe = G.players['1'].active!;
    foe.hp = 2; // Cold Front's 2 fells it
    vindicta.hp -= 2;
    giveItem(G, vindicta, 'mystic_regeneration'); // after the bearer's skill / spell / ult damages an enemy: heal 1
    const [vinHp, hazeExp] = [vindicta.hp, haze.exp];
    useItem(G, '0', 'cold_front', foe.iid, vindicta);
    expect(foe.respawnTurnsLeft).toBeGreaterThan(0);
    expect(vindicta.exp).toBe(EXP_ON_KILL);
    expect(haze.exp).toBe(hazeExp);
    expect(vindicta.hp).toBe(vinHp + 1);
    expect(G.fx.find((e) => e.kind === 'cast')).toMatchObject({ castKind: 'spell', by: '0', cardId: 'cold_front', iid: vindicta.iid, targetIid: foe.iid });
    expect(G.action).toMatchObject({ kind: 'item', by: '0', cardId: 'cold_front', state: 'begin' });
    expect([vindicta.skillUsedThisTurn, haze.skillUsedThisTurn]).toEqual([true, false]);
  });

  it('the turn\'s attack ends the Act: no item after it', () => {
    const G = freshReadyGame();
    const front = giveItem(G, G.players['0'].bench[0]!, 'cold_front');
    G.players['1'].active!.hpMax = G.players['1'].active!.hp = 20;
    makeAttack(G, '0');
    expect(activateBlocked(G, '0', front.iid, G.players['1'].active!.iid)).toBe('actOver');
    expect(legalActions(G, '0')).toEqual([{ type: 'endTurn' }]);
  });

  it('the other refusals: a passive item, an item not yours, a fallen or silenced bearer, a target the item may not aim at', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    const foe = G.players['1'];
    const passive = giveItem(G, haze, 'extra_health');
    const theirs = giveItem(G, foe.active!, 'cold_front');
    const front = giveItem(G, haze, 'cold_front');
    const onCorpse = giveItem(G, vindicta, 'grit');
    vindicta.hp = 0;
    vindicta.respawnTurnsLeft = 2;
    const silenced = giveItem(G, lash, 'grit');
    addStatus(G, lash, 'silenced', 1, 1);
    const cases: [string, string | undefined, string][] = [
      [passive.iid, undefined, 'passive'],
      [theirs.iid, haze.iid, 'noItem'],
      ['no-such-iid', undefined, 'noItem'],
      [onCorpse.iid, undefined, 'down'],
      [silenced.iid, undefined, 'status'],
      [front.iid, foe.bench[0]!.iid, 'target'],    // Cold Front hits the enemy Active only
      [front.iid, lash.iid, 'target'],
    ];
    for (const [itemIid, targetIid, why] of cases) {
      const before = JSON.stringify(G);
      expect(activateBlocked(G, '0', itemIid, targetIid), `${itemIid} → ${targetIid}`).toBe(why);
      expect(activate(G, '0', itemIid, targetIid)).toBe(INVALID);
      expect(JSON.stringify(G)).toBe(before);
    }
    // An item that takes a target must be given one; one that takes none ignores it.
    expect(activateBlocked(G, '0', front.iid)).toBeNull();
    expect(blocked(G, '0', { type: 'activate', itemIid: front.iid })).toBe('target');
    const grit = giveItem(G, me.bench[2]!, 'grit');
    expect(activateTargets(G, '0', grit, me.bench[2]!)).toBe('none');
    expect(blocked(G, '0', { type: 'activate', itemIid: grit.iid })).toBeNull();
  });
});

describe('cooldowns and charges', () => {
  it('put on, an active starts on its full cooldown: usable after 2 own turns at tiers 1–2, after 3 at tiers 3–4', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const t2 = playNew(G, '0', 'cold_front', me.bench[0]!);   // tier 2
    const t3 = playNew(G, '0', 'heroic_aura', me.bench[1]!);  // tier 3
    const t4 = playNew(G, '0', 'refresher', me.bench[2]!);    // tier 4
    expect([itemCooldown(t2), itemCooldown(t3), itemCooldown(t4)]).toEqual([ACTIVE_COOLDOWN.low, ACTIVE_COOLDOWN.high, ACTIVE_COOLDOWN.high]);
    expect([ACTIVE_COOLDOWN.low, ACTIVE_COOLDOWN.high]).toEqual([2, 3]);
    const foe = () => G.players['1'].active!.iid;
    const ready = () => [activateBlocked(G, '0', t2.iid, foe()), activateBlocked(G, '0', t3.iid), activateBlocked(G, '0', t4.iid)];
    expect(ready()).toEqual(['cooldown', 'cooldown', 'cooldown']);
    nextOwnTurn(G, '0');
    expect(ready()).toEqual(['cooldown', 'cooldown', 'cooldown']);
    nextOwnTurn(G, '0');
    expect(ready()).toEqual([null, 'cooldown', 'cooldown']);
    nextOwnTurn(G, '0');
    expect(ready()).toEqual([null, null, null]);
    // Used, it cools down for its full time again.
    expect(activate(G, '0', t2.iid, foe())).not.toBe(INVALID);
    expect(itemCooldown(t2)).toBe(ACTIVE_COOLDOWN.low);
    expect(activate(G, '0', t3.iid)).not.toBe(INVALID);
    expect(itemCooldown(t3)).toBe(ACTIVE_COOLDOWN.high);
  });

  it('an item\'s cooldown ticks at its owner\'s turn start while its bearer is dead', () => {
    const G = freshReadyGame();
    const vindicta = G.players['0'].bench[0]!;
    const front = giveItem(G, vindicta, 'cold_front', { cooldown: 2 });
    damageUnit(G, vindicta, vindicta.hp + 5, 'pure');
    resolve(G);
    expect(vindicta.respawnTurnsLeft).toBeGreaterThan(1);
    nextOwnTurn(G, '0');
    expect(vindicta.respawnTurnsLeft).toBeGreaterThan(0);
    expect(itemCooldown(front)).toBe(1);
    nextOwnTurn(G, '0');
    expect(itemCooldown(front)).toBe(0);
    expect(front.cooldowns).toBeUndefined();
    // Its wait over, Vindicta is back in the hand — still wearing it: items stay through death.
    expect(G.players['0'].hand).toContain(vindicta);
    expect(vindicta.attached).toContain(front);
  });

  it('hard crowd control: 2 charges a match and no cooldown — spent, it stays worn but cannot be used', () => {
    const G = freshReadyGame();
    const vindicta = G.players['0'].bench[0]!;
    const knock = playNew(G, '0', 'knockdown', vindicta);       // Stun the enemy Active for 1 turn
    expect(knock.charges).toBe(HARD_CC_CHARGES);
    expect(knock.cooldowns).toBeUndefined();
    const foe = G.players['1'].active!;
    expect(activate(G, '0', knock.iid, foe.iid)).not.toBe(INVALID); // usable the turn it is put on
    expect(foe.statuses.some((s) => s.id === 'stun')).toBe(true);
    expect([knock.charges, knock.cooldowns]).toEqual([1, undefined]);
    nextOwnTurn(G, '0');
    expect(activate(G, '0', knock.iid, G.players['1'].active!.iid)).not.toBe(INVALID);
    expect(knock.charges).toBe(0);
    nextOwnTurn(G, '0');
    expect(activateBlocked(G, '0', knock.iid, G.players['1'].active!.iid)).toBe('charges');
    expect(findWornItem(G, knock.iid)?.bearer).toBe(vindicta);
    expect(legalActions(G, '0').some((a) => a.type === 'activate' && a.itemIid === knock.iid)).toBe(false);
  });
});

describe('the legal-action list', () => {
  it('lists one activate per worn, ready active per legal target, in board and worn order — none for passives, cooling items, or while a discard is owed', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const [haze, vindicta, lash] = [me.active!, me.bench[0]!, me.bench[1]!];
    const front = giveItem(G, haze, 'cold_front');               // the enemy Active
    giveItem(G, haze, 'extra_health');                           // passive: nothing to use
    const rite = giveItem(G, vindicta, 'healing_rite');          // any ally hero
    const grit = giveItem(G, vindicta, 'grit');                  // no target
    giveItem(G, lash, 'decay', { cooldown: 1 });                 // cooling down
    const allies = [haze, ...me.bench].map((h) => h!.iid);
    const listed = legalActions(G, '0').filter((a): a is Extract<Action, { type: 'activate' }> => a.type === 'activate');
    expect(listed).toEqual([
      { type: 'activate', itemIid: front.iid, targetIid: G.players['1'].active!.iid },
      ...allies.map((t) => ({ type: 'activate', itemIid: rite.iid, targetIid: t })),
      { type: 'activate', itemIid: grit.iid },
    ]);
    for (const a of listed) expect(blocked(G, '0', a)).toBeNull();
    giveCard(G, '0', 'grit');
    G.pendingDiscard = { pid: '0', count: 1, cardId: 'improved_cooldown' };
    expect(legalActions(G, '0').some((a) => a.type === 'activate')).toBe(false);
  });
});
