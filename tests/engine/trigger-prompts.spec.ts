/**
 * The trigger prompt system (engine/prompts.ts, docs/hero-design.md §6), the
 * charged ultimates (§2) and the two heroes built on them (§5, §8):
 *
 *  - Optional triggers are asked only when they can be used (level, wait,
 *    souls); with nothing usable the moment goes on and nobody is asked.
 *  - A usable one pauses the game on `G.triggers`: only its answer is legal,
 *    from either seat, on either player's turn; the client holds the asked
 *    seat in the 'respond' stage. Use pays and runs it; pass lets the moment go on.
 *  - The AI answers the same prompt through the same moves.
 *  - A charged ultimate costs its printed price less the hero's tally (Victor:
 *    damage taken; Silver: damage dealt), never below 0, and the count starts
 *    over when it is used.
 *  - Victor: Aura of Suffering hurts every enemy and Victor; Shocking
 *    Reanimation, asked when he falls, stands him back up with half HP and the
 *    knockout never happens. Silver: Boot Kick; Lycan Curse's Wolf form.
 *  - Both are drafted into a match the AI plays to its end.
 */
import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { DeadlockGame } from '@/engine/game';
import { INVALID, perform } from '@/engine/engine';
import { answerBlocked, blocked, legalActions, skillBlocked, triggerBlocked } from '@/engine/legality';
import { effectiveAtk, kitCost, promptOwed, structureHp, ultCharge, ultimateCard } from '@/engine/query';
import { beginTurn, endTurnEffects } from '@/engine/actions/turn';
import { damageUnit } from '@/engine/damage';
import { allocatorOf } from '@/engine/ids';
import { makeInstance } from '@/engine/instances';
import { enumerateAIMoves } from '@/ai/heuristic';
import { heroForm } from '@/cards/art/heroArt';
import { EXP_ON_KILL, RESPAWN_TURNS, SKILL_COOLDOWN, ULT_UNLOCK_LEVEL, ULT_WAIT } from '@/engine/constants';
import { freshReadyGame } from './_helpers';
import { playGame } from './fuzz/driver';

const ctx = (pid: PlayerID) => ({ currentPlayer: pid, turn: 2, numPlayers: 2 }) as any;
const VICTOR_ULT = 'eff_ult_victor';
const SILVER_ULT = 'eff_ult_silver';

/** `pid`'s Active replaced by a fresh `heroId` at `level`. */
function standIn(G: GameState, pid: PlayerID, heroId: string, level: 1 | 2 | 3 | 4 = ULT_UNLOCK_LEVEL): CardInstance {
  const hero = makeInstance(allocatorOf(G), heroId, pid, 'active', 0);
  hero.level = level;
  G.players[pid].active = hero;
  return hero;
}

/** What Victor's ultimate needs him to take, and Silver's needs her to deal. */
const VICTOR_NEED = 10;
const SILVER_NEED = 8;
/** The souls P1 holds at the brink: an ultimate takes none of them. */
const PURSE = 5;

/** A board where P0 (on turn, turn 2) has Haze in the lane and P1's Active is
 *  Victor at 1 HP, Level 2, having taken `taken` damage toward his ultimate —
 *  one short of what it needs, unless said: Haze's swing (1) fells him, and
 *  that damage completes the charge. */
function victorAtTheBrink(taken = VICTOR_NEED - 1): { G: GameState; victor: CardInstance; haze: CardInstance } {
  const G = freshReadyGame();
  const victor = standIn(G, '1', 'hero_victor');
  victor.hp = 1;
  victor.tally = { [VICTOR_ULT]: taken };
  G.players['1'].souls = PURSE;
  return { G, victor, haze: G.players['0'].active! };
}

/** End `pid`'s turn and begin the other seat's, as the game's turn hooks do. */
function nextTurn(G: GameState, pid: PlayerID): PlayerID {
  const next: PlayerID = pid === '0' ? '1' : '0';
  endTurnEffects(G, pid);
  beginTurn(G, next, G.turnNumber + 1 + G.draftTurnsOffset);
  return next;
}

