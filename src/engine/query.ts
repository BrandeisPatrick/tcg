/**
 * Pure reads of the game: who is on the board, what a hero can do, how hard it
 * hits. Nothing here mutates `G` or emits events, so the rules, the forecast,
 * the AI and the board can all ask the same question and get the same answer.
 * A rule that needs a number asks here instead of working it out again.
 */
import type {
  CardInstance,
  DamageType,
  EquipmentCard,
  GameState,
  HeroCard,
  PlayerID,
  PlayerState,
  StatusId,
} from './types';
import { CARDS_BY_ID } from '@/cards';
import { STATUSES_BY_ID, type Blockable } from '@/statuses';
import type { AbilityDef } from '@/abilities';
import { getAbility } from './registry';

// ---------- The board ----------

export function otherPlayer(id: PlayerID): PlayerID {
  return id === '0' ? '1' : '0';
}

/** The board card with this iid, or null. An empty slot is nobody: a missing or
 *  junk iid (`undefined`, a number…) finds nothing, so callers can treat "not
 *  found" as the one answer for every id that names no card. */
export function findCardOnBoard(G: GameState, iid: string): { owner: PlayerID; card: CardInstance } | null {
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    if (ps.active && ps.active.iid === iid) return { owner: pid, card: ps.active };
    for (const b of ps.bench) if (b && b.iid === iid) return { owner: pid, card: b };
  }
  return null;
}

/** True when a hero is currently a corpse waiting to respawn (greyed in UI,
 *  can't act / be targeted / take damage / receive statuses). */
export function isRespawning(card: CardInstance): boolean {
  return (card.respawnTurnsLeft ?? 0) > 0;
}

/** A player's living heroes in board order: the Active, then bench 1..3. */
export function liveBoardCards(ps: PlayerState): CardInstance[] {
  const out: CardInstance[] = [];
  if (ps.active && !isRespawning(ps.active)) out.push(ps.active);
  for (const b of ps.bench) if (b && !isRespawning(b)) out.push(b);
  return out;
}

/** The bench heroes who can take the Active slot right now: alive, and not
 *  bench-only (Rem). One list for the forced promotion off a fallen Active,
 *  the paid retreat, the AI and the board, so they cannot disagree. */
export function stepInCandidates(ps: PlayerState): CardInstance[] {
  return ps.bench.filter((b): b is CardInstance => {
    if (!b || isRespawning(b)) return false;
    const d = CARDS_BY_ID[b.cardId];
    return d?.type === 'hero' && !d.flags?.benchOnly;
  });
}

/** The hero card behind an instance, or undefined for anything else (a spell,
 *  a piece of equipment, an unknown id). */
export function heroData(card: CardInstance): HeroCard | undefined {
  const data = CARDS_BY_ID[card.cardId];
  return data?.type === 'hero' ? data : undefined;
}

/** Two ways to lose: your patron HP hits 0 (the death tax), or your whole
 *  roster is on the respawn timer at once (a board wipe). A mutual wipe goes
 *  to the player (P0). This is boardgame.io's `endIf`: it runs after every
 *  move on the already-resolved state. */
export function checkWinner(G: GameState): { winner?: PlayerID; draw?: boolean } | undefined {
  const down = (pid: PlayerID) => G.players[pid].hp <= 0 || boardWiped(G.players[pid]);
  const p0Down = down('0');
  const p1Down = down('1');
  if (p0Down && p1Down) return { winner: '0' };
  if (p0Down) return { winner: '1' };
  if (p1Down) return { winner: '0' };
  return undefined;
}

/** True when a player still has heroes but every one of them is KO'd (on the
 *  respawn timer) at the same moment. */
function boardWiped(ps: PlayerState): boolean {
  const heroes = [ps.active, ...ps.bench].filter(
    (c): c is CardInstance => !!c && CARDS_BY_ID[c.cardId]?.type === 'hero',
  );
  if (heroes.length === 0) return false; // pre-match / nothing to wipe yet
  return heroes.every((c) => (c.respawnTurnsLeft ?? 0) > 0 || c.hp <= 0);
}

