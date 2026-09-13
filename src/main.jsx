import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles.css'

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
