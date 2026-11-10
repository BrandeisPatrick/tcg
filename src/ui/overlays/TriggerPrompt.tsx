/**
 * The trigger prompt (engine/prompts.ts, docs/hero-design.md §6): a card of
 * yours says you MAY use it at a moment — "When Victor falls, you may use
 * this" — and the moment has come, on either player's turn. The game waits on
 * the answer: the card, the moment and the price ("Use Shocking Reanimation
 * for 7 souls?"), then Use or Pass. With several offers, tap the one to use,
 * or pass. It cannot be backed out of: the answer is owed.
 *
 * Everything it shows is read from the engine — the prompt (`promptOwed`),
 * the price (`triggerPrice`), the name (`triggerName`) — so it says what the
 * engine will charge and do.
 */
import { motion } from 'framer-motion';
import type { GameState, PendingTrigger, PlayerID, TriggerOffer } from '@/engine/types';
import { cardName } from '@/cards';
import { findCardOnBoard, resolveSkill, triggerPrice, ultimateCard, ultPrice } from '@/engine/query';
import { triggerName } from '@/engine/prompts';
import { CardFrame } from '../card/CardFrame';
import { PosterButton } from '../chrome';
import { fonts, spring } from '../tokens';
import { poster, scrimStyle, sheetStyle } from '../poster';
import { PatronSigil, Souls, bandStyle, scale as type } from '../hud';
import { useViewport } from '../hooks/useViewport';

/** The sheet's accessible name, by which the tutorial and the QA scripts find it. */
export const TRIGGER_SHEET = 'Trigger prompt';

/** "1 soul", "7 souls". */
const souls = (n: number) => `${n} soul${n === 1 ? '' : 's'}`;

/** The moment, in the words the sheet heads itself with ("Victor falls"). */
export function momentLine(G: GameState, prompt: PendingTrigger): string {
  const subject = findCardOnBoard(G, prompt.subjectIid)?.card;
  const who = subject ? cardName(subject.cardId) : 'Your hero';
  switch (prompt.moment) {
    case 'onFall': return `${who} falls`;
  }
}

/** One offer as the sheet prints it: its card, its name, what it costs now
 *  (and what its card prints, for a charged ultimate) and the question. */
export function offerLine(G: GameState, offer: TriggerOffer): { cardId: string; name: string; price: number; printed?: number; question: string } {
  const hero = findCardOnBoard(G, offer.heroIid)!.card;
  const name = triggerName(hero, offer.abilityId);
  const price = triggerPrice(hero, offer.abilityId);
  const face = resolveSkill(hero, offer.abilityId)?.kind === 'ult' ? ultimateCard(offer.abilityId) : undefined;
  const printed = face?.charged ? ultPrice(face) : undefined;
  return {
    cardId: face?.id ?? hero.cardId,
    name,
    price,
    printed: printed !== undefined && printed !== price ? printed : undefined,
    question: price > 0 ? `Use ${name} for ${souls(price)}?` : `Use ${name} for free?`,
  };
}

export function TriggerPrompt({ G, me, prompt, onUse, onPass }: {
  G: GameState;
  me: PlayerID;
  prompt: PendingTrigger;
  onUse: (offer: TriggerOffer) => void;
  onPass: () => void;
}) {
  const { isMobile } = useViewport();
  const lines = prompt.offers.map((o) => ({ offer: o, ...offerLine(G, o) }));
  const one = lines.length === 1 ? lines[0] : undefined;
  const { width: vw } = useViewport();
  // One offer: its card at its own size, so its rule reads at the type
  // scale (a phone shrank it to about 7px). Several: smaller, side by side.
  const scale = one ? Math.min(isMobile ? 1 : 0.86, (vw - 52) / 300) : isMobile ? 0.6 : 0.78;
  const have = G.players[me].souls;
  const card = (l: (typeof lines)[number]) => (
    <div style={{ width: 300 * scale, height: 420 * scale }}>
      <div style={{ width: 300, height: 420, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CardFrame cardId={l.cardId} size="full" tapExplains={false} physical={false} />
      </div>
    </div>
  );
  // The price on paper: the soul wisp and its number in the paper green (a
  // charged ultimate's printed price struck through before it), then your
  // purse.
  const priceTag = (l: (typeof lines)[number]) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: fonts.ui, fontWeight: 700, fontSize: type.body, color: poster.inkDim }}>
      {l.printed !== undefined && (
        <><s style={{ color: poster.inkDim, fontSize: type.number }}>{l.printed}</s><span aria-hidden>→</span></>
      )}
      {l.price > 0 ? <Souls n={l.price} tone="paper" /> : <span style={{ color: poster.ink, fontSize: type.number }}>Free</span>}
      <span style={{ color: poster.inkFaint }}>·</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>you have <Souls n={have} size={type.body} tone={have >= l.price ? 'paper' : 'short'} /></span>
    </span>
  );
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ ...scrimStyle, zIndex: 100, padding: isMobile ? 12 : 32, overflowY: 'auto' }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={spring.snappy}
        role="dialog"
        aria-label={TRIGGER_SHEET}
        style={{
          ...sheetStyle,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 14 : 18,
          padding: isMobile ? '0 0 18px' : '0 0 26px',
          borderRadius: 12,
          overflow: 'hidden',
          maxWidth: 760,
          color: poster.ink,
        }}
      >
        {/* The header band, in your patron's amber: the moment, then the
            question. */}
        <div style={{
          ...bandStyle(poster.you),
          alignSelf: 'stretch',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
          padding: '11px 16px 10px', textAlign: 'center',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: fonts.ui, fontWeight: 700, fontSize: type.label, letterSpacing: '0.12em' }}>
            <PatronSigil side="you" size={14} color={poster.ink} />
            {momentLine(G, prompt)}
          </span>
          <span style={{ fontSize: isMobile ? type.title : type.display, letterSpacing: '0.05em', lineHeight: 1.15 }}>
            {one ? one.question : 'Use one of them, or pass?'}
          </span>
        </div>
        {one ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 14px' }}>
            {card(one)}
            {priceTag(one)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: isMobile ? 10 : 18, padding: '0 14px' }}>
            {lines.map((l) => (
              <motion.button
                key={`${l.offer.heroIid}|${l.offer.abilityId}`}
                type="button"
                aria-label={l.question.replace(/\?$/, '')}
                onClick={() => onUse(l.offer)}
                whileHover={{ y: -6 }}
                whileTap={{ scale: 0.97 }}
                transition={spring.snappy}
                style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
              >
                {card(l)}
                {priceTag(l)}
              </motion.button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {one && (
            <PosterButton variant="red" onClick={() => onUse(one.offer)} ariaLabel={one.question.replace(/\?$/, '')}>
              Use
            </PosterButton>
          )}
          <PosterButton variant="paper" onClick={onPass}>Pass</PosterButton>
        </div>
      </motion.div>
    </motion.div>
  );
}
