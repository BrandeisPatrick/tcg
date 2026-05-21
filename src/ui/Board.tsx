import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroPortrait } from '@/cards/art/heroArt';
import { Hand } from './board/Hand';
import { Log } from './side-panel/Log';
import { LogLine } from './side-panel/LogLine';
import { TargetingOverlay } from './overlays/TargetingOverlay';
import { TurnBanner } from './effects/TurnBanner';
import { DamageFloaters, type FloaterEntry } from './effects/DamageFloater';
import { CardPreview } from './overlays/CardPreview';
import { HeroDetailSheet } from './overlays/HeroDetailSheet';
import { OpponentHand } from './board/OpponentHand';
import { ArenaBackdrop } from './board/ArenaBackdrop';
import { DragArrow } from './effects/DragArrow';
import { MulliganOverlay } from './overlays/MulliganOverlay';
import { PromotionOverlay } from './overlays/PromotionOverlay';
import { EquipmentReplaceOverlay } from './overlays/EquipmentReplaceOverlay';
import { MAX_EQUIPMENT_PER_HERO } from '@/engine/game';
import { BenchRow } from './board/BenchRow';
import { ActiveSlot } from './board/ActiveSlot';
import { ActiveDuel } from './board/ActiveDuel';
import { enumerateAIMoves } from '@/ai/heuristic';
import { getAbility, type TargetFilter } from '@/abilities';
import { planAttackPhase, type AttackPlan } from '@/engine/combat';
import { CombatChoreographer, type BeatImpact } from './effects/CombatChoreographer';
import { UltMomentFlash } from './effects/UltMomentFlash';
import { CardPlayFlash } from './effects/CardPlayFlash';
import { COMBAT_STEP_MS } from './hooks/useCombatSpeed';
import { palette, fonts, radius, shadow, spring, text } from './tokens';
import { SidePanel } from './side-panel/SidePanel';
import { HandTray } from './board/HandTray';
import { findOnBoard, filterAllows, type PendingPlay } from './helpers';

// Animation / pacing constants.
const FLOATER_CLEAR_MS = 2000; // how long damage/heal floaters stay on-screen (long enough to read the number; calibrated to outlast the attack-beat impact phase)
const AI_THINK_MS = 800;        // delay between AI moves; also gives combat anims time to settle

