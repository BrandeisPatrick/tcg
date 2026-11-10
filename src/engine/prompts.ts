/**
 * Trigger prompts: one shared system for the effects a card says you MAY use
 * when something happens (docs/hero-design.md §6) — "When Victor falls, you
 * may use this". It works like Yu-Gi-Oh Master Duel's "Activate this?".
 *
 * A card only declares its trigger: the moment (`trigger`, e.g. 'onFall'),
 * that it is a "may" (`optional`), its cost (its `kitCost`, or a passive's
 * `souls`) and its effect (`run`). Everything else is here, so a new card
 * adds a trigger, not prompt code:
 *
 *  1. The moment comes. The engine asks for it through the one dispatcher,
 *     `fireTriggers` (triggers.ts), which runs the automatic reactions as
 *     always and hands the optional ones to `offerTriggers`.
 *  2. `offerTriggers` keeps the ones the player can use right now
 *     (`triggerBlocked`, legality.ts: the right level, not waiting, enough
 *     souls). None: nothing is asked and the moment goes on.
 *  3. Otherwise the game pauses: a `PendingTrigger` goes on `G.triggers` and
 *     the moment's outcome (the fall) waits. Nothing is legal but the answer
 *     (`blocked`), from either seat, on either player's turn; the boardgame.io
 *     adapter holds the asked seat in a 'respond' stage (game.ts).
 *  4. The player uses one of the offers (`useTrigger`) or passes
 *     (`passTrigger`); the AI answers the same prompt through the same moves
 *     (ai/heuristic.ts). `answerTrigger` pays, runs the effect and lets the
 *     moment go on (`settle`): a fall the answer did not stand back up goes
 *     ahead. Then the state-based pass runs again.
 *
 * The first version answers one prompt per moment, and nobody answers back.
 * The data is a stack so that chains can come later without a rewrite — see
 * docs/engine-model.md, "Trigger prompts".
 */
import type { CardInstance, GameState, PendingTrigger, PlayerID, TriggerMoment, TriggerOffer } from './types';
import { cardName } from '@/cards';
import { findCardOnBoard, isRespawning, optionalTriggers, promptOwed, resolveSkill, triggerPrice, ultimateCard } from './query';
import { triggerBlocked } from './legality';
import { pushLog } from './log';
import { pushFx } from './fx';
import { nextActionId } from './ids';
import { withCast } from './castContext';
import { getAbility } from './registry';
import { fireTriggers } from './triggers';
import { killInPlace, resolve } from './death';
import { payKit } from './actions/useSkill';

/** What a moment's prompt carries beyond who and what: for 'onFall', that the
 *  fall pays nothing if it goes ahead (the Mid-Boss's blow). */
export type MomentDetails = Pick<PendingTrigger, 'unpaid'>;

/** The moments the system can pause at. A trigger declared at any other is
 *  never asked. */
const MOMENTS: ReadonlySet<string> = new Set<TriggerMoment>(['onFall']);

/** The name a trigger prints in the prompt and the log: its ultimate's card
 *  ("Shocking Reanimation"), or the ability's own name. */
export function triggerName(hero: CardInstance, abilityId: string): string {
  if (resolveSkill(hero, abilityId)?.kind === 'ult') return cardName(ultimateCard(abilityId)?.id ?? abilityId);
  return getAbility(abilityId)?.name ?? abilityId;
}

/** The optional triggers `bearer` declares at `moment` that its player can
 *  use right now, as offers. */
export function usableOffers(G: GameState, bearer: CardInstance, moment: TriggerMoment): TriggerOffer[] {
  if (bearer.ownerId === 'none') return [];
  const pid = bearer.ownerId;
  return optionalTriggers(bearer, moment)
    .filter((a) => triggerBlocked(G, pid, bearer, a.id) === null)
    .map((a) => ({ heroIid: bearer.iid, abilityId: a.id }));
}

/**
 * The moment `moment` has come for `bearer`: ask its player about the optional
 * triggers it can use now. Returns true when a prompt is now owed — the
 * moment's outcome then waits on the answer (`answerTrigger`) — and false when
 * nothing could be used, so nothing was asked. Called by `fireTriggers` only.
 */
