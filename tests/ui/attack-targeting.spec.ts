import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Client } from 'boardgame.io/client';
import type { HeroAbilityDef } from '@/abilities';
import { CARDS_BY_ID } from '@/cards';
import { AI_DECKS_BY_NAME } from '@/decks/aiDecks';
import { STARTER_DECK_AI } from '@/decks/starter';
import { DeadlockGame } from '@/engine/game';
import { forecastAttack } from '@/engine/forecast';
import { attackBlocked, attackTargets } from '@/engine/legality';
import { findCardOnBoard } from '@/engine/query';
import { registerAbilities } from '@/engine/registry';
import { addStatus } from '@/engine/statusOps';
import type { CardInstance, GameState, HeroCard, PlayerID } from '@/engine/types';
import { getMatchConfig, setMatchConfig } from '@/storage/matchConfig';
import { attackOffer, tapAttackPlate, tapWhileAttackArmed } from '@/ui/board/attackAim';
import { actionRefusal, attackLine } from '@/ui/board/heroActions';
import { isValidTarget } from '@/ui/board/targeting';
import { HeroDetailSheet } from '@/ui/overlays/HeroDetailSheet';
import type { PendingPlay } from '@/ui/helpers';
import { freshReadyGame, makeHero } from '../engine/_helpers';

// A hero with reach may name who its attack shoots. The Attack plate on its
// sheet then arms a targeting flow (the heroes the engine says it may name glow,
// a tap on one makes the attack at it) instead of swinging at once. No hero of
// the real roster has reach yet, so these specs play a throwaway one, registered
// here like two-skills.spec.ts registers its throwaway heroes. The board asks
// the engine for everything: who glows is `attackBlocked`, why a tap is refused
// is `actionRefusal`, what the plate says is the engine's forecast.

const ME: PlayerID = '0';
const REACHER = 'hero_ui_reacher';

const longArm: HeroAbilityDef = {
  id: 'ui_passive_long_arm', name: 'Long Arm', text: 'Its attack may be aimed at any enemy hero.',
  trigger: 'ongoing', target: 'self', reach: true, run: () => {},
};
const throwaway = (id: string, name: string): HeroCard => ({ id, name, type: 'hero', rarity: 3, atk: 3, hp: 12, skills: [], passives: [longArm.id] });

beforeAll(() => {
  registerAbilities([longArm]);
  CARDS_BY_ID[REACHER] = throwaway(REACHER, 'Reacher');
});
afterAll(() => { delete CARDS_BY_ID[REACHER]; });

/** P0's Active is the reacher; the rival side (Abrams, then Dynamo / Kelvin / Seven) stands 30 deep. Turn 2: P0 may attack. */
function duel(cardId = REACHER) {
  const G = freshReadyGame();
  const me = G.players[ME];
  me.souls = 10;
  const atk = makeHero(cardId, ME, 'active', 0);
  me.active = atk;
  const foe = G.players['1'];
  const foes = [foe.active!, ...foe.bench] as CardInstance[];
  for (const c of foes) c.hp = c.hpMax = 30;
  return { G, atk, foes, rival: foes[0], bench: foes.slice(1) };
}

const heroesOf = (G: GameState): CardInstance[] =>
  (['0', '1'] as PlayerID[]).flatMap((pid) => [G.players[pid].active, ...G.players[pid].bench].filter((c): c is CardInstance => !!c));
const nameOf = (c: CardInstance) => CARDS_BY_ID[c.cardId]?.name ?? c.cardId;
const armed = (atk: CardInstance): PendingPlay =>
  ({ kind: 'attack', iid: atk.iid, title: 'Choose who Reacher shoots', desc: '', filter: 'enemyHero' });

