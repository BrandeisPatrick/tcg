/**
 * A short sideways shake — the wordless "no": a hero that cannot take the
 * card played on it, a tile that cannot go where it was tapped. Web
 * Animations on the element itself, so it never fights a framer transform on
 * a child; a hero tile shakes its resting wrapper (`data-fx-rest`), which
 * nothing else moves. Calm under reduced motion: a single nudge.
 */
export function shake(el: Element | null | undefined): void {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return;
  const host = (el.closest('[data-fx-rest]') as HTMLElement | null) ?? (el as HTMLElement);
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  host.animate(
    calm
      ? [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }]
      : [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-7px)' },
          { transform: 'translateX(6px)' },
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(2px)' },
          { transform: 'translateX(0)' },
        ],
    { duration: calm ? 160 : 360, easing: 'ease-out' },
  );
}