/** The seeds the drafted-match test looks through for one whose match reaches Victor's prompt. */
const PROMPT_SEEDS = Array.from({ length: 32 }, (_, i) => 9 + i); // 9..40

describe('trigger prompts: asked only when the trigger can be used', () => {
  it('nothing usable — below Level 2, a damage short, its side\'s ultimate of the turn used, still waiting — asks nothing, and the fall goes ahead', () => {
    for (const setup of [
      (v: CardInstance) => { v.level = 1; },
      (v: CardInstance) => { v.tally = { [VICTOR_ULT]: VICTOR_NEED - 3 }; }, // 7, and the blow's 2 (Haze's 1 + Fixation's 1 on a hurt hero): 9 of the 10 it needs
      (_v: CardInstance, G: GameState) => { G.ultUsed = { '1': true }; },    // one ultimate a turn for a side
      (v: CardInstance) => { v.cooldowns = { [VICTOR_ULT]: 2 }; },
    ]) {
      const { G, victor } = victorAtTheBrink();
      setup(victor, G);
      const before = structureHp(G.players['1']);
      expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
      expect(promptOwed(G)).toBeUndefined();
      expect(G.triggers).toBeUndefined();
      expect(victor.respawnTurnsLeft).toBe(RESPAWN_TURNS);           // a corpse, waiting
      expect(structureHp(G.players['1'])).toBeLessThan(before);       // the push
      expect(G.record['0'].kills).toBe(1);
    }
  });

  it('a usable one pauses the moment: the hero waits at 0 HP, unreaped and unpushed, and only the answer is legal — from either seat', () => {
    const { G, victor } = victorAtTheBrink();
    const before = structureHp(G.players['1']);
    expect(perform(G, '0', { type: 'attack' })).not.toBe(INVALID);
    const prompt = promptOwed(G)!;
    expect(prompt).toMatchObject({ pid: '1', moment: 'onFall', subjectIid: victor.iid, offers: [{ heroIid: victor.iid, abilityId: VICTOR_ULT }] });
    expect(victor.hp).toBe(0);
    expect(victor.respawnTurnsLeft).toBeUndefined();
    expect(structureHp(G.players['1'])).toBe(before);
    expect(G.record['0'].kills).toBe(0);
    // Nothing else is legal: the end of the turn waits on the answer.
    expect(blocked(G, '0', { type: 'endTurn' })).toBe('triggerOwed');
    expect(perform(G, '0', { type: 'endTurn' })).toBe(INVALID);
    expect(blocked(G, '1', { type: 'endTurn' })).toBe('triggerOwed');
    for (const pid of ['0', '1'] as PlayerID[]) {
      expect(legalActions(G, pid)).toEqual([
        { type: 'useTrigger', heroIid: victor.iid, abilityId: VICTOR_ULT },
        { type: 'passTrigger' },
      ]);
    }
    // An answer that is not an offer is refused.
    expect(answerBlocked(G, { type: 'useTrigger', heroIid: victor.iid, abilityId: 'eff_ult_haze' })).toBe('noOffer');
    // With no prompt owed, there is nothing to answer.
    expect(blocked(freshReadyGame(), '0', { type: 'passTrigger' })).toBe('notOwed');
  });

  it('use: it costs no souls, he stands back up with half his HP, rounded up, and the knockout never happens', () => {
    const { G, victor, haze } = victorAtTheBrink();
    const before = structureHp(G.players['1']);
    const hazeExp = haze.exp ?? 0;
    perform(G, '0', { type: 'attack' });
    expect(ultCharge(victor)).toEqual({ have: VICTOR_NEED, need: VICTOR_NEED }); // Haze's 1 completed the charge
    expect(kitCost(victor, VICTOR_ULT)).toBe(0);
    // The answer comes from the seat on turn's client as well as from P1's: either seat may give it.
    expect(perform(G, '0', { type: 'useTrigger', heroIid: victor.iid, abilityId: VICTOR_ULT })).not.toBe(INVALID);
    expect(G.triggers).toBeUndefined();
    expect(G.players['1'].souls).toBe(PURSE);                          // no souls paid
    expect(G.ultUsed?.['1']).toBe(true);                               // his side's one ultimate of the turn
    expect(victor.hp).toBe(Math.ceil(victor.hpMax / 2));
    expect(victor.hp).toBe(4);                                         // 7 max → 4
    expect(victor.respawnTurnsLeft).toBeUndefined();                   // no wait
    expect(G.players['1'].active).toBe(victor);                        // where he is
    expect(structureHp(G.players['1'])).toBe(before);                  // no push
    expect(G.record['0'].kills).toBe(0);                               // no kill on the record
    expect(haze.exp ?? 0).toBe(hazeExp);                               // no kill exp
    expect(victor.cooldowns?.[VICTOR_ULT]).toBe(ULT_WAIT.medium);      // a charged ultimate waits its size's turns too
    expect(victor.tally?.[VICTOR_ULT] ?? 0).toBe(0);                   // the count starts over
    expect(victor.skillUsedThisTurn).toBe(false);                      // no turn's ability
    expect(G.fx.some((e) => e.kind === 'revive' && e.iid === victor.iid && e.cancelled)).toBe(true);
    expect(G.action).toMatchObject({ kind: 'ult', by: '1', cardId: 'ult_victor' });
    // Play goes on: the turn can end now.
    expect(blocked(G, '0', { type: 'endTurn' })).toBeNull();
  });

  it('pass: the fall goes ahead as it would have — the push, the kill, the wait, and the blow\'s exp', () => {
    const { G, victor, haze } = victorAtTheBrink();
    const before = structureHp(G.players['1']);
    const hazeExp = haze.exp ?? 0;
    perform(G, '0', { type: 'attack' });
    expect(haze.exp ?? 0).toBe(hazeExp);                               // held while the fall waits
    expect(perform(G, '1', { type: 'passTrigger' })).not.toBe(INVALID);
    expect(G.triggers).toBeUndefined();
    expect(G.players['1'].souls).toBe(PURSE);
    expect(victor.respawnTurnsLeft).toBe(RESPAWN_TURNS);
    expect(structureHp(G.players['1'])).toBe(before - (ULT_UNLOCK_LEVEL + 1));
    expect(G.record['0'].kills).toBe(1);
    expect(haze.exp).toBe(hazeExp + EXP_ON_KILL);
    expect(victor.downedBy).toBeUndefined();
  });

  it('an optional trigger is never used from its button', () => {
    const { G, victor } = victorAtTheBrink(VICTOR_NEED);
    victor.hp = victor.hpMax;
    expect(skillBlocked(G, '1', victor, undefined, VICTOR_ULT)).toBe('trigger');
    expect(triggerBlocked(G, '1', victor, VICTOR_ULT)).toBeNull();     // usable — at its moment
    expect(legalActions(G, '1').some((a) => a.type === 'useSkill' && a.skillId === VICTOR_ULT)).toBe(false);
  });

  it('a prompt on the other player\'s turn: the client holds the asked seat in the respond stage until it answers', () => {
    const { G, victor } = victorAtTheBrink();
    // The client's first turn is engine turn 2, P0's (P1 moved first).
    G.draftTurnsOffset = -1;
    const client = Client({ game: { ...DeadlockGame, setup: () => G }, numPlayers: 2 });
    client.start();
    const state = () => client.getState()!;
    expect(state().ctx.currentPlayer).toBe('0');
    client.moves.attack();
    expect(promptOwed(state().G)?.pid).toBe('1');
    expect(state().ctx.activePlayers).toEqual({ '0': 'respond', '1': 'respond' });
    // Nothing but the answer: the end of the turn is refused, by the stage and the engine.
    const id = state()._stateID;
    client.moves.endTurn();
    expect(state()._stateID).toBe(id);
    expect(state().ctx.currentPlayer).toBe('0');
    client.moves.useTrigger(victor.iid, VICTOR_ULT);
    expect(promptOwed(state().G)).toBeUndefined();
    expect(state().ctx.activePlayers).toBeNull();
    const v = state().G.players['1'].active!;
    expect([v.iid, v.hp]).toEqual([victor.iid, 4]); // half of 7, rounded up
    client.moves.endTurn();
    expect(state().ctx.currentPlayer).toBe('1');
    client.stop();
  });

  it('the AI answers the same prompt, for the seat asked, whoever is on turn — and takes the revive', () => {
    const { G, victor } = victorAtTheBrink();
    perform(G, '0', { type: 'attack' });
    const options = enumerateAIMoves(G, ctx('0'));
    expect(options.every((o) => o.move === 'useTrigger' || o.move === 'passTrigger')).toBe(true);
    expect(options[0]).toMatchObject({ move: 'useTrigger', args: [victor.iid, VICTOR_ULT] });
    expect(options.map((o) => o.move).sort()).toEqual(['passTrigger', 'useTrigger']);
    // The crude list (no lookahead) answers the same way.
    expect(enumerateAIMoves(G, ctx('0'), false)[0].move).toBe('useTrigger');
  });

  it('the AI\'s lookahead answers a prompt its own line opens as the rival would: felling a Victor who will get back up is no knockout', () => {
    const { G } = victorAtTheBrink();
    const top = enumerateAIMoves(G, ctx('0'));
    const attack = top.find((o) => o.move === 'attack')!;
    const pass = top.find((o) => o.move === 'endTurn')!;
    expect(attack).toBeDefined();
    // The line is valued after P1's answer: Victor up again, his charge spent — still better than nothing.
    expect(attack.score).toBeGreaterThan(pass.score);
  });

  it('a prompt at the start of his own turn: his Aura fells him, and he is asked as his turn opens', () => {
    const G = freshReadyGame();
    const victor = standIn(G, '0', 'hero_victor');
    victor.hp = 1;
    victor.tally = { [VICTOR_ULT]: VICTOR_NEED - 1 };                 // the Aura's 1 on himself completes it
    G.draftTurnsOffset = -1;
    const client = Client({ game: { ...DeadlockGame, setup: () => G }, numPlayers: 2 });
    client.start();
    const s = client.getState()!;
    expect(promptOwed(s.G)).toMatchObject({ pid: '0', subjectIid: victor.iid });
    expect(s.ctx.activePlayers).toEqual({ '0': 'respond' });
    client.moves.passTrigger();
    expect(client.getState()!.G.players['0'].active!.respawnTurnsLeft).toBe(RESPAWN_TURNS);
    expect(client.getState()!.ctx.activePlayers).toBeNull();
    client.stop();
  });
});