export function offerTriggers(G: GameState, bearer: CardInstance, moment: string, details: MomentDetails = {}): boolean {
  if (!MOMENTS.has(moment)) return false;
  const offers = usableOffers(G, bearer, moment as TriggerMoment);
  if (offers.length === 0 || bearer.ownerId === 'none') return false;
  const pid: PlayerID = bearer.ownerId;
  const entry: PendingTrigger = { pid, moment: moment as TriggerMoment, subjectIid: bearer.iid, offers };
  if (details.unpaid) entry.unpaid = true;
  (G.triggers ??= []).push(entry);
  const what = offers.map((o) => {
    const hero = findCardOnBoard(G, o.heroIid)!.card;
    const n = triggerPrice(hero, o.abilityId);
    return `${triggerName(hero, o.abilityId)} (${n} soul${n === 1 ? '' : 's'})`;
  }).join(' or ');
  pushLog(G, `${cardName(bearer.cardId)} falls — P${pid} may use ${what}.`);
  return true;
}

/**
 * Answer the trigger prompt owed (`answerBlocked`, legality.ts, has said the
 * answer may be given): with `use`, the offer is paid for and its effect runs;
 * without, the player passes. Either way the prompt is done, the moment goes
 * on (`settle`), and the state-based pass runs — which may ask the next.
 *
 * A trigger used is the card's own ability, paid as from its button
 * (`payKit`: its souls, its cooldown, a charged ultimate's count started over)
 * and shown as its cast, but it is no turn's ability: it does not spend the
 * hero's one ability of the turn.
 */
export function answerTrigger(G: GameState, use?: TriggerOffer): void {
  const stack = G.triggers ?? [];
  const entry = stack.pop();
  if (stack.length === 0) G.triggers = undefined;
  if (!entry) return;
  const subject = findCardOnBoard(G, entry.subjectIid)?.card;
  if (use) {
    const hero = findCardOnBoard(G, use.heroIid)!.card;
    const ability = getAbility(use.abilityId)!;
    const ult = resolveSkill(hero, use.abilityId)?.kind === 'ult';
    const faceId = ult ? ultimateCard(use.abilityId)?.id ?? hero.cardId : hero.cardId;
    const name = triggerName(hero, use.abilityId);
    const paid = resolveSkill(hero, use.abilityId) ? payKit(G, entry.pid, hero, use.abilityId) : payPassive(G, entry.pid, hero, use.abilityId);
    pushLog(G, `P${entry.pid} used ${name} (${cardName(hero.cardId)})${paid > 0 ? ` (−${paid} soul${paid === 1 ? '' : 's'})` : ''}.`);
    pushFx(G, { kind: 'cast', castKind: ult ? 'ult' : 'skill', by: entry.pid, cardId: faceId, iid: hero.iid, targetIid: subject?.iid });
    withCast(hero, ult ? 'ult' : 'skill', () => {
      ability.run(G, { movingPlayer: entry.pid }, { source: hero, target: subject, params: { moment: entry.moment } });
    });
    // The worn reactions to an ultimate used (Diviner's Kevlar and the like).
    if (ult) fireTriggers(G, hero, 'onBearerUltCast', { reaction: true, movingPlayer: entry.pid });
    G.action = { id: nextActionId(G), kind: ult ? 'ult' : 'skill', by: entry.pid, cardId: faceId, state: 'begin', abilityId: use.abilityId };
  } else {
    const names = entry.offers.map((o) => {
      const hero = findCardOnBoard(G, o.heroIid)?.card;
      return hero ? triggerName(hero, o.abilityId) : o.abilityId;
    });
    pushLog(G, `P${entry.pid} passed on ${names.join(' and ')}.`);
  }
  settle(G, entry);
  resolve(G);
}

/** A passive's trigger, paid: its own `souls`, then its cooldown, if it names one. */
function payPassive(G: GameState, pid: PlayerID, hero: CardInstance, abilityId: string): number {
  const souls = triggerPrice(hero, abilityId);
  G.players[pid].souls -= souls;
  const wait = getAbility(abilityId)?.cooldown;
  if (wait) (hero.cooldowns ??= {})[abilityId] = wait;
  return souls;
}

/** The moment goes on once its prompt is answered. 'onFall': the fall goes
 *  ahead (`killInPlace`: the push, the record, the wait) unless the answer
 *  stood the hero back up — then the knockout never happened, and the exp its
 *  blow held is never paid. */
function settle(G: GameState, entry: PendingTrigger): void {
  switch (entry.moment) {
    case 'onFall': {
      const found = findCardOnBoard(G, entry.subjectIid);
      if (!found || found.owner === 'none') return;
      const hero = found.card;
      if (isRespawning(hero)) return;
      if (hero.hp > 0) { hero.downedBy = undefined; return; }
      killInPlace(G, G.players[found.owner], hero, { unpaid: entry.unpaid });
      return;
    }
  }
}

/** The prompt owed, re-exported for the adapter and the board. */
export { promptOwed };
