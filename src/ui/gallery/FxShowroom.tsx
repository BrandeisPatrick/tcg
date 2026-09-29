/**
 * The FX showroom — a six-card stage (a rival trio above, yours below) wired
 * to the real FxLayer, HeroSlot, impact-delay context and recoil bus, with a
 * trigger for every animation the match can draw. Each trigger synthesises the
 * exact event batch the engine would push and fires it through the same
 * timeline scheduler the board uses, so what plays here is what plays in a
 * match. The mock HP follows the hits so the stat hold can be seen too.
 *
 * Laid out so the stage never leaves the screen: beside the triggers on a
 * wide window, pinned above them on a narrow one. There are sixty-odd
 * triggers, and a trigger that fires an effect nobody can see is not a demo.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { CardInstance, DamageType, FxCastKind, FxEvent, FxSource, FxTag, PlayerID, StatusId } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroSlot } from '../board/HeroSlot';
import { FxLayer } from '../effects/fx/FxLayer';
import { FxImpulseBus, FxImpulseContext } from '../effects/fx/FxImpulse';
import { FxCalmContext } from '../effects/fx/FxMotionContext';
import { FxTimingContext } from '../effects/fx/FxTimingContext';
import { buildFxTimeline } from '../effects/fx/fxTimeline';
import { useViewport } from '../hooks/useViewport';
import { Button, Chip, Row, Segmented, STICK, type Option } from './primitives';

type Id = 'r0' | 'r1' | 'r2' | 'y0' | 'y1' | 'y2';
type Ev = FxEvent extends infer E ? (E extends FxEvent ? Omit<E, 'seq'> : never) : never;

const STAGE: Record<Id, { cardId: string; owner: PlayerID; zone: 'active' | 'bench'; slot: 0 | 1 | 2 | 3 }> = {
  r0: { cardId: 'hero_abrams', owner: '1', zone: 'active', slot: 0 },
  r1: { cardId: 'hero_haze', owner: '1', zone: 'bench', slot: 1 },
  r2: { cardId: 'hero_seven', owner: '1', zone: 'bench', slot: 2 },
  y0: { cardId: 'hero_kelvin', owner: '0', zone: 'active', slot: 0 },
  y1: { cardId: 'hero_mirage', owner: '0', zone: 'bench', slot: 1 },
  y2: { cardId: 'hero_lady_geist', owner: '0', zone: 'bench', slot: 2 },
};
const IDS = Object.keys(STAGE) as Id[];
const maxHp = (id: Id) => { const d = CARDS_BY_ID[STAGE[id].cardId]; return d?.type === 'hero' ? d.hp + 4 : 8; };
const src = (id: Id): FxSource => ({ iid: id, cardId: STAGE[id].cardId, owner: STAGE[id].owner });

// ---- event builders --------------------------------------------------------
const hit = (iid: Id, amount: number, type: DamageType, o: { source?: Id; tag?: FxTag; cast?: FxCastKind; stacks?: number } = {}): Ev =>
  ({ kind: 'hit', iid, amount, type, ko: false, cast: o.cast ?? (o.source ? 'skill' : 'tick'), source: o.source ? src(o.source) : undefined, tag: o.tag, stacks: o.stacks });
const heal = (iid: Id, amount: number, o: { tag?: FxTag; from?: Id; source?: Id } = {}): Ev =>
  ({ kind: 'heal', iid, amount, tag: o.tag, from: o.from ? src(o.from) : undefined, source: o.source ? src(o.source) : undefined });
const status = (iid: Id, statusId: StatusId, value: number, duration: number, debuff: boolean, o: { tag?: FxTag } = {}): Ev =>
  ({ kind: 'status', iid, statusId, value, duration, debuff, tag: o.tag });
const cast = (castKind: 'skill' | 'spell' | 'ult' | 'equip', by: PlayerID, cardId: string, iid?: Id, targetIid?: Id): Ev =>
  ({ kind: 'cast', castKind, by, cardId, iid, targetIid });
const shield = (iid: Id, absorbed: number, broken: boolean, type: DamageType): Ev => ({ kind: 'shield', iid, absorbed, broken, type });
const immune = (iid: Id, what: 'damage' | StatusId): Ev => ({ kind: 'immune', iid, what });

interface Demo { label: string; events: Ev[] }
interface Group { id: string; short: string; title: string; blurb: string; demos: Demo[] }

/** A group the stage does not drive: full-screen overlays with their own
 *  triggers, listed with the rest so every "fire this" lives in one place. */