describe('charged ultimates: ready once the hero\'s count reaches what they need, and the count starts over when one is used', () => {
  it('Victor\'s count rises by each damage he takes, Silver\'s by each damage she deals', () => {
    const G = freshReadyGame();
    const victor = standIn(G, '0', 'hero_victor');
    const silver = standIn(G, '1', 'hero_silver');
    expect(ultimateCard(VICTOR_ULT)!.charged!.need).toBe(VICTOR_NEED);
    expect(ultimateCard(SILVER_ULT)!.charged!.need).toBe(SILVER_NEED);
    expect([ultCharge(victor), ultCharge(silver)]).toEqual([{ have: 0, need: VICTOR_NEED }, { have: 0, need: SILVER_NEED }]);
    // Neither costs souls, charged or not.
    expect([kitCost(victor, VICTOR_ULT), kitCost(silver, SILVER_ULT)]).toEqual([0, 0]);
    damageUnit(G, victor, 3, 'spirit', 'test', { source: silver });
    expect(victor.tally?.[VICTOR_ULT]).toBe(3);
    expect(silver.tally?.[SILVER_ULT]).toBe(3);
    expect([ultCharge(victor)!.have, ultCharge(silver)!.have]).toEqual([3, 3]);
    // Taking damage does not charge Silver; dealing it does not charge Victor.
    damageUnit(G, silver, 2, 'attack', 'test', { source: victor });
    expect(silver.tally?.[SILVER_ULT]).toBe(3);
    expect(victor.tally?.[VICTOR_ULT]).toBe(3);
    // What a Shield absorbs is not taken.
    victor.hp = victor.hpMax;
    victor.statuses.push({ id: 'shield', value: 5, duration: 999 });
    damageUnit(G, victor, 4, 'attack', 'test', { source: silver });
    expect(victor.tally?.[VICTOR_ULT]).toBe(3);
    // The charge reads no more than it needs.
    victor.tally![VICTOR_ULT] = 25;
    expect(ultCharge(victor)).toEqual({ have: VICTOR_NEED, need: VICTOR_NEED });
  });

  it('Silver\'s Lycan Curse is used from the button once she has dealt what it needs, for no souls, and her count starts over', () => {
    const G = freshReadyGame();
    const silver = standIn(G, '0', 'hero_silver');
    G.players['0'].souls = 3;
    silver.tally = { [SILVER_ULT]: SILVER_NEED - 1 };
    expect(skillBlocked(G, '0', silver, undefined, SILVER_ULT)).toBe('charge');
    silver.tally = { [SILVER_ULT]: SILVER_NEED };
    expect(perform(G, '0', { type: 'useSkill', heroIid: silver.iid, skillId: SILVER_ULT, targetIid: silver.iid })).not.toBe(INVALID);
    expect(G.players['0'].souls).toBe(3);
    expect(silver.tally[SILVER_ULT]).toBe(0);
    expect(ultCharge(silver)).toEqual({ have: 0, need: SILVER_NEED });
    expect(silver.cooldowns?.[SILVER_ULT]).toBe(ULT_WAIT.medium);      // and it waits its size's turns, as every ultimate does
    expect(G.ultUsed?.['0']).toBe(true);
    // The wolf's own damage fills the count again, and the wait still holds it.
    silver.tally[SILVER_ULT] = SILVER_NEED;
    silver.skillUsedThisTurn = false;
    G.ultUsed = undefined;
    expect(skillBlocked(G, '0', silver, undefined, SILVER_ULT)).toBe('cooldown');
  });
});

