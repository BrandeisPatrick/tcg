/**
 * The map: each side's structures, the pushes that take them down, and the
 * Mid-Boss in the pit between the lanes.
 *
 *  - Structures. A side's track is Guardian → Walker → Patron (`STRUCTURES`).
 *    A push damages the front standing structure and carries what is left
 *    over on to the next. A felled Walker gives the pushing side the flex
 *    slot; a felled Patron loses the match (`checkWinner`). No fall pays
 *    souls: the lane's income is the only souls there are. Pushes come from kills (the
 *    victim's level + 1, killInPlace) and from an Active pushing into a lane its
 *    rival left empty (its bullet power, at the End step); both double in the
 *    late game (`pushMultiplier`, rounds.ts).
 *  - The Mid-Boss (only in a match that has one, `G.midBoss`: MID_BOSS_ENABLED
 *    is off for now) rises at the start of round BOSS_SPAWN_ROUND, and again
 *    BOSS_RESPAWN_ROUNDS after the round it died in. Only basic attacks hurt
 *    it (damageUnit), each side's damage is tallied, and when it falls the
 *    side with more takes it (`bossTaker`, query.ts): the Rejuvenator — REVIVE_CREDITS revives, good through REVIVE_ROUNDS more
 *    rounds (spent in killInPlace). It hits back at the hero that attacked it
 *    at that player's End step (turn.ts).
 *
 * Everything logs, and every structure hit, fall and boss beat is an FX
 * event the board plays.
 */
import type { CardInstance, GameState, MapRecord, PlayerID, PlayerState, PushCause, Structure, StructureKind, TrackHp } from './types';
import {
  BOSS_CARD_ID, BOSS_HP, REVIVE_CREDITS, STRUCTURES,
} from './constants';
import { bossReturnRound, endsRound, reviveLastRound, round } from './rounds';
import { bossTaker, netWorth, otherPlayer } from './query';
import { allocatorOf } from './ids';
import { pushLog } from './log';
import { pushFx } from './fx';


const STRUCTURE_NAME: Record<StructureKind, string> = { guardian: 'Guardian', walker: 'Walker', patron: 'Patron' };
/** How the log and the board name a structure. */
export function structureName(kind: StructureKind): string {
  return STRUCTURE_NAME[kind];
}

/** A fresh track: `STRUCTURES`, or — given `hp` — the structures it names at
 *  those HP and the others off the track (max 0). A track always ends on a
 *  Patron of at least 1 HP. */
export function newTrack(hp?: TrackHp): Structure[] {
  return STRUCTURES.map(([kind, standard]) => {
    const n = Math.max(0, Math.floor(hp ? hp[kind] ?? 0 : standard));
    const max = kind === 'patron' ? Math.max(1, n) : n;
    return { kind, hp: max, max };
  });
}

/** A side's record before the match. */
export function newRecord(): MapRecord {
  return { kills: 0, pushes: 0, pushDamage: 0, bossKills: 0, bossKillsBehind: 0, revives: 0 };
}

/**
 * Push `amount` into `pid`'s structures: the front standing one takes it, and
 * what it cannot absorb carries on to the next, until the push is spent or the
 * Patron has fallen (what is left past it is lost). Each structure hit is
 * logged and is a `push` event; each that falls, a `fall` event — and the side
 * pushing (the other) collects what that fall gives: the Walker's flex slot. Returns the structure HP taken.
 */
export function pushStructures(G: GameState, pid: PlayerID, amount: number, cause: PushCause): number {
  const by = otherPlayer(pid);
  const ps = G.players[pid];
  let left = Math.max(0, Math.floor(amount));
  let dealt = 0;
  for (const s of ps.structures) {
    if (left <= 0) break;
    if (s.hp <= 0) continue;
    const hit = Math.min(s.hp, left);
    s.hp -= hit;
    left -= hit;
    dealt += hit;
    pushLog(G, `P${pid}'s ${structureName(s.kind)}: ${hit} dmg (${s.hp} HP).`);
    pushFx(G, { kind: 'push', side: pid, structure: s.kind, amount: hit, hp: s.hp, cause });
    if (s.hp <= 0) fall(G, ps, by, s.kind);
  }
  if (dealt > 0) {
    G.record[by].pushes++;
    G.record[by].pushDamage += dealt;
  }
  return dealt;
}

