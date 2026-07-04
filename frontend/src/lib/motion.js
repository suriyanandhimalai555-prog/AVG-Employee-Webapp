// frontend/src/lib/motion.js
// Single motion vocabulary for the app. Before this, framer-motion usages had
// ad-hoc durations (150/200/300/500ms) and mixed easings/springs. Import from
// here so every transition feels part of one calm, professional system.

// Duration scale (seconds). Keep these small — flat/pro UIs move quickly.
export const DURATION = Object.freeze({
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
});

// The house easing curve — a soft "ease-out-quart". Already used on Login;
// promoted here as the standard for all non-spring transitions.
export const EASE = [0.22, 1, 0.36, 1];

// Spring for surfaces that should feel physical (modals, sheets, cards).
export const SPRING = Object.freeze({ type: 'spring', damping: 30, stiffness: 300 });

// ── Reusable variants ────────────────────────────────────────────────────────
// Simple opacity fade.
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.base, ease: EASE } },
  exit:    { opacity: 0, transition: { duration: DURATION.fast, ease: EASE } },
};

// Fade + gentle rise. Good for content blocks and list items.
export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } },
  exit:    { opacity: 0, y: 8, transition: { duration: DURATION.fast, ease: EASE } },
};

// Route-level page transition. Opacity-ONLY on purpose: a lingering transform
// on the route wrapper would re-anchor any inline `position: fixed` modal a
// page renders (fixed elements anchor to a transformed ancestor). Fade is safe
// and still reads smooth.
//
// Enter-only — no exit variant, and the router <Outlet/> must never sit inside
// AnimatePresence: an exiting keyed wrapper keeps rendering the live <Outlet/>,
// which re-resolves to the NEW (lazy) route and suspends mid-exit; with the
// Suspense boundary above Layout the new page then never mounts (blank screen).
export const page = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.base, ease: EASE } },
};

// Modal / bottom-sheet: slides up on mobile, settles with a spring.
export const modal = {
  initial: { opacity: 0, y: 40, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: SPRING },
  exit:    { opacity: 0, y: 40, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE } },
};
