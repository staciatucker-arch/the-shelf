import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles.css'
import { retireOldCaches } from './lib/cacheRules.js'

// Delete the old 'posters' store, which holds copies of the collection and
// sign-in responses from before 2026-09-19 (review A1). Renaming the store in
// the service worker does not remove the old one; this does. Fire and forget:
// it never blocks the app from opening.
retireOldCaches()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* The last resort. If something throws outside any panel, this is all
        that stands between a person and a blank screen. */}
    <ErrorBoundary
      title="The Shelf couldn’t start."
      detail="Nothing has been lost — this is the app failing to draw itself, not your collection. Reloading usually fixes it. If it keeps happening, the message below is the useful part to pass on."
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
