import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Scroll restoration for BrowserRouter (which lacks the built-in ScrollRestoration
 * component available only in createBrowserRouter).
 *
 * Behaviour:
 *  - PUSH / REPLACE (new page forward) → scroll to top immediately
 *  - POP (back / forward button)        → restore the saved scroll position
 *
 * Positions are keyed by location.key so each history entry has its own saved Y,
 * even when the same pathname is visited multiple times.
 */

// Lives outside the component so it persists across re-renders and route changes.
const savedPositions = {};

export const ScrollManager = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const prevKey = useRef(location.key);

  // Track scroll position continuously for the current history entry.
  useEffect(() => {
    const key = location.key;
    const onScroll = () => { savedPositions[key] = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.key]);

  // On route change, either restore or reset scroll.
  useEffect(() => {
    if (navType === 'POP') {
      // Back/forward — restore the saved position for this entry.
      // Use requestAnimationFrame so the page has rendered its content first.
      const target = savedPositions[location.key] ?? 0;
      requestAnimationFrame(() => window.scrollTo({ top: target, behavior: 'instant' }));
    } else {
      // PUSH or REPLACE — new navigation, always start at the top.
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    prevKey.current = location.key;
  }, [location.key, navType]);

  return null;
};
