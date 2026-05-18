import type { CardInstance, DamageType, GameState, PlayerID, PlayerState } from './types';
import { findCardOnBoard, pushLog } from './util';
import { CARDS_BY_ID } from '@/cards';

// Damage routing for a unit. Returns the damage actually dealt after mitigation.
export function damageUnit(G: GameState, target: CardInstance, amount: number, type: DamageType): number {
  if (amount <= 0) return 0;
  // Corpses can't take more damage — they're already KO'd waiting to respawn.
  if ((target.respawnTurnsLeft ?? 0) > 0) return 0;
  // Invincibility is granted by a small set of cards (Ethereal Shift, etc.) and
  // negates all damage. The status is not user-visible — see card text + portrait aura.
  if (target.statuses.some((s) => s.id === 'invincibility')) return 0;

  let dmg = amount;

  // Vulnerable: +2 dmg taken from all sources.
  if (target.statuses.some((s) => s.id === 'vulnerable')) dmg += 2;

  // Bullet Resist reduces bullet (attack) damage only.
  if (type === 'attack') {
    const br = target.statuses.find((s) => s.id === 'bullet_resist');
    if (br) dmg = Math.max(0, dmg - br.value);
  }
  // Spirit Resist reduces spirit (skill) damage only.
  if (type === 'spirit') {
    const sr = target.statuses.find((s) => s.id === 'spirit_resist');
    if (sr) dmg = Math.max(0, dmg - sr.value);
  }

  // Pure ignores everything else (no Shield interaction either)
  if (type !== 'pure') {
    // Shield absorbs first
    const shield = target.statuses.find((s) => s.id === 'shield');
    if (shield && dmg > 0) {
      const absorbed = Math.min(shield.value, dmg);
      shield.value -= absorbed;
      dmg -= absorbed;
      if (shield.value <= 0) {
        target.statuses = target.statuses.filter((s) => s !== shield);
      }
    }
  }

  if (dmg <= 0) return 0;

  target.hp -= dmg;

  // Sleep wakes up on any damage.
  if (target.statuses.some((s) => s.id === 'sleep')) {
    target.statuses = target.statuses.filter((s) => s.id !== 'sleep');
    pushLog(G, `${CARDS_BY_ID[target.cardId]?.name ?? target.cardId} woke from Sleep.`);
  }

  pushLog(G, `${CARDS_BY_ID[target.cardId]?.name ?? target.cardId} took ${dmg} ${type} dmg (now ${target.hp} HP).`);

  // Overflow: any damage in excess of the hero's HP spills into the owner's Patron.
  // This is what keeps games finishing once respawn is in play — pushing past a KO
  // hits the player directly (Deadlock: pushing into the base).
  if (target.hp < 0) {
    const overflow = -target.hp;
    target.hp = 0;
    damagePlayer(G, target.ownerId, overflow);
    pushLog(G, `Overflow: ${overflow} dmg spills to P${target.ownerId}'s patron.`);
  }

  return dmg;
}

export function damagePlayer(G: GameState, pid: PlayerID, amount: number): number {
  if (amount <= 0) return 0;
  G.players[pid].hp -= amount;
  pushLog(G, `Player ${pid} took ${amount} dmg (HP ${G.players[pid].hp}).`);
  return amount;
}

export function healUnit(G: GameState, target: CardInstance, amount: number): number {
  if (amount <= 0) return 0;
  const healed = Math.min(amount, target.hpMax - target.hp);
  target.hp += healed;
  if (healed > 0) {
    pushLog(G, `${CARDS_BY_ID[target.cardId]?.name ?? target.cardId} healed ${healed}.`);
  }
  return healed;
}

/** Turns a hero takes to respawn after being KO'd. Long enough that death
 *  matters, short enough that you can rebuild. Hero stays in their slot,
 *  greyed-out, while this counts down. */
export const RESPAWN_TURNS = 3;

/**
 * Process a hero's death IN PLACE: drop attached gear, clear statuses + mods,
 * arm the respawn timer. The hero stays in its slot (active or bench) — the UI
 * renders it greyed out with a countdown until `respawnTurnsLeft` reaches 0,
 * at which point `tickRespawn` brings them back to life.
 */
function killInPlace(G: GameState, ps: PlayerState, hero: CardInstance) {
  pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} fell.`);
  // KO bounty: opponent of the fallen hero's owner gains +1 soul (hard-capped).
  const SOULS_MAX = 7;
  const oppId: PlayerID = ps.id === '0' ? '1' : '0';
  const before = G.players[oppId].souls;
  G.players[oppId].souls = Math.min(SOULS_MAX, before + 1);
  if (G.players[oppId].souls > before) pushLog(G, `P${oppId} +1 Souls (KO bounty).`);
  // Attached equipment is dropped to discard pile on death.
  if (hero.attached && hero.attached.length > 0) {
    for (const eq of hero.attached) {
      eq.zone = 'discard';
      eq.attachedTo = undefined;
      ps.discard.push(eq);
    }
    hero.attached = [];
  }
  // Reset state so the corpse can't be statused, doesn't carry buffs, etc.
  hero.statuses = [];
  hero.atkMod = 0;
  hero.spiritMod = 0;
  hero.skillUsedThisTurn = false;
  hero.exhausted = true; // can't attack while dead
  hero.hp = 0;
  hero.respawnTurnsLeft = RESPAWN_TURNS;
  pushLog(G, `${CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId} respawning in (${RESPAWN_TURNS}).`);
}

/**
 * Sweep a player's board for heroes that just hit 0 HP. The hero stays in its
 * slot — `killInPlace` arms the respawn timer instead of moving them out.
 */
export function reapDead(G: GameState, ps: PlayerState) {
  if (ps.active && ps.active.hp <= 0 && ps.active.respawnTurnsLeft == null) {
    killInPlace(G, ps, ps.active);
  }
  for (const b of ps.bench) {
    if (b && b.hp <= 0 && b.respawnTurnsLeft == null) {
      killInPlace(G, ps, b);
    }
  }
}
