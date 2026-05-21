import type {
  CardInstance,
  GameState,
  PlayerID,
  PlayerState,
} from './types';
import { CARDS_BY_ID } from '@/cards';

let _iidCounter = 1;
export function nextIid(prefix = 'i'): string {
  return `${prefix}${_iidCounter++}`;
}

export function resetIid() { _iidCounter = 1; }

export function otherPlayer(id: PlayerID): PlayerID {
  return id === '0' ? '1' : '0';
}

export function findCardOnBoard(G: GameState, iid: string): { owner: PlayerID; card: CardInstance } | null {
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    if (ps.active?.iid === iid) return { owner: pid, card: ps.active };
    for (const b of ps.bench) if (b?.iid === iid) return { owner: pid, card: b };
  }
  return null;
}

export function findCardAnywhere(G: GameState, iid: string): { owner: PlayerID; card: CardInstance; zone: string } | null {
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    if (ps.active?.iid === iid) return { owner: pid, card: ps.active, zone: 'active' };
    for (const b of ps.bench) if (b?.iid === iid) return { owner: pid, card: b, zone: 'bench' };
    for (const c of ps.hand) if (c.iid === iid) return { owner: pid, card: c, zone: 'hand' };
    for (const c of ps.deck) if (c.iid === iid) return { owner: pid, card: c, zone: 'deck' };
    for (const c of ps.discard) if (c.iid === iid) return { owner: pid, card: c, zone: 'discard' };
  }
  return null;
}

export function liveBoardCards(ps: PlayerState): CardInstance[] {
  const out: CardInstance[] = [];
  if (ps.active && !isRespawning(ps.active)) out.push(ps.active);
  for (const b of ps.bench) if (b && !isRespawning(b)) out.push(b);
  return out;
}

/** True when a hero is currently a corpse waiting to respawn (greyed in UI,
 *  can't act / be targeted / take damage / receive statuses). */
export function isRespawning(card: CardInstance): boolean {
  return (card.respawnTurnsLeft ?? 0) > 0;
}

export function effectiveAtk(card: CardInstance): number {
  const data = CARDS_BY_ID[card.cardId];
  if (data?.type !== 'hero') return 0;
  // Stun and Disarm both silence basic attacks.
  if (card.statuses.some((s) => s.id === 'stun' || s.id === 'disarm')) return 0;
  // Sum any temporary Weapon Power buffs on top of base + equipment bonus.
  const weaponPower = card.statuses
    .filter((s) => s.id === 'weapon_power')
    .reduce((a, s) => a + s.value, 0);
  return Math.max(0, data.atk + card.atkMod + weaponPower);
}

/** Total spirit-power for skill scaling: equipment bonus + any Spirit Power status. */
export function effectiveSpirit(card: CardInstance): number {
  if (!card) return 0;
  const fromBuff = (card.statuses ?? [])
    .filter((s) => s.id === 'spirit_power')
    .reduce((a, s) => a + s.value, 0);
  return (card.spiritMod ?? 0) + fromBuff;
}

export function pushLog(G: GameState, text: string) {
  G.log.push({ turn: G.turnNumber, text });
  if (G.log.length > 200) G.log.splice(0, G.log.length - 200);
}
