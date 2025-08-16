import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    window.addEventListener("resize", listener);
    return () => window.removeEventListener("resize", listener);
  }, [matches, query]);

  return matches;
}

// 预定义的断点Hook
export function useIsMobile() {
  return useMediaQuery('(max-width: 768px)');
}

export function useIsDesktop() {
  return useMediaQuery('(min-width: 769px)');
}