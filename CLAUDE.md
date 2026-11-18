# Deadlock TCG

## Card design rules (core)

Read [docs/card-design.md](docs/card-design.md) before adding, renaming or redesigning a card.

- A Deadlock **active** item is always a **spell**; a **passive** item is always **equipment**. No exception
  but the one Patrick made himself, recorded in docs/card-design.md §1: Counterspell (a passive in Deadlock,
  a spell here). The Cooldown family was the other until 2026-11-16; it is equipment again.
- Keep the main game's flavor: canon item names, the item's real verb, its shop slot (Weapon / Spirit / Vitality) and its tier.
- A spell whose one play is worth under half its tier's budget costs less, not more effects (Patrick, 2026-11-16):
  it prints its own price, about half its one-play value (a soul buys 2 points); its tier stays canon (docs/card-design.md §2).
- Card prices are half the budget (Patrick, 2026-11-16: "equipment and spells, they're too expensive"):
  `PRICE` 1 / 2 / 4 / 8 / 12 by tier. Retreat stays 0–2 for now (docs/balance-model.md §12).
  One card prints over its tier's price, Patrick's own exception: Metal Skin costs 6 (2026-11-18,
  "metal skin is too cheap now"; docs/card-design.md §2).
- Card data always names the damage type: "deal N bullet damage" or "deal N spirit damage", never bare
  "damage". Attacks are bullet. The game prints it shorter (Patrick, 2026-11-17): "deal N damage", with N
  in the type's colour, purple spirit and brown bullet (`parseMarkup`, src/ui/card/scaling.ts); a number
  that scales keeps its dotted underline.
- Hero cards follow [docs/hero-design.md](docs/hero-design.md): role first, then the TCG; no Weakness;
  an ultimate is one or two effects in 15 words or fewer.
- Every hero skill, passive and ultimate scales with Spirit Power (`{sp:N}`) or Bullet Power (`{bp:N}`),
  as Deadlock's do (Patrick, 2026-11-17). A rider may stay flat; the main number scales. Where the main
  effect is control with no number (a lift, a Sleep, a revival), a scaling rider sits beside it.
- A hero's strength is a curve, not one number (Patrick, 2026-11-17): judge it in its own phase
  (early, mid, late) and with the items it needs. Win rates from short AI games under-rate late heroes.

## Design phase: numbers by reasoning, no testing unless asked

While the game's content is being designed (new items, heroes, rules), every number is set by
reasoning from the budget in [docs/card-design.md](docs/card-design.md) §3, whose method is in
[docs/balance-model.md](docs/balance-model.md) (1 damage = 1.0, 1 heal
or shield = 0.5, a permanent +1 stat = 0.7 × the own turns it is expected to be worn, a turn of hard
crowd control on the Active = 2.0, an extra attack = 2 × the attack it doubles; a card's value lands
on its tier's budget, 2 / 4 / 8 / 16 / 24 points, and since 2026-11-16 it costs half that in souls), and the reasoning is written down beside the card in
[docs/card-design.md](docs/card-design.md).

- Do not run the balance sim (`scripts/balance-sim.ts`), restricted play, or the browser QA scripts
  (`scripts/qa/*.mjs`) during design work. They run only when Patrick asks for that testing by name;
  there is no automatic "final round".
- Compile-level hygiene is not testing and always stays: `npx tsc --noEmit`, `npm run build`, and the
  existing vitest suite kept green by fixing what the data broke (never by deleting a test).
  `npm test` is the everyday run (~30 s; the fuzz specs play a slice of their seeds). A change to the
  engine's rules (src/engine, src/abilities) also runs `npm run test:deep`, the fuzz at full depth (~65 s).
