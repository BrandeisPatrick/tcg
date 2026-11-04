import type { CardInstance } from '@/engine/types';
import { Hand } from './Hand';
import { BoardControls } from './BoardControls';
import type { PendingPlay } from '../helpers';
import { useViewport } from '../hooks/useViewport';

/**
 * Bottom row: the hand fan, floating under the cream sheet on the dark
 * scene. On desktop the turn controls live on the sheet's right rail
 * (Board mounts the BoardControls dock there), so the fan takes the full
 * row; phones keep the controls here as a row under the hand, the turn
 * button at the thumb edge. The phone hand is a flat strip (see Hand) in
 * flow above that row, so no card ever sits under it.
 */
export function HandTray({
  cards, disabled, pending, isMyTurn, busy, hasPending, playable,
  onTap, onLongPress, onHover, onDragEndOver, onBlocked, onEndTurn, onCancel,
  autoPlay, onToggleAuto, onShop, arriving, registerCard,
}: {
  cards: CardInstance[];
  disabled: boolean;
  pending: PendingPlay | null;
  isMyTurn: boolean;
  busy?: boolean;
  hasPending: boolean;
  playable: (c: CardInstance) => boolean;
  onTap: (c: CardInstance) => void;
  onLongPress: (c: CardInstance) => void;
  onHover: (c: CardInstance | null) => void;
  onDragEndOver: (c: CardInstance, x: number, y: number) => void;
  onBlocked?: (c: CardInstance) => void;
  onEndTurn: () => void;
  onCancel: () => void;
  autoPlay: boolean;
  onToggleAuto: () => void;
  /** The shop is open and its sheet put away: the controls offer it back. */
  onShop?: () => void;
  arriving?: string | null;
  registerCard?: (iid: string, el: HTMLElement | null) => void;
}) {
  const { isMobile } = useViewport();
  // pointerEvents:none lets clicks fall through the (full-width) tray shell to
  // whatever it overlaps — pointer-events is inherited, so interactive children
  // (hand cards, the mobile controls row) opt back in with 'auto'.
  return (
    <div style={isMobile ? {
      display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8, pointerEvents: 'none',
    } : {
      paddingBottom: 16, pointerEvents: 'none', position: 'relative',
    }}>
      {/* Contact shade — a flat pool of neutral black under the fan so the
          held cards read as lifted off the scene rather than floating free.
          Painted before the cards; their transforms stack above it. */}
      {!isMobile && cards.length > 0 && (
        <div aria-hidden style={{
          position: 'absolute',
          left: '14%',
          right: '14%',
          bottom: 8,
          height: 48,
          background: 'radial-gradient(ellipse 50% 100% at 50% 100%, rgba(0, 0, 0, 0.26), rgba(0, 0, 0, 0.10) 55%, transparent 78%)',
          filter: 'blur(2px)',
        }} />
      )}
      {/* Phones: the strip runs past the board's 6px side padding to the
          screen edges, so a card scrolls off the glass, not off a margin. */}
      <div style={{ minWidth: 0, margin: isMobile ? '0 -6px' : undefined }}>
        <Hand
          cards={cards}
          disabled={disabled}
          pending={pending}
          playable={playable}
          onTap={onTap}
          onLongPress={onLongPress}
          onHover={onHover}
          onDragEndOver={onDragEndOver}
          onBlocked={onBlocked}
          arriving={arriving}
          registerCard={registerCard}
        />
      </div>
      {isMobile && (
        <BoardControls
          variant="tray"
          isMyTurn={isMyTurn}
          busy={!!busy}
          hasPending={hasPending}
          autoPlay={autoPlay}
          onEndTurn={onEndTurn}
          onCancel={onCancel}
          onToggleAuto={onToggleAuto}
          onShop={onShop}
        />
      )}
    </div>
  );
}
