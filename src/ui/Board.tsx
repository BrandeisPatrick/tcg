import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, CardInstance, PlayerID, DamageEvent } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { Log } from './side-panel/Log';
import { TargetingOverlay } from './overlays/TargetingOverlay';
import { CardPreview } from './overlays/CardPreview';
import { HeroDetailSheet } from './overlays/HeroDetailSheet';
import { OpponentHand } from './board/OpponentHand';
import { PosterBackdrop } from './PosterBackdrop';
import { DragArrow } from './effects/DragArrow';
import { MulliganOverlay } from './overlays/MulliganOverlay';
import { DraftOverlay } from './overlays/DraftOverlay';
import { PromotionOverlay } from './overlays/PromotionOverlay';
import { EquipmentReplaceOverlay } from './overlays/EquipmentReplaceOverlay';
import { MAX_EQUIPMENT_PER_HERO, RETREAT_COST } from '@/engine/game';
import { BenchRow } from './board/BenchRow';
import { ActiveDuel } from './board/ActiveDuel';
import { BoardTable, boardRows, boardGutter, vitalsPull } from './board/BoardTable';
import { PatronPlaque } from './board/PatronPlaque';
import { BoardControls } from './board/BoardControls';
import { enumerateAIMoves } from '@/ai/heuristic';
import { getAbility, type TargetFilter } from '@/abilities';
import { planAttackPhase, type AttackPlan } from '@/engine/combat';
import { CombatChoreographer } from './effects/CombatChoreographer';
import { SoulsRail } from './board/SoulsRail';
import { CombatProgressContext, type CombatProgress } from './effects/CombatProgressContext';
import { DamageFxContext, type DamageFxResolver } from './effects/DamageFxContext';
import { UltMomentFlash } from './effects/UltMomentFlash';
import { CardPlayFlash, CARD_REVEAL_MS } from './effects/CardPlayFlash';
import { COMBAT_STEP_MS } from './hooks/useCombatSpeed';
import { useSettings, getSettings } from '@/storage/settings';
import { useFitScale } from './hooks/useFitScale';
import { useViewport } from './hooks/useViewport';
import { fonts, spring, DAMAGE_BEAT_MS } from './tokens';
import { poster } from './poster';
import { SidePanel } from './side-panel/SidePanel';
import { PanelDrawer, PANEL_WIDTH } from './side-panel/PanelDrawer';
import { PATRON_NAMES } from './board/patrons';
import { HandTray } from './board/HandTray';
import { findOnBoard, filterAllows, type PendingPlay } from './helpers';
import { getMatchConfig } from '@/storage/matchConfig';
import { markTutorialDone } from '@/storage/playerData';
import { finishStoryBattle } from '@/story/storyRun';
import { MatchEndScreen } from './board/MatchEndScreen';
import { CoachPlate } from './tutorial/CoachPlate';
import { useMatchNav } from './hooks/matchNav';

// Animation / pacing constants.
const AI_THINK_MS = 800;        // delay between AI moves; also gives combat anims time to settle