export function Board(props: BoardProps<GameState>) {
  const { G, ctx, moves } = props;
  const me: PlayerID = '0';
  const isMyTurn = ctx.currentPlayer === me;
  const [pending, setPending] = useState<PendingPlay | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [floaters, setFloaters] = useState<FloaterEntry[]>([]);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerText, setBannerText] = useState('');
  const [bannerTone, setBannerTone] = useState<'self' | 'opponent'>('self');
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
  // iids whose HP delta we should NOT emit a DamageFloater for, because the
  // combat choreographer just drew its own −N for the same hit. Populated
  // when a combat plan starts; cleared shortly after the engine resolves.
  const combatTargetIidsRef = useRef<Set<string>>(new Set());
  const combatTargetsClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // After the engine resolves, the HP-diff effect will fire one render later.
    // Keep the suppression set alive briefly so that effect skips the floater
    // pushes for iids the choreographer already painted, then clear it.
    if (combatTargetsClearTimerRef.current) clearTimeout(combatTargetsClearTimerRef.current);
    combatTargetsClearTimerRef.current = setTimeout(() => {
      combatTargetIidsRef.current = new Set();
      combatTargetsClearTimerRef.current = null;
    }, 200);
  }, []);

  /** Per-beat impact handler — pushes damage numbers into the shared
   *  DamageFloaters layer at the cinematic impact moment, so combat numbers
   *  use the same renderer and the same anchor position as skill / spell /
   *  heal numbers triggered elsewhere on the board. */
  const handleBeatImpact = useCallback((impact: BeatImpact) => {
    const additions: FloaterEntry[] = [];
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (impact.primary && impact.step.finalDamage > 0) {
      additions.push({
        id: `combat-primary-${impact.primary.iid}-${stamp}`,
        iid: impact.primary.iid,
        value: -impact.step.finalDamage,
        kind: impact.primary.iid.startsWith('face-') ? 'face' : 'attack',
        x: impact.primary.x,
        y: impact.primary.y,
      });
    }
    if (impact.retaliation && impact.step.retaliationDamage > 0) {
      additions.push({
        id: `combat-retal-${impact.retaliation.iid}-${stamp}`,
        iid: impact.retaliation.iid,
        value: -impact.step.retaliationDamage,
        kind: 'attack',
        x: impact.retaliation.x,
        y: impact.retaliation.y,
      });
    }
    if (additions.length) {
      setFloaters((cur) => [...cur, ...additions]);
      setTimeout(() => {
        setFloaters((cur) => cur.filter((f) => !additions.some((a) => a.id === f.id)));
      }, FLOATER_CLEAR_MS);
    }
  }, []);

  /** Intercept end-turn to play the attack-phase animation before the engine resolves. */
  const triggerEndTurn = useCallback(() => {
    if (combatPlan) return; // already animating
    if (G.action?.state === 'begin') return; // wait for card/skill reveal first
    const plan = planAttackPhase(G, ctx.currentPlayer as PlayerID);
    if (plan.steps.length === 0) {
      moves.endTurn();
      return;
    }
    pendingEndTurnRef.current = () => {
      try { moves.endTurn(); } catch {}
      pendingEndTurnRef.current = null;
    };
    // Snapshot which iids the choreographer will paint a −N over, so the
    // HP-diff effect skips duplicating the same number. Includes the
    // attacker iid whenever a beat carries retaliation damage — the attacker
    // also takes a hit on resolve, and the choreographer fires its own
    // floater for that side.
    const targets = new Set<string>();
    const oppPid: PlayerID = ctx.currentPlayer === '0' ? '1' : '0';
    for (const s of plan.steps) {
      if (s.targetIid) targets.add(s.targetIid);
      else targets.add(`face-${oppPid}`);
      if (s.retaliationDamage > 0) targets.add(s.attackerIid);
    }
    combatTargetIidsRef.current = targets;
    if (combatTargetsClearTimerRef.current) {
      clearTimeout(combatTargetsClearTimerRef.current);
      combatTargetsClearTimerRef.current = null;
    }
    setCombatPlan(plan);
  }, [G, ctx.currentPlayer, combatPlan, moves, G.action]);

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

  const prevHpRef = useRef<Map<string, number>>(new Map());
  const prevHpMaxRef = useRef<Map<string, number>>(new Map());
  const prevPlayerHpRef = useRef<{ '0': number; '1': number }>({ '0': 20, '1': 20 });

  useEffect(() => {
    const additions: FloaterEntry[] = [];
    const newHp = new Map<string, number>();
    const newHpMax = new Map<string, number>();
    const collect = (c: CardInstance | null) => {
      if (!c) return;
      newHp.set(c.iid, c.hp);
      newHpMax.set(c.iid, c.hpMax);
      const prev = prevHpRef.current.get(c.iid);
      const prevMax = prevHpMaxRef.current.get(c.iid);
      if (prev !== undefined && prev !== c.hp) {
        if (combatTargetIidsRef.current.has(c.iid)) return;
        // Level-up grants +N HP and +N hpMax in lock-step (see expSystem.grantExp).
        // That's a stat upgrade, not a heal — suppress the floater so it doesn't
        // double up with the level-ring tick + log line. Only an hp increase
        // that exceeds the hpMax increase is treated as a true heal.
        const hpDelta = c.hp - prev;
        const maxDelta = prevMax !== undefined ? c.hpMax - prevMax : 0;
        if (hpDelta > 0 && maxDelta > 0 && hpDelta === maxDelta) return;
        const el = slotRefs.current.get(c.iid);
        const rect = el?.getBoundingClientRect();
        if (rect) {
          additions.push({
            id: `${c.iid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            iid: c.iid,
            value: hpDelta,
            kind: hpDelta > 0 ? 'heal' : 'attack',
            // Anchor: TOP edge of the card. The floater renders just above and
            // floats further up. Identical position whether the trigger is
            // combat damage, a skill, a status tick, or a heal.
            x: rect.left + rect.width / 2,
            y: rect.top,
          });
        }
      }
    };
    for (const pid of ['0', '1'] as PlayerID[]) {
      collect(G.players[pid].active);
      for (const b of G.players[pid].bench) collect(b);
    }
    for (const pid of ['0', '1'] as PlayerID[]) {
      const prev = prevPlayerHpRef.current[pid];
      if (prev !== G.players[pid].hp) {
        if (!combatTargetIidsRef.current.has(`face-${pid}`)) {
          additions.push({
            id: `face-${pid}-${Date.now()}`,
            iid: `face-${pid}`,
            value: G.players[pid].hp - prev,
            kind: 'face',
            // y = top of the face zone (matches the synthetic combat band).
            x: window.innerWidth / 2,
            y: pid === me ? window.innerHeight - 156 : 16,
          });
        }
        prevPlayerHpRef.current[pid] = G.players[pid].hp;
      }
    }
    prevHpRef.current = newHp;
    prevHpMaxRef.current = newHpMax;
    if (additions.length) {
      setFloaters((cur) => [...cur, ...additions]);
      setTimeout(() => {
        setFloaters((cur) => cur.filter((f) => !additions.some((a) => a.id === f.id)));
      }, FLOATER_CLEAR_MS);
    }
  }, [G]);

  const lastTurnRef = useRef<{ turn: number; player: string }>({ turn: ctx.turn, player: ctx.currentPlayer });
  useEffect(() => {
    const cur = { turn: ctx.turn, player: ctx.currentPlayer };
    const prev = lastTurnRef.current;
    if (cur.player !== prev.player || cur.turn !== prev.turn) {
      const isMy = cur.player === me;
      setBannerText(isMy ? 'Your Move' : "Rival's Move");
      setBannerTone(isMy ? 'self' : 'opponent');
      setBannerVisible(true);
      const t = setTimeout(() => setBannerVisible(false), 2200);
      lastTurnRef.current = cur;
      return () => clearTimeout(t);
    }
  }, [ctx.turn, ctx.currentPlayer]);

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
    const HOLD_MS = 2400;
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
    const hasIC = card.attached?.some((eq) => eq.cardId === 'improved_cooldown') ?? false;
    if (G.players[me].skillUsedThisTurn && !hasIC) return; // player-wide rule (IC bypass)
    if (card.skillUsedThisTurn) return;
    if (card.statuses.some((s) => s.id === 'stun' || s.id === 'silenced' || s.id === 'sleep')) return;
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
    const txt = ctx.gameover.draw ? 'Draw' :
      ctx.gameover.winner === me ? 'Patron Falls' : 'Outflanked';
    const tone = ctx.gameover.winner === me ? palette.success : palette.danger;
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
        <button
          onClick={() => location.reload()}
          style={{
            background: `linear-gradient(180deg, ${tone}aa, ${tone}66)`,
            color: palette.text, padding: '16px 40px', border: 'none', borderRadius: 12,
            fontFamily: fonts.ui, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', boxShadow: shadow.lg,
          }}
        >Rematch</button>
      </div>
    );
  }

  const opp: PlayerID = '1';

  return (
    <LayoutGroup>
      <ArenaBackdrop />
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1100px) 280px',
        gridTemplateRows: '1fr',
        maxWidth: 1460,
        margin: '0 auto',
        gap: 16,
        padding: '12px 16px 0',
        fontFamily: fonts.ui, color: palette.text,
        position: 'relative',
        justifyContent: 'center',
      }}>
        {/* MAIN COLUMN */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: 0,
          height: 'calc(100vh - 32px)',
        }}>
          <div style={{ flex: '0 0 auto' }}>
            <OpponentHand cards={G.players[opp].hand} />
          </div>

          {/* OPP BENCH (3 cards) */}
          <div style={{ flex: '0 0 130px' }}>
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

          {/* THE DUEL — opp active and my active side by side */}
          <div style={{ flex: '1 1 290px', minHeight: 290 }}>
            <ActiveDuel
              G={G}
              me={me}
              opp={opp}
              isMyTurn={isMyTurn}
              turn={ctx.turn}
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
          <div style={{ flex: '0 0 130px' }}>
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

          <div style={{ flex: '0 0 auto' }}>
            <HandTray
              cards={G.players[me].hand}
              disabled={!isMyTurn}
              pending={pending}
              isMyTurn={isMyTurn}
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

        {/* RIGHT SIDE PANEL */}
        <SidePanel
          G={G}
          me={me}
          isMyTurn={isMyTurn}
          turn={ctx.turn}
          onLogToggle={() => setLogOpen((v) => !v)}
          projectedFaceDamageMe={ctx.currentPlayer !== me ? projectedFaceDamage : 0}
          projectedFaceDamageOpp={ctx.currentPlayer === me ? projectedFaceDamage : 0}
        />

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

        <DamageFloaters entries={floaters} />

        <DragArrow
          active={!!pending}
          source={pending ? { x: window.innerWidth / 2, y: window.innerHeight - 130 } : null}
        />

        <TurnBanner visible={bannerVisible} text={bannerText} tone={bannerTone} />

        <AnimatePresence>
          {preview && <CardPreview key={preview.card.iid + (preview.hover ? '-h' : '-p')} cardId={preview.card.cardId} hover={preview.hover} onClose={() => setPreview(null)} />}
        </AnimatePresence>

        <AnimatePresence>
          {heroDetail && (() => {
            const found = findOnBoard(G, heroDetail.iid);
            const isMine = !!found && found.owner === me;
            const mySouls = G.players[me].souls;
            const RETREAT_COST = 2;
            const isMyBench = isMine && heroDetail.zone === 'bench';
            const canRetreat = isMyTurn && isMyBench && mySouls >= RETREAT_COST && !!G.players[me].active;

            // Skill availability — mirrors `tryUseSkill` so the button only
            // shows when the engine would actually accept the move.
            const data = CARDS_BY_ID[heroDetail.cardId];
            const hasSkill = data?.type === 'hero' && !!data.skill;
            const heroCcd = heroDetail.statuses.some((s) => s.id === 'stun' || s.id === 'silenced' || s.id === 'sleep');
            const heroHasIC = heroDetail.attached?.some((eq) => eq.cardId === 'improved_cooldown') ?? false;
            const playerSkillGate = G.players[me].skillUsedThisTurn && !heroHasIC;
            const canUseSkill = isMyTurn
              && isMine
              && hasSkill
              && !heroDetail.skillUsedThisTurn
              && !playerSkillGate
              && !heroCcd;
            const skillBlockedReason =
              !isMine ? null :
              !isMyTurn ? "Not your turn" :
              playerSkillGate ? "1 skill per turn" :
              heroDetail.skillUsedThisTurn ? "Already used" :
              heroCcd ? "Cannot use skill (status)" :
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
              onBeatImpact={handleBeatImpact}
            />
          )}
        </AnimatePresence>

        <UltMomentFlash G={G} />
        <CardPlayFlash G={G} />
      </div>
    </LayoutGroup>
  );
}









