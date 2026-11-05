import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { MapIcon } from './MapIcon';
import type { ArmedPlay } from '../helpers';

/**
 * The pit between the two Actives (ActiveDuel's middle column), where the
 * Mid-Boss stands from round 4. Its plate is the shop's graphite (the Income
 * plate's: an edge keyline, cream type, the stencil numerals): the game's own
 * picture of the Mid-Boss, its HP as pips in the HP ink, and each side's
 * damage as a tag in its ink — the side with more takes it when it falls, and
 * its tag is filled while it leads. While your attack is armed the plate lights
 * as a target like a hero, and a tap on it makes the attack at it; otherwise a
 * tap explains it. The combat choreographer and the FX layer find it by its
 * iid (`registerSlotRef`), so a swing at it is walked like any other, and its
 * blow back at the End step leaves from it. With no boss up the pit is an
 * empty slot on the paper, the Mid-Boss greyed in it, naming the round it
 * rises in (or returns in, once one has been taken).
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
  const width = isMobile ? 112 : 166;
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
            style={{ pointerEvents: 'auto', width: '100%', maxWidth: width }}
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
            style={{ width: '100%', maxWidth: width }}
          >
            <EmptyPit round={G.bossRespawnRound} taken={G.record['0'].bossKills + G.record['1'].bossKills > 0} isMobile={isMobile} />
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

  const mine = G.bossDamage[me];
  const theirs = G.bossDamage[rival];
  const label = `Mid-Boss — ${boss.hp} of ${boss.hpMax} HP; damage: you ${mine}, rival ${theirs}`;
  const pip = isMobile ? { w: 5.5, h: 7, gap: 1.5 } : { w: 7.5, h: 9, gap: 2 };
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
            display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: isMobile ? 4 : 6,
            width: '100%',
            padding: isMobile ? '4px 5px 5px' : '6px 8px 8px',
            borderRadius: 8,
            // Lit as a target like a hero tile: the green frame.
            border: `${targetable ? 2 : 1.5}px solid ${targetable ? poster.target : poster.edge}`,
            boxShadow: targetable
              ? `inset 0 0 0 1px ${poster.target}, 0 0 14px 2px rgba(98, 196, 98, 0.45), 0 8px 18px rgba(0, 0, 0, 0.35)`
              : '0 8px 18px rgba(0, 0, 0, 0.35)',
            background: poster.frame,
            color: poster.cream,
            cursor: armed ? 'crosshair' : 'help',
            font: 'inherit',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 8 }}>
            <MapIcon kind="mid_boss" size={isMobile ? 26 : 34} zoom={1.2} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 3 : 4, minWidth: 0, flex: 1 }}>
              {/* Its name and HP — side by side on a desktop, stacked in a phone's narrow pit. */}
              <span style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'baseline', justifyContent: 'space-between', gap: isMobile ? 2 : 4 }}>
                <span style={{ ...text.label, fontSize: isMobile ? 7.5 : 9, letterSpacing: '0.18em', color: poster.creamDim, whiteSpace: 'nowrap' }}>Mid-Boss</span>
                <span style={{ fontFamily: fonts.display, fontSize: isMobile ? 11 : 14, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: poster.cream, whiteSpace: 'nowrap' }}>
                  {boss.hp}<span style={{ color: poster.creamFaint }}>/{boss.hpMax}</span>
                </span>
              </span>
              {/* Its HP — a pip a point, emptied as the sides chip it down. */}
              <span aria-hidden style={{ display: 'flex', gap: pip.gap }}>
                {Array.from({ length: boss.hpMax }, (_, k) => {
                  const up = k < boss.hp;
                  return (
                    <span key={k} style={{
                      flex: `0 1 ${pip.w}px`, minWidth: 2, height: pip.h, borderRadius: 1, boxSizing: 'border-box',
                      background: up ? poster.stat.hp : 'transparent',
                      border: `1px solid ${up ? poster.stat.hp : poster.creamFaint}`,
                      transition: 'background-color 200ms ease, border-color 200ms ease',
                    }} />
                  );
                })}
              </span>
            </span>
          </span>
          {/* Each side's damage: the side with more takes it — its tag filled. */}
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
            <Tally ink={poster.you} leads={mine > theirs} isMobile={isMobile} title="Your damage to it">You {mine}</Tally>
            <Tally ink={poster.rival} leads={theirs > mine} isMobile={isMobile} title="The rival's damage to it">Rival {theirs}</Tally>
          </span>
        </motion.button>
      </Explain>
    </div>
  );
}

/** A side's damage tag: the shop's pill in the side's ink, filled while it leads. */
function Tally({ ink, leads, isMobile, title, children }: { ink: string; leads: boolean; isMobile: boolean; title: string; children: ReactNode }) {
  return (
    <span title={title} style={{
      ...text.label,
      fontSize: isMobile ? 7 : 8.5,
      letterSpacing: '0.1em',
      padding: isMobile ? '2px 5px' : '2px 7px',
      borderRadius: 999,
      border: `1.5px solid ${ink}`,
      background: leads ? ink : 'transparent',
      color: leads ? poster.ink : ink,
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1.1,
    }}>{children}</span>
  );
}

/** No boss in the pit: an empty slot on the paper (the board's own dashed
 *  outline), the Mid-Boss greyed in it and the round it rises — or, once one
 *  has been taken, returns — in. */
function EmptyPit({ round, taken, isMobile }: { round: number; taken: boolean; isMobile: boolean }) {
  const verb = taken ? 'returns' : 'rises';
  return (
    <div
      role="img"
      aria-label={`Mid-Boss — ${verb} in round ${round}`}
      title={`The Mid-Boss ${verb} in round ${round}`}
      style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 8,
        padding: isMobile ? '4px 5px' : '6px 8px',
        borderRadius: 8,
        border: `1.5px dashed ${poster.inkFaint}`,
        background: 'rgba(242, 230, 203, 0.6)',
      }}
    >
      <MapIcon kind="mid_boss" size={isMobile ? 22 : 30} zoom={1.2} grey ink={poster.inkFaint} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 2 : 3, minWidth: 0, whiteSpace: 'nowrap' }}>
        <span style={{ ...text.label, fontSize: isMobile ? 7.5 : 9, letterSpacing: '0.18em', color: poster.inkDim }}>Mid-Boss</span>
        <span style={{ ...text.label, fontSize: isMobile ? 7 : 8.5, letterSpacing: '0.12em', color: poster.inkDim }}>{verb} in</span>
        <span style={{ fontFamily: fonts.display, fontSize: isMobile ? 10 : 12.5, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1, color: poster.ink, fontVariantNumeric: 'tabular-nums' }}>Round {round}</span>
      </span>
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