describe('Victor — Aura of Suffering', () => {
  it('while he is Active, his turn opens with 1 spirit damage to every enemy (the bench too) and to Victor, which charges his ultimate', () => {
    const G = freshReadyGame();
    const victor = standIn(G, '0', 'hero_victor');
    const foes = [G.players['1'].active!, ...G.players['1'].bench.filter((c): c is CardInstance => !!c)];
    const before = foes.map((f) => f.hp);
    beginTurn(G, '0', G.turnNumber);
    foes.forEach((f, i) => expect(f.hp, f.cardId).toBe(before[i] - 1));
    expect(victor.hp).toBe(victor.hpMax - 1);
    expect(victor.tally?.[VICTOR_ULT]).toBe(1);
    expect(ultCharge(victor)).toEqual({ have: 1, need: VICTOR_NEED });
    expect(G.fx.some((e) => e.kind === 'hit' && e.iid === victor.iid && e.type === 'spirit' && e.cast === 'proc')).toBe(true);
  });

  it('on the bench it does nothing, and not on the rival\'s turn', () => {
    const G = freshReadyGame();
    const victor = makeInstance(allocatorOf(G), 'hero_victor', '0', 'bench', 1);
    G.players['0'].bench[0] = victor;
    const foe = G.players['1'].active!;
    const hp = foe.hp;
    beginTurn(G, '0', G.turnNumber);
    expect([foe.hp, victor.hp]).toEqual([hp, victor.hpMax]);
    const active = standIn(G, '0', 'hero_victor');
    beginTurn(G, '1', G.turnNumber + 1);
    expect(active.hp).toBe(active.hpMax);
  });
});