describe('the Attack plate: one target attacks at once, more than one asks who', () => {
  it('a hero with reach and four heroes to hit arms the attack: the prompt names the hero, and nothing is dispatched yet', () => {
    const { G, atk, foes } = duel();
    expect(attackTargets(G, ME)).toEqual(foes);
    const tap = tapAttackPlate(G, ME);
    expect(tap).toEqual({
      do: 'choose',
      pending: { kind: 'attack', iid: atk.iid, title: 'Choose who Reacher shoots', desc: '', filter: 'enemyHero' },
    });
    // Arming asks the engine only: the turn's attack has not been made.
    expect(G.attackUsed).toBe(false);
  });

  it('two targets are enough for a choice', () => {
    const { G, bench } = duel();
    for (const b of bench.slice(1)) { b.hp = 0; b.respawnTurnsLeft = 2; }
    expect(attackTargets(G, ME)).toHaveLength(2);
    expect(tapAttackPlate(G, ME).do).toBe('choose');
  });

  it('one target — the rival Active alone — attacks at once, exactly as the plate always has', () => {
    const { G, bench } = duel();
    for (const b of bench) { b.hp = 0; b.respawnTurnsLeft = 2; }
    expect(attackTargets(G, ME)).toHaveLength(1);
    expect(tapAttackPlate(G, ME)).toStrictEqual({ do: 'attack' });
  });

  it('a hero without reach has one target however many heroes the rival has', () => {
    const G = freshReadyGame(); // P0's Active is Haze
    expect(attackTargets(G, ME)).toHaveLength(1);
    expect(tapAttackPlate(G, ME)).toStrictEqual({ do: 'attack' });
  });

  it('an attack the engine refuses is refused with its words, whoever could be named', () => {
    const { G } = duel();
    G.turnNumber = 1; // no attacks on Turn 1
    expect(tapAttackPlate(G, ME)).toEqual({ do: 'refuse', refusal: { code: 'turn1', text: 'No attacks on Turn 1' } });
    const { G: H } = duel();
    H.attackUsed = true;
    expect(tapAttackPlate(H, ME)).toMatchObject({ do: 'refuse', refusal: { code: 'used' } });
  });

  it('the plate\'s line stays the default target\'s forecast, whoever else could be named', () => {
    const { G, atk, bench } = duel();
    expect(attackTargets(G, ME)).toHaveLength(4);
    const offer = attackOffer(G, ME, atk, true);
    expect(offer.blockedReason).toBeUndefined();
    expect(offer.line).toBe(attackLine(forecastAttack(G, ME)));
    expect(offer.line).toBe('Hits Abrams for 3 bullet damage');
    // …and not the forecast at a bench hero, which the targeting overlay is for.
    expect(forecastAttack(G, ME, bench[0].iid).steps[0].targetName).toBe('Dynamo');
  });
});

describe('an armed attack lights the heroes the engine says it may name', () => {
  it('exactly attackTargets: every living rival, never your own heroes', () => {
    const { G, atk } = duel();
    const lit = heroesOf(G).filter((h) => isValidTarget(G, ME, armed(atk), h));
    expect(lit.map((h) => h.iid)).toEqual(attackTargets(G, ME).map((h) => h.iid));
    expect(lit.map((h) => h.ownerId)).toEqual(['1', '1', '1', '1']);
    for (const h of heroesOf(G)) {
      expect(isValidTarget(G, ME, armed(atk), h), nameOf(h)).toBe(attackBlocked(G, ME, h.iid) === null);
    }
  });

  it('skips a rival who has fallen and a rival under a Dome', () => {
    const { G, atk, foes } = duel();
    foes[1].hp = 0; foes[1].respawnTurnsLeft = 2;           // Dynamo: a corpse
    addStatus(G, foes[0], 'dome', 1, 1);                    // Abrams: protected
    const lit = heroesOf(G).filter((h) => isValidTarget(G, ME, armed(atk), h)).map((h) => h.iid);
    expect(lit).toEqual([foes[2].iid, foes[3].iid]);
    expect(lit).toEqual(attackTargets(G, ME).map((h) => h.iid));
  });

  it('glows nothing for an attack armed for a hero that is not the Active, or once the attack is spent', () => {
    const { G, atk } = duel();
    const benched: PendingPlay = { ...armed(atk), iid: G.players[ME].bench[0]!.iid };
    expect(heroesOf(G).some((h) => isValidTarget(G, ME, benched, h))).toBe(false);
    G.attackUsed = true;
    expect(heroesOf(G).some((h) => isValidTarget(G, ME, armed(atk), h))).toBe(false);
  });
});

