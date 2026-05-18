import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroPortrait } from '@/cards/art/heroArt';
import { PlayerArea } from './PlayerArea';
import { Hand } from './Hand';
import { Log } from './Log';
import { TargetingOverlay } from './TargetingOverlay';
import { TurnBanner } from './TurnBanner';
import { DamageFloaters, type FloaterEntry } from './DamageFloater';
import { CardPreview } from './CardPreview';
import { HeroDetailSheet } from './HeroDetailSheet';
import { OpponentHand } from './OpponentHand';
import { ArenaBackdrop } from './ArenaBackdrop';
import { DragArrow } from './DragArrow';
import { MulliganOverlay } from './MulliganOverlay';
import { PromotionOverlay } from './PromotionOverlay';
import { BenchRow } from './BenchRow';
import { ActiveSlot } from './ActiveSlot';
import { ActiveDuel } from './ActiveDuel';
import { enumerateAIMoves } from '@/ai/heuristic';
import { getAbility, type TargetFilter } from '@/abilities';
import { planAttackPhase, type AttackPlan } from '@/engine/combat';
import { CombatChoreographer } from './CombatChoreographer';
import { UltMomentFlash } from './UltMomentFlash';
import { useCombatSpeed, COMBAT_SPEED_MS, type CombatSpeed } from './useCombatSpeed';
import { palette, fonts, radius, shadow, spring, text } from './tokens';