describe('Silver — Boot Kick and Lycan Curse', () => {
  it('Boot Kick: {bp:1/2} bullet damage to the enemy Active (2 at her Attack 2), then Vulnerable 2 turns (takes +1 damage: both resists down), for no souls, and then it waits', () => {
    const G = freshReadyGame();
    const silver = standIn(G, '0', 'hero_silver');
    const foe = G.players['1'].active!;
    const hp = foe.hp;
    G.players['0'].souls = 2;
    expect(perform(G, '0', { type: 'useSkill', heroIid: silver.iid, targetIid: foe.iid })).not.toBe(INVALID);
    expect(G.players['0'].souls).toBe(2);                              // a skill costs no souls
    expect(silver.cooldowns?.skill_silver).toBe(4);                   // 4 since it scales (2026-11-17)
    expect(foe.hp).toBe(hp - (1 + Math.floor(2 / 2)));
    expect(foe.statuses.find((s) => s.id === 'bullet_resist_down')).toMatchObject({ value: 1, duration: 2 });
    expect(foe.statuses.find((s) => s.id === 'spirit_resist_down')).toMatchObject({ value: 1, duration: 2 });
    expect(silver.tally?.[SILVER_ULT]).toBe(2);                        // the kick charged her: the 2 it dealt
  });

  it('Lycan Curse: Wolf form for 2 of her turns — +3 Attack, Shield 6, the wolf on her card — and then she is Silver again', () => {
    const G = freshReadyGame();
    const silver = standIn(G, '0', 'hero_silver');
    const atk = effectiveAtk(silver);
    silver.tally = { [SILVER_ULT]: SILVER_NEED };
    expect(heroForm(silver)).toBeUndefined();
    expect(perform(G, '0', { type: 'useSkill', heroIid: silver.iid, skillId: SILVER_ULT, targetIid: silver.iid })).not.toBe(INVALID);
    expect(effectiveAtk(silver)).toBe(atk + 3);
    expect(silver.statuses.find((s) => s.id === 'shield')?.value).toBe(6);
    expect(heroForm(silver)).toEqual({ label: 'Wolf form', turns: 2, art: 'hero_silver_wolf_card.webp' });
    // Her next turn: still a wolf, one turn left.
    let pid = nextTurn(G, '0');
    pid = nextTurn(G, pid);
    expect(pid).toBe('0');
    expect(effectiveAtk(silver)).toBe(atk + 3);
    expect(heroForm(silver)?.turns).toBe(1);
    // The turn after: the form has run out.
    pid = nextTurn(G, nextTurn(G, pid));
    expect(effectiveAtk(silver)).toBe(atk);
    expect(heroForm(silver)).toBeUndefined();
    expect(silver.statuses.some((s) => s.id === 'wolf_form' || s.id === 'weapon_power')).toBe(false);
  });

  it('a hero in another\'s form shows the badge but keeps its own art (Sinclair casting her Lycan Curse)', () => {
    const G = freshReadyGame();
    const sinclair = standIn(G, '0', 'hero_sinclair');
    standIn(G, '1', 'hero_silver');
    G.players['0'].souls = 8;
    expect(perform(G, '0', { type: 'useSkill', heroIid: sinclair.iid, skillId: 'eff_ult_sinclair', targetIid: sinclair.iid })).not.toBe(INVALID);
    expect(heroForm(sinclair)).toEqual({ label: 'Wolf form', turns: 2, art: undefined });
  });

  it('Sinclair cannot copy Victor\'s revive: a trigger has nothing to cast at once', () => {
    const G = freshReadyGame();
    const sinclair = standIn(G, '0', 'hero_sinclair');
    standIn(G, '1', 'hero_victor');
    G.players['0'].souls = 8;
    expect(skillBlocked(G, '0', sinclair, undefined, 'eff_ult_sinclair')).toBe('target');
  });
});