describe('a tap while the attack is armed', () => {
  it('a bench hero is named; the Active — the first of the list — is left out, which is the bare attack the AI makes', () => {
    const { G, rival, bench } = duel();
    expect(tapWhileAttackArmed(G, ME, bench[1].iid)).toStrictEqual({ do: 'attack', target: bench[1].iid });
    expect(tapWhileAttackArmed(G, ME, rival.iid)).toStrictEqual({ do: 'attack' });
  });

  it('the first target is the default even when it is not the Active: a Dome on the Active makes the first bench hero the bare attack', () => {
    const { G, rival, bench } = duel();
    addStatus(G, rival, 'dome', 1, 1);
    expect(attackTargets(G, ME)[0]).toBe(bench[0]);
    expect(tapWhileAttackArmed(G, ME, bench[0].iid)).toStrictEqual({ do: 'attack' });
    expect(tapWhileAttackArmed(G, ME, bench[1].iid)).toStrictEqual({ do: 'attack', target: bench[1].iid });
  });

  it('anything else is refused with the engine\'s own reason (actionRefusal for that attack), and nothing is spent', () => {
    const { G, atk, rival, bench } = duel();
    bench[2].hp = 0; bench[2].respawnTurnsLeft = 2;
    const mine = G.players[ME].bench[0]!;
    for (const [label, hero] of [['your own hero', mine], ['your own Active', atk], ['a corpse', bench[2]]] as const) {
      const tap = tapWhileAttackArmed(G, ME, hero.iid);
      expect(tap, label).toEqual({
        do: 'refuse', refusal: { code: 'target', text: 'That hero cannot be attacked' },
      });
      expect(actionRefusal(G, ME, { type: 'attack', targetIid: hero.iid }), label).toEqual((tap as { refusal: unknown }).refusal);
    }
    // A Dome on the rival Active: it is not lit, and tapping it says so.
    addStatus(G, rival, 'dome', 1, 1);
    expect(tapWhileAttackArmed(G, ME, rival.iid)).toMatchObject({ do: 'refuse', refusal: { code: 'target' } });
    expect(G.attackUsed).toBe(false);
  });

  it('what the board dispatches is the engine\'s attack: the named bench hero takes the swing, a bare move hits the Active (a real match)', () => {
    const saved = getMatchConfig();
    setMatchConfig({
      playerDeck: [], heroPreferences: [null, null, null, null],
      story: {
        playerHeroes: [REACHER, 'hero_lash', 'hero_paige', 'hero_vindicta'],
        playerDeck: AI_DECKS_BY_NAME.aggro,
        enemyHeroes: STARTER_DECK_AI.heroes,
        enemyDeck: AI_DECKS_BY_NAME.control,
        enemyBuff: { atk: 0, hp: 20 }, // nobody falls to one swing
      },
    });
    try {
      const turnTwo = () => {
        const c = Client({ game: DeadlockGame, numPlayers: 2 });
        c.start();
        const moves = c.moves as any;
        moves.endTurn(); // Turn 1 has no attack; P1 passes too…
        moves.endTurn(); // …and P0's second turn opens the attack
        const G = () => c.getState()!.G as GameState;
        const foes = [G().players['1'].active!, ...G().players['1'].bench] as CardInstance[];
        return { moves, G, foes, hp: foes.map((f) => f.hp), now: () => foes.map((f) => findCardOnBoard(G(), f.iid)!.card.hp) };
      };
      // The board's two taps, then the move they make — through the match.
      const play = (pick: (foes: CardInstance[]) => CardInstance) => {
        const m = turnTwo();
        expect(tapAttackPlate(m.G(), ME).do).toBe('choose');
        const tap = tapWhileAttackArmed(m.G(), ME, pick(m.foes).iid);
        if (tap.do !== 'attack') throw new Error('the engine refused a hero it lit');
        if (tap.target === undefined) m.moves.attack(); else m.moves.attack(tap.target);
        return m;
      };

      const bench = play((foes) => foes[2]);
      expect(bench.now()).toEqual([bench.hp[0], bench.hp[1], bench.hp[2] - 3, bench.hp[3]]);
      expect(bench.G().attackUsed).toBe(true);

      const active = play((foes) => foes[0]);
      expect(active.now()).toEqual([active.hp[0] - 3, active.hp[1], active.hp[2], active.hp[3]]);
    } finally {
      setMatchConfig(saved);
    }
  });
});