interface PendingPlay {
  kind: 'playCard' | 'useSkill';
  iid: string;
  title: string;
  desc: string;
  filter: TargetFilter;
}

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
  const [attackingIids, setAttackingIids] = useState<Set<string>>(new Set());
  // Combat animation gate. While non-null, end-turn is intercepted — the
  // choreographer walks the plan visually, then we call the actual move.
  const [combatPlan, setCombatPlan] = useState<AttackPlan | null>(null);
  // Pending end-turn callback to fire once choreographer completes.
  const pendingEndTurnRef = useRef<(() => void) | null>(null);
  const [combatSpeed, setCombatSpeed] = useCombatSpeed();

  const slotRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerSlotRef = useCallback((iid: string, el: HTMLElement | null) => {
    if (el) slotRefs.current.set(iid, el);
    else slotRefs.current.delete(iid);
  }, []);

  // Face-damage projection feeds the patron HP bar indicator (the per-hero
  // ▼N badges were removed as visual noise — combat choreographer shows
  // damage events when they land).
  const projectedFaceDamage = useMemo(() => {
    if (ctx.gameover) return 0;
    const plan = planAttackPhase(G, ctx.currentPlayer as PlayerID);
    return plan.damageToFace;
  }, [G, ctx.currentPlayer, ctx.gameover]);

  /** Intercept end-turn to play the attack-phase animation before the engine resolves. */
  const triggerEndTurn = useCallback(() => {
    if (combatPlan) return; // already animating
    // Instant speed = no animation, just resolve.
    if (combatSpeed === 'instant') { moves.endTurn(); return; }
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
  }, [G, ctx.currentPlayer, combatPlan, moves, combatSpeed]);

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

  const prevHpRef = useRef<Map<string, number>>(new Map());
  const prevPlayerHpRef = useRef<{ '0': number; '1': number }>({ '0': 20, '1': 20 });

  useEffect(() => {
    const additions: FloaterEntry[] = [];
    const newHp = new Map<string, number>();
    const collect = (c: CardInstance | null) => {
      if (!c) return;
      newHp.set(c.iid, c.hp);
      const prev = prevHpRef.current.get(c.iid);
      if (prev !== undefined && prev !== c.hp) {
        const el = slotRefs.current.get(c.iid);
        const rect = el?.getBoundingClientRect();
        if (rect) {
          additions.push({
            id: `${c.iid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            iid: c.iid,
            value: c.hp - prev,
            kind: c.hp > prev ? 'heal' : 'attack',
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
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
        additions.push({
          id: `face-${pid}-${Date.now()}`,
          iid: `face-${pid}`,
          value: G.players[pid].hp - prev,
          kind: 'face',
          x: pid === me ? window.innerWidth / 2 : window.innerWidth / 2,
          y: pid === me ? window.innerHeight - 110 : 70,
        });
        prevPlayerHpRef.current[pid] = G.players[pid].hp;
      }
    }
    prevHpRef.current = newHp;
    if (additions.length) {
      setFloaters((cur) => [...cur, ...additions]);
      setTimeout(() => {
        setFloaters((cur) => cur.filter((f) => !additions.some((a) => a.id === f.id)));
      }, 950);
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
      const t = setTimeout(() => setBannerVisible(false), 900);
      lastTurnRef.current = cur;
      return () => clearTimeout(t);
    }
  }, [ctx.turn, ctx.currentPlayer]);

  useEffect(() => {
    if (ctx.turn === 1) return;
    const justAttackedPid: PlayerID = ctx.currentPlayer === me ? '1' : '0';
    const ps = G.players[justAttackedPid];
    const ids = new Set<string>();
    if (ps.active) ids.add(ps.active.iid);
    for (const b of ps.bench) {
      if (!b) continue;
      const data = CARDS_BY_ID[b.cardId];
      if (data?.type === 'hero' && data.flags?.longRange) ids.add(b.iid);
    }
    setAttackingIids(ids);
    const t = setTimeout(() => setAttackingIids(new Set()), 380);
    return () => clearTimeout(t);
  }, [ctx.turn, ctx.currentPlayer, G, me]);

  // AI loop. Pauses while combat is animating.
  useEffect(() => {
    if (ctx.gameover || ctx.currentPlayer !== '1' || combatPlan) return;
    const t = setTimeout(() => {
      const opts = enumerateAIMoves(G, ctx);
      if (opts.length === 0) { triggerEndTurn(); return; }
      const best = opts[0];
      try {
        if (best.move === 'endTurn') triggerEndTurn();
        else if (best.move === 'playCard') (moves.playCard as any)(...best.args);
        else if (best.move === 'useSkill') (moves.useSkill as any)(...best.args);
        else if (best.move === 'moveHero') (moves.moveHero as any)(...best.args);
        else if (best.move === 'promoteToActive') (moves as any).promoteToActive(...best.args);
        else triggerEndTurn(); // unknown move kind — bail rather than freeze the AI loop
      } catch {
        triggerEndTurn();
      }
    }, 800);
    return () => clearTimeout(t);
  }, [ctx.currentPlayer, ctx.turn, G, moves, ctx, combatPlan, triggerEndTurn]);

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

  function onTapCardInHand(c: CardInstance) {
    if (!isMyTurn) return;
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

  function onTapHero(card: CardInstance, owner: PlayerID) {
    // Corpses are non-interactive — they're respawning in their slot.
    if ((card.respawnTurnsLeft ?? 0) > 0) return;
    if (pending) {
      if (!isMyTurn) return;
      const valid = isTargetable(card, owner);
      if (!valid) { setPending(null); return; }
      if (pending.kind === 'playCard') moves.playCard(pending.iid, card.iid);
      else moves.useSkill(pending.iid, card.iid);
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
        fontFamily: fonts.display, gap: 28,
      }}>
        <motion.h1
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.bouncy}
          style={{
            fontSize: 96, color: tone, letterSpacing: '0.2em',
            textShadow: `0 0 40px ${tone}aa`, margin: 0,
          }}
        >{txt}</motion.h1>
        <button
          onClick={() => location.reload()}
          style={{
            background: `linear-gradient(180deg, ${tone}aa, ${tone}66)`,
            color: palette.text, padding: '16px 40px', border: 'none', borderRadius: 12,
            fontFamily: fonts.display, fontSize: 16, fontWeight: 600,
            letterSpacing: '0.18em', textTransform: 'uppercase',
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
              attackingIids={attackingIids}
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
              attackingIids={attackingIids}
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
              attackingIids={attackingIids}
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
          combatSpeed={combatSpeed}
          onCombatSpeedChange={setCombatSpeed}
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
          {combatPlan && (
            <CombatChoreographer
              plan={combatPlan}
              slotRefs={slotRefs.current}
              stepDuration={COMBAT_SPEED_MS[combatSpeed]}
              onComplete={() => {
                setCombatPlan(null);
                if (pendingEndTurnRef.current) pendingEndTurnRef.current();
              }}
            />
          )}
        </AnimatePresence>

        <UltMomentFlash G={G} />
      </div>
    </LayoutGroup>
  );
}

function Battlefield({ isMyTurn, turn }: { isMyTurn: boolean; turn: number }) {
  const accent = isMyTurn ? palette.accent : palette.danger;
  return (
    <div style={{
      position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: radius.md,
      borderTop: `1px solid ${palette.border}`,
      borderBottom: `1px solid ${palette.border}`,
      background: `linear-gradient(180deg, rgba(8,12,22,0) 0%, rgba(8,12,22,0.55) 50%, rgba(8,12,22,0) 100%)`,
      overflow: 'hidden',
      gap: 14,
    }}>
      {/* Center light bar */}
      <div style={{
        position: 'absolute', inset: '50% 0 50%',
        height: 1,
        background: `linear-gradient(90deg, transparent 0%, ${accent}66 25%, ${accent} 50%, ${accent}66 75%, transparent 100%)`,
        boxShadow: `0 0 20px ${accent}55`,
      }} />
      {/* Animated glow blob behind centerpiece */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: 200, height: 60, transform: 'translate(-50%, -50%)',
        background: `radial-gradient(ellipse at center, ${accent}33, transparent 70%)`,
        filter: 'blur(8px)',
        pointerEvents: 'none',
      }} />
      <span style={{
        position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)',
        ...text.label, color: palette.textFaint,
      }}>
        Lane
      </span>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '8px 22px',
        background: `linear-gradient(180deg, rgba(8,12,22,0.85), rgba(8,12,22,0.65))`,
        border: `1px solid ${accent}55`,
        borderRadius: 999,
        boxShadow: `0 0 20px ${accent}33, inset 0 0 10px ${accent}11`,
        backdropFilter: 'blur(6px)',
      }}>
        <span style={{
          width: 9, height: 9, borderRadius: '50%',
          background: accent,
          boxShadow: `0 0 10px ${accent}`,
        }} />
        <span style={{ ...text.label, color: palette.text }}>{isMyTurn ? 'Your Move' : 'Rival Moves'}</span>
      </div>
      <span style={{
        position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)',
        display: 'inline-flex', alignItems: 'baseline', gap: 6,
      }}>
        <span style={{ ...text.label, color: palette.textDim }}>Turn</span>
        <span style={{ ...text.numeric, color: palette.text }}>{turn}</span>
      </span>
    </div>
  );
}

function HandTray({
  cards, disabled, pending, isMyTurn, hasPending, mySouls, onTap, onLongPress, onHover, onDragEndOver, onEnd, onCancel,
}: {
  cards: CardInstance[]; disabled: boolean; pending: PendingPlay | null;
  isMyTurn: boolean; hasPending: boolean; mySouls: number;
  onTap: (c: CardInstance) => void; onLongPress: (c: CardInstance) => void;
  onHover: (c: CardInstance | null) => void;
  onDragEndOver: (c: CardInstance, x: number, y: number) => void;
  onEnd: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'flex-end',
      gap: 16,
      paddingBottom: 16,
    }}>
      <div style={{ minWidth: 0 }}>
        <Hand
          cards={cards}
          disabled={disabled}
          pending={pending}
          mySouls={mySouls}
          onTap={onTap}
          onLongPress={onLongPress}
          onHover={onHover}
          onDragEndOver={onDragEndOver}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, paddingBottom: 12 }}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={isMyTurn ? { scale: 1.03, y: -2 } : undefined}
          disabled={!isMyTurn}
          onClick={onEnd}
          style={{
            background: isMyTurn
              ? `linear-gradient(180deg, ${palette.accent}cc, ${palette.accent}55)`
              : 'rgba(255,255,255,0.04)',
            ...text.label, color: palette.text,
            padding: '20px 30px',
            border: `1px solid ${isMyTurn ? palette.accent : palette.border}`,
            borderRadius: radius.md,
            boxShadow: isMyTurn ? shadow.glowAccent : shadow.sm,
            cursor: isMyTurn ? 'pointer' : 'default',
            opacity: isMyTurn ? 1 : 0.45,
            minWidth: 160,
          }}
        >End Cycle</motion.button>
        {hasPending && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            whileTap={{ scale: 0.96 }}
            onClick={onCancel}
            style={{
              background: 'rgba(255,107,107,0.12)',
              ...text.label, color: palette.danger,
              padding: '20px 24px',
              border: `1px solid ${palette.danger}55`,
              borderRadius: radius.md,
              cursor: 'pointer',
            }}
          >Cancel</motion.button>
        )}
      </div>
    </div>
  );
}

/**
 * Categorize a log line by its leading verb / keyword so the side panel can
 * tint it semantically. Pure substring matching — fast and stable since all
 * log strings are constructed in the engine via `pushLog`.
 *
 *   attack arrow / KO / fell / overflow       → wine red
 *   healed / respawned / refresh              → success green
 *   gained <status> / cleansed / discharges   → spirit purple
 *   casts skill / played / promoted / unlocked → brass
 *   Mulligan / Turn marker                    → dim grey
 *   everything else                           → default text
 */
function logEntryColor(s: string): string {
  if (/→.* dmg|overflow|fatigue|fell\.|KO bounty|spills|patron|took \d+/i.test(s)) return palette.danger;
  if (/healed |respawned|refresh|reshuffled|woke/i.test(s)) return palette.success;
  if (/gained |cleansed|discharges|resisted/i.test(s)) return palette.spirit;
  if (/casts skill|played |promoted |retreated|swapped|unlocked|\+\d+ souls?|\+\d+ Souls?/i.test(s)) return palette.accent;
  if (/Mulligan|---/i.test(s)) return palette.textFaint;
  return palette.text;
}

function SidePanel({ G, me, isMyTurn, turn, onLogToggle, projectedFaceDamageMe, projectedFaceDamageOpp, combatSpeed, onCombatSpeedChange }: {
  G: GameState; me: PlayerID; isMyTurn: boolean; turn: number; onLogToggle: () => void;
  projectedFaceDamageMe?: number; projectedFaceDamageOpp?: number;
  combatSpeed?: CombatSpeed; onCombatSpeedChange?: (s: CombatSpeed) => void;
}) {
  const opp: PlayerID = me === '0' ? '1' : '0';
  // Group log entries by turn (newest first). Each group shows one "Turn N"
  // header followed by its lines — saves the T-prefix per line and makes
  // turn boundaries scannable.
  const grouped = (() => {
    const last40 = [...G.log].slice(-40).reverse();
    const out: { turn: number; entries: typeof last40 }[] = [];
    for (const e of last40) {
      const head = out[out.length - 1];
      if (head && head.turn === e.turn) head.entries.push(e);
      else out.push({ turn: e.turn, entries: [e] });
    }
    return out;
  })();
  return (
    <aside style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: '14px 14px 14px',
      background: palette.bg1,
      border: `1px solid #5a3f1c`,
      borderRadius: radius.lg,
      boxShadow: '0 4px 12px rgba(40, 20, 0, 0.22)',
      minHeight: 0,
      height: 'calc(100vh - 32px)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 8, borderBottom: `1px solid ${palette.border}`,
      }}>
        <span style={{ ...text.label, color: palette.textDim }}>Patrol</span>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...text.label, color: palette.textFaint }}>Turn</span>
          <span style={{ ...text.numeric, color: palette.text }}>{turn}</span>
        </span>
      </div>

      <PlayerCard label="Sapphire Flame" ps={G.players[opp]} hostile order={opp === '0' ? '1st' : '2nd'} projectedFaceDamage={projectedFaceDamageOpp} />

      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        background: 'rgba(120, 80, 30, 0.06)',
        border: `1px solid ${palette.border}`,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px', borderBottom: `1px solid ${palette.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ ...text.label, color: palette.textDim }}>Recent</span>
          <button onClick={onLogToggle} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            ...text.label, color: palette.accent,
          }}>Full Log →</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 12px 12px' }}>
          {grouped.length === 0 ? (
            <div style={{ ...text.body, color: palette.textFaint, fontStyle: 'italic' }}>No actions yet.</div>
          ) : grouped.map((g) => (
            <div key={g.turn} style={{ marginTop: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                paddingBottom: 3, borderBottom: `1px dashed ${palette.border}`,
              }}>
                <span style={{ ...text.label, color: palette.accentWarm }}>Turn</span>
                <span style={{ ...text.numeric, color: palette.text }}>{g.turn}</span>
              </div>
              {g.entries.map((e, i) => {
                const c = logEntryColor(e.text);
                return (
                  <div key={i} style={{
                    ...text.body, color: c, padding: '1px 0',
                    paddingLeft: 6, borderLeft: `2px solid ${c}44`,
                    marginLeft: 2,
                  }}>
                    {e.text}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <PlayerCard label="Amber Hand" ps={G.players[me]} active={isMyTurn} order={me === '0' ? '1st' : '2nd'} projectedFaceDamage={projectedFaceDamageMe} />

      {/* Combat speed picker */}
      {combatSpeed && onCombatSpeedChange && (
        <div style={{
          paddingTop: 8, borderTop: `1px solid ${palette.border}`,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <span style={{ ...text.label, color: palette.textFaint }}>Combat Speed</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {(['instant', 'fast', 'normal', 'slow'] as const).map((s) => (
              <button
                key={s}
                onClick={() => onCombatSpeedChange(s)}
                title={s === 'instant' ? 'Skip animations entirely' : `${s} (${s === 'fast' ? '380ms' : s === 'normal' ? '700ms' : '1.1s'} per hit)`}
                style={{
                  padding: '5px 0',
                  background: combatSpeed === s
                    ? `linear-gradient(180deg, ${palette.accent}, ${palette.accent}aa)`
                    : palette.bg2,
                  border: `1px solid ${combatSpeed === s ? palette.accent : palette.border}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  ...text.label,
                  color: combatSpeed === s ? '#1a1208' : palette.textDim,
                  textShadow: combatSpeed === s ? '0 1px 0 rgba(255,235,180,0.4)' : 'none',
                }}
              >
                {s === 'instant' ? '⏵⏵' : s.charAt(0)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{
        paddingTop: 8, borderTop: `1px solid ${palette.border}`,
        ...text.body, color: palette.textFaint,
      }}>
        Drop a card on a hero · Hover for the lore · Hold for full preview
      </div>
    </aside>
  );
}

function PlayerCard({ label, ps, hostile, active, order, projectedFaceDamage }: { label: string; ps: GameState['players'][PlayerID]; hostile?: boolean; active?: boolean; order?: '1st' | '2nd'; projectedFaceDamage?: number }) {
  const color = hostile ? palette.danger : palette.accent;
  const hpFrac = Math.max(0, Math.min(1, ps.hp / ps.hpMax));
  const projectedHp = Math.max(0, ps.hp - (projectedFaceDamage ?? 0));
  const projectedFrac = Math.max(0, Math.min(1, projectedHp / ps.hpMax));
  const hasIncoming = !!projectedFaceDamage && projectedFaceDamage > 0;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: 10,
      borderRadius: radius.md,
      border: `1px solid ${palette.border}`,
      background: 'transparent',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            ...text.label, color: palette.textDim, whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: active ? palette.accent : palette.textFaint,
            }} />
            {label}
          </span>
          {order && <OrderBadge order={order} color={palette.textFaint} />}
        </div>
        <span style={{ ...text.body, color: palette.textFaint }}>
          deck {ps.deck.length} · disc {ps.discard.length}{hostile ? ` · hand ${ps.hand.length}` : ''}
        </span>
      </div>
      <div style={{
        position: 'relative', height: 8, borderRadius: 4,
        background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, width: `${hpFrac * 100}%`,
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          transition: 'width 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        }} />
        {/* Predicted HP drop overlay (dimmer red wash on the slice that's about to be lost) */}
        {hasIncoming && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${projectedFrac * 100}%`,
            width: `${(hpFrac - projectedFrac) * 100}%`,
            background: `repeating-linear-gradient(45deg, ${palette.danger}cc 0 4px, ${palette.danger}88 4px 8px)`,
            transition: 'all 200ms ease',
          }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ ...text.label, color: palette.textFaint }}>HP</span>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
          {hasIncoming && (
            <span style={{
              padding: '1px 6px', borderRadius: 4,
              background: `${palette.danger}cc`, color: '#fff',
              textShadow: '0 1px 1px rgba(0,0,0,0.5)',
              ...text.label,
            }}>▼{projectedFaceDamage}</span>
          )}
          <span style={{ ...text.numeric, color: palette.textDim }}>
            {ps.hp}<span style={{ ...text.body, color: palette.textFaint, marginLeft: 2 }}> / {ps.hpMax}</span>
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <span style={{ ...text.label, color: palette.textFaint }}>Souls</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <SoulGem />
          <span style={{ ...text.numeric, color: palette.accentWarm }}>{ps.souls}</span>
        </span>
      </div>
      {/* Skill availability dot + respawn queue */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, minHeight: 16 }}>
        <span style={{ ...text.label, color: palette.textFaint }}>Skill</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {ps.skillUsedThisTurn ? (
            <span style={{
              display: 'inline-block',
              width: 8, height: 8, borderRadius: '50%',
              background: palette.textFaint,
            }} />
          ) : (
            <motion.span
              animate={{ opacity: [0.6, 1, 0.6], scale: [0.92, 1.08, 0.92] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                display: 'inline-block',
                width: 8, height: 8, borderRadius: '50%',
                background: palette.success,
                boxShadow: `0 0 8px ${palette.success}`,
              }}
            />
          )}
          <span style={{ ...text.label, color: ps.skillUsedThisTurn ? palette.textFaint : palette.success }}>
            {ps.skillUsedThisTurn ? 'Used' : 'Ready'}
          </span>
        </span>
      </div>
      {/* Respawning heroes stay in their bench/active slot greyed-out now;
          see HeroSlot's RespawnOverlay. No side-panel queue needed. */}
    </div>
  );
}

function SoulGem({ size = 14 }: { size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle at 35% 30%, #ffd98a, ${palette.accent} 55%, #6e4612 100%)`,
      border: '1px solid #3a2810',
      boxShadow: `0 1px 2px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,235,180,0.5)`,
      display: 'inline-block',
    }} />
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: palette.textFaint }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function PlayerSummary({ label, ps, hostile }: { label: string; ps: GameState['players'][PlayerID]; hostile?: boolean }) {
  const color = hostile ? palette.danger : palette.accent;
  const hpFrac = Math.max(0, Math.min(1, ps.hp / ps.hpMax));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color,
        }}>{label}</span>
        <span style={{ fontSize: 12, color: palette.textDim }}>
          deck {ps.deck.length} · disc {ps.discard.length}{hostile ? ` · hand ${ps.hand.length}` : ''}
        </span>
      </div>
      <div style={{
        position: 'relative', height: 10, borderRadius: 5,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
        border: `1px solid ${palette.border}`,
      }}>
        <div style={{
          position: 'absolute', inset: 0, width: `${hpFrac * 100}%`,
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
          boxShadow: `0 0 12px ${color}66`,
          transition: 'width 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2, fontSize: 11, color: palette.hp, fontVariantNumeric: 'tabular-nums' }}>
        {ps.hp} / {ps.hpMax} HP
      </div>
    </div>
  );
}

function OrderBadge({ order, color }: { order: '1st' | '2nd'; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '1px 5px',
      marginLeft: 4,
      borderRadius: 3,
      border: `1px solid ${color}88`,
      background: `linear-gradient(180deg, ${color}33, ${color}11)`,
      color: color,
      fontFamily: fonts.ui,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: '0.04em',
      textTransform: 'none',
      lineHeight: 1.3,
    }}>
      {order}
    </span>
  );
}

function findOnBoard(G: GameState, iid: string): { owner: PlayerID; card: CardInstance } | null {
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    if (ps.active?.iid === iid) return { owner: pid, card: ps.active };
    for (const b of ps.bench) if (b?.iid === iid) return { owner: pid, card: b };
  }
  return null;
}

function filterAllows(filter: TargetFilter, card: CardInstance, owner: PlayerID, me: PlayerID): boolean {
  const isAlly = owner === me;
  switch (filter) {
    case 'noTarget': return false;
    case 'self': return false;
    case 'allyAny': return isAlly;
    case 'allyHero': return isAlly && CARDS_BY_ID[card.cardId]?.type === 'hero';
    case 'enemyAny': return !isAlly;
    case 'enemyHero': return !isAlly && CARDS_BY_ID[card.cardId]?.type === 'hero';
    case 'enemyActive': return !isAlly && card.zone === 'active';
    case 'anyBoard': return true;
  }
}
