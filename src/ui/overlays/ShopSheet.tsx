/**
 * The shop — the turn's shop step, as a sheet over the board. It opens at the
 * start of your turn and stays until you are done (Done closes the shop and the
 * turn moves on to its act; Hide only puts the sheet away, and the board's Shop
 * button brings it back). One hero at a time: pick who you are buying for, see
 * what it wears (sell it, or move it to another hero), its build — the next
 * item you can afford lit, an item this market does not sell greyed with the
 * one it would take instead — and everything on sale, tab by tab and tier by
 * tier, each with what it costs that hero (an upgrade of an item it wears costs
 * the difference).
 *
 * Every button asks the engine first (`buyBlocked`, `sellBlocked`,
 * `moveItemBlocked`, through `actionRefusal`): a move it will not make is
 * greyed with the reason, never dispatched to go nowhere. Plain on purpose —
 * the poster's paper, ink and buttons; the polished sheet comes later.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { CardId, CardInstance, GameState, ItemSlot, ItemTier, PlayerID } from '@/engine/types';
import { cardName, itemCard } from '@/cards';
import { buyPrice, sellRefund, upgradeComponent } from '@/engine/legality';
import { itemCooldown, slotCap, wornItems } from '@/engine/query';
import { ITEM_SLOTS, marketByTab, marketStandIn, onSale } from '@/engine/market';
import type { Action } from '@/engine/engine';
import { getBuild } from '@/storage/playerData';
import { RoundCardIcon } from '../card/RoundCardIcon';
import { PosterButton } from '../chrome';
import { actionRefusal } from '../board/heroActions';
import { fonts, spring, text } from '../tokens';
import { poster, sheetStyle, soulCoin } from '../poster';
import { useViewport } from '../hooks/useViewport';

/** The sheet's accessible name: the tutorial's gate finds it by this. */
export const SHOP_SHEET = 'Shop sheet';
/** The button that closes the shop. */
export const SHOP_DONE = 'Done shopping';

const TAB_WORD: Record<ItemSlot, string> = { weapon: 'Weapon', spirit: 'Spirit', vitality: 'Vitality' };
const TIERS: ItemTier[] = [1, 2, 3, 4];

/** "1 soul", "4 souls". */
const souls = (n: number) => `${n} soul${n === 1 ? '' : 's'}`;

interface Props {
  G: GameState;
  me: PlayerID;
  /** Make a shop move (the board dispatches it). */
  onMove: (a: Extract<Action, { type: 'buy' | 'sell' | 'moveItem' }>) => void;
  /** Close the shop: the turn moves on to its act. */
  onDone: () => void;
  /** Put the sheet away; the shop stays open. */
  onHide: () => void;
  /** Open the item's card at full size. */
  onPreview: (cardId: CardId) => void;
}