export function Board(props: BoardProps<GameState>) {
  const { G, ctx, moves } = props;
  const me: PlayerID = '0';
  const matchNav = useMatchNav();
  const isMyTurn = ctx.currentPlayer === me;
  // A tutorial match is built from a scripted setup like a Story node, but it
  // exits to the title and carries the coach plate. Read once — the config is
  // fixed for the life of the mount.
  const isTutorial = useMemo(() => !!getMatchConfig().tutorial, []);
  // Winning the lesson counts as having had it, even if the player dismissed
  // the coach on the first step. (The coach marks it too, when its script
  // runs out — whichever happens first.)
  useEffect(() => {
    if (isTutorial && ctx.gameover?.winner === me) markTutorialDone();
  }, [isTutorial, ctx.gameover, me]);
  // Combat tempo honours the system-menu speed setting live.
  const { combatSpeed } = useSettings();
  // The backdrop's slow push-in runs only when neither the settings sheet
  const [pending, setPending] = useState<PendingPlay | null>(null);
  // Auto-play: when on, the same AI that runs the opponent also drives the
  // local player's turns, so the match plays itself hands-free. Toggle in the
  // top-right; flip off any time to take control back.
  const [autoPlay, setAutoPlay] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  // Panel default: the patron plaques carry the vitals on-board, so the
  // panel is optional depth (log + detail). The player's setting wins;
  // 'auto' opens it only where its 320px cost is negligible (wide screens).
  const [panelOpen, setPanelOpen] = useState(() => {
    const pref = getSettings().panelDefault;
    if (pref === 'open') return true;
    if (pref === 'closed') return false;
    return window.innerWidth >= 1100;
  });
  const [preview, setPreview] = useState<{ card: CardInstance; hover: boolean } | null>(null);
  const [heroDetail, setHeroDetail] = useState<CardInstance | null>(null);
  // Equipment replacement flow: when the player tries to attach a 4th piece
  // to a hero, this holds the incoming card + the target hero until the
  // player picks which existing item to discard (or cancels).
  const [replaceTarget, setReplaceTarget] = useState<{ incoming: CardInstance; hero: CardInstance } | null>(null);
  // Combat animation gate. While non-null, end-turn is intercepted — the
  // choreographer walks the plan visually, then we call the actual move.
  const [combatPlan, setCombatPlan] = useState<AttackPlan | null>(null);
  // Pending end-turn callback to fire once choreographer completes.
  const pendingEndTurnRef = useRef<(() => void) | null>(null);
  // Queued end-turn intent. If the player taps End Turn while an animation is
  // in flight (combat choreography or a card/skill reveal), we remember it
  // here instead of silently dropping the click, then fire once things settle.
  const queuedEndRef = useRef(false);
  // Mirror of the choreographer's beat index so the TurnCompass (via
  // CombatProgressContext) can paint its combat-mode ring without the
  // choreographer needing to own any UI other than the action visuals.
  const [combatBeat, setCombatBeat] = useState(0);
  // Snap back to 0 whenever a new plan mounts or combat ends so the
  // compass doesn't carry stale beat state into the next combat.
  useEffect(() => { setCombatBeat(0); }, [combatPlan]);

  // "Got hit" flash sequencer. Plays NEW non-attack damage events (skill / spell
  // / ult / bleed, pushed to G.damageFx) for a short impact beat so the on-card
  // flash is clearly seen. Basic attacks are flashed via the choreographer beat
  // instead (see damageFxFor). We track a high-water seq so a remount/reconnect
  // doesn't replay old hits.
  const [fxBeat, setFxBeat] = useState<DamageEvent[]>([]);
  const seenFxSeq = useRef<number | null>(null);
  const maxFxSeq = G.damageFx.reduce((m, e) => Math.max(m, e.seq), 0);
  useEffect(() => {
    if (seenFxSeq.current === null) { seenFxSeq.current = maxFxSeq; return; }
    if (maxFxSeq <= seenFxSeq.current) return;
    const fresh = G.damageFx.filter((e) => e.seq > (seenFxSeq.current ?? 0));
    seenFxSeq.current = maxFxSeq;
    if (fresh.length === 0) return;
    setFxBeat(fresh);
    const t = setTimeout(() => setFxBeat([]), DAMAGE_BEAT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxFxSeq]);

  // Resolver consumed by every HeroSlot via DamageFxContext. Covers non-attack
  // damage (skill / spell / ult / bleed); basic-attack flashes are rendered by
  // the CombatChoreographer at the true impact moment instead.
  const damageFxFor = useCallback<DamageFxResolver>(
    (iid) => fxBeat.find((e) => e.iid === iid) ?? null,
    [fxBeat],
  );

  // Memoized — a fresh object identity every Board render used to re-render
  // every CombatProgressContext consumer (TurnCompass) even between beats.
  const combatProgress: CombatProgress = useMemo(() => combatPlan
    ? { total: combatPlan.steps.length, currentBeat: combatBeat, attackerIsMe: combatPlan.attackerId === me }
    : null, [combatPlan, combatBeat, me]);

  // Ephemeral feedback sticker — explains otherwise-silent no-ops (unaffordable
  // card, invalid target — printed red as warnings) and confirms
  // fire-and-forget actions (mulligan — printed ink).
  const [notice, setNotice] = useState<{ id: number; msg: string; warn: boolean } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((msg: string, warn = false) => {
    setNotice({ id: Date.now(), msg, warn });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2000);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // Scale the battle stage to fit shorter viewports so the hand row never gets
  // clipped off the bottom of the screen.
  const { containerRef: fitContainerRef, contentRef: fitContentRef, scale: fitScale } = useFitScale();
  // Phone widths reflow the board to a narrower, shorter-row layout (cards
  // shrink to ~⅓ of the viewport width) instead of overflowing off the side.
  const { isMobile } = useViewport();

  // panelOpen's initializer only runs once — when the window is resized across
  // the phone breakpoint mid-match, sync the drawer (phones: the 320px overlay
  // would bury the whole board; desktop: restore the default-open panel).
  const wasMobileRef = useRef(isMobile);
  useEffect(() => {
    if (isMobile !== wasMobileRef.current) {
      wasMobileRef.current = isMobile;
      setPanelOpen(!isMobile);
    }
  }, [isMobile]);

  const slotRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerSlotRef = useCallback((iid: string, el: HTMLElement | null) => {
    if (el) {
      slotRefs.current.set(iid, el);
      return;
    }
    // Cleanup callback (el === null): during AnimatePresence layout transitions
    // (e.g., a hero promoted from bench to active), the entering element's
    // mount-ref can fire BEFORE the exiting element's cleanup-ref, even though
    // both share the same iid. Blindly deleting here wipes the just-set ref
    // and the choreographer can't find the slot, so the entire AttackBeat
    // bails (no tracer, no banner). Instead, only delete if the currently
    // registered element is detached from the DOM — meaning no replacement
    // has re-registered for this iid.
    const cur = slotRefs.current.get(iid);
    if (cur && !document.body.contains(cur)) {
      slotRefs.current.delete(iid);
    }
  }, []);

  // Face-damage projection feeds the patron HP bar indicator (the per-hero
  // ▼N badges were removed as visual noise — combat choreographer shows
  // damage events when they land).
  const projectedFaceDamage = useMemo(() => {
    if (ctx.gameover) return 0;
    const plan = planAttackPhase(G, ctx.currentPlayer as PlayerID);
    return plan.damageToFace;
  }, [G, ctx.currentPlayer, ctx.gameover]);

  /** Stable callback for CombatChoreographer — inline arrows recreate every
   *  render and would re-fire the choreographer's walk effect, replaying the
   *  same attack beat multiple times. */
  const handleCombatComplete = useCallback(() => {
    setCombatPlan(null);
    if (pendingEndTurnRef.current) pendingEndTurnRef.current();
  }, []);

  /** Intercept end-turn to play the attack-phase animation before the engine resolves. */
  const triggerEndTurn = useCallback(() => {
    // An animation is in flight — combat choreography or a card/skill reveal.
    // Don't drop the click: remember the player's intent and let the drain
    // effect below fire it once things settle. (The AI re-fires via its own
    // effect, so only queue for the human's turn to avoid a stray end-turn
    // leaking onto the player's turn after the AI moves.)
    if (combatPlan || G.action?.state === 'begin') {
      if (ctx.currentPlayer === me) queuedEndRef.current = true;
      return;
    }
    queuedEndRef.current = false;
    const plan = planAttackPhase(G, ctx.currentPlayer as PlayerID);
    if (plan.steps.length === 0) {
      moves.endTurn();
      return;
    }
    pendingEndTurnRef.current = () => {
      try { moves.endTurn(); } catch {}
      pendingEndTurnRef.current = null;
    };
    setCombatPlan(plan);
  }, [G, ctx.currentPlayer, combatPlan, moves, G.action, me]);

  // Drain a queued end-turn once the blocking animation finishes. If the turn
  // has already flipped (or the game ended) we just clear the flag so a stale
  // intent never ends the player's next turn for them.
  useEffect(() => {
    if (!queuedEndRef.current) return;
    if (combatPlan || G.action?.state === 'begin') return; // still animating
    if (ctx.gameover || ctx.currentPlayer !== me) { queuedEndRef.current = false; return; }
    queuedEndRef.current = false;
    triggerEndTurn();
  }, [combatPlan, G.action?.state, ctx.currentPlayer, ctx.gameover, me, triggerEndTurn]);

  // Targeting needs the board visible — close any hover/long-press preview the
  // moment a pending action arms, AND any that opens mid-targeting (a hover
  // timer armed before the tap can fire after it), so the big card preview
  // never sits on top of the very targets the player is being asked to pick.
  useEffect(() => { if (pending && preview) setPreview(null); }, [pending, preview]);

  // Layered Escape: back out of the innermost mode first — an armed
  // targeting state or an open hero sheet — before the key reaches the
  // SystemLayer's pause-menu toggle. Capture phase + stopImmediatePropagation
  // so the system listener (bubble phase on window) never sees the press.
  useEffect(() => {
    if (!pending && !heroDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (heroDetail) setHeroDetail(null);
      else setPending(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [pending, heroDetail]);

  // Safety net: if the previewed card (hand or attached equipment) is no longer present, drop the preview.
  useEffect(() => {
    if (!preview?.hover) return;
    const targetIid = preview.card.iid;
    const inHand = (['0', '1'] as PlayerID[]).some((pid) =>
      G.players[pid].hand.some((c) => c.iid === targetIid)
    );
    const inAttached = (['0', '1'] as PlayerID[]).some((pid) => {
      const all = [G.players[pid].active, ...G.players[pid].bench].filter(Boolean) as CardInstance[];
      return all.some((h) => (h.attached ?? []).some((eq) => eq.iid === targetIid));
    });
    if (!inHand && !inAttached) setPreview(null);
  }, [G, preview]);

  // Stuck-hover guard: if the cursor leaves the document or stops moving for
  // ~2.5s while a hover preview is open, close it. Catches the case where the
  // source card unmounts mid-hover and never fires pointerleave, or the user
  // tabs/alt-tabs away.
  useEffect(() => {
    if (!preview?.hover) return;
    let idleTimer: ReturnType<typeof setTimeout>;
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setPreview(null), 2500);
    };
    const onWinBlur = () => setPreview(null);
    const onDocLeave = (e: PointerEvent) => {
      if (e.relatedTarget === null) setPreview(null);
    };
    armIdle();
    window.addEventListener('pointermove', armIdle, { passive: true });
    window.addEventListener('blur', onWinBlur);
    document.addEventListener('pointerleave', onDocLeave);
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener('pointermove', armIdle);
      window.removeEventListener('blur', onWinBlur);
      document.removeEventListener('pointerleave', onDocLeave);
    };
  }, [preview]);

  // HP / BP change animations are now driven by `useStatTick` inside
  // HeroSlot (per-card) and the vitals rules (patron HP) — no central floater
  // pushes here. Removing the old HP-diff effect also drops the
  // combat-vs-card-diff deduplication ref it used to need.

  // Turn-change acknowledgement now lives on the TurnCompass itself
  // (ring-burst + chevron flip + hue swap on isMyTurn change). No
  // banner needed.

  // AI loop. Pauses while combat is animating OR while a card-play / skill /
  // ult reveal is in flight (so the AI doesn't fire its next move on top of
  // its previous animation).
  useEffect(() => {
    // The opponent ('1') is always AI-driven; the local player is too while
    // auto-play is on. Either way the loop is the same: enumerate, play best,
    // end the turn.
    const aiControlled = ctx.currentPlayer === '1' || (autoPlay && ctx.currentPlayer === me);
    if (ctx.gameover || !aiControlled || combatPlan) return;
    if (G.action?.state === 'begin') return;
    const t = setTimeout(() => {
      try {
        // enumerate inside the try — if the heuristic ever throws, falling
        // through to endTurn keeps the match moving instead of freezing the
        // AI's turn forever (nothing else would re-arm this effect).
        const opts = enumerateAIMoves(G, ctx);
        if (opts.length === 0) { triggerEndTurn(); return; }
        const best = opts[0];
        // boardgame.io types `moves` as Record<string, (...args: unknown[]) => void>
        // but won't infer per-move signatures. One Function-typed lookup is
        // tidier than four separate `as any` casts and keeps the AI loop in
        // one place if a new move kind is added.
        const dispatch = moves as unknown as Record<string, (...args: unknown[]) => void>;
        if (best.move === 'endTurn') triggerEndTurn();
        else if (dispatch[best.move]) dispatch[best.move](...best.args);
        else triggerEndTurn(); // unknown move kind — bail rather than freeze the AI loop
      } catch {
        triggerEndTurn();
      }
    }, AI_THINK_MS);
    return () => clearTimeout(t);
  }, [ctx.currentPlayer, ctx.turn, G, moves, ctx, combatPlan, triggerEndTurn, G.action, autoPlay, me]);

  // AI watchdog. The loop above re-arms on state changes — but a dispatched
  // move the engine rejects (INVALID_MOVE) leaves G untouched, so nothing
  // re-fires and the rival's turn would wedge forever. If an AI-controlled
  // turn sits with no state change well past the think delay, force the turn
  // to end so the match always keeps moving.
  useEffect(() => {
    const aiControlled = ctx.currentPlayer === '1' || (autoPlay && ctx.currentPlayer === me);
    if (ctx.gameover || !aiControlled || combatPlan) return;
    if (G.action?.state === 'begin') return;
    const t = setTimeout(() => { triggerEndTurn(); }, AI_THINK_MS * 6);
    return () => clearTimeout(t);
  }, [ctx.currentPlayer, ctx.turn, G, moves, ctx, combatPlan, triggerEndTurn, G.action, autoPlay, me]);

  // Auto-play promotion resolver. The engine only auto-promotes the AI ('1');
  // the local player ('0') normally picks a new Active via the PromotionOverlay.
  // Under auto-play nobody clicks it — and our Active can die on the OPPONENT's
  // combat phase, when the AI loop above is enumerating the rival's moves and
  // never touches our board. So resolve our forced promotion here, on EITHER
  // turn, picking the highest-HP eligible bench hero (mirrors engine autoPromoteAi).
  useEffect(() => {
    if (!autoPlay || ctx.gameover || combatPlan) return;
    if (G.action?.state === 'begin') return;
    if (G.pendingPromotion !== me) return;  // single source of truth — set by engine `resolve`
    // On our own turn the AI loop above already enumerates promoteToActive;
    // dispatching from both effects raced and spammed `invalid move` for the
    // loser. This effect only covers promotions owed on the RIVAL's turn.
    if (ctx.currentPlayer === me) return;
    const ps = G.players[me];
    let best: CardInstance | null = null;
    for (const b of ps.bench) {
      if (!b || (b.respawnTurnsLeft ?? 0) > 0) continue;
      const d = CARDS_BY_ID[b.cardId];
      if (d?.type !== 'hero' || d.flags?.benchOnly) continue;
      if (!best || b.hp > best.hp) best = b;
    }
    if (!best) return;
    const iid = best.iid;
    const t = setTimeout(() => {
      try { (moves as any).promoteToActive(iid); } catch {}
    }, AI_THINK_MS);
    return () => clearTimeout(t);
  }, [autoPlay, ctx.gameover, combatPlan, G.action?.state, G.pendingPromotion, G, moves, me]);

  // Action reveal driver. When the engine sets G.action with state='begin'
  // (after playCard / useSkill), schedule completeAction so the animation
  // hold matches the dispatcher unlock. Player input is blocked elsewhere
  // via `actionLocked` until this fires.
  useEffect(() => {
    if (G.action?.state !== 'begin') return;
    // Play / skill reveals are a quick "you played X" beat; the ultimate is a
    // dramatic screen-fill that needs longer to land. Keep each in sync with
    // its overlay's animation length (CardPlayFlash / UltMomentFlash 2.3s).
    const HOLD_MS = G.action.kind === 'ult' ? 2400 : CARD_REVEAL_MS;
    const t = setTimeout(() => {
      try { (moves as any).completeAction(); } catch {}
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [G.action?.id, G.action?.state, G.action?.kind, moves]);

  const isTargetable = useCallback((card: CardInstance, owner: PlayerID): boolean => {
    if (!pending) return false;
    // Corpses (respawning heroes) are never valid targets.
    if ((card.respawnTurnsLeft ?? 0) > 0) return false;
    // 'self' means the armed card itself; filterAllows has no source to compare.
    if (pending.filter === 'self') return owner === me && pending.iid === card.iid;
    return filterAllows(pending.filter, card, owner, me);
  }, [pending, me]);

  /** True while a card-play / skill / ult reveal is mid-animation. Blocks
   *  the player from queueing the next move until the action visibly resolves. */
  const actionLocked = G.action?.state === 'begin';

  function onTapCardInHand(c: CardInstance) {
    if (!isMyTurn) return;
    if (actionLocked) return;
    const data = CARDS_BY_ID[c.cardId];
    if (!data) return;

    if (data.type === 'spell' || data.type === 'ultimate') {
      const ability = getAbility(data.abilities[0]);
      if (!ability) return;
      if (ability.target === 'noTarget') {
        moves.playCard(c.iid);
        return;
      }
      setPending({
        kind: 'playCard', iid: c.iid,
        title: data.name,
        desc: data.text ?? '',
        filter: ability.target,
      });
    } else if (data.type === 'equipment') {
      setPending({
        kind: 'playCard', iid: c.iid,
        title: data.name,
        desc: data.text ?? 'Attach to an ally hero.',
        filter: 'allyHero',
      });
    }
  }

  /**
   * Equipment attach gate: if the target hero is at the equipment cap (3),
   * open the replacement modal instead of dispatching playCard. The modal
   * calls back with the chosen discard iid, which is forwarded to playCard.
   * Returns true if the play was deferred to the modal (caller should not
   * call playCard directly).
   */
  function maybeOpenEquipmentReplace(handCardIid: string, heroCardIid: string): boolean {
    const handCard = G.players[me].hand.find((c) => c.iid === handCardIid);
    if (!handCard) return false;
    if (CARDS_BY_ID[handCard.cardId]?.type !== 'equipment') return false;
    const found = findOnBoard(G, heroCardIid);
    if (!found || found.owner !== me) return false;
    if ((found.card.attached ?? []).length < MAX_EQUIPMENT_PER_HERO) return false;
    setReplaceTarget({ incoming: handCard, hero: found.card });
    return true;
  }

  function onTapHero(card: CardInstance, owner: PlayerID) {
    // Corpses are non-interactive — they're respawning in their slot.
    if ((card.respawnTurnsLeft ?? 0) > 0) return;
    if (pending) {
      if (!isMyTurn || actionLocked) return;
      const valid = isTargetable(card, owner);
      if (!valid) {
        setPending(null);
        showNotice(`Not a valid target for ${pending.title}`, true);
        return;
      }
      if (pending.kind === 'playCard') {
        if (maybeOpenEquipmentReplace(pending.iid, card.iid)) { setPending(null); return; }
        moves.playCard(pending.iid, card.iid);
      } else {
        moves.useSkill(pending.iid, card.iid);
      }
      setPending(null);
      return;
    }
    // No pending action: open the preview for any hero (own or enemy).
    // Skill activation happens from inside the preview via the "Use Skill" button.
    setHeroDetail(card);
  }

  /**
   * Try to activate this hero's skill. Mirrors the engine guards
   * (`game.ts` useSkill) so the UI never opens a stale targeting overlay.
   */
  function tryUseSkill(card: CardInstance) {
    if (!isMyTurn) return;
    if (actionLocked) return;
    if (G.players[me].skillUsedThisTurn) return; // one skill per player per turn
    if (G.players[me].souls < 1) return; // skills cost 1 soul
    if (card.skillUsedThisTurn) return;
    if (card.statuses.some((s) => s.id === 'stun' || s.id === 'silenced')) return;
    const data = CARDS_BY_ID[card.cardId];
    if (data?.type !== 'hero' || !data.skill) return;
    const ability = getAbility(data.skill);
    if (!ability) return;
    if (ability.target === 'noTarget') { moves.useSkill(card.iid); return; }
    if (ability.target === 'self')     { moves.useSkill(card.iid, card.iid); return; }
    setPending({
      kind: 'useSkill', iid: card.iid,
      title: `${data.name} · Skill`,
      desc: ability.prompt ?? 'Choose a target.',
      filter: ability.target,
    });
  }

  function onHandDragEnd(c: CardInstance, x: number, y: number) {
    if (!isMyTurn) return;
    const data = CARDS_BY_ID[c.cardId];
    if (!data) return;

    let targetIid: string | null = null;
    for (const [iid, el] of slotRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        targetIid = iid;
        break;
      }
    }

    if (data.type === 'spell' || data.type === 'ultimate') {
      const ability = getAbility(data.abilities[0]);
      if (!ability) return;
      if (ability.target === 'noTarget') { moves.playCard(c.iid); setPending(null); return; }
      if (targetIid) {
        const found = findOnBoard(G, targetIid);
        if (found && filterAllows(ability.target, found.card, found.owner, me)) {
          moves.playCard(c.iid, targetIid);
          setPending(null);
          return;
        }
      }
      setPending({
        kind: 'playCard', iid: c.iid,
        title: data.name,
        desc: data.text ?? '',
        filter: ability.target,
      });
    } else if (data.type === 'equipment') {
      if (targetIid) {
        const found = findOnBoard(G, targetIid);
        if (found && found.owner === me && CARDS_BY_ID[found.card.cardId]?.type === 'hero') {
          if (maybeOpenEquipmentReplace(c.iid, targetIid)) { setPending(null); return; }
          moves.playCard(c.iid, targetIid);
          setPending(null);
          return;
        }
      }
      setPending({
        kind: 'playCard', iid: c.iid,
        title: data.name,
        desc: data.text ?? 'Attach to an ally hero.',
        filter: 'allyHero',
      });
    }
  }

  if (ctx.gameover) {
    const isStory = !!getMatchConfig().story;
    const won = ctx.gameover.winner === me;
    // Story battles return to the campaign map (win advances, loss ends the
    // run); a draw counts as a loss so the run still resolves. Quick Match
    // offers Rematch (fresh mount via Root's matchEpoch) and Main Menu.
    return (
      <MatchEndScreen
        G={G}
        me={me}
        won={won}
        draw={!!ctx.gameover.draw}
        isStory={isStory}
        isTutorial={isTutorial}
        onRematch={() => { if (matchNav) matchNav.rematch(); else location.reload(); }}
        onMenu={matchNav ? matchNav.exitToMenu : null}
        onStoryReturn={() => finishStoryBattle(won)}
      />
    );
  }

  const opp: PlayerID = '1';

  // Pre-match draft: render only the DraftOverlay; suppress the rest of the
  // board chrome. Boardgame.io currentPlayer drives whose pick it is, so we
  // still need props from G + ctx down to the overlay.
  if (G.draft) {
    return (
      <DraftOverlay
        draft={G.draft}
        currentPlayer={ctx.currentPlayer as PlayerID}
        me={me}
        onPick={(heroId) => (moves as any).draftPick(heroId)}
      />
    );
  }

  return (
    <LayoutGroup>
      <CombatProgressContext.Provider value={combatProgress}>
      <DamageFxContext.Provider value={damageFxFor}>
      <PosterBackdrop />

      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        margin: '0 auto',
        padding: isMobile ? '6px 6px 0' : '12px 16px 0',
        fontFamily: fonts.ui, color: poster.ink,
        position: 'relative',
      }}>
        {/* MAIN COLUMN — battle stage centered, side panel lives in a
            drawer slid in from the right (toggled by the chevron tab). */}
        <div
          ref={fitContainerRef}
          style={{
            flex: '1 1 auto',
            maxWidth: 1100,
            width: '100%',
            // Flexbox min-width:auto would stop this column shrinking below
            // the stage's intrinsic width, shoving the open panel off-screen
            // on tablet-width windows. Allowing shrink lets useFitScale see
            // the true leftover width and scale the stage down instead.
            minWidth: 0,
            position: 'relative', // anchors the corner-pinned turn controls
            display: 'flex',
            flexDirection: 'column',
            // Center the stage vertically so unused space spreads to top/bottom
            // rather than ballooning the active row. When the stage is taller
            // than the viewport, useFitScale shrinks it (transform below) so the
            // hand row stays on-screen instead of overflowing off the bottom.
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
            height: 'calc(100vh - 32px)',
          }}>
        <div
          ref={fitContentRef}
          style={{
            // Desktop: size to the stage's intrinsic width (the rows grid /
            // cream sheet) so useFitScale can fit BOTH axes — a 100%-wide
            // box always "fits" horizontally and the sheet clipped instead
            // of scaling on narrow windows.
            width: isMobile ? '100%' : 'fit-content',
            alignSelf: 'center',
            display: 'flex',
            flexDirection: 'column',
            // Generous fibonacci gap gives the rows visible breathing room
            // rather than packing them.
            gap: isMobile ? 20 : 40,
            transform: `scale(${fitScale})`,
            transformOrigin: 'center center',
          }}>
          {/* Rival's fan tucks behind the sheet's top edge — a small negative
              margin lets the card backs peek over the paper (the sheet stacks
              above via zIndex), so the face-down hand rests AT the board
              instead of floating in the room. Mobile keeps the flat gap. */}
          <div style={{ flex: '0 0 auto', position: 'relative', zIndex: 0, marginBottom: isMobile ? 0 : -10 }}>
            <OpponentHand cards={G.players[opp].hand} />
          </div>

          {/* 3×3 BOARD GRID — the three rows (opp bench, lane, my bench)
              sit on one flat cream sheet (BoardTable), a print floating on
              the blurred scene. Same flat plane on desktop and mobile. */}
          <div style={{
            // Stacks the sheet above the rival's fan so the paper's top edge
            // overlaps the tucked card bottoms (see OpponentHand wrapper).
            position: 'relative',
            zIndex: 1,
          }}>
          <div style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: boardRows.gap(isMobile),
            // Gutter margins: row tags live in the left margin; the turn
            // control dock sits in the right margin. Without them the
            // fit-content stage hugs the card grid and both sat on cards.
            paddingLeft: boardGutter(isMobile).left,
            paddingRight: boardGutter(isMobile).right,
            // translateZ(0) keeps a stacking context so the sheet layer can
            // never paint over the rows on either branch.
            transform: 'translateZ(0)',
          }}>
            {/* The cream sheet — decorative layer behind the rows. */}
            <BoardTable isMobile={isMobile} />

            {/* RIVAL VITALS — a narrow rule capping the top of the stack.
                Patron HP, deck, discard, hand, souls and skill readiness live
                here on the board rather than only in the panel, and being a
                real row it can't overlap the sheet's edge the way the old
                corner plate did. */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.vitals(isMobile)}px`, height: boardRows.vitals(isMobile), marginBottom: -vitalsPull(isMobile) }}>
              <PatronPlaque
                label={PATRON_NAMES.rival}
                ps={G.players[opp]}
                hostile
                skillUsed={G.players[opp].skillUsedThisTurn}
                projectedFaceDamage={ctx.currentPlayer === me ? projectedFaceDamage : 0}
                side="top"
                isMobile={isMobile}
                myTurn={!isMyTurn}
              />
            </div>

            {/* OPP BENCH (3 cards) */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.bench(isMobile)}px`, height: boardRows.bench(isMobile) }}>
              <BenchRow
                ps={G.players[opp]}
                owner={opp} myId={me}
                isOpponent
                pending={pending}
                onTapHero={onTapHero}
                onLongPressHero={(c) => setHeroDetail(c)}
                onEquipmentHover={(eq) => setPreview(eq ? { card: eq, hover: true } : null)}
                isTargetable={isTargetable}
                registerSlotRef={registerSlotRef}
              />
            </div>

            {/* THE DUEL — opp active and my active side by side. Active row
                is bench × golden ratio (180 × 1.618 ≈ 291) so the duel still
                reads as the focus while bench tiles show full portraits. */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.lane(isMobile)}px`, height: boardRows.lane(isMobile) }}>
              <ActiveDuel
                G={G}
                me={me}
                opp={opp}
                isMyTurn={isMyTurn}
                turn={G.turnNumber}
                pending={pending}
                onTapHero={onTapHero}
                onLongPressHero={(c) => setHeroDetail(c)}
                onEquipmentHover={(eq) => setPreview(eq ? { card: eq, hover: true } : null)}
                isTargetable={isTargetable}
                registerSlotRef={registerSlotRef}
                playerSkillSpent={G.players[me].skillUsedThisTurn}
              />
            </div>

            {/* MY BENCH (3 cards) */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.bench(isMobile)}px`, height: boardRows.bench(isMobile) }}>
              <BenchRow
                ps={G.players[me]}
                owner={me} myId={me}
                isOpponent={false}
                pending={pending}
                onTapHero={onTapHero}
                onLongPressHero={(c) => setHeroDetail(c)}
                onEquipmentHover={(eq) => setPreview(eq ? { card: eq, hover: true } : null)}
                isTargetable={isTargetable}
                registerSlotRef={registerSlotRef}
                playerSkillSpent={G.players[me].skillUsedThisTurn}
              />
            </div>

            {/* YOUR VITALS — the same rule closing the bottom of the stack. */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.vitals(isMobile)}px`, height: boardRows.vitals(isMobile), marginTop: -vitalsPull(isMobile) }}>
              <PatronPlaque
                label={PATRON_NAMES.you}
                ps={G.players[me]}
                skillUsed={G.players[me].skillUsedThisTurn}
                projectedFaceDamage={ctx.currentPlayer !== me ? projectedFaceDamage : 0}
                side="bottom"
                isMobile={isMobile}
                myTurn={isMyTurn}
              />
            </div>

            {/* Souls rail — vertical coin stack parallel to the 3×3 grid;
                top = rival, bottom = you, positions encode ownership. */}
            <SoulsRail
              rivalSouls={G.players[opp].souls}
              yourSouls={G.players[me].souls}
            />

            {/* Turn control dock — printed in the sheet's right margin,
                centred on the lane. Lives inside the plane so it reads as
                part of the board. Phones keep the controls in the hand tray
                instead. */}
            {!isMobile && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 150,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
                pointerEvents: 'none',
              }}>
                <BoardControls
                  variant="dock"
                  isMyTurn={isMyTurn}
                  busy={isMyTurn && (!!combatPlan || G.action?.state === 'begin' || queuedEndRef.current)}
                  hasPending={!!pending}
                  autoPlay={autoPlay}
                  onEnd={() => { setPending(null); triggerEndTurn(); }}
                  onCancel={() => setPending(null)}
                  onToggleAuto={() => setAutoPlay((v) => !v)}
                />
              </div>
            )}
          </div>
          </div>

          {/* zIndex 2 keeps the hand row above the board plane (zIndex 1),
              so cards rising on select/hover/drag pass OVER the sheet's
              bottom edge instead of sliding beneath it. */}
          <div style={{ flex: '0 0 auto', position: 'relative', zIndex: 2 }}>
            <HandTray
              cards={G.players[me].hand}
              disabled={!isMyTurn}
              pending={pending}
              isMyTurn={isMyTurn}
              busy={isMyTurn && (!!combatPlan || G.action?.state === 'begin' || queuedEndRef.current)}
              hasPending={!!pending}
              mySouls={G.players[me].souls}
              onTap={onTapCardInHand}
              onLongPress={(c) => setPreview({ card: c, hover: false })}
              onHover={(c) => setPreview(c ? { card: c, hover: true } : null)}
              onDragEndOver={onHandDragEnd}
              onUnaffordable={(_, cost) => showNotice(`Need ${cost} souls — you have ${G.players[me].souls}`, true)}
              onEnd={() => { setPending(null); triggerEndTurn(); }}
              onCancel={() => setPending(null)}
              autoPlay={autoPlay}
              onToggleAuto={() => setAutoPlay((v) => !v)}
            />
          </div>
        </div>

        </div>

        {/* PANEL DRAWER — slides in from the right edge, toggled by a thin
            chevron tab always visible at the right edge of the viewport. */}
        <PanelDrawer open={panelOpen} onToggle={() => setPanelOpen((v) => !v)}>
          <SidePanel
            G={G}
            turn={G.turnNumber}
            onLogToggle={() => setLogOpen((v) => !v)}
          />
        </PanelDrawer>

        <AnimatePresence>
          {pending && (
            <TargetingOverlay
              title={pending.title}
              desc={pending.desc}
              filter={pending.filter}
              onCancel={() => setPending(null)}
              // Desktop panel is an in-flow column the fixed banner can't see —
              // inset its centring so it tracks the visible board, not the
              // full viewport (its right end used to slide under the sheet).
              rightInset={!isMobile && panelOpen ? PANEL_WIDTH : 0}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>{logOpen && <Log entries={G.log} onClose={() => setLogOpen(false)} />}</AnimatePresence>

        <DragArrow
          active={!!pending}
          source={pending ? { x: window.innerWidth / 2, y: window.innerHeight - 130 } : null}
        />

        <AnimatePresence>
          {preview && <CardPreview key={preview.card.iid + (preview.hover ? '-h' : '-p')} cardId={preview.card.cardId} hover={preview.hover} onClose={() => setPreview(null)} />}
        </AnimatePresence>

        <AnimatePresence>
          {heroDetail && (() => {
            const found = findOnBoard(G, heroDetail.iid);
            const isMine = !!found && found.owner === me;
            const mySouls = G.players[me].souls;
            const isMyBench = isMine && heroDetail.zone === 'bench';
            const canRetreat = isMyTurn && isMyBench && mySouls >= RETREAT_COST && !!G.players[me].active;

            // Skill availability — mirrors `tryUseSkill` so the button only
            // shows when the engine would actually accept the move.
            const data = CARDS_BY_ID[heroDetail.cardId];
            const hasSkill = data?.type === 'hero' && !!data.skill;
            const heroCcd = heroDetail.statuses.some((s) => s.id === 'stun' || s.id === 'silenced');
            const playerSkillGate = G.players[me].skillUsedThisTurn;
            const SKILL_COST = 1;
            const canAffordSkill = mySouls >= SKILL_COST;
            const canUseSkill = isMyTurn
              && isMine
              && hasSkill
              && !heroDetail.skillUsedThisTurn
              && !playerSkillGate
              && !heroCcd
              && canAffordSkill;
            const skillBlockedReason =
              !isMine ? null :
              !isMyTurn ? "Not your turn" :
              playerSkillGate ? "1 skill per turn" :
              heroDetail.skillUsedThisTurn ? "Already used" :
              heroCcd ? "Cannot use skill (status)" :
              !canAffordSkill ? `Need ${SKILL_COST} soul` :
              null;

            return (
              <HeroDetailSheet
                card={heroDetail}
                isMine={isMine}
                canUseSkill={canUseSkill}
                skillBlockedReason={skillBlockedReason ?? undefined}
                onUseSkill={() => tryUseSkill(heroDetail)}
                canRetreat={canRetreat}
                retreatCost={RETREAT_COST}
                onRetreat={() => {
                  if (heroDetail.slot && heroDetail.slot >= 1 && heroDetail.slot <= 3) {
                    (moves as any).moveHero(heroDetail.slot, 0);
                  }
                }}
                onClose={() => setHeroDetail(null)}
              />
            );
          })()}
        </AnimatePresence>

        <AnimatePresence>
          {G.mulliganPending && (
            <MulliganOverlay
              cards={G.players[me].hand}
              onConfirm={(iids) => {
                (moves as any).mulligan(iids);
                showNotice(iids.length === 0
                  ? 'Kept opening hand'
                  : `Swapped ${iids.length} card${iids.length === 1 ? '' : 's'}`);
              }}
            />
          )}
        </AnimatePresence>

        {/* Promotion prompt: opens when our Active is a corpse and we have at
            least one alive bench hero who can step up. Blocks board input
            until a choice is made. */}
        <AnimatePresence>
          {(() => {
            const ps = G.players[me];
            // Single source of truth: the engine's `resolve` pass flags when a
            // promotion is owed. (No recompute of the corpse/candidate condition.)
            if (G.pendingPromotion !== me || G.mulliganPending) return null;
            const candidates = (ps.bench.filter((b) => {
              if (!b || (b.respawnTurnsLeft ?? 0) > 0) return false;
              const d = CARDS_BY_ID[b.cardId];
              return d?.type === 'hero' && !d.flags?.benchOnly;
            }) as CardInstance[]);
            if (candidates.length === 0) return null;
            return (
              <PromotionOverlay
                candidates={candidates}
                fallenName={CARDS_BY_ID[ps.active!.cardId]?.name ?? 'Your Active'}
                onPick={(iid) => (moves as any).promoteToActive(iid)}
              />
            );
          })()}
        </AnimatePresence>

        <AnimatePresence>
          {replaceTarget && (
            <EquipmentReplaceOverlay
              incoming={replaceTarget.incoming}
              hero={replaceTarget.hero}
              onPick={(discardIid) => {
                moves.playCard(replaceTarget.incoming.iid, replaceTarget.hero.iid, discardIid);
                setReplaceTarget(null);
              }}
              onCancel={() => setReplaceTarget(null)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {combatPlan && (
            <CombatChoreographer
              plan={combatPlan}
              slotRefs={slotRefs.current}
              stepDuration={COMBAT_STEP_MS / combatSpeed}
              onComplete={handleCombatComplete}
              onBeatIndexChange={setCombatBeat}
            />
          )}
        </AnimatePresence>

        <UltMomentFlash G={G} />
        <CardPlayFlash
          G={G}
          onSkip={() => { try { (moves as any).completeAction(); } catch {} }}
        />

        {/* Feedback sticker — one ink label above the hand (red when it is
            a warning). Explains silent no-ops and confirms fire-and-forget
            actions. */}
        <AnimatePresence>
          {notice && (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
              transition={spring.default}
              style={{
                position: 'fixed',
                left: 0, right: 0,
                bottom: 196,
                display: 'flex',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 95,
              }}
            >
              <span style={{
                padding: '8px 16px',
                background: notice.warn ? poster.red : poster.ink,
                color: poster.paper,
                borderRadius: 3,
                fontFamily: fonts.display,
                fontSize: 11,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                lineHeight: 1.2,
                boxShadow: '0 6px 16px rgba(0, 0, 0, 0.45)',
              }}>
                {notice.msg}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {isTutorial && (
        <CoachPlate
          G={G}
          me={me}
          isMyTurn={isMyTurn}
          targeting={!!pending}
          sheetOpen={!!heroDetail}
        />
      )}
      </DamageFxContext.Provider>
      </CombatProgressContext.Provider>
    </LayoutGroup>
  );
}









