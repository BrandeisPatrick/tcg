import { useCallback, useRef } from 'react';

/**
 * Pointer-driven 3D tilt — the "physical card in my hand" primitive.
 *
 * Writes CSS custom properties directly to the element (no React re-render per
 * frame) which the card's transform + shine layers read:
 *   --rx / --ry  rotateX / rotateY in deg (tilt toward the cursor)
 *   --mx / --my  pointer position 0–100% (drives glare + holo position)
 *   --glare      0→1 highlight strength, eases to 0 on leave
 *   --tilt-on    0/1 flag (lets shine layers fade their reactive bits out)
 *
 * Attach `ref` to the element you want to tilt and spread `handlers` onto it.
 * Honors prefers-reduced-motion by disabling the rotation (glare still tracks).
 */
const REDUCED = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function usePointerTilt({ max = 9 }: { max?: number } = {}) {
  // Loose element type so the same ref can attach to a div (CardFrame) or a
  // button (HeroSlot) without per-call casts.
  const ref = useRef<any>(null);
  const raf = useRef<number | null>(null);

  const set = useCallback((k: string, v: string) => {
    ref.current?.style.setProperty(k, v);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const rot = REDUCED ? 0 : max;
      set('--ry', `${(px - 0.5) * 2 * rot}deg`);
      set('--rx', `${-(py - 0.5) * 2 * rot}deg`);
      set('--mx', `${px * 100}%`);
      set('--my', `${py * 100}%`);
      set('--glare', '1');
      set('--tilt-on', '1');
    });
  }, [max, set]);

  const onPointerLeave = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    set('--rx', '0deg');
    set('--ry', '0deg');
    set('--mx', '50%');
    set('--my', '50%');
    set('--glare', '0');
    set('--tilt-on', '0');
  }, [set]);

  return { ref, handlers: { onPointerMove, onPointerLeave } };
}
