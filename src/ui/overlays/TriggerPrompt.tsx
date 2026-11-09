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
  const scale = isMobile ? 0.6 : 0.78;
  const lines = prompt.offers.map((o) => ({ offer: o, ...offerLine(G, o) }));
  const one = lines.length === 1 ? lines[0] : undefined;
  const have = G.players[me].souls;
  const card = (l: (typeof lines)[number]) => (
    <div style={{ width: 300 * scale, height: 420 * scale }}>
      <div style={{ width: 300, height: 420, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CardFrame cardId={l.cardId} size="full" tapExplains={false} physical={false} />
      </div>
    </div>
  );
  const priceTag = (l: (typeof lines)[number]) => (
    <span style={{ fontFamily: fonts.display, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: poster.inkDim }}>
      {l.printed !== undefined ? `${l.printed} → ${souls(l.price)}` : l.price > 0 ? souls(l.price) : 'Free'} · you have {have}
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
          padding: isMobile ? '18px 14px' : '26px 30px',
          borderRadius: isMobile ? 16 : 18,
          maxWidth: 760,
          color: poster.ink,
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: fonts.display, fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1, color: poster.red }}>
            {momentLine(G, prompt)}
          </span>
          <span style={{ fontFamily: fonts.display, fontSize: isMobile ? 19 : 22, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.15 }}>
            {one ? one.question : 'Use one of them, or pass?'}
          </span>
        </div>
        {one ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {card(one)}
            {priceTag(one)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: isMobile ? 10 : 18 }}>
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
              Use{one.price > 0 ? ` · ${souls(one.price)}` : ''}
            </PosterButton>
          )}
          <PosterButton variant="paper" onClick={onPass}>Pass</PosterButton>
        </div>
      </motion.div>
    </motion.div>
  );
}