export interface ExtraGroup { id: string; short: string; title: string; blurb: string; body: ReactNode }

const GROUPS: Group[] = [
  {
    id: 'skills', short: 'Skills',
    title: 'Skill triggers',
    blurb: 'The caster flares in its identity colour with its ability on a plate, a bolt flies to the target, and the impact lands with the stat change.',
    demos: [
      { label: 'Kelvin · Frost Grenade → Abrams', events: [cast('skill', '0', 'hero_kelvin', 'y0', 'r0'), hit('r0', 2, 'spirit', { source: 'y0' }), heal('y0', 2)] },
      { label: 'Lady Geist · Life Drain → Abrams', events: [cast('skill', '0', 'hero_lady_geist', 'y2', 'r0'), hit('r0', 3, 'spirit', { source: 'y2', tag: 'life_drain' }), heal('y2', 1, { tag: 'lifesteal', from: 'r0', source: 'y2' })] },
      { label: 'Seven · Static Charge → Kelvin', events: [cast('skill', '1', 'hero_seven', 'r2', 'y0'), hit('y0', 1, 'spirit', { source: 'r2' }), status('y0', 'charged', 1, 2, true)] },
      { label: 'Buff skill → ally (Shield + Bullet Resist)', events: [cast('skill', '0', 'hero_kelvin', 'y0', 'y1'), status('y1', 'shield', 2, 999, false), status('y1', 'bullet_resist', 2, 2, false)] },
      { label: 'Self skill (Shield 3 on caster)', events: [cast('skill', '1', 'hero_abrams', 'r0', 'r0'), status('r0', 'shield', 3, 999, false)] },
    ],
  },
  {
    id: 'spells', short: 'Spells & ults',
    title: 'Spells & ultimates',
    blurb: "A spell's bolt leaves the card reveal (left of centre on desktop); an ultimate waits for its name plate, then the linked hero flares heavier and the strike lands as a bolt or a shockwave with spokes.",
    demos: [
      { label: 'Spell · Cold Front → Abrams', events: [cast('spell', '0', 'cold_front', 'y0', 'r0'), hit('r0', 4, 'spirit', { source: 'y0', cast: 'spell' })] },
      { label: 'Spell · Knockdown → Abrams', events: [cast('spell', '0', 'knockdown', 'y0', 'r0'), status('r0', 'stun', 1, 1, true)] },
      { label: 'Spell · Decay → Abrams', events: [cast('spell', '0', 'decay', 'y0', 'r0'), status('r0', 'bleed', 3, 2, true)] },
      { label: 'Spell · Metal Skin → Kelvin', events: [cast('spell', '0', 'metal_skin', 'y0', 'y0'), status('y0', 'bullet_resist', 5, 2, false)] },
      { label: 'Spell · Healing Rite → Mirage', events: [cast('spell', '0', 'healing_rite', 'y0', 'y1'), heal('y1', 2)] },
      { label: 'Spell · Curse → Abrams', events: [cast('spell', '0', 'curse', 'y0', 'r0'), status('r0', 'silenced', 1, 3, true), status('r0', 'disarm', 1, 3, true)] },
      { label: 'Ult · Seismic Impact — spirit AoE + Stun', events: [cast('ult', '1', 'ult_abrams', 'r0'), hit('y0', 4, 'spirit', { source: 'r0', cast: 'ult' }), hit('y1', 4, 'spirit', { source: 'r0', cast: 'ult' }), hit('y2', 4, 'spirit', { source: 'r0', cast: 'ult' }), status('y0', 'stun', 1, 1, true)] },
      { label: 'Ult · Bullet Dance — gunfire AoE', events: [cast('ult', '1', 'ult_haze', 'r1'), hit('y0', 3, 'attack', { source: 'r1', cast: 'ult' }), hit('y1', 3, 'attack', { source: 'r1', cast: 'ult' }), hit('y2', 3, 'attack', { source: 'r1', cast: 'ult' })] },
      { label: 'Ult · Assassinate → Abrams', events: [cast('ult', '0', 'ult_vindicta', undefined, 'r0'), hit('r0', 5, 'spirit', { cast: 'ult' })] },
      { label: 'Equip · Titanic Magazine → Kelvin', events: [cast('equip', '0', 'titanic_magazine', 'y0', 'y0')] },
    ],
  },
  {
    id: 'damage', short: 'Damage',
    title: 'Damage by type',
    blurb: 'Bullet damage is gunfire — muzzle flash, tracer volley, holes, sparks. Spirit is a plum burst with the rune. Pure tears the print. A kill cracks it and stamps K.O.',
    demos: [
      { label: 'Gunfire ×2 (from Kelvin)', events: [hit('r0', 2, 'attack', { source: 'y0', cast: 'proc' })] },
      { label: 'Gunfire ×5', events: [hit('r0', 5, 'attack', { source: 'y0', cast: 'proc' })] },
      { label: 'Spirit hit ×2', events: [hit('r0', 2, 'spirit', { source: 'y0' })] },
      { label: 'Two spirit hits on Abrams (2 + 3)', events: [hit('r0', 2, 'spirit', { source: 'y0' }), hit('r0', 3, 'spirit', { source: 'y0' })] },
      { label: 'Pure hit ×2', events: [hit('r0', 2, 'pure')] },
      { label: 'KO · spirit', events: [hit('r0', 99, 'spirit', { source: 'y0' })] },
      { label: 'KO · gunfire', events: [hit('r0', 99, 'attack', { source: 'y0', cast: 'proc' })] },
    ],
  },
  {
    id: 'unique', short: 'Unique',
    title: 'Unique effects',
    blurb: 'Every tagged effect has its own lead-in before the impact.',
    demos: [
      { label: "Djinn's Mark ×4 detonates (Mirage → Abrams)", events: [status('r0', 'djinns_mark', 4, 3, true), hit('r0', 12, 'spirit', { source: 'y1', tag: 'djinns_mark', stacks: 4, cast: 'proc' })] },
      { label: "Djinn's Mark ×2 expires (Haze)", events: [hit('r1', 6, 'spirit', { tag: 'djinns_mark', stacks: 2 })] },
      { label: 'Bleed tick ×3 (Abrams) + ×2 (Haze)', events: [hit('r0', 3, 'pure', { tag: 'bleed' }), hit('r1', 2, 'pure', { tag: 'bleed' })] },
      { label: 'Mystic Reverb echo (Abrams)', events: [hit('r0', 2, 'spirit', { tag: 'reverb' })] },
      { label: 'Naptime — wakes (Abrams)', events: [hit('r0', 6, 'spirit', { tag: 'naptime' })] },
      { label: 'Charged → Discharge · Stun (Kelvin)', events: [status('y0', 'stun', 1, 1, true, { tag: 'discharge' })] },
      { label: 'Killing Blow — execute (Abrams)', events: [hit('r0', 999, 'pure', { tag: 'execute' })] },
      { label: 'Bloodscent lifesteal (Kelvin ← Abrams)', events: [heal('y0', 2, { tag: 'lifesteal', from: 'r0' })] },
      { label: 'Ricochet → bench (Haze, Seven)', events: [hit('r1', 2, 'attack', { source: 'y0', tag: 'ricochet', cast: 'proc' }), hit('r2', 2, 'attack', { source: 'y0', tag: 'ricochet', cast: 'proc' })] },
      { label: 'Tesla chain → Haze', events: [hit('r1', 1, 'attack', { source: 'y0', tag: 'tesla', cast: 'proc' })] },
      { label: 'Mixed Bullets rider (spirit)', events: [hit('r0', 2, 'spirit', { source: 'y0', tag: 'mixed_bullets', cast: 'proc' })] },
      { label: 'Mystic Burst proc', events: [hit('r0', 1, 'spirit', { source: 'y0', tag: 'burst', cast: 'proc' })] },
      { label: 'Storm Cloud pulse (Seven → all)', events: [hit('y0', 2, 'spirit', { source: 'r2', tag: 'channel', cast: 'tick' }), hit('y1', 2, 'spirit', { source: 'r2', tag: 'channel', cast: 'tick' }), hit('y2', 2, 'spirit', { source: 'r2', tag: 'channel', cast: 'tick' })] },
      { label: 'Channel shockwave (Kelvin → all)', events: [hit('r0', 2, 'spirit', { source: 'y0', tag: 'channel', cast: 'tick' }), hit('r1', 2, 'spirit', { source: 'y0', tag: 'channel', cast: 'tick' }), hit('r2', 2, 'spirit', { source: 'y0', tag: 'channel', cast: 'tick' })] },
      { label: 'Siphon Bullets (Kelvin ← Abrams)', events: [status('r0', 'siphon_drain', 1, 2, true, { tag: 'siphon' }), status('y0', 'siphon_gain', 1, 2, false, { tag: 'siphon' })] },
    ],
  },
  {
    id: 'heals', short: 'Heals & shields',
    title: 'Heals, shields, immunity',
    blurb: 'Green rises for healing; a shield glyph pops with its tally (and cracks when it breaks); Unstoppable shrugs in gold.',
    demos: [
      { label: 'Heal 3 (Kelvin)', events: [heal('y0', 3)] },
      { label: 'Regen tick (Abrams)', events: [heal('r0', 1, { tag: 'regen' })] },
      { label: 'Shield absorbs 2, 1 spills', events: [shield('r0', 2, false, 'spirit'), hit('r0', 1, 'spirit', { source: 'y0' })] },
      { label: 'Shield blocks all, breaks', events: [shield('r0', 3, true, 'attack')] },
      { label: 'Unstoppable — immune to damage', events: [immune('y0', 'damage')] },
      { label: 'Unstoppable — resists Stun', events: [immune('y0', 'stun')] },
    ],
  },
  {
    id: 'stamps', short: 'Statuses',
    title: 'Status stamps',
    blurb: 'A status lands as a slapped-on sticker in its class colour, with a glyph or a flourish where the status has one (stars for Stun, letters for Sleep, mark pips, a channel ring…).',
    demos: [
      { label: 'Stun', events: [status('r0', 'stun', 1, 1, true)] },
      { label: 'Sleep', events: [status('r0', 'sleep', 6, 2, true)] },
      { label: 'Silence', events: [status('r0', 'silenced', 1, 2, true)] },
      { label: 'Disarm', events: [status('r0', 'disarm', 1, 2, true)] },
      { label: 'Shield 3', events: [status('y0', 'shield', 3, 999, false)] },
      { label: '+BP 2', events: [status('y0', 'weapon_power', 2, 2, false)] },
      { label: '−BP 2', events: [status('r0', 'weapon_power_down', 2, 2, true)] },
      { label: '−Spirit Res 2', events: [status('r0', 'spirit_resist_down', 2, 2, true)] },
      { label: "Djinn's Mark ×3", events: [status('r0', 'djinns_mark', 3, 3, true)] },
      { label: 'Bleed 3', events: [status('r0', 'bleed', 3, 2, true)] },
      { label: 'Unstoppable', events: [status('y0', 'unstoppable', 1, 1, false)] },
      { label: 'Channeling (Seven)', events: [status('r2', 'casting', 2, 3, false)] },
      { label: '+Heal 2', events: [status('y0', 'healing_boost', 2, 999, false)] },
      { label: 'Healing blocked', events: [status('r0', 'healing_boost_down', 1, 2, true)] },
      { label: 'Charged', events: [status('r0', 'charged', 1, 2, true)] },
      { label: 'Three at once (Stun + Bleed + −BP)', events: [status('r0', 'stun', 1, 1, true), status('r0', 'bleed', 2, 2, true), status('r0', 'weapon_power_down', 1, 2, true)] },
    ],
  },
  {
    id: 'respawn', short: 'Respawn & level',
    title: 'Respawn & level',
    blurb: 'A corpse comes back under gold rays; a level-up rings the card gold.',
    demos: [
      { label: 'KO Haze, then respawn her', events: [{ kind: 'revive', iid: 'r1' }] },
      { label: 'Level up → 2 (Kelvin)', events: [{ kind: 'levelup', iid: 'y0', level: 2 }] },
      { label: 'Level up → 4 (Abrams)', events: [{ kind: 'levelup', iid: 'r0', level: 4 }] },
    ],
  },
];

