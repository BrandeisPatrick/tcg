import { useEffect, useState } from 'react';

/**
 * Live viewport size + breakpoint flags. The app styles with inline `style={{}}`
 * objects rather than CSS classes, so media queries can't drive most of the
 * layout — components read this hook and branch their inline styles instead.
 *
 * Breakpoints: mobile ≤767 (phones), tablet 768–1023, desktop ≥1024.
 */
export interface Viewport {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export const MOBILE_MAX = 767;
export const TABLET_MAX = 1023;

function read(): Viewport {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const height = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    width,
    height,
    isMobile: width <= MOBILE_MAX,
    isTablet: width > MOBILE_MAX && width <= TABLET_MAX,
    isDesktop: width > TABLET_MAX,
  };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read);
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp(read()));
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, []);
  return vp;
}

/** Convenience: true on phone-width viewports (≤767px). */
export function useIsMobile(): boolean {
  return useViewport().isMobile;
}
