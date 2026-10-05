/**
 * Play a card from hand: a spell or ultimate takes effect and goes to the
 * discard; equipment attaches to a hero. `playBlocked` (legality.ts) has
 * already said it may be played and where; this only does it.
 */
import type { CardInstance, GameState, PlayerID } from '../types';
import { CARDS_BY_ID } from '@/cards';
import { getAbility } from '../registry';
import { findCardOnBoard, wornEquipment } from '../query';
import { cardCost } from '../legality';
import { MAX_EQUIPMENT_PER_HERO } from '../constants';
import { pushLog } from '../log';
import { pushFx } from '../fx';
import { nextActionId } from '../ids';
import { withCast } from '../castContext';
import { fireTriggers } from '../triggers';
import { grantExp } from '../expSystem';
import { discardEquipment } from '../deckOps';
import { resolve } from '../death';

function applyOnPlay(G: GameState, pid: PlayerID, source: CardInstance, target?: CardInstance) {
  const data = CARDS_BY_ID[source.cardId];
  const abilityIds: string[] =
    data?.type === 'spell' ? data.abilities :
    data?.type === 'equipment' ? data.abilities ?? [] :
    data?.type === 'ultimate' ? data.abilities :
    [];

  // Only fire abilities marked with the onPlay trigger. Equipment can also
  // declare reactive triggers (onBearerSkillDamage, onAttack, onBearerCCSuffered,
  // onBearerSkillUsed, onBearerUltCast) which must NOT fire on attach — those
  // are driven by the engine's trigger dispatcher at the appropriate game event.
  for (const aid of abilityIds) {
    const a = getAbility(aid);
    if (a && a.trigger === 'onPlay') {
      a.run(G, { movingPlayer: pid }, { source, target });
    }
  }
  if (data?.type === 'equipment' && target && data.bonus) {
    if (data.bonus.atk) target.atkMod += data.bonus.atk;
    if (data.bonus.hp) { target.hpMax += data.bonus.hp; target.hp += data.bonus.hp; }
    if (data.bonus.spirit) target.spiritMod += data.bonus.spirit;
  }
  // Charge-based gear (cooldown→draw family): seed the instance's charge meter.
  if (data?.type === 'equipment' && data.charges) {
    source.charges = data.charges;
  }
  // Hero leveling: +1 exp to the bearer hero when an item is attached.
  if (data?.type === 'equipment' && target && CARDS_BY_ID[target.cardId]?.type === 'hero') {
    grantExp(G, target, 1);
  }
}

export function playCard(G: GameState, pid: PlayerID, cardIid: string, targetIid?: string, discardIid?: string) {
  const ps = G.players[pid];
  const idx = ps.hand.findIndex((c) => c.iid === cardIid);
  const card = ps.hand[idx];
  const data = CARDS_BY_ID[card.cardId];
  const cost = cardCost(card);

  // What the card lands on. A card that takes no target does not look at one;
  // a self-cast ultimate (Yamato's Shadow Transformation) lands on its own
  // hero — there is nothing for the caster to aim, so resolve it here.
  let target: CardInstance | undefined;
  if (data.type === 'equipment') {
    target = findCardOnBoard(G, targetIid!)?.card;
  } else if (data.type === 'spell' || data.type === 'ultimate') {
    const filter = getAbility(data.abilities[0])?.target ?? 'noTarget';
    if (targetIid && filter !== 'noTarget') target = findCardOnBoard(G, targetIid)?.card;
    else if (data.type === 'ultimate' && filter === 'self') {
      target = [ps.active, ...ps.bench].find(
        (c): c is CardInstance => !!c && c.cardId === data.linkedHero && (c.respawnTurnsLeft ?? 0) === 0,
      );
    }
  }

  if (data.type === 'equipment' && target) {
    // Equipment cap: a hero at the cap gives up the item the caller named.
    if (wornEquipment(target).length >= MAX_EQUIPMENT_PER_HERO) {
      const dropped = wornEquipment(target).find((eq) => eq.iid === discardIid)!;
      discardEquipment(G, target, dropped);
      pushLog(G, `${CARDS_BY_ID[target.cardId]?.name} discarded ${CARDS_BY_ID[dropped.cardId]?.name} to make room.`);
    }
    card.attachedTo = target.iid;
  }

  ps.souls -= cost;
  ps.hand.splice(idx, 1);

  // Cast context: spells channel through the active hero (so spell damage
  // can scale with Spirit and trigger the active hero's equipment).
  // Ults are sourced from their linked hero on the caster's board.
  // The FX layer's cast event goes out FIRST so the effects that follow
  // read as this card's (the bolt leaves the caster, the hits land).
  if (data.type === 'spell') {
    pushFx(G, { kind: 'cast', castKind: 'spell', by: pid, cardId: card.cardId, iid: ps.active?.iid, targetIid: target?.iid });
    withCast(ps.active, 'spell', () => applyOnPlay(G, pid, card, target));
  } else if (data.type === 'ultimate') {
    const linked = [ps.active, ...ps.bench].find((c) => c?.cardId === data.linkedHero) ?? null;
    pushFx(G, { kind: 'cast', castKind: 'ult', by: pid, cardId: card.cardId, iid: linked?.iid, targetIid: target?.iid });
    withCast(linked, 'ult', () => applyOnPlay(G, pid, card, target));
    if (linked) fireTriggers(G, linked, 'onBearerUltCast', { reaction: true, movingPlayer: pid });
  } else {
    pushFx(G, { kind: 'cast', castKind: 'equip', by: pid, cardId: card.cardId, iid: target?.iid, targetIid: target?.iid });
    applyOnPlay(G, pid, card, target);
  }

  if (data.type === 'spell' || data.type === 'ultimate') {
    card.zone = 'discard';
    ps.discard.push(card);
  } else if (data.type === 'equipment' && target) {
    card.zone = 'equipment';
    if (!target.attached) target.attached = [];
    target.attached.push(card);
  }

  pushLog(G, `P${pid} played ${data.name}${target ? ` on ${CARDS_BY_ID[target.cardId]?.name}` : ''}.`);
  resolve(G);
  // Record the action so the UI can play the matching reveal animation
  // (CardPlayFlash for spell/equipment, UltMomentFlash for ultimate)
  // and lock further input until completeAction fires.
  G.action = {
    id: nextActionId(G),
    kind: data.type === 'ultimate' ? 'ult' : 'play',
    by: pid,
    cardId: card.cardId,
    state: 'begin',
  };
}
