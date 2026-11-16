import type { AbilityId, CardId, HeroCard } from '@/engine/types';

/**
 * Units (docs/hero-design.md, "Units"; Patrick, 2026-11-16): board cards that
 * are no hero. A unit takes one of a side's four spots, has Attack and HP and
 * can be damaged like a hero, but it wears nothing, earns nothing, and once
 * destroyed it is gone. No unit is drafted or built into a deck: a hero's kit
 * makes it (Graves raises Ghouls and a Gravestone).
 *
 * A unit is hero-shaped (`type: 'hero'` with `unit` set, engine/types.ts), so
 * the board, the targeting filters and the statuses treat it as they treat a
 * hero; the rules that differ read `unit` (engine/query.ts `unitData`).
 */
function unit(u: {
  id: CardId; name: string; atk: number; hp: number; price: number;
  passives?: AbilityId[]; death?: AbilityId; benchOnly?: true;
}): HeroCard {
  return {
    id: u.id, name: u.name, type: 'hero', rarity: 1,
    atk: u.atk, hp: u.hp, growth: { atk: 0, hp: 0, spirit: 0 }, retreat: 0,
    profile: { role: 'Unit', mix: { tank: 0, damage: 0, control: 0, support: 0 }, reach: 'one', curve: 'mid' },
    skills: [], passives: u.passives,
    // A unit has no signature items: it wears none.
    signature: [] as unknown as [CardId, CardId],
    flags: u.benchOnly ? { benchOnly: true } : undefined,
    unit: { price: u.price, death: u.death },
  };
}

/** The Ghoul's card id: Graves' kit shuffles these into her side's deck. */
export const GHOUL = 'unit_ghoul';
/** The Gravestone's: Borrowed Decree raises one on the bench. */
export const GRAVESTONE = 'unit_gravestone';

export const UNITS: HeroCard[] = [
  // Deadlock's Ghoul (Graves' Grasping Hands and Borrowed Decree summon them;
  // Patrick's "zombie"). 1 Attack, 1 HP, 1 soul: a body for the lane, and what
  // it is really for is dying there.
  unit({ id: GHOUL, name: 'Ghoul', atk: 1, hp: 1, price: 1, passives: ['passive_ghoul'], death: 'passive_ghoul' }),
  // The gravestone Borrowed Decree raises. It never takes the lane and is
  // never in a hand (price 0: nothing plays it): it stands on the bench until
  // anything damages it.
  unit({ id: GRAVESTONE, name: 'Gravestone', atk: 0, hp: 1, price: 0, passives: ['passive_gravestone'], benchOnly: true }),
];

export const UNITS_BY_ID = Object.fromEntries(UNITS.map((u) => [u.id, u])) as Record<string, HeroCard>;
