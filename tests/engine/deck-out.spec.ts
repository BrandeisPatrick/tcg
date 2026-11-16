/**
 * Patrick, 2026-11-16: "Running out of cards is end of game. Round limit to
 * be 20."
 *
 * Under the deck-out rule (`G.deckOut`, on in every match set up to play) a
 * side whose deck is empty when its turn's draw comes loses, as in the
 * Pokémon TCG. A scripted lesson that names its decks (one card, or none)
 * plays without it. The round cap is 20.
 */
import { describe, it, expect } from 'vitest';
import { beginTurn } from '@/engine/actions/turn';
import { checkWinner } from '@/engine/query';
import { ROUND_CAP } from '@/engine/constants';
import { freshReadyGame, giveCard } from './_helpers';
import { INVALID, perform } from '@/engine/engine';

describe('deck-out', () => {
  it('a side whose deck is empty at its draw loses; the rival wins', () => {
    const G = freshReadyGame();
    G.deckOut = true;
    G.players['0'].deck = [];
    G.players['1'].deck = [giveCard(G, '1', 'extra_health')];
    G.players['1'].hand = [];
    beginTurn(G, '0', G.turnNumber + 1);
    expect(G.deckedOut).toBe('0');
    expect(checkWinner(G)).toEqual({ winner: '1' });
    expect(G.log.some((l) => /no card left to draw and loses/.test(l.text))).toBe(true);
  });

  it('a full hand does not save it: the deck is what is empty', () => {
    const G = freshReadyGame();
    G.deckOut = true;
    G.players['1'].deck = [];
    for (let i = 0; i < 10; i++) giveCard(G, '1', 'extra_health');
    beginTurn(G, '1', G.turnNumber + 1);
    expect(checkWinner(G)).toEqual({ winner: '0' });
  });

  it('a deck with one card draws it and plays on; the next draw loses', () => {
    const G = freshReadyGame();
    G.deckOut = true;
    const last = giveCard(G, '0', 'extra_health');
    G.players['0'].hand = [];
    G.players['0'].deck = [last];
    beginTurn(G, '0', G.turnNumber + 1);
    expect(G.deckedOut).toBeUndefined();
    expect(G.players['0'].hand).toContain(last);
    expect(checkWinner(G)).toBeUndefined();
    beginTurn(G, '0', G.turnNumber + 2);
    expect(checkWinner(G)).toEqual({ winner: '1' });
  });

  it('Golden Goose Egg can draw a side dry: it loses at its next draw', () => {
    const G = freshReadyGame();
    G.deckOut = true;
    const me = G.players['0'];
    me.souls = 10;
    me.deck = [giveCard(G, '0', 'extra_health'), giveCard(G, '0', 'extra_health')];
    me.hand = [];
    const egg = giveCard(G, '0', 'golden_goose_egg');
    expect(perform(G, '0', { type: 'playCard', cardIid: egg.iid })).not.toBe(INVALID);
    expect(me.deck).toHaveLength(0);
    expect(checkWinner(G)).toBeUndefined(); // not yet: the loss is at its draw
    beginTurn(G, '0', G.turnNumber + 2);
    expect(checkWinner(G)).toEqual({ winner: '1' });
  });

  it('without the rule (a scripted lesson, a hand-built state) an empty deck draws nothing and nobody loses', () => {
    const G = freshReadyGame();
    G.players['0'].deck = [];
    beginTurn(G, '0', G.turnNumber + 1);
    expect(G.deckedOut).toBeUndefined();
    expect(checkWinner(G)).toBeUndefined();
  });

  it('the round cap is 20', () => {
    expect(ROUND_CAP).toBe(20);
  });
});
