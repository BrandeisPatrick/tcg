import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, CardInstance, PlayerID, DamageEvent } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroPortrait } from '@/cards/art/heroArt';
import { Hand } from './board/Hand';
import { Log } from './side-panel/Log';
import { LogLine } from './side-panel/LogLine';
import { TargetingOverlay } from './overlays/TargetingOverlay';
import { CardPreview } from './overlays/CardPreview';
import { HeroDetailSheet } from './overlays/HeroDetailSheet';
import { OpponentHand } from './board/OpponentHand';
import { ArenaBackdrop } from './board/ArenaBackdrop';
import { DragArrow } from './effects/DragArrow';
import { MulliganOverlay } from './overlays/MulliganOverlay';
import { DraftOverlay } from './overlays/DraftOverlay';
import { PromotionOverlay } from './overlays/PromotionOverlay';
import { EquipmentReplaceOverlay } from './overlays/EquipmentReplaceOverlay';
import { MAX_EQUIPMENT_PER_HERO, RETREAT_COST } from '@/engine/game';
import { BenchRow } from './board/BenchRow';
import { ActiveSlot } from './board/ActiveSlot';
import { ActiveDuel } from './board/ActiveDuel';
import { enumerateAIMoves } from '@/ai/heuristic';
import { getAbility, type TargetFilter } from '@/abilities';
import { planAttackPhase, type AttackPlan } from '@/engine/combat';
import { CombatChoreographer } from './effects/CombatChoreographer';
import { SoulsRail } from './board/SoulsRail';
import { CombatProgressContext, type CombatProgress } from './effects/CombatProgressContext';
import { DamageFxContext, type DamageFxResolver } from './effects/DamageFxContext';
import { UltMomentFlash } from './effects/UltMomentFlash';
import { CardPlayFlash } from './effects/CardPlayFlash';
import { COMBAT_STEP_MS } from './hooks/useCombatSpeed';
import { useFitScale } from './hooks/useFitScale';
import { palette, fonts, radius, shadow, spring, text, DAMAGE_BEAT_MS } from './tokens';
import { SidePanel } from './side-panel/SidePanel';
import { PanelDrawer } from './side-panel/PanelDrawer';
import { HandTray } from './board/HandTray';
import { findOnBoard, filterAllows, type PendingPlay } from './helpers';
import { getMatchConfig } from '@/storage/matchConfig';
import { finishStoryBattle } from '@/story/storyRun';

// Animation / pacing constants.
const AI_THINK_MS = 800;        // delay between AI moves; also gives combat anims time to settle

