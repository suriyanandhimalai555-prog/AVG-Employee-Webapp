// ErrorBoundary — catches render errors and failed lazy-chunk imports.
//
// React's <Suspense> only handles the *pending* (loading) promise; when a
// dynamic import() rejects (e.g. chunk 404 after a new deploy), the rejection
// propagates as a render error that Suspense cannot catch.  This class component
// sits *above* the Suspense boundary and intercepts those errors.
//
// Stale-chunk errors → auto-reload once (via the shared reloadForStaleChunk
// helper with its cooldown guard).  If the guard trips (reloaded < 10 s ago)
// it means the chunk is genuinely missing, not just stale — show retry UI.
//
// Any other render error → show a generic retry screen so the app never goes
// fully blank.
//
// IMPORTANT: This component is intentionally animation-free.  Per project rules,
// <Outlet/> must never be wrapped in <AnimatePresence> because React Router 7
// lazy routes suspend mid-exit → blank screen.  The error fallback avoids all
// Framer Motion wrappers for the same reason.

import { Component } from 'react';
import { isChunkLoadError, reloadForStaleChunk } from '../lib/chunkReload';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    // hasError — whether a render error was caught.
    // reloading — whether we triggered window.location.reload() and are
    //             waiting for it; render nothing in this transient state.
    this.state = { hasError: false, reloading: false };
  }

  static getDerivedStateFromError() {
    // Switch to error UI on the next render cycle.
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error)) {
      // Stale chunk after a new deploy.  Try to self-heal with one reload.
      const willReload = reloadForStaleChunk();
      if (willReload) {
        // Page is about to reload — render nothing so there is no flash.
        this.setState({ reloading: true });
        return;
      }
      // Guard tripped: we just reloaded and the chunk is still missing.
      // Fall through to the error UI so the user can manually retry.
    }

    // Log non-chunk errors so they are visible in monitoring/console.
    console.error('[ErrorBoundary] Uncaught render error:', error, info);
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    // Reloading: window.location.reload() was called — render nothing.
    if (this.state.reloading) return null;

    if (this.state.hasError) {
      // Minimal, animation-free fallback.  Uses only inline Tailwind so it
      // renders even if the design-token CSS failed to load.
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              This page failed to load. This usually fixes itself — try
              refreshing.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    // Normal render — pass children through unchanged.
    return this.props.children;
  }
}

export { ErrorBoundary };
