/**
 * The one-play riders (2026-11-16; docs/card-design.md, "The one-play riders"):
 * the spells that were worth under half their price as a single play each
 * gained what their Deadlock item also does. Knockdown, Disarming Hex, Cursed
 * Relic, Echo Shard, Unstoppable, Divine Barrier, Ethereal Shift and Infuser
 * are pinned where their old tests were (control-spells, new-cards,
 * more-cards); the rest are here.
 */
import { describe, it, expect } from 'vitest';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { ABILITIES_BY_ID } from '@/abilities';
import { heroesOf } from '@/engine/query';
import { freshReadyGame, stackDeck, useItem } from './_helpers';

const status = (c: CardInstance, id: string) => c.statuses.find((s) => s.id === id);
const text = (id: string) => (CARDS_BY_ID[id] as { text: string }).text;

describe('Majestic Leap: the ally leaps in shielded and flying', () => {
  it('swaps free; the hero that comes in gains Shield 4 and Flying for 1 turn, the one that leaves nothing', () => {
    const G = freshReadyGame();
    const me = G.players['0'];
    const out = me.active!;
    const comer = me.bench[1]!;
    useItem(G, '0', 'majestic_leap', comer.iid);
    expect(me.active!.iid).toBe(comer.iid);
    expect(status(comer, 'shield')?.value).toBe(4);
    expect(status(comer, 'flying')).toMatchObject({ duration: 1 });
    expect(status(out, 'shield')).toBeUndefined();
    expect(status(out, 'flying')).toBeUndefined();
  });
});

describe('Mystical Piano: the piano comes down', () => {
  it('every enemy hero takes 2 + Spirit spirit damage, then is Stunned and Rooted for 2 turns', () => {
    const G = freshReadyGame();
    G.players['0'].active!.spiritMod = 1;
    const foes = heroesOf(G.players['1']);
    for (const f of foes) { f.hpMax = 30; f.hp = 30; }
    useItem(G, '0', 'mystical_piano');
    for (const f of foes) {
      expect(f.hp, f.cardId).toBe(27);
      expect(status(f, 'stun')?.duration, f.cardId).toBe(2);
      expect(status(f, 'rooted')?.duration, f.cardId).toBe(2);
    }
  });

  it('a hero the hit knocks out is not stunned', () => {
    const G = freshReadyGame();
    const foe = G.players['1'].bench[0]!;
    foe.hp = 1;
    useItem(G, '0', 'mystical_piano');
    expect(status(foe, 'stun')).toBeUndefined();
  });
});

describe('Transcendent Cooldown: the draw, and the item\'s regeneration', () => {
  it('each of your standing heroes heals 3; the rival\'s do not', () => {
    const G = freshReadyGame();
    stackDeck(G, '0', Array(10).fill('extra_spirit'));
    const mine = heroesOf(G.players['0']);
    const theirs = heroesOf(G.players['1']);
    for (const h of [...mine, ...theirs]) { h.hpMax = 20; h.hp = 10; }
    useItem(G, '0', 'transcendent_cooldown');
    for (const h of mine) expect(h.hp, h.cardId).toBe(13);
    for (const h of theirs) expect(h.hp, h.cardId).toBe(10);
  });

  it('its text says both, and the draw it records for the oracle is unchanged: 8, discard 2', () => {
    expect(text('transcendent_cooldown')).toBe('Draw 8 cards, then discard 2 cards from your hand. Each of your heroes heals 3.');
    expect(ABILITIES_BY_ID.eff_transcendent_cooldown.draw).toEqual({ cards: 8, discard: 2 });
  });
});

describe('the texts name what the code does', () => {
  const cases: Array<[string, string]> = [
    ['knockdown', 'Stun enemy Active for 1 turn and deal {sp:1} spirit damage to it. A flying hero lands and is Stunned 2 turns. A Stun ends a channel.'],
    ['disarming_hex', 'Disarm any enemy for 2 turns and apply Bullet Resist −3 to it for 2 turns.'],
    ['majestic_leap', 'Your Active retreats free; the bench ally you pick leaps in with Shield 4 and Flying for 1 turn.'],
    ['curse', 'Curse one enemy hero: it loses its buffs and its channel, and is Silenced and Disarmed for 4 turns.'],
    ['mystical_piano', 'Deal {sp:2} spirit damage to every enemy hero, then Stun them for 2 turns and Root them for 2 turns.'],
    ['echo_shard', 'Each of your heroes uses its skill again this turn. Your Active gains Bullet Resist 3 and Spirit Resist 3 for 2 turns.'],
    ['ethereal_shift', 'An ally is Invulnerable for 1 turn and gains +4 Spirit Power and Spirit Resist 3 for 3 turns.'],
    ['divine_barrier', "Cleanse an ally's debuffs except Stun. It gains Shield 10, and Bullet Resist 3 and Spirit Resist 3 for 3 turns."],
    ['infuser', 'Your Active heals 6 and gains +4 Spirit Power and Spirit Lifesteal for 3 turns.'],
    ['unstoppable', 'An ally is cleansed of every debuff, gains Unstoppable for 3 turns and is Invulnerable for 1 turn.'],
  ];
  it.each(cases)('%s', (id, want) => expect(text(id)).toBe(want));

  it('every damage they deal is named spirit', () => {
    for (const [id] of cases) {
      const t = text(id);
      if (/damage/.test(t)) expect(t, id).toMatch(/spirit damage/);
    }
  });
});

