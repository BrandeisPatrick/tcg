import { describe, it, expect } from 'vitest';
import { READY_DECKS, readyDeckInUse } from '@/cards/readyDecks';
import { DECK_OFFERS, deckOffers, readyDeckFit } from '@/cards/deckOffers';
import { defaultBuild } from '@/cards/builds';
import type { CardId } from '@/engine/types';
import { copyCounts, deckProblem, evolvesFrom } from '@/cards/decks';
import { CARDS_BY_ID, HEROES, itemCard } from '@/cards';
import { itemPrice } from '@/engine/query';
import { DECK_SIZE, PRICE, SQUAD_SIZE, MAX_COPIES } from '@/engine/constants';

// The ready decks (docs/deck-plan.md, "Ready decks"): each is a squad of three
// and a legal 16-item deck built to one recipe.
describe('ready decks', () => {
  // Seven since 2026-11-16, one an archetype Patrick named: bullet one target, bullet many,
  // spirit burst, spirit area, crowd control, Graves, tank and support; Crossfire, the
  // eighth (2026-11-17), mixes bullet and spirit.
  it('there are seven, each with its own name and id; Graveyard is Graves\'s, Aurora Dynamo\'s (2026-11-16)', () => {
    expect(READY_DECKS).toHaveLength(8);
    expect(READY_DECKS.map((d) => d.id)).toEqual(['headshot', 'spray', 'nuke', 'storm', 'lockdown', 'graveyard', 'aurora', 'crossfire']);
    expect(new Set(READY_DECKS.map((d) => d.name)).size).toBe(8);
    expect(READY_DECKS.find((d) => d.id === 'graveyard')?.heroes).toContain('hero_graves');
    // Aurora is the Healing Tempo deck: Dynamo's heal, and the line Healing Booster → Healing Tempo.
    const aurora = READY_DECKS.find((d) => d.id === 'aurora')!;
    expect(aurora.heroes).toContain('hero_dynamo');
    expect(aurora.items).toEqual(expect.arrayContaining(['healing_booster', 'healing_tempo']));
  });

  it.each(READY_DECKS.map((d) => [d.name, d] as const))('%s: three different heroes (SQUAD_SIZE) and a legal deck; an upgrade is in it beside the item it is built from', (_name, d) => {
    expect(d.heroes).toHaveLength(SQUAD_SIZE);
    expect(new Set(d.heroes).size).toBe(SQUAD_SIZE);
    for (const h of d.heroes) expect(CARDS_BY_ID[h]?.type, h).toBe('hero');
    expect(d.items).toHaveLength(DECK_SIZE);
    expect(deckProblem(d.items)).toBeNull();
    // Upgrades are deck cards now (2026-11-15): each deck carries at least one, and never
    // one whose component it does not carry — the discount has to be reachable.
    const upgrades = d.items.filter((id) => evolvesFrom(id));
    expect(upgrades.length, 'no upgrade').toBeGreaterThan(0);
    for (const id of upgrades) expect(d.items, id).toContain(evolvesFrom(id));
  });

  it.each(READY_DECKS.map((d) => [d.name, d] as const))('%s: the recipe — at most 4 copies (MAX_COPIES), 28 souls at most at printed prices with at most two over 2, a counter, a draw card, mostly equipment', (_name, d) => {
    const counts = copyCounts(d.items);
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(MAX_COPIES);
    // What the deck costs is what its cards print (a spell priced for one play counts its own
    // price): 28 souls at most, and at most two cards over 2 — its payoffs — none over 8 (56, 4 and 16 until prices halved).
    // (Until the redesign of 2026-11-16 the recipe counted tiers: 8 / 6 / 2.)
    expect(d.items.reduce((n, id) => n + itemPrice(id), 0)).toBeLessThanOrEqual(28);
    const payoffs = d.items.filter((id) => itemPrice(id) > PRICE[2]);
    expect(payoffs.length, payoffs.join(', ')).toBeLessThanOrEqual(2);
    for (const id of payoffs) expect(itemPrice(id), id).toBeLessThanOrEqual(PRICE[4]);
    // A counter in every deck; the draw card, Golden Goose Egg, once (running out of cards loses
    // since 2026-11-16); and a deck leans on equipment, which stays, over spells.
    expect(d.items.some((id) => ['counterspell', 'debuff_reducer', 'debuff_remover', 'knockdown'].includes(id))).toBe(true);
    const draws = d.items.filter((id) => /^Draw \d+ cards?/.test(itemCard(id)!.text ?? ''));
    expect(new Set(draws)).toEqual(new Set(['golden_goose_egg']));
    expect(draws).toHaveLength(1);
    const spells = d.items.filter((id) => itemCard(id)!.type === 'spell').length;
    expect(spells).toBeGreaterThan(0);
    expect(spells).toBeLessThanOrEqual(DECK_SIZE / 2);
    // Listed cheapest tier first, as the Loadout prints it.
    const listed = d.items.map((id) => itemCard(id)!.tier);
    expect(listed).toEqual([...listed].sort((a, b) => a - b));
  });

  it('no hero is in two of the seven archetype decks; Crossfire seats Mirage, the one left out, and two of theirs (2026-11-17)', () => {
    const archetypes = READY_DECKS.filter((d) => d.id !== 'crossfire').flatMap((d) => d.heroes);
    expect(new Set(archetypes).size).toBe(archetypes.length);
    const crossfire = READY_DECKS.find((d) => d.id === 'crossfire')!;
    expect(crossfire.heroes.filter((h) => !archetypes.includes(h))).toEqual(['hero_mirage']);
    // Every hero is in a ready deck now.
    expect(new Set(READY_DECKS.flatMap((d) => d.heroes)).size).toBe(HEROES.length);
  });

  it('Crossfire carries both directions of cross-type shred: spirit damage that cuts Bullet Resist, swings that cut Spirit Resist', () => {
    const d = READY_DECKS.find((x) => x.id === 'crossfire')!;
    expect(d.items).toEqual(expect.arrayContaining(['bullet_resist_shredder', 'alchemical_fire', 'spirit_strike', 'spirit_shredder']));
  });

  it('readyDeckInUse names the deck a saved deck is, in any item order; heroes play no part (2026-11-17)', () => {
    const d = READY_DECKS[1];
    expect(readyDeckInUse([...d.items].reverse())).toBe(d);
    expect(readyDeckInUse(d.items.slice(1))).toBeUndefined();                 // a card short
    expect(readyDeckInUse([])).toBeUndefined();
  });
});

