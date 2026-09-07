import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { store } from './store/store'
import { reloadForStaleChunk } from './lib/chunkReload'
import './index.css'
import App from './App.jsx'

// Catch Vite modulepreload failures that fire *before* a component renders
// (i.e. before the ErrorBoundary has a chance to intercept them).  Uses the
// same shared reloadForStaleChunk cooldown guard so the two paths cannot race
// and double-reload for the same failure event.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault(); // suppress the default console error / uncaught throw
  reloadForStaleChunk();
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        {/* reducedMotion="user" makes every framer animation respect the OS
            "Reduce Motion" setting app-wide. */}
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