describe('a Dome on the rival Active, as the plate words it', () => {
  it('a hero with one possible target reads "Their Active cannot be attacked this turn", and the plate is not offered as a button', () => {
    const G = freshReadyGame(); // Haze: no reach
    addStatus(G, G.players['1'].active!, 'dome', 1, 1);
    expect(attackBlocked(G, ME)).toBe('noTarget');
    const haze = G.players[ME].active!;
    const offer = attackOffer(G, ME, haze, true);
    expect(offer).toEqual({ line: undefined, blockedReason: 'Their Active cannot be attacked this turn', made: false });

    const sheet = renderToStaticMarkup(createElement(HeroDetailSheet, {
      card: haze, isMine: true, skills: {}, attack: { ...offer, onAttack: () => {} }, onClose: () => {},
    }));
    expect(sheet).toContain('Their Active cannot be attacked this turn');
    expect(sheet).not.toContain('aria-label="Attack:');
    expect(sheet).not.toContain('role="button"');
  });

  it('without a Dome the same plate is a button naming what the swing does', () => {
    const G = freshReadyGame();
    const haze = G.players[ME].active!;
    const offer = attackOffer(G, ME, haze, true);
    expect(offer.blockedReason).toBeUndefined();
    const sheet = renderToStaticMarkup(createElement(HeroDetailSheet, {
      card: haze, isMine: true, skills: {}, attack: { ...offer, onAttack: () => {} }, onClose: () => {},
    }));
    expect(sheet).toContain('role="button"');
    expect(sheet).toContain(`aria-label="Attack: ${offer.line}. Free."`);
  });

  it('a rival who is simply not there reads as it always has, and so does a rival who cannot be named', () => {
    const G = freshReadyGame();
    const haze = G.players[ME].active!;
    const rival = G.players['1'].active!;
    rival.hp = 0; rival.respawnTurnsLeft = 2;
    expect(attackOffer(G, ME, haze, true).blockedReason).toBe('No rival Active to hit');
    expect(attackOffer(G, ME, haze, false).blockedReason).toBe('Not your turn');
    haze.attackedThisTurn = true;
    G.attackUsed = true;
    expect(attackOffer(G, ME, haze, true)).toMatchObject({ blockedReason: 'Attacked this turn', made: true });
  });

  it('a reaching hero keeps its plate: a Dome on the Active leaves the bench to name, and the line is the first of them', () => {
    const { G, atk, rival, bench } = duel();
    addStatus(G, rival, 'dome', 1, 1);
    const offer = attackOffer(G, ME, atk, true);
    expect(offer.blockedReason).toBeUndefined();
    expect(offer.line).toBe(attackLine(forecastAttack(G, ME)));
    expect(forecastAttack(G, ME).steps[0].targetIid).toBe(bench[0].iid);
    expect(tapAttackPlate(G, ME).do).toBe('choose');
    // Every rival under a Dome: nothing to name, and the plate says why.
    for (const b of bench) addStatus(G, b, 'dome', 1, 1);
    expect(attackOffer(G, ME, atk, true).blockedReason).toBe('Their Active cannot be attacked this turn');
    expect(tapAttackPlate(G, ME)).toMatchObject({ do: 'refuse', refusal: { code: 'noTarget' } });
  });
});