// The deck draft's offers (cards/deckOffers.ts, 2026-11-17): a deck no longer
// comes with heroes; the draft offers the decks that fit the drafted ones.
describe('deck offers', () => {
  const offerIds = (heroes: CardId[], own?: CardId[]) => deckOffers(heroes, heroes.map(defaultBuild), own).map((o) => o.id);

  it('the two best-fitting ready decks, best first, then the heroes\' builds; a legal saved deck beside them', () => {
    expect(offerIds(['hero_haze', 'hero_mirage', 'hero_kelvin'])).toEqual(['crossfire', expect.any(String), 'builds']);
    expect(offerIds(['hero_graves', 'hero_abrams', 'hero_rem'])[0]).toBe('graveyard');
    expect(offerIds(['hero_haze', 'hero_mirage', 'hero_kelvin'], [...READY_DECKS[0].items])).toHaveLength(DECK_OFFERS + 1);
    expect(offerIds(['hero_haze', 'hero_mirage', 'hero_kelvin'], ['extra_spirit'])).toHaveLength(DECK_OFFERS); // not a legal deck
  });

  it('says why: the drafted heroes a ready deck was made for, by name', () => {
    const [first] = deckOffers(['hero_haze', 'hero_mirage', 'hero_kelvin'], [[], [], []]);
    expect(first.madeFor).toEqual(['hero_haze', 'hero_mirage', 'hero_kelvin']);
    expect(first.why).toBe('Made for Haze, Mirage and Kelvin');
  });

  it('a gun team leans to Weapon decks, a spirit team to Spirit ones, when no deck was made for its heroes', () => {
    const guns = READY_DECKS.find((d) => d.id === 'spray')!;
    const spirit = READY_DECKS.find((d) => d.id === 'storm')!;
    // Two teams no ready deck names, read by their growth alone.
    const gunTeam: CardId[] = ['hero_drifter', 'hero_vindicta'];
    const spiritTeam: CardId[] = ['hero_lady_geist', 'hero_sinclair'];
    const fitNoNames = (d: typeof guns, team: CardId[]) => readyDeckFit({ ...d, heroes: ['x', 'y', 'z'] as never }, team, []);
    expect(fitNoNames(guns, gunTeam)).toBeGreaterThan(fitNoNames(spirit, gunTeam));
    expect(fitNoNames(spirit, spiritTeam)).toBeGreaterThan(fitNoNames(guns, spiritTeam));
  });
});
