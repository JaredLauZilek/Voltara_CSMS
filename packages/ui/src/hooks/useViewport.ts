import { useEffect, useState } from 'react';

// Breakpoints (px). Picked so the drawer matches:
//   - Galaxy Fold 7 folded (~344) / iPhone 13 Pro Max (~430) → MOBILE
//   - Galaxy Fold 7 unfolded (~780-820) / iPad portrait (768) → TABLET
//   - iPad landscape (1024) and up → DESKTOP
export const BP_MOBILE = 600;
export const BP_TABLET = 1024;

interface Viewport {
  width: number;
  isMobile: boolean; // ≤ 600
  isTablet: boolean; // 601–1024
  isCompact: boolean; // ≤ 1024 — sidebar collapses to a drawer
}

function snapshot(): Viewport {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return {
    width: w,
    isMobile: w <= BP_MOBILE,
    isTablet: w > BP_MOBILE && w <= BP_TABLET,
    isCompact: w <= BP_TABLET,
  };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(snapshot);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      // rAF-coalesce resize storms — iPad rotation and Galaxy Fold's
      // fold/unfold fire many events back-to-back.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp(snapshot()));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return vp;
}