// ---------- Targets ----------

/** What a skill, spell or ultimate may be aimed at. Moved here from the
 *  abilities, which still re-export it. */
export type TargetFilter =
  | 'noTarget'
  | 'self'
  | 'allyAny'           // any ally board card
  | 'allyHero'
  | 'enemyAny'
  | 'enemyHero'
  | 'enemyActive'
  | 'anyBoard';

/**
 * Every live board card `filter` allows for `pid`, in board order: the enemy's
 * Active, enemy bench 1..3, then your Active and bench 1..3. Corpses are never
 * targets. `self` is `source` alone, and `noTarget` allows none (the caller
 * reads that as "nothing to aim"). `allyHero` includes the caster; a skill that
 * should not aim at its own caster says so itself (`excludeSelf`, applied by
 * legality's skillTargets) rather than needing a filter of its own.
 */
export function targetsFor(G: GameState, pid: PlayerID, filter: TargetFilter, source?: CardInstance): CardInstance[] {
  if (filter === 'noTarget') return [];
  const enemy = liveBoardCards(G.players[otherPlayer(pid)]);
  const ally = liveBoardCards(G.players[pid]);
  const heroes = (cards: CardInstance[]) => cards.filter((c) => CARDS_BY_ID[c.cardId]?.type === 'hero');
  switch (filter) {
    case 'self': return source && !isRespawning(source) ? [source] : [];
    case 'allyAny': return ally;
    case 'allyHero': return heroes(ally);
    case 'enemyAny': return enemy;
    case 'enemyHero': return heroes(enemy);
    case 'enemyActive': return enemy.filter((c) => c.zone === 'active');
    case 'anyBoard': return [...enemy, ...ally];
  }
}

// ---------- What a card brings with it ----------

/** One ability a board hero carries, and the equipment it came from (absent
 *  for the hero's own passives). */
export interface AbilitySource {
  ability: AbilityDef;
  equip?: CardInstance;
}

/** The abilities a board hero carries, in the order they are asked: its own
 *  passives, then each worn piece of equipment's abilities in worn order. The
 *  one list behind the reactive triggers (engine/triggers.ts) and the pure
 *  hooks read below, so a card's behaviour is found in the same place by every
 *  rule. A merged Rem in `attached` is a hero, not equipment, and adds none. */
export function abilitySources(card: CardInstance): AbilitySource[] {
  const out: AbilitySource[] = [];
  for (const id of heroData(card)?.passives ?? []) {
    const ability = getAbility(id);
    if (ability) out.push({ ability });
  }
  for (const equip of wornEquipment(card)) {
    const data = CARDS_BY_ID[equip.cardId] as EquipmentCard;
    for (const id of data.abilities ?? []) {
      const ability = getAbility(id);
      if (ability) out.push({ ability, equip });
    }
  }
  return out;
}

/** The equipment `card` wears, in worn order. A merged Rem rides in the same
 *  `attached` list but is a hero, not equipment: she takes no slot of the cap and
 *  can never be the piece discarded to make room. */
export function wornEquipment(card: CardInstance): CardInstance[] {
  return (card.attached ?? []).filter((a) => CARDS_BY_ID[a.cardId]?.type === 'equipment');
}

/** Damage `card` is about to take, after the pure `incoming` hooks of what it
 *  carries (Vindicta's flight). Runs first, ahead of every status. */
export function incomingDamage(card: CardInstance, amount: number, type: DamageType): number {
  let n = amount;
  for (const { ability } of abilitySources(card)) {
    if (ability.incoming) n = ability.incoming(card, n, type);
  }
  return n;
}

/** How long a status lands for on `card`, after the `buffDuration` hooks of
 *  what it carries (Superior Duration stretches the bearer's buffs). */