/** `ps`'s structure of `kind` has fallen to `by`'s push. */
function fall(G: GameState, ps: PlayerState, by: PlayerID, kind: StructureKind) {
  pushLog(G, `P${ps.id}'s ${structureName(kind)} falls.`);
  pushFx(G, { kind: 'fall', side: ps.id, structure: kind });
  if (kind === 'walker' && !G.players[by].flexSlot) {
    G.players[by].flexSlot = true;
    pushLog(G, `P${by}'s heroes gain the flex slot.`);
  }
}

// ---------- The Mid-Boss ----------

/** The Mid-Boss rises in the pit when the round it is due in begins: called at
 *  every turn's start, it acts on the first turn of a round at or past
 *  `G.bossRespawnRound` with no boss up — in a match that has a Mid-Boss
 *  (`G.midBoss`); in one that has none it never rises. Its damage tallies
 *  start over. */
export function riseBoss(G: GameState) {
  if (!G.midBoss || G.boss || round(G) < G.bossRespawnRound) return;
  const boss: CardInstance = {
    iid: allocatorOf(G)('b'),
    cardId: BOSS_CARD_ID,
    ownerId: 'none',
    zone: 'pit',
    attached: [],
    hp: BOSS_HP,
    hpMax: BOSS_HP,
    atkMod: 0,
    spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: false,
  };
  G.boss = boss;
  G.bossDamage = { '0': 0, '1': 0 };
  G.bossLastHit = null;
  G.bossAttacker = null;
  pushLog(G, `The Mid-Boss rises in the pit (${BOSS_HP} HP).`);
  pushFx(G, { kind: 'boss', what: 'spawn', iid: boss.iid });
}

/** Tally a hit on the boss: `removed` HP off it by `pid`'s swing, the last hit
 *  so far. (damageUnit calls this for the swings that reach it.) */
export function tallyBossHit(G: GameState, pid: PlayerID, removed: number) {
  if (removed <= 0) return;
  G.bossDamage[pid] += removed;
  G.bossLastHit = pid;
}

/** The boss at 0 HP falls: the side `bossTaker` names takes it — the
 *  Rejuvenator (REVIVE_CREDITS revives through round
 *  `reviveLastRound`) — and it rises again in round `bossReturnRound`. Part of
 *  the state-based pass (`resolve`). */
export function reapBoss(G: GameState) {
  const boss = G.boss;
  if (!boss || boss.hp > 0) return;
  const { pid, by } = bossTaker(G);
  const behind = netWorth(G, pid) < netWorth(G, otherPlayer(pid));
  G.boss = null;
  G.bossAttacker = null;
  G.bossRespawnRound = bossReturnRound(G);
  G.record[pid].bossKills++;
  if (behind) G.record[pid].bossKillsBehind++;
  const tally = `${G.bossDamage['0']}–${G.bossDamage['1']}`;
  const why = by === 'damage' ? `damage ${tally}` : by === 'netWorth' ? `damage tied ${tally}, behind on net worth` : `tied, last hit`;
  pushLog(G, `The Mid-Boss falls: P${pid} takes it (${why}). It returns in round ${G.bossRespawnRound}.`);
  pushFx(G, { kind: 'boss', what: 'death', iid: boss.iid, pid, by });
  const ps = G.players[pid];
  ps.reviveCredits = REVIVE_CREDITS;
  ps.reviveUntilRound = reviveLastRound(G);
  pushLog(G, `P${pid} holds the Rejuvenator: ${REVIVE_CREDITS} revives through round ${ps.reviveUntilRound}.`);
  pushFx(G, { kind: 'boss', what: 'award', iid: boss.iid, pid });
}

/** As a round ends (the second mover's turn), a Rejuvenator whose last round
 *  it was lapses. */
export function lapseRevives(G: GameState, ending: PlayerID) {
  if (!endsRound(G, ending)) return;
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    if (ps.reviveCredits > 0 && round(G) >= ps.reviveUntilRound) {
      ps.reviveCredits = 0;
      pushLog(G, `P${pid}'s Rejuvenator lapses.`);
    }
  }
}