describe('the charged lines print on their own, under the effect', () => {
  it('each names its count in the doc\'s words; the effect stays 15 words or fewer', () => {
    expect(ultimateCard(VICTOR_ULT)!.charged).toEqual({ need: 10, by: 'taken', text: 'Ready once Victor has taken 10 damage.' });
    expect(ultimateCard(SILVER_ULT)!.charged).toEqual({ need: 8, by: 'dealt', text: 'Ready once Silver has dealt 8 damage.' });
    expect(ultimateCard(VICTOR_ULT)!.text).toBe('When Victor falls, you may use this: he revives where he is with half HP.');
    expect(ultimateCard(SILVER_ULT)!.text).toBe('Silver turns into a wolf for 2 turns: +3 Attack and Shield 6.');
  });
});

describe('both heroes in a drafted match the AI plays to its end', () => {
  // Seed 9 (a heuristic seat each, Victor P0's first pick, Silver P1's): the AI answers
  // Victor's prompt on the way to a result. (Seed 8 did until the opening changed: each side
  // now opens with a chosen hero and draws 4 from the rest, so a different deal reaches both
  // heroes; seed 7 did until Rem could stand in the lane, which changed how its match plays
  // out.) The AI's use of Silver's Wolf form is staged below: whether a seeded match reaches
  // it depends on how much she deals.
  it('Victor and Silver are drafted, stand on the board, the AI answers his prompt, and the match is decided', () => {
    // Whether a seeded match reaches Victor's prompt depends on the whole card pool, so a pinned
    // seed broke with every rule change (8, then 9). The test takes the first of a few seeds
    // whose match asks, and holds that match to everything below.
    const play = (seed: number) => {
      const seen = new Set<string>();
      let asked = 0;
      let picks: Record<PlayerID, string[]> | undefined;
      const game = playGame({
        seed,
        policies: { '0': 'heuristic', '1': 'heuristic' },
        prefer: { '0': ['hero_victor'], '1': ['hero_silver'] },
        beforeMove: ({ G }, info) => {
          if (G.draft) picks = G.draft.picks;
          for (const pid of ['0', '1'] as PlayerID[]) {
            for (const c of [G.players[pid].active, ...G.players[pid].bench]) {
              if (c) seen.add(c.cardId);
            }
          }
          if (info.name === 'useTrigger' || info.name === 'passTrigger') asked++;
        },
      });
      return { seen, asked, picks, game };
    };
    let found: ReturnType<typeof play> | undefined;
    for (const seed of PROMPT_SEEDS) {
      const m = play(seed);
      // …with both heroes drawn and put on the board before it is decided.
      if (m.asked > 0 && m.seen.has('hero_victor') && m.seen.has('hero_silver')) { found = m; break; }
    }
    expect(found, `none of the seeds ${PROMPT_SEEDS[0]}..${PROMPT_SEEDS[PROMPT_SEEDS.length - 1]} reaches Victor's prompt with Silver on the board`).toBeDefined();
    const { seen, asked, picks, game } = found!;
    expect(picks?.['0']).toContain('hero_victor');
    expect(picks?.['1']).toContain('hero_silver');
    expect(game.threw).toEqual([]);
    expect(game.policyThrew).toEqual([]);
    expect(seen.has('hero_victor')).toBe(true);
    expect(seen.has('hero_silver')).toBe(true);
    expect(asked).toBeGreaterThan(0);
    expect(game.stalemate).toBe(false);
    expect(game.winner).toBeDefined();
  });

  it('the AI turns Silver into a wolf once she has dealt what Lycan Curse needs', () => {
    const G = freshReadyGame();
    const silver = standIn(G, '0', 'hero_silver');
    silver.tally = { [SILVER_ULT]: SILVER_NEED };
    for (const h of G.players['0'].bench) if (h) h.skillUsedThisTurn = true;
    const top = enumerateAIMoves(G, ctx('0'));
    const form = top.find((o) => o.move === 'useSkill' && o.args[0] === silver.iid && o.args[2] === SILVER_ULT);
    expect(form).toBeDefined();
    expect(form!.score).toBeGreaterThan(top.find((o) => o.move === 'endTurn')!.score);
    expect(top[0]).toBe(form);
    // A damage short, it is not offered.
    silver.tally = { [SILVER_ULT]: SILVER_NEED - 1 };
    expect(enumerateAIMoves(G, ctx('0')).some((o) => o.move === 'useSkill' && o.args[2] === SILVER_ULT)).toBe(false);
  });
});
