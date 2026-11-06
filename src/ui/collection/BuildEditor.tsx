/**
 * The build editor — the Loadout screen's half where each hero's build is
 * set: the six items it buys in the shop, in order, which every match reads
 * (storage/playerData.ts). Printed like the shop, in icons only: the hero's
 * name and the three tab words are the only words on it.
 *
 *   heroes     every hero's head, the squad's first; the one being edited
 *              ringed
 *   build      its six tiles in buying order, empty slots faint. Tap one to
 *              pick it up (its ✕ takes it out of the build), another to swap
 *              the two. It stays in view while the catalogue scrolls under it
 *   catalogue  every item in the game by tab — Weapon · Vitality · Spirit —
 *              in the shop's tier rows. Tap a tile to put it in the slot
 *              picked up, else in the first empty one; with the build full
 *              and nothing picked up, the tile shakes and the build nudges.
 *              A tile the build has is ticked
 *
 * A long-press (a right-click, a mouse rest) on any tile opens its tooltip; a
 * second tap opens the full card. Under a mouse, a tile can also be dragged:
 * a build tile onto another slot, a catalogue tile into one. Every change is
 * saved at once; the ↺ button puts the hero's default build back.
 */
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import type { CardId, ItemSlot, ItemTier } from '@/engine/types';
import { HEROES, ITEMS, cardName } from '@/cards';
import { BUILD_SIZE, defaultBuild } from '@/cards/builds';
import { tierLists } from '@/engine/market';
import { getBuild, saveBuild } from '@/storage/playerData';
import { HERO_IMG_BASE } from '@/art/assets';
import { ShopTile } from '../shop/ShopTile';
import { ItemTooltip } from '../shop/ItemTooltip';
import { TierRows } from '../shop/TierRows';
import { CATEGORY_WORD, SHOP_TABS } from '../shop/itemFacts';
import { CardPreview } from '../overlays/CardPreview';
import { fonts, spring } from '../tokens';
import { poster, shopInk } from '../poster';
import { useViewport } from '../hooks/useViewport';

/** Every item in the game by tab and tier, in catalogue order — the order the
 *  match's shop sets its rows in, so a tile sits where the player will find
 *  it there. */
const CATALOGUE: Record<ItemSlot, Record<ItemTier, CardId[]>> = (() => {
  const out: Record<ItemSlot, Record<ItemTier, CardId[]>> = { weapon: tierLists(), vitality: tierLists(), spirit: tierLists() };
  for (const item of ITEMS) out[item.slot][item.tier].push(item.id);
  return out;
})();