export function FxShowroom({ extra = [] }: { extra?: ExtraGroup[] }) {
  const { width, height, isMobile } = useViewport();
  const [hp, setHp] = useState<Record<Id, number>>(() => Object.fromEntries(IDS.map((id) => [id, maxHp(id)])) as Record<Id, number>);
  const [dead, setDead] = useState<Set<Id>>(() => new Set());
  const [batch, setBatch] = useState<FxEvent[]>([]);
  const [batchKey, setBatchKey] = useState(0);
  const [calm, setCalm] = useState(false);
  const [only, setOnly] = useState('all');
  const [playing, setPlaying] = useState<string | null>(null);
  const bus = useMemo(() => new FxImpulseBus(), []);
  const seq = useRef(1000);
  const slotRefs = useRef(new Map<string, HTMLElement>());
  const registerSlotRef = useCallback((iid: string, el: HTMLElement | null) => {
    if (el) slotRefs.current.set(iid, el);
    else slotRefs.current.delete(iid);
  }, []);

  const timeline = useMemo(() => buildFxTimeline(batch), [batch]);
  const fxHoldFor = useCallback((iid: string) => ({ impact: timeline.impactDelay[iid] ?? 0, settle: timeline.koSettle[iid] ?? 0 }), [timeline]);
  // Retire the batch once it has played so later mock changes are not held.
  useEffect(() => {
    if (batch.length === 0) return;
    const t = setTimeout(() => { setBatch([]); setPlaying(null); }, timeline.total + 50);
    return () => clearTimeout(t);
  }, [batch, timeline]);

  const fire = (events: Ev[], label?: string) => {
    // Apply the batch to the mock board so the stat hold has something to hold.
    const nextHp = { ...hp };
    const nextDead = new Set(dead);
    const stamped: FxEvent[] = events.map((e) => {
      const ev = { ...e, seq: ++seq.current } as FxEvent;
      if (ev.kind === 'hit') {
        const id = ev.iid as Id;
        if (!nextDead.has(id)) {
          nextHp[id] = Math.max(0, nextHp[id] - ev.amount);
          ev.ko = nextHp[id] <= 0;
          if (ev.ko) nextDead.add(id);
        }
      } else if (ev.kind === 'heal') {
        const id = ev.iid as Id;
        if (!nextDead.has(id)) nextHp[id] = Math.min(maxHp(id), nextHp[id] + ev.amount);
      } else if (ev.kind === 'revive') {
        const id = ev.iid as Id;
        nextDead.delete(id);
        nextHp[id] = maxHp(id);
      }
      return ev;
    });
    setHp(nextHp);
    setDead(nextDead);
    setBatch(stamped);
    setBatchKey(seq.current);
    setPlaying(label ?? null);
  };

  const reset = () => {
    setHp(Object.fromEntries(IDS.map((id) => [id, maxHp(id)])) as Record<Id, number>);
    setDead(new Set());
  };

  const koHaze = () => fire([hit('r1', 99, 'attack', { source: 'y0', cast: 'proc' })]);

  const card = (id: Id): CardInstance => ({
    iid: id,
    cardId: STAGE[id].cardId,
    ownerId: STAGE[id].owner,
    zone: STAGE[id].zone,
    slot: STAGE[id].slot,
    hp: hp[id],
    hpMax: maxHp(id),
    atkMod: 0,
    spiritMod: 0,
    statuses: [],
    exhausted: false,
    skillUsedThisTurn: true,
    level: 1,
    exp: 0,
    respawnTurnsLeft: dead.has(id) ? 3 : undefined,
  });

  const spellOrigin = useCallback(() => ({
    x: Math.min(330, Math.max(170, window.innerWidth * 0.2)),
    y: window.innerHeight / 2,
  }), []);

  // ---- layout ---------------------------------------------------------------
  // Beside the triggers when there is room for both, pinned above them when
  // there is not. Either way the tiles are sized so the whole stage, its
  // controls and the masthead fit the window: a pinned stage taller than the
  // window would hide its own bottom row.
  const two = width >= 1100;
  const stick = isMobile ? STICK.phone : STICK.desk;
  const gap = isMobile ? 8 : 14;
  const pad = isMobile ? 8 : 14;
  const SIDE = 10;                       // the vertical "Rival" / "You" label
  // Everything that shares the window's height with the two rows of tiles.
  const chrome = stick + (two ? 12 : 10) + pad * 2 + gap + 40 /* controls */ + (two ? 12 : 8);
  const rowMax = isMobile ? 146 : two ? 240 : 196;
  const rowFit = Math.floor((height - chrome) / 2);
  // A window too short to hold the stage gets it unpinned, at a usable size.
  const pinned = rowFit >= 96;
  const rowH = pinned ? Math.min(rowMax, rowFit) : Math.min(rowMax, 150);
  // The live board draws a bench tile at about three quarters of the active
  // one. A phone's stage is too narrow for that: a bench tile so small cannot
  // hold a hero's name, so there the three share the row more evenly.
  const ratio = isMobile ? 0.9 : 0.735;
  // A phone is also bounded by its width: sheet margins, the band's padding,
  // the side label and the two gutters come out of it first.
  const across = isMobile ? width - 36 - pad * 2 - SIDE - gap * 3 : Infinity;
  const active = Math.floor(Math.min(rowH * 0.75, across / (1 + 2 * ratio)));
  const bench = Math.round(active * ratio);

  const slot = (id: Id, compact: boolean) => (
    <div key={id} style={{ width: compact ? bench : active, aspectRatio: '3 / 4', flexShrink: 0 }}>
      <HeroSlot
        card={card(id)}
        owner={STAGE[id].owner} myId="0"
        isOpponent={STAGE[id].owner === '1'}
        pending={null} isTargetable={false}
        isCurrentTurn={STAGE[id].zone === 'active'}
        compact={compact || active < 150}
        onTap={() => {}}
        registerSlotRef={registerSlotRef}
      />
    </div>
  );

  const row = (label: string, ids: [Id, Id, Id]) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap }}>
      <span className="gal-fx__side">{label}</span>
      {slot(ids[0], false)}{slot(ids[1], true)}{slot(ids[2], true)}
    </div>
  );

  const filters: Option<string>[] = [
    { id: 'all', label: 'All', n: GROUPS.reduce((n, g) => n + g.demos.length, 0) },
    ...GROUPS.map((g) => ({ id: g.id, label: g.short, n: g.demos.length })),
    ...extra.map((g) => ({ id: g.id, label: g.short })),
  ];
  const shown = (id: string) => only === 'all' || only === id;

  return (
    <FxTimingContext.Provider value={fxHoldFor}>
    <FxImpulseContext.Provider value={bus}>
    <FxCalmContext.Provider value={calm}>
      <div className={two ? 'gal-fx gal-fx--two' : 'gal-fx gal-fx--stack'}>
        {/* layoutRoot: the tiles carry a layoutId, and framer measures layout
            in page coordinates. A pinned stage moves in page coordinates every
            time the page scrolls, so without this the tiles would glide in
            from where they last were on the next render. */}
        <motion.div layoutRoot className={pinned ? 'gal-fx__stage gal-fx__stage--stick' : 'gal-fx__stage'}>
          <div className="gal-fx__band" style={{ padding: pad, gap, alignItems: two ? 'flex-start' : 'center' }}>
            {row('Rival', ['r0', 'r1', 'r2'])}
            {row('You', ['y0', 'y1', 'y2'])}
          </div>
          <div style={{ marginTop: 8 }}>
            <Row>
              <Button onClick={reset}>{isMobile ? 'Reset' : 'Reset stage'}</Button>
              <Button onClick={koHaze}>{isMobile ? 'KO Haze' : 'KO Haze (gunfire)'}</Button>
              <Button onClick={() => setCalm((c) => !c)} title="What reduced-motion players see">
                {isMobile ? `Calm: ${calm ? 'on' : 'off'}` : `Calm motion: ${calm ? 'on' : 'off'}`}
              </Button>
            </Row>
          </div>
        </motion.div>

        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 10 }}>
            <Segmented label="Show" value={only} onChange={setOnly} options={filters} scroll={isMobile} />
          </div>
          {GROUPS.filter((g) => shown(g.id)).map((g) => (
            <div key={g.id} className="gal-fx__group">
              <div className="gal-fx__lede"><h3>{g.title}</h3>{g.blurb}</div>
              <div className="gal-chips">
                {g.demos.map((d) => (
                  <Chip key={d.label} on={playing === d.label} onClick={() => fire(d.events, d.label)}>{d.label}</Chip>
                ))}
              </div>
            </div>
          ))}
          {extra.filter((g) => shown(g.id)).map((g) => (
            <div key={g.id} className="gal-fx__group">
              <div className="gal-fx__lede"><h3>{g.title}</h3>{g.blurb}</div>
              <div className="gal-chips">{g.body}</div>
            </div>
          ))}
        </div>
      </div>
      <FxLayer batch={batch} batchKey={batchKey} slotRefs={slotRefs.current} spellOrigin={spellOrigin} />
    </FxCalmContext.Provider>
    </FxImpulseContext.Provider>
    </FxTimingContext.Provider>
  );
}
