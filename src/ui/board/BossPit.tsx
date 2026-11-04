import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, type AnimationPlaybackControls } from 'framer-motion';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { BOSS_RESPAWN_ROUNDS, BOSS_RETALIATION, BOSS_SOULS, REVIVE_CREDITS, REVIVE_ROUNDS } from '@/engine/constants';
import { standingBoss } from '@/engine/query';
import { fromHere, kickFor, useFxImpulse } from '../effects/fx/FxImpulse';
import { useFxCalm } from '../effects/fx/FxMotionContext';
import { Explain } from '../explain/Explain';
import type { ExplainContent } from '../explain/content';
import { FX_INK } from '../effects/fx/fxCatalog';
import { fonts, spring, text } from '../tokens';
import { poster } from '../poster';
import type { ArmedPlay } from '../helpers';

/**
 * The pit between the two Actives (ActiveDuel's middle column), where the
 * Mid-Boss stands from round 4: a small plate with its HP and each side's
 * damage tally — the side with more takes it when it falls. While your attack
 * is armed it lights as a target like a hero, and a tap on it makes the attack
 * at it; otherwise a tap explains it. The combat choreographer and the FX
 * layer find it by its iid (`registerSlotRef`), so a swing at it is walked
 * like any other, and its blow back at the End step leaves from it. With no
 * boss up the pit says the round it rises in.
 */