const NAME: Record<CardId, string> = Object.fromEntries(HEROES.map((h) => [h.id, h.name]));
const BY_NAME = [...HEROES].sort((a, b) => a.name.localeCompare(b.name)).map((h) => h.id);
const headUrl = (heroId: CardId) => `${HERO_IMG_BASE}${heroId}_sm.webp`;
const sameList = (a: readonly CardId[], b: readonly CardId[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** The page's gutters round the panel on a phone, each side: the screen's
 *  padding (10), the sheet's (14), the panel's own (10) and its border. The
 *  build's six tiles shrink from 44px only where a narrower phone needs it. */
const PHONE_CHROME = 10 + 14 + 10 + 1.5;

/** The tooltip open on a tile: held open by a long-press, or a mouse's
 *  passing peek. */
interface Tip { id: CardId; rect: DOMRect; passive: boolean }

/** A tile being dragged: a build slot, or an item from the catalogue. */
type Drag = { from: 'build'; index: number } | { from: 'catalogue'; id: CardId };

/** A slot's drag-and-drop handlers (a mouse only — on a phone a long press is
 *  the tooltip, never a drag). */
interface SlotDrop {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

/** True under a mouse or a trackpad: the tiles drag. */
function useFinePointer(): boolean {
  const query = '(pointer: fine)';
  const [fine, setFine] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setFine(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return fine;
}

/** What a catalogue tile does when tapped, as its accessible name says it. */
function catalogueLabel(id: CardId, build: readonly CardId[], held: number | null, hero: string): string {
  const name = cardName(id);
  const at = build.indexOf(id);
  if (held !== null && build[held]) {
    if (at === held) return `${name}, slot ${held + 1} of ${hero}'s build`;
    if (at >= 0) return `Swap ${name} into slot ${held + 1} of ${hero}'s build`;
    return `Put ${name} in slot ${held + 1} of ${hero}'s build, in place of ${cardName(build[held])}`;
  }
  if (at >= 0) return `${name}, in ${hero}'s build`;
  if (build.length >= BUILD_SIZE) return `${name}: ${hero}'s build is full`;
  return `Add ${name} to ${hero}'s build`;
}

export function BuildEditor({ squad }: {
  /** The squad's heroes in pick order: first in the hero row. */
  squad: CardId[];
}) {
  const { isMobile, width } = useViewport();
  const order = useMemo(() => [...squad, ...BY_NAME.filter((id) => !squad.includes(id))], [squad]);
  const [heroId, setHeroId] = useState<CardId>(() => order[0]);
  const [build, setBuild] = useState<CardId[]>(() => getBuild(order[0]));
  /** The build slot picked up: the next catalogue tap lands in it, the next
   *  build tap swaps with it. */
  const [held, setHeld] = useState<number | null>(null);
  const [tab, setTab] = useState<ItemSlot>('weapon');
  const [tip, setTip] = useState<Tip | null>(null);
  const [card, setCard] = useState<CardId | null>(null);
  /** Build slots to nudge (a refused catalogue tap points at them), and a
   *  count that replays the nudge. */
  const [nudge, setNudge] = useState<{ at: number[]; n: number }>({ at: [], n: 0 });
  /** Under a mouse: the tile being dragged, and the slot it is over. */
  const fine = useFinePointer();
  const dragging = useRef<Drag | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  /** A long press has just opened a tooltip: the click its release makes is
   *  swallowed (see the effect below). */
  const endingPress = useRef(false);

  const hero = NAME[heroId] ?? cardName(heroId);
  const isDefault = sameList(build, defaultBuild(heroId));

  // 10px between tiles keeps one tile's bolt clear of the next one's tick.
  const gap = 10;
  const tile = isMobile ? Math.max(32, Math.min(44, Math.floor((width - 2 * PHONE_CHROME - 5 * gap) / 6))) : 50;
  const shopTile = isMobile ? tile : 44;
  const face = isMobile ? 40 : 44;

  /** Save `next` as the hero's build and show what storage kept. */
  const commit = (next: CardId[]) => {
    saveBuild(heroId, next);
    setBuild(getBuild(heroId));
    setHeld(null);
    // A mouse peek anchored to a tile that moved or went is stale.
    setTip((t) => (t?.passive ? null : t));
  };

  const pickHero = (id: CardId) => {
    if (id === heroId) return;
    setHeroId(id);
    setBuild(getBuild(id));
    setHeld(null);
    setTip(null);
  };

  /** `id` into slot `i`: in place of what is there — the two trade places
   *  when the build already has `id` — or, an empty slot, at the end of the
   *  build (a build has no gaps). */
  const placeAt = (id: CardId, i: number) => {
    const at = build.indexOf(id);
    if (at === i) { setHeld(null); return; }
    const next = [...build];
    if (i >= build.length) {
      if (at >= 0) next.splice(at, 1);
      next.push(id);
    } else if (at >= 0) {
      [next[at], next[i]] = [next[i], next[at]];
    } else {
      next[i] = id;
    }
    commit(next);
  };

  const tapSlot = (i: number) => {
    if (held === null) { setHeld(i); return; }
    if (held === i) { setHeld(null); return; }
    placeAt(build[held], i);
  };

  const removeSlot = (i: number) => {
    // A build keeps at least one item: saving none puts the default back.
    if (build.length <= 1) return;
    commit(build.filter((_, k) => k !== i));
  };

  const restore = () => {
    saveBuild(heroId, []);
    setBuild(getBuild(heroId));
    setHeld(null);
    setTip(null);
  };

  /** A catalogue tile tapped: into the slot picked up (a swap when the build
   *  already has it), else into the first empty slot. False when it cannot
   *  go anywhere — the tile shakes and the build nudges the slots in the way. */
  const pick = (id: CardId): boolean => {
    const at = build.indexOf(id);
    if (held !== null) {
      placeAt(id, held);
      return true;
    }
    if (at >= 0 || build.length >= BUILD_SIZE) {
      setNudge((v) => ({ at: at >= 0 ? [at] : build.map((_, k) => k), n: v.n + 1 }));
      return false;
    }
    commit([...build, id]);
    return true;
  };

  const openTip = (id: CardId, rect: DOMRect) => {
    endingPress.current = true;
    setTip({ id, rect, passive: false });
  };
  const peekTip = (id: CardId, rect: DOMRect | null) => setTip((t) => {
    if (rect) return t && !t.passive ? t : { id, rect, passive: true };
    return t?.passive && t.id === id ? null : t;
  });

  // Drag and drop, under a mouse. The drag is kept in a ref (a dragover fires
  // every few ms); only the slot it is over is state, for its ring.
  const startDrag = (d: Drag) => {
    dragging.current = d;
    setHeld(null);
    setTip(null);
  };
  const endDrag = () => {
    dragging.current = null;
    setDropAt(null);
  };
  const slotDrop = (i: number): SlotDrop => ({
    onDragOver: (e) => {
      if (!dragging.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropAt !== i) setDropAt(i);
    },
    // Moving onto the slot's own tile is no leaving.
    onDragLeave: (e) => {
      if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
      setDropAt((v) => (v === i ? null : v));
    },
    onDrop: (e) => {
      e.preventDefault();
      const d = dragging.current;
      endDrag();
      if (!d) return;
      const id = d.from === 'build' ? build[d.index] : d.id;
      if (id) placeAt(id, i);
    },
  });

  // The catalogue is memoised on its props: its handlers are stable, reading
  // the latest state through a ref, so a peek or a nudge never re-renders it.
  const latest = useRef({ pick, openTip, peekTip, pickHero, startDrag, endDrag });
  latest.current = { pick, openTip, peekTip, pickHero, startDrag, endDrag };
  const onPick = useCallback((id: CardId) => latest.current.pick(id), []);
  const onLong = useCallback((id: CardId, rect: DOMRect) => latest.current.openTip(id, rect), []);
  const onPeek = useCallback((id: CardId, rect: DOMRect | null) => latest.current.peekTip(id, rect), []);
  const onHero = useCallback((id: CardId) => latest.current.pickHero(id), []);
  const onDragItem = useCallback((id: CardId) => latest.current.startDrag({ from: 'catalogue', id }), []);
  const onDragDone = useCallback(() => latest.current.endDrag(), []);

  // The click that ends a long press is no tap. A finger's lands on the
  // tooltip's tap-away layer, which has just appeared under it, inside the
  // tile — the tooltip would take it for the second tap and swap itself for
  // the full card the moment the finger lifts. It is swallowed here, in the
  // capture phase before React sees it; a new press or key lets clicks
  // through again (a release that makes no click leaves nothing to swallow).
  useEffect(() => {
    const reset = () => { endingPress.current = false; };
    const onClick = (e: MouseEvent) => {
      if (!endingPress.current) return;
      endingPress.current = false;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('pointerdown', reset, true);
    window.addEventListener('keydown', reset, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerdown', reset, true);
      window.removeEventListener('keydown', reset, true);
      window.removeEventListener('click', onClick, true);
    };
  }, []);

  // A tooltip is anchored where its tile was: a scroll moves the tile, so it
  // goes.
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [tip]);
  // Layered Escape: the full card, else the tooltip, else the slot picked up
  // — in the capture phase, stopped there, so the System menu's own Escape
  // (its open/close toggle) does not fire underneath.
  useEffect(() => {
    if (!card && !tip && held === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (card) setCard(null);
      else if (tip) setTip(null);
      else setHeld(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [card, tip, held]);

  // A tab opened while the catalogue is scrolled under the stuck header
  // starts at its first row: the panel is brought back to the top of the
  // screen (once the new tab has its height, so the scroll is not clamped).
  const panel = useRef<HTMLDivElement>(null);
  const tabScroll = useRef(false);
  const switchTab = (slot: ItemSlot) => {
    if (slot === tab) return;
    tabScroll.current = true;
    setTab(slot);
    setTip(null);
  };
  useLayoutEffect(() => {
    if (!tabScroll.current) return;
    tabScroll.current = false;
    const top = panel.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) window.scrollTo(0, window.scrollY + top);
  }, [tab]);

  // The tab words close up on the narrowest phones (under 360px) so the
  // three still fit across.
  const narrow = width < 360;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 16 }}>
      <HeroRow order={order} squadCount={squad.length} picked={heroId} size={face} onPick={onHero} />

      {/* The shop's graphite panel: the build and the tabs on top, the
          catalogue under them. */}
      <div
        ref={panel}
        style={{
          position: 'relative',
          background: poster.frame,
          border: `1.5px solid ${poster.ink}`,
          borderRadius: 12,
          boxShadow: '0 12px 26px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.22)',
          color: poster.cream,
        }}
      >
        {/* The build and the tabs — held at the top of the screen while the
            catalogue scrolls, so a tap below is seen landing and another
            tab is a tap away. */}
        <div
          style={{
            position: 'sticky',
            top: 'env(safe-area-inset-top, 0px)',
            zIndex: 3,
            background: poster.frame,
            borderRadius: '11px 11px 0 0',
            boxShadow: '0 10px 14px -12px rgba(0, 0, 0, 0.9)',
          }}
        >
          <div style={{ padding: isMobile ? '10px 10px 12px' : '14px 14px 16px', borderBottom: `1px solid ${poster.edge}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32 }}>
              <img
                src={headUrl(heroId)}
                alt=""
                draggable={false}
                style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0, userSelect: 'none' }}
              />
              <h3
                style={{
                  margin: 0,
                  minWidth: 0,
                  fontFamily: fonts.display,
                  fontWeight: 400,
                  fontSize: isMobile ? 20 : 24,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  color: poster.cream,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {hero}
              </h3>
              <RestoreButton hero={hero} disabled={isDefault} onPress={restore} />
            </div>

            <div
              role="group"
              aria-label={`${hero}'s build`}
              style={{ display: 'flex', gap, marginTop: isMobile ? 10 : 14 }}
            >
              {Array.from({ length: BUILD_SIZE }, (_, i) => {
                const id = build[i];
                const drop = fine ? slotDrop(i) : undefined;
                if (!id) return <EmptySlot key={`empty-${i}`} size={tile} target={dropAt === i} drop={drop} />;
                return (
                  <BuildSlot
                    key={id}
                    itemId={id}
                    index={i}
                    size={tile}
                    hero={hero}
                    held={held === i}
                    target={dropAt === i}
                    removable={build.length > 1}
                    nudge={nudge.at.includes(i) ? nudge.n : 0}
                    onTap={tapSlot}
                    onRemove={removeSlot}
                    onLong={onLong}
                    onPeek={onPeek}
                    drag={drop && { ...drop, onStart: () => startDrag({ from: 'build', index: i }), onEnd: endDrag }}
                  />
                );
              })}
            </div>
          </div>

          {/* Tabs — Weapon · Vitality · Spirit, the lit one underlined in its colour. */}
          <div role="tablist" aria-label="Item categories" style={{ display: 'flex', borderBottom: `1px solid ${poster.edge}` }}>
            {SHOP_TABS.map((slot) => {
              const on = slot === tab;
              const { ink, wash } = shopInk(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  role="tab"
                  id={`build-tab-${slot}`}
                  aria-selected={on}
                  aria-controls="build-catalogue"
                  onClick={() => switchTab(slot)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    padding: isMobile ? '12px 4px 10px' : '13px 6px 11px',
                    border: 'none',
                    borderBottom: `3px solid ${on ? ink : 'transparent'}`,
                    marginBottom: -1,
                    background: on ? wash : 'transparent',
                    color: on ? poster.cream : poster.creamDim,
                    fontFamily: fonts.display,
                    fontSize: narrow ? 12.5 : isMobile ? 14 : 15,
                    letterSpacing: narrow ? '0.06em' : '0.12em',
                    textTransform: 'uppercase',
                    lineHeight: 1,
                    cursor: 'pointer',
                    transition: 'color 140ms ease, background 140ms ease, border-color 140ms ease',
                  }}
                >
                  {!narrow && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: ink, opacity: on ? 1 : 0.55, flexShrink: 0 }} />}
                  {CATEGORY_WORD[slot]}
                </button>
              );
            })}
          </div>
        </div>

        <div
          id="build-catalogue"
          role="tabpanel"
          aria-labelledby={`build-tab-${tab}`}
          style={{ padding: isMobile ? '12px 10px 14px' : '16px 14px 18px' }}
        >
          <Catalogue
            tab={tab}
            size={shopTile}
            gap={gap}
            build={build}
            held={held}
            hero={hero}
            onPick={onPick}
            onLong={onLong}
            onPeek={onPeek}
            draggable={fine}
            onDragItem={onDragItem}
            onDragDone={onDragDone}
          />
        </div>
      </div>

      <AnimatePresence>
        {tip && (
          <ItemTooltip
            key={`${tip.id}-${tip.passive ? 'peek' : 'held'}`}
            itemId={tip.id}
            anchor={tip.rect}
            passive={tip.passive}
            onClose={() => setTip(null)}
            onOpenCard={() => { setCard(tip.id); setTip(null); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {card && <CardPreview key={card} cardId={card} onClose={() => setCard(null)} />}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heroes                                                              */
/* ------------------------------------------------------------------ */

/** Every hero's head — the squad's first, set off from the rest by a rule —
 *  the one whose build is open ringed in red. */
const HeroRow = memo(function HeroRow({ order, squadCount, picked, size, onPick }: {
  order: CardId[];
  squadCount: number;
  picked: CardId;
  size: number;
  onPick: (id: CardId) => void;
}) {
  return (
    <div role="group" aria-label="Heroes" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, padding: '3px 3px 0' }}>
      {order.map((id, i) => {
        const on = id === picked;
        const name = NAME[id] ?? cardName(id);
        return (
          <Fragment key={id}>
            {i === squadCount && squadCount > 0 && (
              <span aria-hidden style={{ width: 1.5, height: size - 8, alignSelf: 'center', margin: '0 3px', background: poster.inkFaint }} />
            )}
            <motion.button
              type="button"
              aria-label={`Edit ${name}'s build`}
              aria-pressed={on}
              onClick={() => onPick(id)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.92 }}
              transition={spring.snappy}
              style={{
                position: 'relative',
                width: size,
                height: size,
                padding: 0,
                border: 'none',
                borderRadius: Math.round(size * 0.24),
                background: on ? poster.ink : poster.frame,
                boxShadow: on
                  ? `0 0 0 2px ${poster.paper}, 0 0 0 4.5px ${poster.red}`
                  : `inset 0 0 0 1px ${poster.edge}`,
                overflow: 'hidden',
                cursor: on ? 'default' : 'pointer',
                lineHeight: 0,
                touchAction: 'manipulation',
              }}
            >
              <img
                src={headUrl(id)}
                alt=""
                draggable={false}
                loading="lazy"
                decoding="async"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  transform: 'scale(1.12)',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
            </motion.button>
          </Fragment>
        );
      })}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* The build                                                           */
/* ------------------------------------------------------------------ */

/** One filled slot of the build: the item's tile — picked up, it wears the
 *  cream ring and the red ✕ that takes it out; under a dragged tile, the gold
 *  ring. It slides when a swap moves it, pops in when it is new, and hops
 *  when a refused tap points at it. */
function BuildSlot({ itemId, index, size, hero, held, target, removable, nudge, onTap, onRemove, onLong, onPeek, drag }: {
  itemId: CardId;
  index: number;
  size: number;
  hero: string;
  held: boolean;
  target: boolean;
  removable: boolean;
  nudge: number;
  onTap: (i: number) => void;
  onRemove: (i: number) => void;
  onLong: (id: CardId, rect: DOMRect) => void;
  onPeek: (id: CardId, rect: DOMRect | null) => void;
  /** Under a mouse: the tile drags, and takes a drop. */
  drag?: SlotDrop & { onStart: () => void; onEnd: () => void };
}) {
  const hop = useAnimationControls();
  useEffect(() => {
    if (nudge > 0) void hop.start({ y: [0, -7, 0, -3, 0], transition: { duration: 0.42, ease: 'easeOut' } });
  }, [nudge, hop]);
  const name = cardName(itemId);
  return (
    <motion.span
      layout
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring.snappy}
      style={{ position: 'relative', display: 'inline-block', lineHeight: 0, zIndex: held ? 1 : 0 }}
    >
      <motion.span animate={hop} style={{ display: 'inline-block', lineHeight: 0 }}>
        <span
          draggable={!!drag}
          onDragStart={drag && ((e) => {
            e.dataTransfer.setData('text/plain', itemId);
            e.dataTransfer.effectAllowed = 'move';
            drag.onStart();
          })}
          onDragEnd={drag?.onEnd}
          onDragOver={drag?.onDragOver}
          onDragLeave={drag?.onDragLeave}
          onDrop={drag?.onDrop}
          style={{ display: 'inline-block', lineHeight: 0 }}
        >
          <ShopTile
            itemId={itemId}
            size={size}
            label={`${hero}'s build, slot ${index + 1}: ${name}${held ? ', picked up' : ''}`}
            selected={held}
            lit={target}
            onTap={() => onTap(index)}
            onLong={(rect) => onLong(itemId, rect)}
            onHover={(rect) => onPeek(itemId, rect)}
          />
        </span>
      </motion.span>
      <AnimatePresence>
        {held && removable && (
          <motion.button
            key="remove"
            type="button"
            aria-label={`Remove ${name} from ${hero}'s build`}
            onClick={() => onRemove(index)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0, transition: { duration: 0.1 } }}
            whileTap={{ scale: 0.85 }}
            transition={spring.snappy}
            style={{
              position: 'absolute',
              top: -13,
              left: -13,
              width: 30,
              height: 30,
              padding: 0,
              border: 'none',
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 2,
              touchAction: 'manipulation',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: poster.red,
                boxShadow: `0 0 0 2px ${poster.frame}, 0 2px 4px rgba(0, 0, 0, 0.5)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg viewBox="0 0 10 10" width={9} height={9}>
                <path d="M2 2 L8 8 M8 2 L2 8" stroke={poster.paper} strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.span>
  );
}

/** A slot the build leaves open: a faint keyline where a tile will go — gold
 *  under a dragged tile, which lands at the end of the build. */
function EmptySlot({ size, target, drop }: { size: number; target: boolean; drop?: SlotDrop }) {
  return (
    <span
      aria-hidden
      {...drop}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: Math.max(3, Math.round(size * 0.18)),
        border: `1.5px dashed ${target ? poster.you : poster.creamFaint}`,
        background: target ? 'rgba(217, 182, 74, 0.14)' : 'rgba(232, 224, 204, 0.04)',
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
    />
  );
}

/** ↺ — the hero's default build back; dim while the build is the default. */
function RestoreButton({ hero, disabled, onPress }: { hero: string; disabled: boolean; onPress: () => void }) {
  return (
    <motion.button
      type="button"
      aria-label={`Restore ${hero}'s default build`}
      disabled={disabled}
      onClick={onPress}
      whileTap={disabled ? undefined : { scale: 0.9, rotate: -40 }}
      transition={spring.snappy}
      style={{
        width: 32,
        height: 32,
        flexShrink: 0,
        padding: 0,
        borderRadius: '50%',
        border: `1.5px solid ${disabled ? poster.edge : poster.creamDim}`,
        background: 'transparent',
        color: disabled ? poster.creamFaint : poster.cream,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        touchAction: 'manipulation',
        transition: 'color 140ms ease, border-color 140ms ease',
      } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 4v6h6" />
        <path d="M3.6 15a9 9 0 1 0 2.1-9.4L3 10" />
      </svg>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

/** Every item of one tab in the shop's tier rows, as tiles: the build's own
 *  ticked. Memoised — a tooltip's peek or a nudge leaves it alone. */
const Catalogue = memo(function Catalogue({ tab, size, gap, build, held, hero, onPick, onLong, onPeek, draggable, onDragItem, onDragDone }: {
  tab: ItemSlot;
  size: number;
  gap: number;
  build: CardId[];
  held: number | null;
  hero: string;
  onPick: (id: CardId) => boolean;
  onLong: (id: CardId, rect: DOMRect) => void;
  onPeek: (id: CardId, rect: DOMRect | null) => void;
  draggable: boolean;
  onDragItem: (id: CardId) => void;
  onDragDone: () => void;
}) {
  return (
    <TierRows
      slot={tab}
      byTier={CATALOGUE[tab]}
      gap={gap}
      renderTile={(id) => (
        <CatalogueTile
          key={id}
          itemId={id}
          size={size}
          owned={build.includes(id)}
          label={catalogueLabel(id, build, held, hero)}
          onPick={onPick}
          onLong={onLong}
          onPeek={onPeek}
          draggable={draggable}
          onDragItem={onDragItem}
          onDragDone={onDragDone}
        />
      )}
    />
  );
});

/** One catalogue tile; a tap that cannot place it shakes it. Under a mouse
 *  it drags onto a build slot. */
const CatalogueTile = memo(function CatalogueTile({ itemId, size, owned, label, onPick, onLong, onPeek, draggable, onDragItem, onDragDone }: {
  itemId: CardId;
  size: number;
  owned: boolean;
  label: string;
  onPick: (id: CardId) => boolean;
  onLong: (id: CardId, rect: DOMRect) => void;
  onPeek: (id: CardId, rect: DOMRect | null) => void;
  draggable: boolean;
  onDragItem: (id: CardId) => void;
  onDragDone: () => void;
}) {
  const shake = useAnimationControls();
  return (
    <motion.span animate={shake} style={{ display: 'inline-block', lineHeight: 0 }}>
      <span
        draggable={draggable}
        onDragStart={draggable ? (e) => {
          e.dataTransfer.setData('text/plain', itemId);
          e.dataTransfer.effectAllowed = 'copyMove';
          onDragItem(itemId);
        } : undefined}
        onDragEnd={draggable ? onDragDone : undefined}
        style={{ display: 'inline-block', lineHeight: 0 }}
      >
        <ShopTile
          itemId={itemId}
          size={size}
          label={label}
          marks={owned ? { owned: true } : undefined}
          onTap={() => {
            if (!onPick(itemId)) void shake.start({ x: [0, -6, 6, -4, 4, -2, 0], transition: { duration: 0.36 } });
          }}
          onLong={(rect) => onLong(itemId, rect)}
          onHover={(rect) => onPeek(itemId, rect)}
        />
      </span>
    </motion.span>
  );
});