export function ShopSheet({ G, me, onMove, onDone, onHide, onPreview }: Props) {
  const { isMobile } = useViewport();
  const ps = G.players[me];
  const heroes = [ps.active, ...ps.bench].filter((c): c is CardInstance => !!c);
  const [heroIid, setHeroIid] = useState<string>(() => heroes[0]?.iid ?? '');
  const hero = heroes.find((h) => h.iid === heroIid) ?? heroes[0];
  const [tab, setTab] = useState<ItemSlot>(() => firstTab(G, hero));
  // The worn item being moved, while its destination is being picked.
  const [moving, setMoving] = useState<string | null>(null);
  const market = useMemo(() => marketByTab(G), [G]);
  if (!hero) return null;
  const cap = slotCap(G, me);
  const worn = wornItems(hero);
  const heroName = cardName(hero.cardId);

  const buy = (itemId: CardId) => onMove({ type: 'buy', itemId, heroIid: hero.iid });
  const refusal = (a: Action) => actionRefusal(G, me, a);

  return (
    // A static frame places the sheet (centred on desktop, along the bottom on
    // a phone); the sheet inside it does the motion, so framer's transform
    // never fights the placement. The frame lets taps through to the board.
    <div style={{
      position: 'fixed', inset: 0, zIndex: 88,
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
      padding: isMobile ? 6 : 16,
      pointerEvents: 'none',
    }}>
    <motion.div
      role="dialog"
      aria-label={SHOP_SHEET}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={spring.snappy}
      style={{
        pointerEvents: 'auto',
        width: isMobile ? '100%' : 'min(620px, 100%)',
        maxHeight: isMobile ? 'calc(100dvh - 64px)' : 'min(86vh, 760px)',
        display: 'flex', flexDirection: 'column',
        borderRadius: 14,
        overflow: 'hidden',
        color: poster.ink,
        fontFamily: fonts.ui,
        ...sheetStyle,
      }}
    >
      {/* Header: the souls you have, and the two ways out. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: isMobile ? '10px 12px' : '12px 16px',
        borderBottom: `1.5px solid ${poster.ink}`,
      }}>
        <h2 style={{ margin: 0, fontFamily: fonts.display, fontSize: 22, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>Shop</h2>
        <span aria-label={`Souls: ${ps.souls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...text.numeric, fontSize: 18 }}>
          <span aria-hidden style={soulCoin(14)} />{ps.souls}
        </span>
        <span style={{ flex: 1 }} />
        <PosterButton variant="paper" size="sm" onClick={onHide} ariaLabel="Hide the shop" style={{ padding: '7px 12px' }}>Hide</PosterButton>
        <PosterButton variant="ink" size="sm" onClick={onDone} ariaLabel={SHOP_DONE} style={{ padding: '7px 14px' }}>Done</PosterButton>
      </div>

      <div style={{ overflowY: 'auto', padding: isMobile ? '10px 12px 14px' : '12px 16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Who you are buying for: the four heroes and their slots. */}
        <div role="radiogroup" aria-label="Buy for" style={{ display: 'grid', gridTemplateColumns: `repeat(${heroes.length}, minmax(0, 1fr))`, gap: 6 }}>
          {heroes.map((h, i) => {
            const on = h.iid === hero.iid;
            return (
              <button
                key={h.iid}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Shop for ${cardName(h.cardId)}`}
                onClick={() => { setHeroIid(h.iid); setMoving(null); setTab(firstTab(G, h)); }}
                style={{
                  padding: '7px 4px', minWidth: 0,
                  border: `1.5px solid ${on ? poster.ink : poster.inkRule}`,
                  background: on ? poster.ink : 'transparent',
                  color: on ? poster.paper : poster.ink,
                  cursor: 'pointer', textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: fonts.display, fontSize: 12.5, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {cardName(h.cardId)}
                </div>
                <div style={{ ...text.label, fontSize: 9, letterSpacing: '0.14em', color: on ? poster.creamDim : poster.inkDim, marginTop: 2 }}>
                  {i === 0 ? 'Active · ' : ''}{wornItems(h).length}/{cap}
                </div>
              </button>
            );
          })}
        </div>

        {/* What the hero wears: sell it, or move it to another hero. */}
        <Section title={`${heroName} wears`} note={`${worn.length}/${cap} slots`}>
          {worn.length === 0 && <Empty>Nothing yet.</Empty>}
          {worn.map((it) => {
            const data = itemCard(it.cardId)!;
            const refund = sellRefund(G, it);
            const sellNo = refusal({ type: 'sell', itemIid: it.iid });
            const cd = itemCooldown(it);
            return (
              <div key={it.iid} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Row
                  cardId={it.cardId}
                  onPreview={onPreview}
                  meta={[`${TAB_WORD[data.slot]} · T${data.tier}`, it.charges != null ? `${it.charges} charges` : cd > 0 ? `ready in ${cd}` : ''].filter(Boolean).join(' · ')}
                >
                  <PosterButton variant="paper" size="sm" disabled={!!sellNo} title={sellNo?.text} onClick={() => onMove({ type: 'sell', itemIid: it.iid })}
                    ariaLabel={`Sell ${data.name} for ${souls(refund)}`} style={{ padding: '6px 10px' }}>
                    Sell +{refund}
                  </PosterButton>
                  {heroes.length > 1 && (
                    <PosterButton variant="paper" size="sm" onClick={() => setMoving(moving === it.iid ? null : it.iid)}
                      ariaLabel={`Move ${data.name}`} style={{ padding: '6px 10px' }}>
                      {moving === it.iid ? 'Cancel' : 'Move'}
                    </PosterButton>
                  )}
                </Row>
                {moving === it.iid && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 40 }}>
                    {heroes.filter((h) => h.iid !== hero.iid).map((to) => {
                      const no = refusal({ type: 'moveItem', itemIid: it.iid, toHeroIid: to.iid });
                      return (
                        <PosterButton key={to.iid} variant="ink" size="sm" disabled={!!no} title={no?.text}
                          onClick={() => { setMoving(null); onMove({ type: 'moveItem', itemIid: it.iid, toHeroIid: to.iid }); }}
                          ariaLabel={`Move ${data.name} to ${cardName(to.cardId)}`} style={{ padding: '6px 10px' }}>
                          To {cardName(to.cardId)}
                        </PosterButton>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </Section>

        {/* The hero's build: what it means to buy, in order. */}
        <Section title={`${heroName}'s build`} note="next affordable lit">
          <BuildList G={G} me={me} hero={hero} onBuy={buy} onPreview={onPreview} />
        </Section>

        {/* Everything on sale, by tab and tier. */}
        <Section title="On sale">
          <div role="tablist" aria-label="Shop tabs" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {ITEM_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                role="tab"
                aria-selected={tab === slot}
                onClick={() => setTab(slot)}
                style={{
                  flex: 1, padding: '7px 4px',
                  fontFamily: fonts.display, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
                  border: `1.5px solid ${poster.ink}`,
                  background: tab === slot ? poster.ink : 'transparent',
                  color: tab === slot ? poster.paper : poster.ink,
                  cursor: 'pointer',
                }}
              >
                {TAB_WORD[slot]}
              </button>
            ))}
          </div>
          {TIERS.map((tier) => {
            const ids = market[tab][tier];
            if (ids.length === 0) return null;
            return (
              <div key={tier} style={{ marginBottom: 8 }}>
                <div style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.18em', color: poster.inkDim, margin: '4px 0 6px' }}>
                  Tier {tier}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ids.map((id) => {
                    const no = refusal({ type: 'buy', itemId: id, heroIid: hero.iid });
                    const price = buyPrice(hero, id);
                    const component = upgradeComponent(hero, id);
                    return (
                      <Row key={id} cardId={id} onPreview={onPreview}
                        meta={component ? `upgrades ${cardName(component.cardId)}` : no?.text ?? ''}
                        warn={!!no}>
                        <PosterButton variant={no ? 'paper' : 'red'} size="sm" disabled={!!no} title={no?.text}
                          onClick={() => buy(id)} ariaLabel={`Buy ${cardName(id)} for ${heroName}`}
                          style={{ padding: '6px 10px', minWidth: 76 }}>
                          Buy {price}
                        </PosterButton>
                      </Row>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Section>
      </div>
    </motion.div>
    </div>
  );
}

/** The tab a hero's shop opens on: the tab of its next build item, else Weapon. */
function firstTab(G: GameState, hero: CardInstance | undefined): ItemSlot {
  if (!hero) return 'weapon';
  const next = getBuild(hero.cardId).find((id) => !wornItems(hero).some((it) => it.cardId === id));
  const stand = next ? marketStandIn(G, next) : undefined;
  return itemCard(stand ?? next)?.slot ?? 'weapon';
}

/** The hero's build in order: worn items ticked, the next one it can afford
 *  lit (tap to buy it for the hero), an item this market does not sell greyed
 *  with the one that would stand in for it. */
function BuildList({ G, me, hero, onBuy, onPreview }: {
  G: GameState; me: PlayerID; hero: CardInstance; onBuy: (id: CardId) => void; onPreview: (id: CardId) => void;
}) {
  const worn = wornItems(hero).map((it) => it.cardId);
  const has = (id: CardId) => wornItems(hero).some((it) => {
    for (let x: CardId | undefined = it.cardId; x; x = itemCard(x)?.upgradesFrom) if (x === id) return true;
    return false;
  });
  let lit = false;
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {getBuild(hero.cardId).map((id) => {
        const owned = has(id);
        const sale = onSale(G, id);
        const stand = sale ? id : marketStandIn(G, id, worn);
        const no = stand ? actionRefusal(G, me, { type: 'buy', itemId: stand, heroIid: hero.iid }) : null;
        const next = !owned && !!stand && !no && !lit;
        if (next) lit = true;
        const meta = owned ? 'owned'
          : !sale ? (stand ? `not on sale — ${cardName(stand)} instead` : 'not on sale')
          : no?.text ?? '';
        return (
          <li key={id} style={{ opacity: !sale && !owned ? 0.55 : 1 }}>
            <Row cardId={id} onPreview={onPreview} meta={meta} lit={next}>
              {owned ? (
                <span aria-label="Owned" style={{ fontFamily: fonts.display, fontSize: 16, color: poster.status.buff, width: 76, textAlign: 'center' }}>✓</span>
              ) : stand ? (
                <PosterButton variant={next ? 'red' : 'paper'} size="sm" disabled={!!no} title={no?.text}
                  onClick={() => onBuy(stand)} ariaLabel={`Buy ${cardName(stand)} for ${cardName(hero.cardId)} (build)`}
                  style={{ padding: '6px 10px', minWidth: 76 }}>
                  Buy {buyPrice(hero, stand)}
                </PosterButton>
              ) : <span style={{ width: 76 }} />}
            </Row>
          </li>
        );
      })}
    </ol>
  );
}

/** One item line: its round icon (tap: the card at full size), name, a line
 *  under it, and the controls on the right. */
function Row({ cardId, meta, warn = false, lit = false, onPreview, children }: {
  cardId: CardId; meta?: string; warn?: boolean; lit?: boolean; onPreview: (id: CardId) => void; children?: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: lit ? '4px 6px' : 0,
      border: lit ? `1.5px solid ${poster.you}` : '1.5px solid transparent',
      background: lit ? 'rgba(217, 182, 74, 0.16)' : 'transparent',
    }}>
      <button type="button" onClick={() => onPreview(cardId)} aria-label={`${cardName(cardId)} — show the card`}
        style={{ border: 'none', background: 'none', padding: 0, cursor: 'zoom-in', flexShrink: 0 }}>
        <RoundCardIcon cardId={cardId} size={30} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: fonts.display, fontSize: 13.5, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {cardName(cardId)}
        </div>
        {meta && (
          <div style={{ ...text.label, fontSize: 9, letterSpacing: '0.1em', color: warn ? poster.redDeep : poster.inkDim, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {meta}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontFamily: fonts.display, fontSize: 14, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1 }}>{title}</h3>
        {note && <span style={{ ...text.label, fontSize: 9, letterSpacing: '0.16em', color: poster.inkDim }}>{note}</span>}
        <span aria-hidden style={{ flex: 1, height: 1, background: poster.inkRule }} />
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ ...text.label, fontSize: 10, letterSpacing: '0.12em', color: poster.inkDim }}>{children}</div>;
}
