# Hero Design — requirements

Status, 2026-11-16: **22 heroes are built to these cards** (Graves on 2026-11-16, with the units her kit raises: see "Units, the mill and Graves" at the end). Status, 2026-11-09: 21 heroes were built to these cards (branch `deck-and-heroes`; see "As
built" at the end): the 19 of step 2, and in step 3 Victor and Silver with their charged ultimates,
on the trigger prompt system of section 6 (`src/engine/prompts.ts`), and Rem rebuilt to Patrick's
call of the same day (section 5: she stands in the lane, Tag Along a ride). The other 23 cards in section 8
are not built yet; nor are the later parts of section 6 (chains, and an auto/on/off setting — how to
add them is in [engine-model.md](engine-model.md), "Trigger prompts"). The rules below are
binding for every hero card; the proposed cards for all 44 Deadlock heroes are listed at the end. A visual version with portraits:
[Hero Card Designs](https://claude.ai/artifact/JYPQPyeXj6u1PYiuhQDcGB). Role research behind
it: [Deadlock Hero Roles](https://claude.ai/artifact/Jp27zXwR6dXjyr5q2QriyD).

These cards assume the deck plan
([Deck and Draw Plan](https://claude.ai/artifact/WDLNDpGunGhw5rSLz8Wopp)): souls that pile up (5 a
turn when these cards were written; 2 a turn and a kill bounty since 2026-11-15,
[balance-model.md](balance-model.md) §7), heroes drawn from the deck, and skills and ultimates paid in souls (until 2026-11-15: since then a kit costs no souls and waits instead, [balance-model.md](balance-model.md) §8). A fallen hero goes to your hand
after 2 turns, keeping its level (section 7).

## 1. Role first, then the TCG

- Design each hero card from how the hero plays in Deadlock first, then fit it to the TCG.
- The core rules copy the Pokémon TCG (Pocket): simple, with a little depth.
- Every hero has:
  - **Role**: Tank, Bruiser, Gun carry, Marksman, Spirit caster, Assassin, Support or Controller.
  - **Mix**: tank, damage, control and support, each 0–3.
  - **Reach**: one target, many, or both.
  - **Curve**: early, mid or late.
- Most heroes mix roles, and the card shows the mix:
  - Billy is a tank who controls many targets.
  - Mo & Krill is a tank who controls one target.
  - Shiv is a damage tank.
  - Warden is half tank, half gun.

## 2. The card

| Field | Rule |
|---|---|
| HP | 4 + tank score at Level 1, adjusted by the curve. |
| Attack | 1 at Level 1. It is 2 when the hero's damage is mainly bullet or melee and its damage score is 2 or more. Never above 2 at Level 1. |
| Curve | **Early:** +1 point at Level 1 (on HP or Attack) and 2 growth points a level. **Mid:** no extra point and 3 growth points a level. **Late:** −1 point at Level 1 (never below Attack 1 or HP 4) and 4 growth points a level. All three are even at Level 2. |
| Growth | Each level's points are split between Attack, HP and Spirit: gun heroes into Attack, spirit heroes into Spirit, tanks into HP. This replaces the flat +1/+1/+1. Since 2026-11-16 a hero's own skill or passive counts its Spirit twice (`{sp:N}` there is N + 2 × Spirit), so a point put into Spirit pays about what a point put into Attack does ([balance-model.md](balance-model.md) §10). |
| Retreat | From Pokémon: the souls it costs to swap the Active with a bench hero. 0 for very mobile heroes, 1 for most, 2 for slow heavy ones. |
| Weakness | **None.** Patrick: "I don't like weak." No hero takes extra damage from a type. |
| Kit | Exactly one **skill** or one **passive**, plus an **ultimate**. A skill costs no souls (Patrick, 2026-11-15). After a use it waits 3 turns, or 4 for the heavier ones (area damage with a rider, or a turn denied). Three skills are **charged**, as they are in Deadlock (Serrated Knives, Frost Grenade, and since 2026-11-16 Vindicta's Assassinate, which waits 5; Lightning Ball was one until Seven's skill became Static Charge, 2026-11-15, and Kinetic Pulse until Dynamo's became Rejuvenating Aurora, 2026-11-16): they hold 2 uses, and the wait brings them back one at a time. A passive is always on. Use the hero's real Deadlock ability names. |
| Ultimate | **A button printed on the hero card**, like a Pokémon attack, not a card in the deck (Patrick, 2026-11-09). It shows the hero's own Deadlock ultimate icon: the deadlock-api's `signature4` ability for that hero, field `image_webp`. Unlocks at Level 3 (Patrick, 2026-11-16; it was Level 2). Costs no souls (Patrick, 2026-11-15), and a side uses **one ultimate a turn**. It waits 4 (small), 6 (medium) or 8 (large) turns by size: after each use, and from the match's first turn, so a large one is first ready on its side's turn 8. |
| Charged ultimate | For heroes like Victor and Silver (Patrick, 2026-11-09). It has no opening wait: it is ready once the hero has taken (Victor, 10) or dealt (Silver, 8) enough damage. The count starts over after use, and it then waits its size's turns like any ultimate. (Until 2026-11-15 it had a soul price, 20 and 16, that each damage brought down by 1.) |

## 3. Writing card text

- **Damage always names its type** (Patrick, 2026-11-09).
  - Write "deal N bullet damage" or "deal N spirit damage", never bare "damage".
  - Attacks deal bullet damage, and melee counts as bullet. Purple numbers (`{sp:N}`, N plus the hero's Spirit) are spirit damage.
  - A modifier such as "takes +1 damage" applies to both types and needs no type.
- **Ultimates stay simple** (Patrick: "keep word and effect simple").
  - One or two effects in 15 words or fewer, with no story words.
  - Allowed effects: damage, heal, shield, one status, a pull or swap, or a stat boost.
  - Not allowed: knockout rewards, costs paid in the hero's own HP, "then" steps, or conditions.
  - **A channel is allowed** (Patrick, 2026-11-15; until then it was not): an ultimate may run over 2 or 3 of its caster's turns, pulsing as each ends, when a Stun on the caster ends it. The card says "Channel N turns", and the caster can't attack or use its skill while it runs.
  - **Effects that resolve after a turn** (Patrick, 2026-11-15): where a hero's control is a Stun, prefer one that goes off after the enemy's next turn, so the enemy has that turn to answer it ([card-design.md](card-design.md), "Counters"). Seven is the first; the other Stuns are still immediate.
  - Two exceptions:
    - Shiv's Killing Blow keeps its condition: it knocks out a hero below half HP.
    - Victor's ultimate is used on the enemy's turn, at the moment he falls.
  - A charged ultimate's charge rule ("Ready once Victor has taken 10 damage.") goes on its own line under the effect, so it doesn't count toward the 15 words.
- When an effect refers to the hero itself, the text names the hero ("Warden heals that much").
- The meaning of each card word:
  - **Stun**: skips its next turn.
  - **Sleep**: the same as Stun, for the number of turns shown.
  - **Root**: can't retreat or be swapped in.
  - **Silence**: can't use skills or ultimates.
  - **Disarm**: can't attack.
  - **Bleed N**: loses N HP at the start of each of its turns.
  - **Shield N**: blocks the next N damage.
  - **Unstoppable**: can't be stunned, rooted, silenced or put to sleep.
  - **Any enemy** and **every enemy** include bench heroes.
  - No hero heals above its max HP.

## 4. Budget

One soul bought about one point of effect, the rate items were priced at; since 2026-11-16 cards cost half, so a soul buys two ([balance-model.md](balance-model.md) §12) and the points are unchanged. Since 2026-11-15 a kit costs no souls: its points are paid for in turns of waiting ([balance-model.md](balance-model.md) §8), and the point values below are unchanged.

| Effect | Points |
|---|---|
| 1 damage to one enemy | 1 |
| 1 damage to every enemy (up to 4) | 2.5 |
| Heal 1 / Shield 1 | 0.5 / 0.6 |
| Stun the Active 1 turn | 3 |
| Sleep 2 turns | 4 |
| Root, Silence or Disarm 1 turn | 1.5 |
| Takes +1 damage for 1 turn | 1 |
| Bleed 1 a turn | 1 a turn |
| +1 Attack or Spirit for 2 turns | 1.5 |
| Bullet or Spirit Resist +1 for 2 turns | 1.2 |
| Pull a bench hero into the Active slot, or swap two heroes | 2 |
| Knock out below half HP | +3 on top of the damage |
| Hitting a bench hero | +0.5 on top |

- A **skill** is worth 2–3 points if it waits 3 turns and 3–4.5 if it waits 4 (they were priced at 2 and 3 souls, 1–1.5 times their cost). Most skills wait 3.
- A **passive** is worth about 1–2 points per own turn.
- **Ultimates:**
  - a small one is worth 4–6;
  - a medium one, 8–12;
  - a large one, 12–18.
- A stun or sleep on more than one enemy only comes in a large ultimate.
- **Control 3** means hard control (stun, root, silence, disarm, sleep, pull or swap) in the skill or passive. **Control 2** means control in the ultimate.
- **Support 3** means the skill or passive heals, shields or boosts allies, and the amount may grow with Spirit.
- **Not reconciled yet:** this budget prices a 1-turn stun at 3.
  - [balance-model.md](balance-model.md) and CLAUDE.md price a turn of hard control at 2.0.
  - Settle on one number before heroes are built.

## 5. Patrick's calls on single heroes

- **Viscous:** his skill is **The Cube**, his signature, waiting 4 turns (3 souls until 2026-11-15): "Cube one of your heroes: it takes no damage until your next turn."
  - The signature wins over the control-3 rule, so his stun lives only in Goo Ball.
- **Victor:** his ultimate, Shocking Reanimation, is a charged revive.
  - It is ready once he has taken 10 damage: "When Victor falls, you may use this: he revives where he is with half HP."
  - His Aura of Suffering deals 1 spirit damage to Victor too, so it charges the ultimate.
  - Patrick first wanted it passive and free. He changed his mind: it should cost a lot (20 souls) and get cheaper as Victor takes damage. On 2026-11-15 ultimates stopped costing souls, so the damage alone charges it: 10, half the old price.
- **Silver:** her ultimate, Lycan Curse, is charged. It is ready once she has dealt 8 damage (until 2026-11-15: 16 souls, 1 less for each damage she dealt): "Silver turns into a wolf for 2 turns: +3 Attack and Shield 6."
  - While she is a wolf, her card shows her wolf-form art. That is Deadlock's own wolf-form hero card, from the deadlock-api (`images/heroes/werewolf_wolf_card.webp`), not new art.
  - The Lycan Curse icon (`werewolf_lycancurse.webp`) is her ultimate icon, not her wolf art.
  - In Deadlock, dealing damage builds her bloodlust toward the transformation, so this matches the real game.
- **Haze:** Bullet Dance deals her Attack as bullet damage to every enemy. She starts at Attack 1 and grows +3 Attack a level, so the ultimate grows with her.
- **Shiv:** a damage tank (HP 6, Attack 1, grows +2 Attack a level) who keeps his execute.
- **Rem** (2026-11-09): Rem can stand in the lane; Tag Along makes her equipment for 2 turns: "Rem rides on another of your heroes as equipment for 2 turns: it heals 4✦. Then Rem returns to your bench."
  - She is no longer bench-only: she can open the match, go into an empty lane, step up when the Active falls and be retreated to.
  - She rides on another standing hero of her side, bench or Active. While she rides she can't be hit or targeted and uses nothing; when the ride is over she returns to her bench slot, and if her bearer falls first she jumps back to the bench.
  - Riding off from the lane leaves it empty, and her side chooses who steps up, as when an Active falls.

## 6. Trigger prompts: one shared system

Patrick, 2026-11-09: Victor's revive should come from a separate system that other cards can use later. It works like Yu-Gi-Oh Master Duel, which asks "Activate this?" or "Chain this card?".

**What it does**

- Some effects are optional, and they happen at a moment, often on the other player's turn. Example: "When Victor falls, you may use this." These are **trigger effects**.
- When the moment comes, the game:
  - finds every trigger effect that player has for that moment;
  - keeps only the ones the player can use right now (the right level, not waiting, charged; and for an ultimate, the side has not used one this turn).
- If any are left, the game pauses and asks that player. The prompt shows the card and the moment, for example "Use Shocking Reanimation? Yes / No" (until 2026-11-15 it named a soul price too).
  - With several triggers, the player picks one or passes.
  - Nothing usable means no prompt, so the game never asks a pointless question.
- The computer player answers the same prompt through the same code.
- The system stays apart from the cards:
  - a card only declares when it triggers, that it is a "may", its cost and its effect;
  - the prompt system does the asking;
  - a new card adds a trigger, not new prompt code.

**First version, and later**

- **First version:** one answer per moment. The player who is asked says yes or no, and the effect happens. The other player can't answer back.
- **Later: chains.** After a yes, the other player may answer with a trigger of their own, and the newest effect happens first, as in Yu-Gi-Oh. Build the first version so chains can be added without rewriting it.
- **Later, if prompts get noisy:** a setting to turn them off or answer them automatically, like Master Duel's auto/on/off.

**Where it fits in the engine**

- `src/engine/triggers.ts` already has `fireTriggers`, the one place where automatic reactions are found and run (on-attack effects, Djinn's Mark, and so on).
  - Optional triggers should go through the same place.
  - Instead of running at once, they stop and wait for an answer.
- Waiting for the other player in the middle of a turn is what boardgame.io stages are for (`setActivePlayers`). The asked player gets a short "respond" stage with two moves: use it, or pass.

## 7. Decisions and open questions

- **Decided:** the ultimate is a button on the hero, not a card. The other two options were a card in the deck, and a card made at Level 2.
- **Decided: a fallen hero goes to your hand after 2 turns** (Patrick, 2026-11-09).
  - It is a flat 2 all game, and the hero keeps its level.
  - The 2 is one number in the rules (for example `RESPAWN_TURNS`), so it can change after play; 0 would mean straight to hand.
  - Why: a knockout gives the enemy 2 turns to push, like a Deadlock respawn, and you know when the hero comes back.
  - The other options were "back into the deck" and "straight to your hand".
  - Victor's ultimate lets him skip the wait and get back up where he is.
- **New engine rules the cards need:**
  - The Cube: the hero takes no damage until your next turn. The engine's dome may already do this.
  - Charged ultimates (Victor, Silver): the cost drops by 1 for each damage the hero takes or deals, and starts over after use.
  - A second form shown on the card while it lasts (Silver's wolf).
  - Victor's ultimate is used on the enemy's turn, when he falls, through the trigger prompts in section 6.
  - Root on a bench hero (Billy, Solomon): it can't be swapped into the Active slot.
  - Mirage's Djinn's Mark sets itself off at 3 marks.
  - Drifter gains +1 Attack for the game on a knockout, up to +2 (until 2026-11-16: Bloodscent is one rule now).
- **Possible balance problems:**
  - Rem and Mina are late heroes already at the lowest stats, so they keep 1 point more than the curve gives.
  - Seven's Storm Cloud hits every enemy for 8 at Level 2 and 14 at Level 4. That may be too strong.
  - The two charged costs (Victor 20, Silver 16) are twice what their effects are worth by the budget. How fast they come down depends on how much damage is flying, which only play will show.
- The numbers come from the budget, not from test games.
- [ultimate-design.md](ultimate-design.md) describes the ultimates as built today. When heroes are rebuilt, this doc replaces it.

## 8. The proposed cards

Numbers marked ✦ add the hero's Spirit, so "4✦" is 4 plus Spirit.

### Tank (6)

**Abrams** · in the game today — peaks mid, one target; mix tank 3 · damage 2 · control 1 · support 0  
HP 7 · Attack 2 · Retreat 2 · per level +1 Attack +2 HP
- Passive — **Infernal Resilience**: At the start of your turn, if Abrams is Active, he heals 2.
- Ultimate, medium, waits 6 — **Seismic Impact**: Deal 6✦ spirit damage to the enemy Active. Stun it 1 turn.
- Why: Abrams is the slow frontliner who heals back what he takes and crashes onto one target to pin it and punch it out.
- Changed from today: Attack 1 to 2 and HP 5 to 7 by the formulas (mostly melee, damage 2, tank 3); passive heal 1 to 2 to reach the passive budget. Seismic Impact drops the hit on every enemy for a bigger hit on the Active alone (reach one), so it becomes medium.

**Mo & Krill** · in the game today — peaks late, one target; mix tank 3 · damage 1 · control 3 · support 0  
HP 6 · Attack 1 · Retreat 1 · per level +3 HP +1 Spirit
- Skill, waits 3 — **Sand Blast**: Deal 1✦ spirit damage to the enemy Active and Disarm it 1 turn.
- Ultimate, medium, waits 6 — **Combo**: Deal 4✦ spirit damage to the enemy Active, healing that much. Stun it 1 turn.
- Why: Mo & Krill pop up under the enemy carry, blind it so it can't shoot, then stun it and drain it dry.
- Changed from today: HP 7 to 6 (late -1); the cleanse passive becomes Sand Blast because control 3 needs control in the skill. Combo drain 6✦ to 4✦ to fit medium.

**Viscous** · in the game today — peaks mid, many targets; mix tank 2 · damage 1 · control 3 · support 2  
HP 6 · Attack 1 · Retreat 1 · per level +2 HP +1 Spirit
- Skill, waits 4 — **The Cube**: Cube one of your heroes: it takes no damage until your next turn.
- Ultimate, medium, waits 6 — **Goo Ball**: Deal 2✦ spirit damage to every enemy. Stun the enemy Active 1 turn.
- Why: Viscous saves his carry inside The Cube and bowls the enemy team over with Goo Ball, but deals little damage himself.
- Changed from today: HP 4 to 6 and Attack 2 to 1 to match tank 2, damage 1. His skill becomes The Cube, his signature, so his hard control lives only in Goo Ball (an exception to the control-3 rule). Goo Ball drops its Unstoppable and its damage goes 3 to 2.

**Billy** — peaks mid, many targets; mix tank 2 · damage 2 · control 3 · support 0  
HP 6 · Attack 2 · Retreat 1 · per level +1 Attack +1 HP +1 Spirit
- Skill, waits 4 — **Bashdown**: Slam the bat down: deal 1✦ spirit damage to every enemy, and the enemy Active is pulled down: Rooted 1 turn.
- Ultimate, large, waits 8 — **Chain Gang**: Root every enemy 2 turns. Deal 3✦ spirit damage to each.
- Why: The punk goat rams in, slams everyone, and chains the whole enemy team to himself so nobody escapes the beating.

**Rat King** — peaks early, many targets; mix tank 3 · damage 2 · control 1 · support 2  
HP 8 · Attack 2 · Retreat 2 · per level +1 Attack +1 HP
- Skill, waits 4 — **Rat Swarm**: Rats leap on every enemy: Bleed 1 for 1 turn. The enemy Active also loses 1 Bullet Resist for 2 turns.
- Ultimate, medium, waits 6 — **Rule, Ratannia!**: Deal 2✦ spirit damage to every enemy. Shield 2 on your heroes.
- Why: The tanky early-game brawler: rats strip bullet resist for his shotgun and the banner wins the teamfight, but his small growth falls off late.

**Victor** — peaks late, many targets; mix tank 3 · damage 2 · control 0 · support 0  
HP 6 · Attack 1 · Retreat 2 · per level +3 HP +1 Spirit
- Passive — **Aura of Suffering**: While Victor is Active, at the start of your turn deal 1 spirit damage to every enemy and to Victor.
- Charged ultimate, medium, 10 damage taken — **Shocking Reanimation**: When Victor falls, you may use this: he revives where he is with half HP. *Ready once Victor has taken 10 damage.*
- Why: The tank who won't die: his aura burns everyone, himself included, and every hit he soaks up brings his revive closer.


### Bruiser (6)

**Lady Geist** · in the game today — peaks early, one target; mix tank 2 · damage 3 · control 0 · support 0  
HP 7 · Attack 1 · Retreat 2 · per level +2 Spirit
- Skill, waits 3 — **Essence Bomb**: Lady Geist pays 2 HP: deal 4✦ spirit damage to the enemy Active.
- Ultimate, medium, waits 6 — **Soul Exchange**: Swap HP with the enemy Active. Deal 3✦ spirit damage to it.
- Why: Lady Geist bleeds herself to bomb the whole enemy side, and the lower she drops, the harder Soul Exchange flips the duel.
- Changed from today: HP 4 to 7 (tank 2, early +1 on HP since she is a spirit hero); the single-target drain becomes Essence Bomb so her reach is both. Soul Exchange adds 3✦ so it always does something and can finish a kill.
- **Changed 2026-11-16 (Patrick): "Lady Geist's bomb should just be a single target: she just bombed the Active."** Deadlock's Essence Bomb is a one-target nuke she pays health for. Her reach becomes one. Then: "but she should deal more damage." She pays 2 HP for 4✦: 4 less the 2 HP (0.5 each at the heal rate) is 3.0, the top of a wait-3 skill's 2–3; the area bomb it replaces was 1✦ on every enemy for 1 HP, 2.5 − 0.5 = 2.0. The HP she pays also lowers her for Soul Exchange. With a skill's Spirit counted twice (balance-model.md §10) it is 4 at Level 1, 8 at Level 2 and 12 at Level 3. Hitting more than the Active is for the range items (card-design.md, Mystic Expansion), not the skill.

**Shiv** · in the game today — peaks late, one target; mix tank 2 · damage 3 · control 0 · support 0  
HP 6 · Attack 1 · Retreat 1 · per level +2 Attack +1 HP +1 Spirit
- Skill, 2 charges, 3 turns each — **Serrated Knives**: Deal 1✦ spirit damage to the enemy Active and Bleed 1 for 2 turns.
- Ultimate, medium, waits 6 — **Killing Blow**: Deal 5✦ spirit damage to the enemy Active. Knock it out if below half HP.
- Why: Shiv bleeds one target down with knives, then leaps in to execute it once it drops below half.
- Changed from today: Attack 2 to 1 and HP 5 to 6: a damage tank who starts slow and grows +2 Attack a level. Today's free Bleed 2 on every attack was over budget, so the bleed moves to the Serrated Knives skill.

**Warden** · in the game today — peaks early, one target; mix tank 2 · damage 2 · control 1 · support 0  
HP 7 · Attack 2 · Retreat 1 · per level +1 Attack +1 HP
- Skill, waits 3 — **Willpower**: Shield 2 on Warden, and Swift.
- Ultimate, medium, waits 6 — **Last Stand**: Deal 6✦ spirit damage to the enemy Active. Warden heals that much.
- Why: Warden is half tank, half gun: he shields up, outshoots the enemy front and drains it to heal through a long duel.
- Changed from today: HP 5 to 7 (tank 2, and the early +1 goes on HP since Attack caps at 2). Willpower gains Swift for its speed burst. Last Stand is one drain of 6✦ from the enemy Active instead of a 3-turn channel on everyone.
- **Changed 2026-11-16 (Patrick): "Warden is pretty strong."** Willpower's Shield goes from 3 to 2. Since the second swing (balance-model.md §9) Swift is a free Retreat, worth its soul and its swap (1.5), so Shield 3 (0.6 × 3 = 1.8) put the skill at 3.3, over a wait-3 skill's 2–3; Shield 2 (1.2) brings it to 2.7. HP 7 and Attack 2 stay: the rules set them (tank 2, early +1 on HP since Attack caps at 2).

**Baba** — peaks mid, one or many; mix tank 2 · damage 2 · control 2 · support 0  
HP 6 · Attack 1 · Retreat 1 · per level +1 HP +2 Spirit
- Skill, waits 3 — **Threadsap**: A yarn thread steals Spirit: the enemy Active gets -1 Spirit and Baba +1 Spirit, both for 2 turns.
- Ultimate, medium, waits 6 — **Feed The Birds**: Deal 2✦ spirit damage to every enemy. Silence the enemy Active 2 turns.
- Why: The front-line hexer saps enemy Spirit to fuel her own, then pigeon-bombs the whole team and hexes their Active silent.

**Infernus** — peaks mid, many targets; mix tank 1 · damage 3 · control 1 · support 0  
HP 5 · Attack 1 · Retreat 0 · per level +1 Attack +1 HP +1 Spirit
- Passive — **Afterburn**: His attacks set the target burning: Bleed 2 for 1 turn.
- Ultimate, medium, waits 6 — **Concussive Combustion**: Deal 3✦ spirit damage to every enemy. Stun the enemy Active 1 turn.
- Why: The fire guy: his gun keeps you burning, Flame Dash makes his retreat free, and Concussive Combustion blows up mid-team with a stun.

**Silver** — peaks mid, one target; mix tank 2 · damage 3 · control 1 · support 0  
HP 6 · Attack 2 · Retreat 1 · per level +2 Attack +1 HP
- Skill, waits 3 — **Boot Kick**: Deal 1 bullet damage to the enemy Active. It is Vulnerable 2 turns.
- Charged ultimate, medium, 8 damage dealt — **Lycan Curse** (Wolf form, with her wolf-form art): Silver turns into a wolf for 2 turns: +3 Attack and Shield 6. *Ready once Silver has dealt 8 damage.*
- Why: She kick-marks one target and shotguns it; the more she hurts the enemy, the sooner she turns wolf for a shielded melee burst.


### Gun carry (3)

**Haze** · in the game today — peaks late, one target; mix tank 0 · damage 3 · control 0 · support 0  
HP 4 · Attack 1 · Retreat 1 · per level +3 Attack +1 HP
- Passive — **Fixation**: Haze's attacks deal +1 bullet damage to an enemy below full HP.
- Ultimate, large, waits 8 — **Bullet Dance**: Deal Haze's Attack as bullet damage to every enemy.
- Why: Haze is the late carry: weak at Level 1, then Fixation keeps biting at whoever she has hurt, and a late Bullet Dance shreds the whole enemy team.
- Changed from today: Attack 3 to 1 and HP 5 to 4: she starts weak and grows +3 Attack a level. The Level 3 extra attack becomes Fixation, her real passive. Bullet Dance now uses her Attack, so it grows as she does.
- **Changed 2026-11-16 (Patrick): "some passives are too complicated — Haze can just be +X when the target is damaged."** Fixation was a stack on her target for each swing (max 2, +1 bullet damage a stack, gone when it left the lane). Now it is one line, the mirror of Headshot Booster's "+2 to an enemy at full HP": +1 to an enemy below full HP. **The number** keeps the value: at Attack 1 the stacks dealt 1, 2, 3 over three swings at one hero (6); the bonus deals 1, 2, 2 (5) when her first swing finds the hero whole, and 2, 2, 2 (6) when someone has hurt it first. A passive is worth 1–2 points an own turn, and this sits at about 1, where Fixation did. There is no status any more: nothing to read on the target.

**Wraith** · in the game today — peaks late, one target; mix tank 0 · damage 3 · control 1 · support 0  
HP 4 · Attack 1 · Retreat 0 · per level +3 Attack +1 HP
- Skill, waits 3 — **Full Auto**: Wraith gets +2 Attack for 2 turns.
- Ultimate, medium, waits 6 — **Telekinesis**: Deal 5✦ spirit damage to the enemy Active. Stun it 1 turn.
- Why: Wraith starts as the weakest gun on the board, then grows the most Attack, spins up Full Auto and wins any one-on-one, lifting her target out of the fight.
- Changed from today: Attack 2 to 1 and HP 6 to 4 (tank 0, late -1 off Attack); the spirit-on-hit passive becomes Full Auto. Telekinesis hits a little harder, 4✦ to 5✦.

**Vyper** — peaks late, one target; mix tank 1 · damage 3 · control 1 · support 0  
HP 5 · Attack 1 · Retreat 0 · per level +3 Attack +1 HP
- Skill, waits 3 — **Lethal Venom**: Poison any enemy hero: deal 1✦ spirit damage, or 2✦ if it is below half HP.
- Ultimate, small, waits 4 — **Petrifying Bola**: Deal 2✦ spirit damage to the enemy Active. Stun it 1 turn.
- Why: A weak-lane gunner who grows into a big late-game gun, slides out for free, and poisons runners even after they flee to the bench.


### Marksman (4)

**Vindicta** · in the game today — peaks early, one target; mix tank 0 · damage 3 · control 0 · support 0  
HP 5 · Attack 2 · Retreat 0 · per level +2 Attack
- Skill, 2 charges, 5 turns each — **Assassinate**: Snipe any enemy, bench too: deal 4✦ spirit damage.
- Ultimate, small, waits 4 — **Flight**: Fly 3 turns: 1 in 3 hits miss her; her attacks add 1✦ spirit damage.
- Built so on 2026-11-16 (Patrick). Until then Flight was her passive (1✦ on each swing) and Assassinate her ultimate (medium: 8✦ to any enemy). The reasoning is in "Vindicta: the snipe and Flight" at the end.
- Why: Vindicta floats out of reach adding spirit damage to her rifle, then snipes any wounded hero on the board, bench included.
- Changed from today: Stats stay 2/5 (Attack capped at 2, so the early +1 goes on HP). The bullet-resist passive becomes Flight's real effect, bonus spirit damage on her shots; Assassinate becomes a flat 8✦ on any enemy.

**Grey Talon** — peaks late, one target; mix tank 1 · damage 3 · control 1 · support 0  
HP 4 · Attack 1 · Retreat 1 · per level +1 HP +3 Spirit
- Skill, waits 3 — **Charged Shot**: A long-range charged arrow: deal 3✦ spirit damage to the enemy Active.
- Ultimate, medium, waits 6 — **Guided Owl**: Deal 5✦ spirit damage to any enemy. Stun it 1 turn.
- Why: The archer pokes the front line from range and sends his owl across the map to stun and finish whoever is hurt.

**Holliday** — peaks early, one or many; mix tank 1 · damage 3 · control 1 · support 0  
HP 6 · Attack 2 · Retreat 0 · per level +1 Attack +1 Spirit
- Skill, waits 4 — **Powder Keg**: Throw an explosive barrel: deal 1✦ spirit damage to every enemy, and the enemy Active burns: Bleed 1 for 2 turns.
- Ultimate, small, waits 4 — **Spirit Lasso**: Pull an enemy bench hero into Active. Deal 3✦ spirit damage to it.
- Why: The trick-shooting cowgirl bullies the lane with headshots and barrels, then lassos a hiding carry into the open for her team to gun down.

**Venator** — peaks mid, one target; mix tank 1 · damage 3 · control 1 · support 0  
HP 5 · Attack 2 · Retreat 1 · per level +2 Attack +1 HP
- Skill, waits 3 — **Hex-Lined Snap Trap**: Kick a trap under the enemy Active: Root it 1 turn and reveal it: Vulnerable 1 turn.
- Ultimate, medium, waits 6 — **Ira Domini**: Venator attacks the enemy Active 2 more times.
- Why: The monster hunter snap-traps one target, then fires two more holy stakes into it.


### Spirit caster (4)

**Seven** · in the game today — peaks late, many targets; mix tank 1 · damage 3 · control 1 · support 0  
HP 4 · Attack 1 · Retreat 1 · per level +1 HP +3 Spirit
- Skill, waits 4 — **Static Charge**: Deal 1✦ spirit damage to the enemy Active. After its next turn, it is Stunned 1 turn.
- Ultimate, large, waits 8 — **Storm Cloud**: Channel 2 turns: at each turn's end, deal 2✦ spirit damage to every enemy.
- Why: Seven is the easy spirit carry who zaps grouped enemies all game and wins late teamfights with a storm that hits the whole team.
- Changed from today: Attack 2 to 1 (spirit hero; HP stays 4 after the late -1). Static Charge's delayed stun gave way to Lightning Ball because control 1 allows little control; Storm Cloud is one hit on every enemy instead of a 3-turn channel.
- **Changed 2026-11-15 (Patrick: "Seven's stun… I can play Debuff Remover to counter it"; "Seven will be channelling for 2 or 3 turns… I can use Knockdown to counter it"):** both came back, as effects the enemy can answer.
  - Static Charge: 1✦ now (1 point, growing with Spirit) and a Stun that lands after the enemy's next turn. A Stun is 3 points; delayed and answerable (Dispel Magic, Debuff Reducer, a Retreat) it counts half, 1.5. 2.5 points at Level 1: a turn denied, so it waits 4. It holds no charges, as in Deadlock.
  - Storm Cloud: 2 pulses of 2✦. Base 4 on every enemy is 10 points against the single hit's 12.5, but Spirit counts twice: at Level 2 (Spirit 3) 5 + 5 against 8, at Level 4 (Spirit 9) 11 + 11 against 14. The first pulse lands as the turn he starts it ends; the second only if the enemy has not stunned him in between, about 0.6 of the time, so it is worth 5 + 3 = 8 at Level 2 and 11 + 6.6 = 17.6 at Level 4: the single hit's value when answered as often as that, more when ignored, and Seven is locked for both turns.
  - His control stays 1: the Stun is his only control and the enemy can take it off.

**Celeste** — peaks early, many targets; mix tank 0 · damage 3 · control 0 · support 0  
HP 5 · Attack 1 · Retreat 0 · per level +2 Spirit
- Skill, waits 4 — **Radiant Daggers**: Beams of light crash down on the enemy team: deal 1✦ spirit damage to every enemy, and Celeste gets +1 Spirit for 2 turns.
- Ultimate, medium, waits 6 — **Shining Wonder**: Deal 4✦ spirit damage to every enemy.
- Why: The floaty carnival caster is hard to catch, stacks power with every hero she hits, and her bouncing orb shreds a bunched-up team; her early +1 goes on HP for the barrier she lives on.

**Graves** — peaks mid, many targets; mix tank 1 · damage 2 · control 2 · support 0  
HP 5 · Attack 1 · Retreat 1 · per level +1 HP +2 Spirit
- Skill, waits 4 — **Grasping Hands**: Deal 1✦ spirit damage to the enemy Active and Root it 1 turn. Shuffle 2 Ghouls into your deck.
- Ultimate, small, waits 4 — **Borrowed Decree**: Raise a Gravestone on your bench: each turn it shuffles a Ghoul into your deck.
- Why: The necromancer traps the lane and raises the dead. Her Ghouls are cards (Patrick, 2026-11-16): she fills her own deck with them, and each one that dies takes a card off the enemy's.
- Built 2026-11-16 to Patrick's design; this replaces the proposal of 2026-11-09 (Essence Theft and a Borrowed Decree that hit every enemy). The reasoning is in "Units, the mill and Graves" at the end.

**Mina** — peaks late, one target; mix tank 0 · damage 3 · control 0 · support 0  
HP 4 · Attack 1 · Retreat 0 · per level +1 HP +3 Spirit
- Skill, waits 3 — **Rake**: Umbrella slash: deal 2✦ spirit damage to the enemy Active, or 3✦ if it is below half HP.
- Ultimate, medium, waits 6 — **Nox Nostra**: Deal 7✦ spirit damage to the enemy Active. Silence it 1 turn.
- Why: The most fragile hero in the game pokes from the bench with Rake, bats away for free, and scales late into a burst that silences casters.


### Assassin (8)

**Drifter** · in the game today — peaks mid, one target; mix tank 2 · damage 3 · control 1 · support 0  
HP 6 · Attack 2 · Retreat 1 · per level +2 Attack +1 HP
- Passive — **Bloodscent**: His attacks deal +2 bullet damage to a hero below half HP.
- Ultimate, medium, waits 6 — **Eternal Night**: Deal 5✦ spirit damage to the enemy Active. It takes +1 damage for 3 turns.
- Why: Drifter is the stalker who smells blood: he hits wounded heroes harder and traps one target alone in the dark.
- Changed from today: Attack 3 to 2 (the Level 1 cap) and HP 5 to 6 (tank 2); lifesteal becomes his real Bloodscent passive. Eternal Night now hits one target and leaves it taking +1 damage, instead of silencing two heroes.
- **Changed 2026-11-16 (Patrick: long passives and skills say one rule; Mirage's Djinn's Mark is kept as it is, its own mechanic).** Bloodscent was +1 to a hero below half HP and +1 Attack for the game for each knockout while he was Active (max +2). It is now one rule, +2 to a hero below half HP. The knockouts came in the second half of a match, so the Attack they gave was worth about one more point on the swings that finish a hero, which is where the second point now goes. A passive is worth 1–2 points an own turn; at about half his swings below half, +2 is about 1.

**Lash** · in the game today — peaks mid, many targets; mix tank 1 · damage 2 · control 3 · support 0  
HP 5 · Attack 1 · Retreat 0 · per level +1 HP +2 Spirit
- Skill, waits 4 — **Ground Strike**: Deal 1✦ spirit damage to every enemy. Root the enemy Active 1 turn.
- Ultimate, large, waits 8 — **Death Slam**: Deal 3✦ spirit damage to every enemy. Stun each 1 turn.
- Why: Lash drops from the sky onto the whole enemy line, pins the Active so it can't escape his chase, then lifts and slams their entire team.
- Changed from today: HP 4 to 5 (tank 1); the Vulnerable skill becomes Ground Strike with a root because control 3 needs hard control in the skill. Death Slam now stuns every enemy instead of only the Active, trading some damage for it.

**Mirage** · in the game today — peaks late, one target; mix tank 1 · damage 2 · control 1 · support 0  
HP 4 · Attack 1 · Retreat 0 · per level +1 Attack +1 HP +2 Spirit
- Passive — **Djinn's Mark**: Each attack adds a Djinn's Mark to the target (max 3). The third mark detonates them all: deal 4✦ spirit damage.
- Ultimate, small, waits 4 — **Traveler**: Swap Mirage with a bench ally. Both get Shield 2.
- Why: Mirage stacks marks on one target with his shots and pops them for spirit damage, and Traveler whisks him out while shielding whoever steps in.
- Changed from today: Attack 3 to 1 and HP 6 to 4 (spirit-leaning hybrid, tank 1, late -1); Djinn's Mark paid 3 per stack, over budget, so it now pops at 3 marks for 4✦. Traveler now shields both heroes in the swap.

**Yamato** · in the game today — peaks mid, one target; mix tank 1 · damage 3 · control 0 · support 0  
HP 5 · Attack 2 · Retreat 0 · per level +1 Attack +1 HP +1 Spirit
- Skill, waits 3 — **Flying Slash**: Deal 2✦ spirit damage to any enemy, bench too.
- Ultimate, medium, waits 6 — **Shadow Transformation**: For 2 turns: +3 Attack and Unstoppable.
- Why: Yamato grapples onto whoever retreats to the back and is nearly impossible to kill or lock down while transformed.
- Changed from today: HP 6 to 5 (tank 1). Her skill becomes Flying Slash at 2✦ melee for 2 souls (was 1✦). Shadow Transformation drops the heal 5 and gives 2 turns of +3 Attack and Unstoppable.

**Apollo** — peaks early, one target; mix tank 1 · damage 3 · control 1 · support 0  
HP 5 · Attack 2 · Retreat 0 · per level +1 Attack +1 Spirit
- Passive — **Riposte**: Apollo takes 1 less bullet damage. When the enemy Active attacks him, he deals 1 bullet damage back.
- Ultimate, medium, waits 6 — **Itani Lo Sahn**: Deal 8✦ spirit damage to the enemy Active.
- Why: The fencer who ruled early games parries and punishes every swing (so his early +1 goes on Attack), then cuts one target down in a single slow-motion slash.

**Calico** — peaks mid, one target; mix tank 0 · damage 3 · control 0 · support 0  
HP 4 · Attack 1 · Retreat 0 · per level +1 HP +2 Spirit
- Skill, waits 3 — **Ava**: Use from the bench: Calico rides Ava into the Active slot, swapping with your Active, and deals 1✦ spirit damage to the enemy Active.
- Ultimate, medium, waits 6 — **Return to Shadows**: Deal 4✦ spirit damage to any two enemies.
- Why: Calico slips in from the shadows on her cat and bursts the two squishiest heroes, bench included.

**Deadman Danny** — peaks mid, many targets; mix tank 1 · damage 3 · control 1 · support 0  
HP 5 · Attack 2 · Retreat 0 · per level +1 Attack +2 Spirit
- Skill, waits 3 — **Chimera Mk1**: Jetpack dive-bomb: Danny loses 1 HP, then deals 1✦ spirit damage to every enemy, and the enemy Active is Vulnerable 1 turn.
- Ultimate, medium, waits 6 — **Close The Deal**: Deal 6✦ spirit damage to the enemy Active and 1✦ to the rest.
- Why: The jetpack bomber piledrives one target and splashes the rest of the team; Attack 2 because he fights with the rocket launcher first and grows into spirit.

**Pocket** — peaks mid, many targets; mix tank 1 · damage 3 · control 0 · support 0  
HP 5 · Attack 1 · Retreat 0 · per level +1 HP +2 Spirit
- Skill, waits 3 — **Barrage**: Rain spirit shots: deal 1✦ spirit damage to every enemy.
- Ultimate, medium, waits 6 — **Affliction**: Every enemy bleeds 2 a turn for 2 turns.
- Why: Dives in, blows up the whole group with Barrage, curses everyone with a bleeding Affliction, and slips away for free.


### Support (7)

**Dynamo** · in the game today — peaks mid, many targets; mix tank 1 · damage 1 · control 2 · support 3  
HP 5 · Attack 1 · Retreat 1 · per level +1 HP +2 Spirit
- Skill, waits 4 — **Rejuvenating Aurora**: Your heroes heal 5✦ each.
- Ultimate, large, waits 8 — **Singularity**: Stun every enemy 1 turn. Deal 2✦ spirit damage to each.
- Why: Dynamo keeps his whole team standing with Rejuvenating Aurora, and one Singularity stuns everyone.
- Changed from today: Attack 3 to 1 and HP 6 to 5 (spirit hero, tank 1). Singularity is one turn that stuns every enemy instead of a 3-turn channel.
- **Changed 2026-11-16 (Patrick): "Dynamo skill should be the healing aura, which should heal a lot cuz most of time it is gonna be the active hero got hurt, but still should be an AoE heal."** Kinetic Pulse (1 spirit damage to every enemy and a Disarm on the Active, 2 charges) gives way to Deadlock's Rejuvenating Aurora, his heal on himself and every ally near him. The mix goes control 3 · support 2 → control 2 · support 3: his control is Singularity's now.
  - **The number.** Priced on the hero it mostly lands on, the hurt Active: 5 + Spirit, 6.5 at the budget's Spirit 1.5, is 3.3 points there alone. Read as an area heal the way Healing Nova is (each hero × 0.4 for the share of an area heal that lands): (5 + 1.5) × 3 × 0.5 × 0.4 = 3.9. A skill that waits 4 is worth 3–4.5, so it sits at the top of that band, which is "a lot": 5 at Level 1, 9 at Level 3, against Kelvin's Frost Grenade's 1 + Spirit and Healing Nova's 5.
  - **The wait.** 4 turns, the heavier skills' wait, and no charges: Deadlock gives it none (48 s, Dynamo's longest cooldown), and Kinetic Pulse's two were its own.
  - Healing Tempo (card-design.md, 2026-11-16) turns the heal into tempo: a hero it heals that wears it swings harder this turn and retreats for nothing.

**Kelvin** · in the game today — peaks mid, many targets; mix tank 2 · damage 1 · control 2 · support 3  
HP 6 · Attack 1 · Retreat 1 · per level +1 HP +2 Spirit
- Skill, 2 charges, 4 turns each — **Frost Grenade**: Deal 1 spirit damage to every enemy. Your heroes heal 1✦ each.
- Ultimate, medium, waits 6 — **Frozen Shelter**: Heal your heroes 4✦. Root the enemy Active 2 turns.
- Why: Kelvin heals his whole team and chills every enemy with each grenade, and his dome both saves his side and traps their Active.
- Changed from today: Attack 2 to 1 (spirit, damage 1), HP stays 6; Frost Grenade now hits every enemy and heals the whole team (reach many). Frozen Shelter's flat heal 7 becomes 4✦ plus a root, which gives control 2 its control in the ultimate.

**Paige** · in the game today — peaks early, many targets; mix tank 0 · damage 1 · control 1 · support 3  
HP 5 · Attack 1 · Retreat 1 · per level +2 Spirit
- Skill, waits 3 — **Plot Armor**: Give one of your heroes Shield 2✦ and +1 Attack for 2 turns.
- Ultimate, medium, waits 6 — **Rallying Charge**: Heal your heroes 3✦. Deal 2✦ spirit damage to every enemy.
- Why: Paige is the safe backline support who shields her carry and boosts its gun, and her knights heal the team and hit every enemy from anywhere.
- Changed from today: Attack 2 to 1 and HP 4 to 5 (spirit support, early +1 on HP); Plot Armor's real gun boost replaces bullet resist. Rallying Charge trimmed from heal 4 and 4✦ to 3✦ and 2✦, so it fits medium for a damage-1 hero.

**Rem** · in the game today — peaks late, one target; mix tank 0 · damage 0 · control 1 · support 3  
HP 4 · Attack 1 · Retreat 0 · per level +1 HP +3 Spirit
- Skill, waits 3 — **Tag Along**: Rem rides on one of your heroes for 2 turns, healing it 4✦, then returns to your bench.
- Ultimate, small, waits 4 — **Naptime**: Sleep the enemy Active 2 turns.
- Why: Rem is the tiny support who rides on her allies to heal them and sends the enemy Active to sleep, and her Spirit growth makes both strong late. She stands in the lane like any hero, and riding off is her way out of a lane she is losing.
- Changed from today: Stats stay 1/4: the late -1 cannot be paid because HP 4 and Attack 1 are both at the floor. Rem is no longer bench-only (Patrick, 2026-11-09). Tag Along keeps the ride (the old merge) but drops its max-HP buff for a plain heal on the bearer, lasts 2 turns and works from the lane too; Naptime becomes small, just the 2-turn sleep, since her damage score is 0.

**Ivy** — peaks mid, one target; mix tank 0 · damage 1 · control 1 · support 3  
HP 4 · Attack 1 · Retreat 0 · per level +1 HP +2 Spirit
- Skill, waits 3 — **Kudzu Connection**: Tether to an ally: it heals 2✦ and gets +1 Attack for 2 turns.
- Ultimate, medium, waits 6 — **Air Drop**: Swap in a bench ally. Deal 6✦ spirit damage to the enemy Active.
- Why: Ivy's whole job is one carry: she tethers and heals it, then flies it into the fight with a bomb.

**Nurse Harrow** — peaks mid, many targets; mix tank 1 · damage 1 · control 2 · support 3  
HP 5 · Attack 1 · Retreat 1 · per level +1 HP +2 Spirit
- Skill, waits 3 — **Healing Needles**: Heal your Active 2✦ and each bench ally 1.
- Ultimate, medium, waits 6 — **Lurking Terrors**: Deal 2✦ spirit damage to every enemy. Silence each 1 turn.
- Why: She keeps the whole team topped up with Healing Needles and breaks a fight by terrifying every enemy into silence.

**Violet** — peaks mid, one or many; mix tank 0 · damage 1 · control 2 · support 3  
HP 4 · Attack 1 · Retreat 1 · per level +1 HP +2 Spirit
- Skill, waits 3 — **Living Ink**: Paint an ink wall before an ally: Shield 2✦, and its bullets are empowered: +1 Attack for 2 turns.
- Ultimate, medium, waits 6 — **Abstract Landscape**: For 2 turns: root the enemy Active; every enemy takes +1 damage.
- Why: The nimble painter guards and empowers one ally with Living Ink, then paints a circle that lifts her team's Spirit and traps the enemy inside.


### Controller (6)

**Sinclair** · in the game today — peaks mid, one target; mix tank 0 · damage 1 · control 3 · support 1  
HP 4 · Attack 1 · Retreat 1 · per level +1 HP +2 Spirit
- Skill, waits 4 — **Rabbit Hex**: Turn the enemy Active into a Rabbit for 1 turn.
- **Changed 2026-11-16 (Patrick: one rule).** The "+1 damage" rider is gone: the Rabbit is the turn denied (no attack, no abilities), 3 points by itself, which is the 3–4.5 of a skill that waits 4.
- Ultimate, medium, waits 6 — **Audience Participation**: Cast the enemy Active's ultimate as Sinclair's own.
- Why: The magician turns the enemy front-liner into a bunny and steals the enemy's best ultimate: tricky and swingy, with little damage of their own.
- Changed from today: The 2✦ poke (Vexing Bolt) is replaced by Rabbit Hex, the engine's rabbit, because control 3 needs hard control in the skill; Audience Participation casts the copied ultimate right away instead of saving it.

**Bebop** — peaks mid, one target; mix tank 2 · damage 2 · control 3 · support 0  
HP 6 · Attack 1 · Retreat 2 · per level +1 HP +2 Spirit
- Skill, waits 4 — **Grapple Arm**: Hook an enemy bench hero into the Active slot; it's Rooted 1 turn. Or hook an ally: swap your Active with a bench ally.
- Ultimate, medium, waits 6 — **Hyper Beam**: Deal 5✦ spirit damage to the enemy Active. Root it 2 turns.
- Why: Land the hook and the enemy's hidden carry is dragged to the front and pinned under the beam; the same hook can yank an ally out of trouble.

**McGinnis** — peaks mid, many targets; mix tank 1 · damage 2 · control 3 · support 1  
HP 5 · Attack 1 · Retreat 2 · per level +1 HP +2 Spirit
- Skill, waits 4 — **Mini Turret**: Drop a turret on the enemy Active: deal 1✦ spirit damage now, Bleed 1 for 1 turn, and Root it 1 turn so it can't retreat.
- Ultimate, large, waits 8 — **Heavy Barrage**: Deal 4✦ spirit damage to every enemy. Root the enemy Active 2 turns.
- Why: Turret lady holds a kill zone: the turret pins the enemy Active in place under fire, and Heavy Barrage pounds the whole team.

**Paradox** — peaks late, one target; mix tank 1 · damage 2 · control 3 · support 0  
HP 4 · Attack 1 · Retreat 1 · per level +1 Attack +1 HP +2 Spirit
- Skill, waits 4 — **Kinetic Carbine**: Charged shot: deal 1✦ spirit damage to the enemy Active and Stun it 1 turn, frozen in time.
- Ultimate, medium, waits 6 — **Paradoxical Swap**: Pull an enemy bench hero into Active. Deal 6✦ spirit damage to it.
- Why: She freezes one enemy with Kinetic Carbine and swaps the enemy carry out of the backline into her team; weak early, scary late.

**Solomon** — peaks mid, many targets; mix tank 1 · damage 2 · control 3 · support 1  
HP 5 · Attack 1 · Retreat 1 · per level +1 HP +2 Spirit
- Skill, waits 4 — **Rook Battery**: Two rooks roll out: deal 1✦ spirit damage to every enemy, and the enemy Active is Rooted 1 turn.
- Ultimate, medium, waits 6 — **Develop Queen**: Root every enemy 1 turn. Deal 2✦ spirit damage to each.
- Why: The chess master lays out the board: rooks pin the enemy Active, then the queen pins their whole team and hits every piece.

**The Doorman** — peaks mid, one or many; mix tank 1 · damage 1 · control 3 · support 0  
HP 5 · Attack 1 · Retreat 0 · per level +1 HP +2 Spirit
- Skill, waits 4 — **Luggage Cart**: The cart runs over every enemy: deal 1✦ spirit damage, then swap the enemy Active with an enemy bench hero you pick.
- Ultimate, medium, waits 6 — **Hotel Guest**: Deal 4✦ spirit damage to any enemy. Sleep it 2 turns.
- Why: Doors make his retreat free, the cart reshuffles the enemy line, and Hotel Guest checks their carry out of the fight for two turns.

## As built (2026-11-09)

Built on `deck-and-heroes` for the 19 heroes in the game today. Every card plays as section 8
writes it; where the doc is silent or two rules meet, the build reads it this way:

**The rules**
- **Waits.** "Then waits N turns" is the engine's cooldown N, the reading the draw cards' "waits
  2 turns" already has: ready again on the hero's Nth own turn after the use, and the sheet says
  "Ready in N turns". Since 2026-11-15 the waits are a kit's whole price: a skill waits
  `SKILL_COOLDOWN` 3 (4 where its data says so), an ultimate `ULT_WAIT` 4 / 6 / 8 by its card's
  size, after each use and from the match's first turn (`armUltWaits`). `ULT_UNLOCK_LEVEL` 2 is
  unchanged. (As built on 2026-11-09: `SKILL_COOLDOWN` 1, `ULT_COOLDOWN` 3.)
- **Prices.** None since 2026-11-15: `kitCost` is 0 for every skill and ultimate, and `ULT_COST`
  is gone. A side uses one ultimate a turn (`G.ultUsed`, refused as `'ultUsed'`). A charged skill
  (`AbilityDef.charges`) records its spent charges on the hero (`chargesSpent`); its wait brings
  them back one at a time, and only the charge items (Extra Charge, Rapid Recharge) add a charge
  or shorten that wait. Echo Shard's repeat of a skill is the item's own effect: it spends no charge
  and starts no wait. (As built on 2026-11-09: a skill's `souls`, an ultimate's `ULT_COST` 4, 8,
  12, both paid from the same souls as items.)
- **Retreat.** `RETREAT_COST` is gone: a Retreat costs the leaving hero's printed `retreat`, less
  Sprint Boots and the like, and nothing while it is Swift. Rem's 0 applies since she stands in the
  lane (2026-11-09; she was bench-only until then).
- **Growth.** The flat +1/+1/+1 a level is gone: a level adds the card's `growth`. Rem keeps the
  floors (Attack 1, HP 4) and so a point more at Level 2, as section 7 says.
- **Stun at 3 points.** The clash with balance-model.md and CLAUDE.md (2.0) is left as it is: these
  cards follow this doc's prices, and no number in the engine reads either figure (the AI's own
  status weights are unchanged).
- **Unstoppable** is this doc's word: no stun, sleep, root, silence or disarm (it still cleanses
  them as it lands) — it no longer stops damage. Taking no damage is a status of its own,
  **Invulnerable** (The Cube's). The two items that made a hero untouchable, Unstoppable and Prism
  Blast, now give both, so they play exactly as before, and their text says so.
- **Sleep** is a Stun for its turns: damage no longer wakes it, and there is no wake-up burst.
- **"Takes +1 damage"** is Bullet Resist −1 and Spirit Resist −1 together. Statuses on an enemy
  tick at the start of its turns, so "for 3 turns" (Eternal Night) covers the rest of the caster's
  turn and its next two, and "for 1 turn" (Rabbit Hex) the rest of the turn it is cast.
- **"The enemy Active"** in a skill or ultimate that also hits every enemy (Ground Strike, Kinetic
  Pulse, Goo Ball, Frozen Shelter) is the hero standing there when it is used: a hero the damage
  fells is not replaced by the one promoted into its slot.
- **"Attack"** in card text (Full Auto, Plot Armor, Shadow Transformation, Bloodscent) is Bullet
  Power: a `weapon_power` buff, or for Bloodscent's knockouts the hero's own modifier.
- **No Weakness** anywhere: the cards have no such field.

**The heroes**
- **Viscous — The Cube.** Invulnerable for 1 turn on any hero of his side, himself included: it
  covers the rival's turn and is gone when his side's next turn begins. With a 1-turn wait he can
  cube the same hero every turn for 3 of the turn's 5 souls, so one hero never takes damage.
  (Since 2026-11-15 a skill costs no souls and The Cube waits 4 turns, so it comes every fourth
  turn at the most and the question below is closed: [balance-model.md](balance-model.md) §8.)
  **Decided, kept as is** (Patrick, 2026-11-09): cubing every turn is expensive enough to stop being
  worth it, because the rival spends those souls on equipment and develops its heroes while
  Viscous's side spends them cubing. The other options were a 2-turn wait (as the
  old engine had), never the same hero twice in a row, and a cube that stops one hit.
- **Haze — Fixation.** Since 2026-11-16, +1 bullet damage on each of her swings at an enemy
  below full HP, Extra Attacks too, never on a Ricochet bounce (a bounce is no swing). Until then
  it was a stack a swing (max 2) that lasted until the target left the Active slot.
  Her Level 3 extra swing is gone. **Bullet Dance** deals her Attack as her card shows it (0 while
  Disarmed) as bullet damage, but it is no swing: nothing rides on it and it does not ricochet.
- **Vindicta — Flight.** 1✦ spirit damage rides on each of her swings, not on a bounce. The old
  "takes 1 less bullet damage" is gone.
- **Drifter — Bloodscent.** "Below half HP" is under half (as Frenzy reads it). A knockout counts
  when an enemy hero falls to his side, by anything and on either turn, while he stands as its
  Active (a Rejuvenator revive still counts; a fall to the Mid-Boss does not). The +1 Attack is his
  for the game, through his falls, up to +2 (`tally`). His lifesteal is gone.
- **Mirage — Djinn's Mark.** Each mark lasts 3 of the target's turns, the timer starting over with
  each new mark; a bounce marks too, as before. Marks that run out fade: the doc names no expiry
  detonation, so there is none. **Traveler** can only be used while Mirage is the Active (there is
  nobody to swap with otherwise): the player picks the bench ally, who steps in as a free swap.
- **Shiv — Killing Blow.** The hit first; a target it leaves below half HP is then knocked out
  (pure damage, through a Shield; Invulnerable still stops it).
- **Lady Geist — Soul Exchange.** It is Lady Geist's own HP that changes hands, wherever she
  stands; each keeps no more than its own max; then the 3✦.
- **Sinclair — Audience Participation.** Casts the enemy Active's ultimate at once, as his own: his
  Spirit, his heals, aimed as that ultimate aims, on his own wait (medium, 6 turns) and as his side's one ultimate of the turn. With no standing enemy
  Active, or another Sinclair there, there is nothing to copy and it cannot be used. The old
  borrowed copy (a free ultimate kept for later) is gone. **Rabbit Hex** uses the engine's rabbit
  (no attack, skills, ultimates or active items), with no damage rider since 2026-11-16.
- **Rem — Tag Along** aims at another standing hero of her side and rides on it for 2 turns (see
  "Rem in the lane" below; until 2026-11-09 it was a plain heal and Rem was bench-only).
- **Warden — Willpower's Swift** is the engine's: a free Retreat this turn.
- **Yamato — Shadow Transformation's** Unstoppable lasts two of her turns, as its +3 Attack does.
- **Dynamo, Seven, Warden** no longer channel: their ultimates are one hit each. The channel
  statuses and their end-of-turn pulse stay in the engine with no card using them, as does Charged
  (Seven's old Static Charge). (Since 2026-11-15 Seven uses both again: Static Charge is his skill
  and Storm Cloud a 2-turn channel; section 3 and his card in section 8.)
- **Trigger prompts.** None of the 19 kits has an optional "may" effect, so nothing is marked
  `TODO(trigger-prompt)`. (Step 3 built the prompts for Victor; see below.)

**Elsewhere**
- The ultimate button shows each hero's Deadlock ultimate icon, copied into `public/ult/` (credited
  in `public/art/CREDITS.md` and the in-game credits).
- The tutorial teaches free skills (since 2026-11-15): Frost Grenade costs no souls and holds two
  charges (the map lesson the same); Lesson 3 brings 2 souls in, which with the turn's 2 pay for
  Cold Front, against a Lash on 2 (Kelvin's swing is 1 now); the map lesson's rival Patron is 1,
  for Kelvin's push of 1.
- The AI plays the same legality: it uses skills and ultimates when they are ready and the
  lookahead says the position is better for it; they cost no souls. It counts a charged ultimate
  that is ready as worth something to its hero, so it does not swing into a Victor who will get
  back up as if he would not. Since 2026-11-15 it saves for the dearest card it can reach in three
  turns and holds its souls against cheaper cards and Retreats until that card is played, a kill
  aside ([balance-model.md](balance-model.md) §7).
  It no longer prices a Sleep's value as a wake-up burst.

### Rem in the lane, and Tag Along as a ride (2026-11-09)

Built on `deck-and-heroes` to Patrick's call in section 5. Where the call is silent, the build reads
it this way:

- **Bench-only is gone, the rule stays.** Rem's card drops `flags.benchOnly`, so she opens the match
  (`openingCandidates`), goes into an empty lane, steps up, is retreated to, counts for a scripted
  match's hero guarantee and leads a story roster named first. The engine keeps the bench-only rule
  for a card that may want it; no card sets it, and its tests run it on a card flagged by hand.
- **The ride is the old merge's machinery** (`rideOn` and `returnRemToBench` in death.ts,
  `tickRemMerges`, the slot kept in legality.ts). "2 turns" is 2 of her owner's turns, counted at the
  start of each: used on her turn, she rides through the rival's turn, her next turn and the rival's
  after it, and is back on the bench as her second turn after the ride begins.
- **The heal** is 4 + Rem's Spirit on the bearer, no higher than its max HP. Rem herself no longer
  heals, and the ride grants no max HP.
- **Targets.** Another standing hero of her side, bench or Active: not herself, not a corpse, not an
  enemy. The board lights exactly those.
- **While she rides** she is out of every slot: nothing hits or aims at her (an "every enemy" effect
  passes her by), she uses nothing (no Tag Along, Naptime or worn active), her items stay on her, and
  she takes none of the bearer's item slots. Her statuses wait, as they did on the old merge.
- **Coming back.** From the bench her slot is kept for her. From the lane she takes the first free
  bench slot; with none free she rides on one more turn and tries again. If her bearer falls she
  jumps back to the bench at once; if no bench slot is free then (she rode from the lane and the
  bench has filled since), she cannot stay on a corpse and goes back to the hand, at full HP, as a
  fallen hero does.
- **Riding off from the lane** leaves it empty: the human seat gets the promotion sheet, said as a
  ride ("Rem Rides Off"), and an AI seat promotes its healthiest bench hero at once. The hero who
  steps up may still make the turn's attack.
- **The board.** A riding Rem is a chip among her bearer's items with her turns left, and a line on
  its sheet ("riding · back to the bench in 2 turns"). She flies from her slot onto the chip and
  back (the `rideOn` / `rideOff` deck events). Her draft keyword "Bench Healer" is now "Ride-Along".
- **The AI** counts a riding Rem as the hero she is, her gear with her, so a ride costs it only its
  souls and it rides where the heal gains. A ride out of a lane it is losing (Rem about to die, or
  the rival's Active able to fell her in one swing) is worth half her presence on top
  (`RIDE_TO_SAFETY`), since its one-move lookahead cannot see the swing she dodges. It puts Rem in
  an empty lane as any hero.

### Step 3 (2026-11-09): trigger prompts, charged ultimates, Victor and Silver

Built on `deck-and-heroes`. Where the doc is silent, the build reads it this way:

**Trigger prompts (section 6)**
- **Usable** means the doc's tests and nothing else: the right level (an ultimate's Level 3 since 2026-11-16, Level 2 before), not
  waiting (its cooldown), charged (a charged ultimate's damage), and, for an ultimate, its side's
  one of the turn not yet used (since 2026-11-15; before it, the souls of its `kitCost`). Whose turn it is, the Act, and the
  hero's statuses (a Stun, a Silence) do not stop a trigger. With nothing usable nobody is asked and
  the moment goes on (Victor simply falls).
- **A trigger is no turn's ability.** Used, it is paid as from its button — its wait (an
  ultimate's size's turns, less what the hero wears), a charged ultimate's count started over, and
  it is its side's one ultimate of that turn — but it does not spend the hero's one ability of the
  turn.
- **Who answers.** The prompt names the seat asked; the answer (`useTrigger` / `passTrigger`) may be
  sent from either seat, as a promotion may. The boardgame.io adapter puts the asked seat in a
  'respond' stage, and the seat on turn with it, because the game's local client sends every move as
  the player whose turn it is; the stage allows nothing but the two answers (and the board's reveal
  bookkeeping).
- **While a prompt is owed nothing else happens:** no move but its answer, the turn cannot end, and
  an owed promotion waits until it is answered. The hero it is about waits at 0 HP where it stood:
  nothing damages, heals, levels, reaps or promotes it, and for the End step's push into an empty
  lane it has not fallen yet.
- **A fall in the End step** (Torment Pulse at the end of the rival's turn, the Mid-Boss's blow at
  the end of his own) is asked as the next turn opens: boardgame.io cannot hold a turn open inside
  its end hook, so the next turn's start (income, draw, cooldowns) runs first. Usability is judged at
  the moment of the fall; what the start adds (a cooldown ticked, a new turn's ultimate) only ever makes it easier.
- **The kill's exp waits too.** The hit that drops a hero who can cancel its own fall holds its
  killer's exp (`downedBy`) until the fall is decided: paid if it goes ahead, never if it is cancelled.
- **The AI** answers through the same moves, choosing the answer whose position it values most
  (`evalState`), and its lookahead answers a prompt its own line opens the way the rival would.
- **First version:** one prompt per moment, answered before play goes on; no chains, no setting.

**Charged ultimates**
- **What counts.** Every point of damage that reaches the hero's HP — after resists and Shield (what a
  Shield absorbs is not taken), the whole hit even past 0 HP, as the log prints it. Victor's own Aura
  counts. Silver's count is every hit the engine attributes to her (the hit's source): her swings,
  Boot Kick, her gear's procs, a swing at the Mid-Boss too.
- **The count** is the hero's `tally` under the ultimate's id. Like the level it stays through a fall
  and back in the hand; it starts over when the ultimate is used. Since 2026-11-15 the ultimate is
  ready when the count reaches what its card needs (Victor 10, Silver 8) and costs no souls; before
  it, the price was the printed cost (20, 16) less the count.
- **Size.** Both cards are medium, which sets the turns they wait after a use (6). The card prints
  "Ult · charged", the button the count ("7 / 10"), and the rule stands on a line of its own.

**Victor**
- **Aura of Suffering** fires at the start of his own turn while he is the Active, after the income
  and the draw: a flat 1 spirit damage (no ✦) to each enemy hero, the bench included, then 1 to
  Victor. It is dealt in a proc frame of his, so a kill is his (its exp) and nothing he wears reacts.
  His own Shield and Spirit Resist cut his hit (and so charge less). It can fell him: then his prompt
  is asked as his turn opens.
- **Shocking Reanimation** is an optional trigger at 'onFall' and has no button use: its plate reads
  "Asked when Victor falls". Used, he stands where he fell with half his max HP, rounded up, his
  items and statuses as they were. The knockout never happens: no push, no kill on the rival's
  record, no Bloodscent knockout for a Drifter, no `RESPAWN_TURNS` wait, no kill exp. It shows as a
  cast of his ultimate and a revive (`revive` with `cancelled`). Sinclair's Audience Participation
  cannot copy it (an optional trigger has nothing to cast at once).

**Silver**
- **Boot Kick**: the kick's 1 bullet damage is flat (no Attack added) and lands first; Vulnerable is
  "takes +1 damage" as step 2 reads it (Bullet Resist −1 and Spirit Resist −1), for 2 turns that
  tick on the target's turns, as Eternal Night's do.
- **Lycan Curse**: "for 2 turns" is the wolf — the Wolf form status and its +3 Attack (Bullet Power)
  for two of her turns, the one she uses it and her next, as Yamato's Shadow Transformation. Shield 6
  is a Shield as section 3 defines it, there until it has blocked 6; it does not end with the form.
- **Wolf form** is a status that tells the board to show the form (`StatusDef.form`): her card and
  sheet show Deadlock's wolf card art and a "Wolf form" badge with its turns, and her own art again
  when it ends. Its chip mark is the Lycan Curse icon. Sinclair copying Lycan Curse gets the stats
  and the badge but keeps his own art.

**Data**
- Victor: Tank, tank 3, damage 2, many targets, late, not a gun hero (HP 6, Attack 1, +3 HP +1 Spirit,
  Retreat 2). Silver: Bruiser, tank 2, damage 3, control 1, one target, mid, a gun hero (HP 6, Attack
  2, +2 Attack +1 HP, Retreat 1). Both fit the formulas of section 2.
- Builds (card-design.md §4): Victor Extra Health, Torment Pulse, Spirit Lifesteal, Spirit Shielding,
  Fortitude, Leech; Silver Monster Rounds, Bullet Lifesteal, Swift Striker, Kinetic Dash, Berserker,
  Frenzy. Their three-word keywords on the draft card (Undying · Aura · Reanimated; Bruiser ·
  Shapeshifter · Bloodlust) are this game's, not Valve's.
- Art: their portraits are the deadlock-api's (`frank`, `werewolf`; no hero-select crop exists for
  them, as for Rem), their ultimate icons are the `signature4` icons, and the wolf is Deadlock's
  `werewolf_wolf_card`.


### Units, the mill and Graves (2026-11-16)

Patrick: "a new concept for heroes… her skill traps a hero, deals damage and spawns two zombies,
but the zombies become cards that cost one soul… her ultimate is a tomb, another unit: it has to
have a spot on the field… every turn it adds a zombie to the deck… zombies have 1 attack and 1
health, and whenever they die the enemy discards a card from its deck… whenever a hero is
discarded it is added to the deck again, reshuffled… and the max heroes go from 4 to 3."

Deadlock's Graves does this, so the card uses the game's own names: the skill is **Grasping
Hands** (a line of hands that damages and immobilizes, "summoning a Ghoul"), the ultimate
**Borrowed Decree** (gravestones that raise Ghouls), and the zombie is a **Ghoul**.

**Squads of three.** A side drafts 3 heroes, not 4 (`SQUAD_SIZE`). The board keeps its four
spots, the Active and three on the bench, so a full squad leaves one free. Seat 0 drafts first and
last, seat 1 the two picks after the first. Story mode recruits up to three as well since
2026-11-16 (a full roster turns a recruit stop into supplies), and its rivals field three at most.

**Units.** A unit is a board card that is no hero. It takes a spot, has Attack and HP, and is
damaged, targeted and given statuses like a hero. It differs in five ways:

- It is never drafted or built into a deck: a hero's kit makes it.
- Played from the hand it costs souls (a hero is free).
- It wears no item, casts no spell and earns no exp.
- Destroyed, it is gone for good, to its owner's discard pile.
- Nobody is paid for it: no bounty, no push on the structures, no exp. (A unit that fed the enemy
  a bounty would be a card you pay to lose.)

| Unit | Attack · HP | Price | What it does |
|---|---|---|---|
| Ghoul | 1 · 1 | 1 soul | May stand in the lane. **Death Rattle:** when it is destroyed, the enemy discards the top card of its deck. |
| Gravestone | 0 · 1 | not played from the hand | Bench only. At the start of your turn, shuffle a Ghoul into your deck. Any damage destroys it. |

**The mill.** A discard off the top of a deck. A hero is never discarded, from a deck or from a
hand: it goes back into its owner's deck and the deck is shuffled. A Ghoul milled is discarded
like any card.

**The numbers**, by the budget of section 4 and [card-design.md](card-design.md) §3. Nothing was
run through the sim.

- **A card off the enemy's deck is worth 1.4** (the value of a drawn card,
  [card-design.md](card-design.md), "The Cooldown family").
- **A Ghoul played is worth about 2.5 for its 1 soul:** its death 1.4 × 0.8 (it dies sooner or
  later; the deck may be empty) = 1.1; in the lane it takes a swing meant for a hero, 3.5 × 0.5 at
  0.6 (it has to get there: a Retreat, or the lane left open) = 1.0; its own swing of 1 at 0.3.
  It is over its price because the spot is the real cost: with three heroes out a side has one
  spare, and the Gravestone wants the same one.
- **A Ghoul card in the deck is worth 0.85:** it has to be drawn (0.6 of the time, in a 19-card
  deck) and paid for: (2.5 − 1) × 0.6. One Death Rattle discards **1** card ("one or two, it
  depends"): at 2 a played Ghoul would be worth 3.6.
- **Grasping Hands** (waits 4, so 3 to 4.5 points): 1✦ is 1; Root 1 turn 1.5; two Ghoul cards 1.7.
  **4.2.** A Root, not a Stun ("stun, trap a hero"): a Stun is 3 points and would put the skill at
  5.7, and Deadlock's hands immobilize.
- **Borrowed Decree** (small, 4 to 6 points): a Gravestone on the bench is reached only by damage
  that hits the bench (an area hit, reach, a card aimed there), so it stands about 5 of its
  owner's turns: 5 Ghoul cards × 0.85 = **4.25**. It is small, not medium, because one hit ends it
  ("it has to be damaged once") and it takes the squad's spare spot while it stands.
- **Graves herself:** HP 5 (tank 1), Attack 1, Retreat 1, +1 HP and +2 Spirit a level (mid), as
  the proposal had her. Control 2, damage 2.

**Defaults chosen, for Patrick to overrule:**
- Ghouls go into the deck, shuffled, both from the skill and from the Gravestone (not the hand).
- The Gravestone never takes the lane and has no Attack.
- A unit can be healed, shielded and targeted by spells like a hero; it only cannot wear items.
- A Ghoul in the lane is attacked like a hero. When it dies there the lane is open and its side
  picks who steps up, at no cost, as when an Active falls.
- No ready deck carries Graves yet.

### Vindicta: the snipe and Flight (2026-11-16)

Patrick: "Her skill becomes snipe, a charge ability; it might take longer to charge up. Her
ultimate becomes fly… she goes into a fly status, which means she has a one third chance to dodge
any attack, any damage."

In Deadlock, Assassinate holds 2 charges and has her longest cooldown, and Flight makes her weapon
deal bonus spirit damage while she is in the air. So the swap fits the game.

| | Was | Now |
|---|---|---|
| Skill or passive | Passive, **Flight**: her attacks also deal 1✦ | Skill, **Assassinate**: 2 charges, 5 turns each. Snipe any enemy, bench too: 4✦ |
| Ultimate | **Assassinate**, medium (waits 6): 8✦ to any enemy | **Flight**, small (waits 4): fly 3 turns. 1 in 3 hits miss her; her attacks add 1✦ |

**Flying** is a status. While a hero has it:
- each hit on it misses 1 time in 3, whatever the hit is (a swing, a skill, a spell, a Bleed tick),
  and a miss takes nothing;
- its attacks add 1 + its Spirit as spirit damage (not on a Ricochet bounce).

**The roll** is drawn from the match's own seeded stream, so a game replays. A copy of the game
would roll the same number, so two things run blind (`engine/chance.ts`): the attack preview
shown while a swing is being aimed, and the whole of the AI's look. Blind, no die is drawn and the
hit is taken as landing. The attack made rolls for real, and so does the forecast taken as it is
committed, which the board animates.

**The numbers**, by section 4. Nothing was run through the sim.

- **Assassinate** waits 5, the longest of any skill ("it might take longer to charge up"). A
  skill is worth about 0.75 to 1.1 points a turn of wait (2 to 3 at 3 turns, 3 to 4.5 at 4), so 3.75
  to 5.6 at 5. 4✦ is 4, and reaching the bench +0.5: **4.5**. Half the ultimate's 8✦, twice as
  often, with a second shot held.
- **Flight** is small (4 to 6 points; "relatively low cost"). The dodge: about 5.5 damage a turn
  comes at the Active mid-game, a third of it missed is 1.8 prevented, 0.9 points a turn, for 3
  turns: 2.7. That alone is under a small ultimate. With the spirit damage her attacks add while
  she flies, 1 × 0.85 a turn for 3 turns = 2.55, it is **5.25**.
- **The rider is kept on purpose.** Patrick described only the dodge. Her attacks' 1✦ was her
  whole passive until today and it is what Flight does in Deadlock, so it moved into the ultimate
  with it. Without it her damage would have dropped (8✦ every 6 turns and 0.85 a turn, against
  4.5 every 5) for a dodge worth 0.9 a turn. If the dodge is meant to stand alone, the rider comes
  off in one line and Flight should last longer.
- She flies 3 turns of every 4 once Flight is first used (it waits 4), and her side spends its one
  ultimate a turn on it each time.