export function statusDuration(card: CardInstance, statusId: StatusId, duration: number): number {
  let n = duration;
  for (const { ability } of abilitySources(card)) {
    if (ability.buffDuration) n = ability.buffDuration(card, statusId, n);
  }
  return n;
}

// ---------- Statuses ----------

/** True while a status on `card` stops it doing `act`. The only lockout check
 *  there is: each status declares what it blocks (`StatusDef.blocks`), and the
 *  attack gate, `useSkill`, the channel pulse, the AI and the board all ask
 *  this rather than listing statuses. */
export function isBlocked(card: CardInstance, act: Blockable): boolean {
  return card.statuses.some((s) => STATUSES_BY_ID[s.id]?.blocks?.includes(act));
}

// ---------- Attack and spirit ----------

/** A hero's bullet power before Weaken and any conditional bonus: printed
 *  attack + modifiers + Weapon Power buffs, floored at 0. Zero when the hero
 *  cannot make a basic attack. */
export function baseAttack(card: CardInstance): number {
  const data = heroData(card);
  if (!data || isBlocked(card, 'attack')) return 0;
  const weaponPower = card.statuses
    .filter((s) => s.id === 'weapon_power')
    .reduce((a, s) => a + s.value, 0);
  return Math.max(0, data.atk + card.atkMod + weaponPower);
}

export interface AttackPower {
  /** What one basic swing deals before the target's mitigation. */
  total: number;
  /** Where it comes from, for tooltips. `total` is the authority: a part list
   *  is an explanation, not something to sum. `bonus` marks a card's
   *  conditional bonus (Frenzy), as opposed to the hero's own numbers. */
  parts: { label: string; amount: number; bonus?: true }[];
}

/**
 * What one basic swing of `card` deals, before the target's mitigation. The
 * one place attack damage is worked out — the attack gate, the swing, the
 * forecast and the card face all read it, so nothing added on top of a hero's
 * attack (Frenzy) can swing through a lockout:
 *  - 0 when the hero cannot attack (Stun, Disarm, Sleep, a heavy channel);
 *  - else printed attack + modifiers + Weapon Power, floored at 0;
 *  - minus Weaken (Rusted Barrel and any future "ATK-down"), floored at 0;
 *  - plus each `attackBonus` hook of what the hero carries.
 * It reads `card.hp` for hooks like Frenzy's, so a caller simulating a swing
 * later in the turn passes a view of the card at that moment.
 */
export function attackPower(card: CardInstance): AttackPower {
  const data = heroData(card);
  if (!data || isBlocked(card, 'attack')) return { total: 0, parts: [] };
  const parts: AttackPower['parts'] = [{ label: 'Bullet Power', amount: data.atk + card.atkMod }];
  const weaponPower = card.statuses
    .filter((s) => s.id === 'weapon_power')
    .reduce((a, s) => a + s.value, 0);
  if (weaponPower) parts.push({ label: 'Weapon Power', amount: weaponPower });
  let total = baseAttack(card);
  const weak = card.statuses.find((s) => s.id === 'weapon_power_down');
  if (weak) {
    const weakened = Math.max(0, total - weak.value);
    parts.push({ label: 'Weaken', amount: weakened - total });
    total = weakened;
  }
  for (const { ability } of abilitySources(card)) {
    const bonus = ability.attackBonus?.(card);
    if (!bonus) continue;
    total += bonus.amount;
    parts.push({ label: bonus.label, amount: bonus.amount, bonus: true });
  }
  return { total, parts };
}

/** The attack the card face shows: `attackPower(card).total`. */
export function effectiveAtk(card: CardInstance): number {
  return attackPower(card).total;
}

/** Total spirit-power for skill scaling: equipment bonus + any Spirit Power status. */
export function effectiveSpirit(card: CardInstance): number {
  if (!card) return 0;
  const fromBuff = (card.statuses ?? [])
    .filter((s) => s.id === 'spirit_power')
    .reduce((a, s) => a + s.value, 0);
  return (card.spiritMod ?? 0) + fromBuff;
}
