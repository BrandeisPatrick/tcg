# Deadlock TCG

## Card design rules (core)

Read [docs/card-design.md](docs/card-design.md) before adding, renaming or redesigning a card.

- A Deadlock **active** item is always a **spell**; a **passive** item is always **equipment**. No exceptions.
- Keep the main game's flavor: canon item names, the item's real verb, its shop slot (Weapon / Spirit / Vitality) and its tier.

## Design phase: numbers by reasoning, no testing unless asked

While the game's content is being designed (new items, heroes, rules), every number is set by
reasoning from the budget in [docs/balance-model.md](docs/balance-model.md) (1 damage = 1.0, 1 heal
or shield = 0.5, a permanent +1 stat = 0.7 × the own turns it is expected to be worn, a turn of hard
crowd control on the Active = 2.0, an extra attack = 2 × the attack it doubles; a card's value lands
on its tier's price), and the reasoning is written down beside the card in
[docs/card-design.md](docs/card-design.md).

- Do not run the balance sim (`scripts/balance-sim.ts`), restricted play, or the browser QA scripts
  (`scripts/qa/*.mjs`) during design work. They run only when Patrick asks for that testing by name;
  there is no automatic "final round".
- Compile-level hygiene is not testing and always stays: `npx tsc --noEmit`, `npm run build`, and the
  existing vitest suite kept green by fixing what the data broke (never by deleting a test).