export function BossPit({ G, me, pending, onTapHero, isTargetable, registerSlotRef, isMobile }: {
  G: GameState;
  me: PlayerID;
  pending: ArmedPlay | null;
  onTapHero: (c: CardInstance, owner: PlayerID) => void;
  isTargetable: (card: CardInstance) => boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  isMobile: boolean;
}) {
  const boss = G.draft ? null : standingBoss(G);
  return (
    <div style={{
      position: 'absolute', top: isMobile ? 2 : 8, left: 0, right: 0,
      display: 'flex', justifyContent: 'center',
      zIndex: 2,
      pointerEvents: 'none',
    }}>
      <AnimatePresence mode="wait" initial={false}>
        {boss ? (
          <motion.div
            key={boss.iid}
            initial={{ opacity: 0, scale: 0.6, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.25, filter: 'brightness(2)' }}
            transition={spring.bouncy}
            style={{ pointerEvents: 'auto', width: isMobile ? '100%' : 150, maxWidth: isMobile ? 112 : 150 }}
          >
            <BossPlate
              G={G} me={me} boss={boss} pending={pending} onTapHero={onTapHero}
              targetable={isTargetable(boss)} registerSlotRef={registerSlotRef} isMobile={isMobile}
            />
          </motion.div>
        ) : !G.draft ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="img"
            aria-label={`Mid-Boss — rises in round ${G.bossRespawnRound}`}
            style={{
              ...text.label,
              fontSize: isMobile ? 8 : 9.5,
              letterSpacing: '0.16em',
              color: poster.inkDim,
              textAlign: 'center',
              lineHeight: 1.3,
              padding: '2px 6px',
              border: `1px dashed ${poster.inkFaint}`,
              borderRadius: 4,
              background: 'rgba(242, 230, 203, 0.6)',
            }}
          >
            Mid-Boss<br />round {G.bossRespawnRound}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** What a tap on the boss explains, while no attack is armed. */
function explainBoss(boss: CardInstance): ExplainContent {
  return {
    title: 'Mid-Boss',
    accent: FX_INK.pure,
    lead: `${boss.hp} of ${boss.hpMax} HP`,
    lines: [
      'Your Active may attack it instead of their Active. Only basic attacks hurt it; no ability, item or status touches it.',
      `At the End of a turn it hits the hero that attacked it for ${BOSS_RETALIATION}.`,
      `When it falls, the side that dealt it more damage takes it: ${BOSS_SOULS} souls and the Rejuvenator — ${REVIVE_CREDITS} revives for ${REVIVE_ROUNDS} more rounds.`,
      `It rises again ${BOSS_RESPAWN_ROUNDS} rounds after it falls.`,
    ],
  };
}

function BossPlate({ G, me, boss, pending, onTapHero, targetable, registerSlotRef, isMobile }: {
  G: GameState;
  me: PlayerID;
  boss: CardInstance;
  pending: ArmedPlay | null;
  onTapHero: (c: CardInstance, owner: PlayerID) => void;
  targetable: boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  isMobile: boolean;
}) {
  const rival: PlayerID = me === '0' ? '1' : '0';
  const armed = pending?.kind === 'attack';
  // Recoil, as a hero tile takes a blow (FxImpulse): the choreographer's
  // impact beat on a swing at it.
  const plate = useRef<HTMLElement | null>(null);
  const kick = useRef<AnimationPlaybackControls | null>(null);
  const calm = useFxCalm();
  useFxImpulse(boss.iid, (impulse) => {
    const el = plate.current;
    if (calm || !el) return;
    kick.current?.stop();
    const { keyframes, duration, times } = kickFor(impulse);
    kick.current = animate(el, fromHere(keyframes), { duration, times, ease: 'easeOut' });
  });
  useEffect(() => () => kick.current?.stop(), []);
  // Its blow at the End step: the plate lunges as the hit leaves it.
  const struck = useStrike(G, boss.iid);

  const frac = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.hpMax)));
  const label = `Mid-Boss — ${boss.hp} of ${boss.hpMax} HP; damage: you ${G.bossDamage[me]}, rival ${G.bossDamage[rival]}`;
  const border = targetable ? poster.target : poster.ink;
  return (
    <div data-fx-rest style={{ width: '100%' }}>
      <Explain content={explainBoss(boss)} passTaps={armed} style={{ display: 'block', width: '100%' }}>
        <motion.button
          ref={(el) => { plate.current = el; registerSlotRef?.(boss.iid, el); }}
          type="button"
          aria-label={label}
          onClick={() => { if (armed) onTapHero(boss, me); }}
          animate={struck ? { y: [0, 6, 0], scale: [1, 1.06, 1] } : { y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: isMobile ? 2 : 4,
            width: '100%',
            padding: isMobile ? '3px 5px 4px' : '6px 8px 7px',
            borderRadius: 6,
            border: `2px solid ${border}`,
            boxShadow: targetable ? `inset 0 0 0 2px ${poster.target}, 0 6px 14px rgba(0,0,0,0.3)` : '0 6px 14px rgba(0,0,0,0.3)',
            background: poster.frame,
            color: poster.cream,
            cursor: armed ? 'crosshair' : 'help',
            font: 'inherit',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
            <span style={{
              fontFamily: fonts.display, fontSize: isMobile ? 9.5 : 12, letterSpacing: '0.12em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>Mid-Boss</span>
            <span style={{ fontFamily: fonts.ui, fontWeight: 800, fontSize: isMobile ? 10 : 12, fontVariantNumeric: 'tabular-nums' }}>
              {boss.hp}<span style={{ opacity: 0.55, fontWeight: 700 }}>/{boss.hpMax}</span>
            </span>
          </span>
          {/* Its HP — the bar empties as the sides chip it down. */}
          <span aria-hidden style={{ position: 'relative', height: isMobile ? 4 : 5, background: poster.edge, borderRadius: 2, overflow: 'hidden' }}>
            <motion.span
              animate={{ width: `${frac * 100}%` }}
              transition={{ duration: 0.3 }}
              style={{ position: 'absolute', top: 0, bottom: 0, left: 0, background: FX_INK.pure }}
            />
          </span>
          {/* Each side's damage: the side with more takes it. */}
          <span style={{ display: 'flex', justifyContent: 'space-between', fontFamily: fonts.ui, fontWeight: 700, fontSize: isMobile ? 8.5 : 10, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: poster.you }} title="Your damage to it">You {G.bossDamage[me]}</span>
            <span style={{ color: poster.rival }} title="The rival's damage to it">Rival {G.bossDamage[rival]}</span>
          </span>
        </motion.button>
      </Explain>
    </div>
  );
}

/** True for a moment after the boss's blow leaves it (a hit whose source is
 *  the boss shows up in the stream). */
function useStrike(G: GameState, iid: string): boolean {
  const seen = useRef<number>(G.fx.reduce((m, e) => Math.max(m, e.seq), 0));
  const [struck, setStruck] = useState(false);
  const latest = G.fx.filter((e) => e.seq > seen.current && e.kind === 'hit' && e.source?.iid === iid).length;
  useEffect(() => {
    seen.current = G.fx.reduce((m, e) => Math.max(m, e.seq), seen.current);
    if (latest === 0) return;
    setStruck(true);
    const t = setTimeout(() => setStruck(false), 500);
    return () => clearTimeout(t);
  }, [G.fx, latest]);
  return struck;
}
