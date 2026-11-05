import type { ReactNode } from 'react';
import type { GameState, PlayerID } from '@/engine/types';
import { comebackBonus, netWorth, otherPlayer } from '@/engine/query';
import { LANE_INCOME } from '@/engine/constants';
import { fonts, text } from '../tokens';
import { chamfer, clipBoth, poster, soulCoin } from '../poster';

/**
 * The shop's economy, always in sight at the top of the sheet: your souls,
 * large, on the game's plaque — and, while an item is held, the souls a buy
 * would leave — then what next turn's income brings (the comeback named while
 * you trail on net worth), your net worth against the rival's, and the cards
 * in your hand.
 */
export function EconomyHeader({ G, me, preview, compact, controls }: {
  G: GameState;
  me: PlayerID;
  /** An item held on sale: what it would cost you. */
  preview?: number;
  compact: boolean;
  /** The sheet's buttons, beside the readout on a desktop. */
  controls?: ReactNode;
}) {
  const ps = G.players[me];
  const comeback = comebackBonus(G, me);
  const mine = netWorth(G, me);
  const theirs = netWorth(G, otherPlayer(me));
  const after = preview !== undefined ? ps.souls - preview : undefined;
  const big = compact ? 28 : 32;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: compact ? 10 : 16,
      padding: compact ? '10px 12px' : '12px 18px',
      borderBottom: `1px solid ${poster.edge}`,
      background: 'rgba(0, 0, 0, 0.18)',
    }}>
      {/* The souls plaque: the game's cream plate and stencil numerals. */}
      <div
        aria-label={`Souls: ${ps.souls}${after !== undefined ? `, ${after >= 0 ? `${after} left after this buy` : `${-after} short of it`}` : ''}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: compact ? '6px 12px 6px 9px' : '7px 14px 7px 10px',
          background: poster.paperBand, color: poster.ink,
          ...clipBoth(chamfer(7)),
          flexShrink: 0,
        }}
      >
        <span aria-hidden style={soulCoin(compact ? 18 : 20)} />
        <span style={{ fontFamily: fonts.display, fontSize: big, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: poster.ink }}>{ps.souls}</span>
        {after !== undefined && (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span aria-hidden style={{ fontFamily: fonts.display, fontSize: big * 0.6, lineHeight: 1, color: poster.inkDim }}>→</span>
            <span style={{ fontFamily: fonts.display, fontSize: big * 0.8, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: after >= 0 ? poster.status.buff : poster.redDeep }}>{after}</span>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
        <div aria-label={`Next turn: ${LANE_INCOME} souls${comeback ? `, and ${comeback} comeback` : ''}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill>+{LANE_INCOME} next turn</Pill>
          {comeback > 0 && <Pill ink={poster.green}>+{comeback} comeback</Pill>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span aria-label={`Net worth: you ${mine}, rival ${theirs}`} style={{ ...text.label, fontSize: 10, letterSpacing: '0.12em', color: poster.creamDim, whiteSpace: 'nowrap' }}>
            Worth <b style={{ color: poster.cream, fontFamily: fonts.display, fontWeight: 400, fontSize: 12 }}>{mine}</b>
            <span style={{ color: poster.creamFaint }}> · </span>
            Rival <b style={{ color: poster.cream, fontFamily: fonts.display, fontWeight: 400, fontSize: 12 }}>{theirs}</b>
          </span>
          <span aria-label={`Cards in hand: ${ps.hand.length}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: poster.creamDim }}>
            <CardGlyph />
            <span style={{ fontFamily: fonts.display, fontSize: 12, lineHeight: 1, color: poster.cream }}>{ps.hand.length}</span>
          </span>
        </div>
      </div>
      {controls}
    </div>
  );
}

function Pill({ children, ink = poster.creamDim }: { children: ReactNode; ink?: string }) {
  return (
    <span style={{
      ...text.label, fontSize: 9.5, letterSpacing: '0.12em',
      padding: '3px 7px', borderRadius: 999,
      border: `1.5px solid ${ink}`, color: ink, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

/** A card, face down: the hand's count glyph. */
function CardGlyph() {
  return (
    <svg viewBox="0 0 12 16" width={10} height={13} aria-hidden>
      <rect x="1" y="1" width="10" height="14" rx="2" fill="none" stroke={poster.creamDim} strokeWidth="1.6" />
      <path d="M4 6 L8 10 M8 6 L4 10" stroke={poster.creamFaint} strokeWidth="1.2" />
    </svg>
  );
}