export function Board(props: BoardProps<GameState>) {
  const { G, ctx, moves } = props;
  const me: PlayerID = '0';
  const isMyTurn = ctx.currentPlayer === me;
  const [pending, setPending] = useState<PendingPlay | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
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

  const combatProgress: CombatProgress = combatPlan
    ? { total: combatPlan.steps.length, currentBeat: combatBeat, attackerIsMe: combatPlan.attackerId === me }
    : null;

  // Scale the battle stage to fit shorter viewports so the hand row never gets
  // clipped off the bottom of the screen.
  const { containerRef: fitContainerRef, contentRef: fitContentRef, scale: fitScale } = useFitScale();

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
  // HeroSlot (per-card) and PlayerCard (patron HP) — no central floater
  // pushes here. Removing the old HP-diff effect also drops the
  // combat-vs-card-diff deduplication ref it used to need.

  // Turn-change acknowledgement now lives on the TurnCompass itself
  // (ring-burst + chevron flip + hue swap on isMyTurn change). No
  // banner needed.

  // AI loop. Pauses while combat is animating OR while a card-play / skill /
  // ult reveal is in flight (so the AI doesn't fire its next move on top of
  // its previous animation).
  useEffect(() => {
    if (ctx.gameover || ctx.currentPlayer !== '1' || combatPlan) return;
    if (G.action?.state === 'begin') return;
    const t = setTimeout(() => {
      const opts = enumerateAIMoves(G, ctx);
      if (opts.length === 0) { triggerEndTurn(); return; }
      const best = opts[0];
      try {
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
  }, [ctx.currentPlayer, ctx.turn, G, moves, ctx, combatPlan, triggerEndTurn, G.action]);

  // Action reveal driver. When the engine sets G.action with state='begin'
  // (after playCard / useSkill), schedule completeAction so the animation
  // hold matches the dispatcher unlock. Player input is blocked elsewhere
  // via `actionLocked` until this fires.
  useEffect(() => {
    if (G.action?.state !== 'begin') return;
    const HOLD_MS = 3200;
    const t = setTimeout(() => {
      try { (moves as any).completeAction(); } catch {}
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [G.action?.id, G.action?.state, moves]);

  const isTargetable = useCallback((card: CardInstance, owner: PlayerID): boolean => {
    if (!pending) return false;
    // Corpses (respawning heroes) are never valid targets.
    if ((card.respawnTurnsLeft ?? 0) > 0) return false;
    const isAlly = owner === me;
    switch (pending.filter) {
      case 'noTarget': return false;
      case 'self': return isAlly && pending.iid === card.iid;
      case 'allyAny': return isAlly;
      case 'allyHero': return isAlly && CARDS_BY_ID[card.cardId]?.type === 'hero';
      case 'enemyAny': return !isAlly;
      case 'enemyHero': return !isAlly && CARDS_BY_ID[card.cardId]?.type === 'hero';
      case 'enemyActive': return !isAlly && card.zone === 'active';
      case 'anyBoard': return true;
    }
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
      if (!valid) { setPending(null); return; }
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
    const tone = won ? palette.success : palette.danger;
    const txt = ctx.gameover.draw ? 'Draw' :
      isStory ? (won ? 'Victory' : 'Defeated') :
      won ? 'Patron Falls' : 'Outflanked';
    // Story battles return to the campaign map (win advances, loss ends the
    // run); a draw counts as a loss so the run still resolves. Quick Match
    // just reloads for a rematch.
    return (
      <div style={{
        height: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: `radial-gradient(circle at 50% 35%, ${tone}30, ${palette.bg0})`,
        fontFamily: fonts.ui, gap: 28,
      }}>
        <motion.h1
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.bouncy}
          style={{
            fontSize: 22, fontWeight: 700, color: tone,
            textShadow: `0 0 40px ${tone}aa`, margin: 0,
          }}
        >{txt}</motion.h1>
        {isStory && !ctx.gameover.draw && (
          <div style={{ ...text.body, color: palette.textDim, marginTop: -14 }}>
            {won ? 'The block is yours — press on uptown.' : 'Your run ends in the old city.'}
          </div>
        )}
        <button
          onClick={() => { if (isStory) finishStoryBattle(won); else location.reload(); }}
          style={{
            background: `linear-gradient(180deg, ${tone}aa, ${tone}66)`,
            color: palette.text, padding: '16px 40px', border: 'none', borderRadius: 12,
            fontFamily: fonts.ui, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', boxShadow: shadow.lg,
          }}
        >{isStory ? 'Return to Map' : 'Rematch'}</button>
      </div>
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
      <ArenaBackdrop />
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        margin: '0 auto',
        padding: '12px 16px 0',
        fontFamily: fonts.ui, color: palette.text,
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
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            // Generous fibonacci gap gives the rows visible breathing room
            // rather than packing them.
            gap: 40,
            transform: `scale(${fitScale})`,
            transformOrigin: 'center center',
          }}>
          <div style={{ flex: '0 0 auto' }}>
            <OpponentHand cards={G.players[opp].hand} />
          </div>

          {/* 3×3 BOARD GRID — wraps the three rows (opp bench, lane, my
              bench) in a positioning context so SoulsRail can pin to the
              right edge, running parallel to the grid. */}
          <div style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: 40,
          }}>
            {/* OPP BENCH (3 cards) */}
            <div style={{ flex: '0 0 180px', height: 180 }}>
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
            <div style={{ flex: '0 0 290px', height: 290 }}>
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
            <div style={{ flex: '0 0 180px', height: 180 }}>
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

            {/* Souls rail — vertical gem stack parallel to the 3×3 grid;
                top = rival, bottom = you, positions encode ownership. */}
            <SoulsRail
              rivalSouls={G.players[opp].souls}
              yourSouls={G.players[me].souls}
            />
          </div>

          <div style={{ flex: '0 0 auto' }}>
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
              onEnd={() => { setPending(null); triggerEndTurn(); }}
              onCancel={() => setPending(null)}
            />
          </div>
        </div>
        </div>

        {/* PANEL DRAWER — slides in from the right edge, toggled by a thin
            chevron tab always visible at the right edge of the viewport. */}
        <PanelDrawer open={panelOpen} onToggle={() => setPanelOpen((v) => !v)}>
          <SidePanel
            G={G}
            me={me}
            isMyTurn={isMyTurn}
            turn={G.turnNumber}
            onLogToggle={() => setLogOpen((v) => !v)}
            projectedFaceDamageMe={ctx.currentPlayer !== me ? projectedFaceDamage : 0}
            projectedFaceDamageOpp={ctx.currentPlayer === me ? projectedFaceDamage : 0}
          />
        </PanelDrawer>

        <AnimatePresence>
          {pending && (
            <TargetingOverlay
              title={pending.title}
              desc={pending.desc}
              filter={pending.filter}
              onCancel={() => setPending(null)}
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
              onConfirm={(iids) => (moves as any).mulligan(iids)}
            />
          )}
        </AnimatePresence>

        {/* Promotion prompt: opens when our Active is a corpse and we have at
            least one alive bench hero who can step up. Blocks board input
            until a choice is made. */}
        <AnimatePresence>
          {(() => {
            const ps = G.players[me];
            const activeCorpse = ps.active && (ps.active.respawnTurnsLeft ?? 0) > 0;
            if (!activeCorpse || G.mulliganPending) return null;
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
              stepDuration={COMBAT_STEP_MS}
              onComplete={handleCombatComplete}
              onBeatIndexChange={setCombatBeat}
            />
          )}
        </AnimatePresence>

        <UltMomentFlash G={G} />
        <CardPlayFlash G={G} />
      </div>
      </DamageFxContext.Provider>
      </CombatProgressContext.Provider>
    </LayoutGroup>
  );
}









