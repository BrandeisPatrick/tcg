import { describe, it, expect } from 'vitest';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { fireEquipmentTriggers } from '@/engine/equipmentDispatch';
import { EQUIPMENT_BY_ID } from '@/cards/equipment';
import { HEROES } from '@/cards';

function freshGame(): GameState {
  const setup = (DeadlockGame as any).setup({ ctx: { numPlayers: 2, currentPlayer: '0' } });
  const G = JSON.parse(JSON.stringify(setup)) as GameState;
  // setup leaves heroes in deck/hand (active is null); stand one up for each side.
  for (const pid of ['0', '1'] as PlayerID[]) {
    const h = HEROES[0];
    G.players[pid].active = {
      iid: `hero-${pid}`, cardId: h.id, ownerId: pid, zone: 'active', slot: 0,
      hp: h.hp, hpMax: h.hp, atkMod: 0, spiritMod: 0,
      statuses: [], exhausted: false, skillUsedThisTurn: false,
    };
  }
  return G;
}

// Attach a charge-based item to a hero the way the engine does (instance carries
// its own `charges`, seeded from the card def).
function attach(G: GameState, bearer: CardInstance, cardId: string): CardInstance {
  const def = EQUIPMENT_BY_ID[cardId];
  const eq: CardInstance = {
    iid: `eq-${cardId}`, cardId, ownerId: bearer.ownerId, zone: 'equipment',
    attachedTo: bearer.iid, hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0,
    statuses: [], exhausted: false, skillUsedThisTurn: false,
    charges: def.charges,
  };
  (bearer.attached ??= []).push(eq);
  return eq;
}

describe('cooldown→draw family', () => {
  it('Improved Cooldown draws on skill use, burns a charge, and breaks at 0', () => {
    const G = freshGame();
    const pid: PlayerID = '0';
    const hero = G.players[pid].active!;
    // Guarantee deck has cards and hand has room.
    G.players[pid].hand = [];
    G.players[pid].deck = Array.from({ length: 5 }, (_, i) => ({
      iid: `card-${i}`, cardId: 'extra_health', ownerId: pid, zone: 'deck' as const,
      hp: 0, hpMax: 0, atkMod: 0, spiritMod: 0, statuses: [], exhausted: false, skillUsedThisTurn: false,
    }));
    const eq = attach(G, hero, 'improved_cooldown');
    const deck0 = G.players[pid].deck.length;

    // 1st skill use → draw 1, charge 2→1, still attached.
    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: pid });
    expect(G.players[pid].hand.length).toBe(1);
    expect(eq.charges).toBe(1);
    expect(hero.attached).toContain(eq);

    // 2nd skill use → draw 1 more, charge 1→0, item consumed to discard.
    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: pid });
    expect(G.players[pid].hand.length).toBe(2);
    expect(eq.charges).toBe(0);
    expect(hero.attached).not.toContain(eq);
    expect(G.players[pid].discard.some((c) => c.iid === eq.iid)).toBe(true);
    expect(G.players[pid].deck.length).toBe(deck0 - 2);

    // 3rd skill use → nothing happens (no charges, already gone).
    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: pid });
    expect(G.players[pid].hand.length).toBe(2);
  });

  it('does not spend a charge when the hand is full (value held, not wasted)', () => {
    const G = freshGame();
    const pid: PlayerID = '0';
    const hero = G.players[pid].active!;
    const eq = attach(G, hero, 'superior_cooldown'); // 3 charges
    // Fill hand to MAX_HAND (7).
    while (G.players[pid].hand.length < 7) G.players[pid].hand.push({ ...hero, iid: `filler-${G.players[pid].hand.length}` });

    fireEquipmentTriggers(G, hero, 'onBearerSkillUsed', { movingPlayer: pid });
    expect(eq.charges).toBe(3); // fizzled, no charge spent
    expect(hero.attached).toContain(eq);
  });

  it('tiers carry the expected charge counts', () => {
    expect(EQUIPMENT_BY_ID['improved_cooldown'].charges).toBe(2);
    expect(EQUIPMENT_BY_ID['superior_cooldown'].charges).toBe(3);
    expect(EQUIPMENT_BY_ID['transcendent_cooldown'].charges).toBe(4);
  });
});
