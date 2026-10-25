import { useState } from 'react'
import { money, signedMoney } from '../lib/collection.js'

// Open or closed is remembered on each phone separately (Stacia, 2026-10-25):
// Ingrid, who cares about the figures, leaves it open; Stacia, choosing a
// film, leaves it shut. A display preference, so the browser keeps it —
// and a browser that refuses storage simply starts closed.
const OPEN_KEY = 'shelf.statsOpen'

function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function saveOpen(open) {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {
    // Nothing to do: it just won't be remembered.
  }
}

function Stat({ value, label, note, tone }) {
  return (
    <div className="stat">
      <div className={'stat-value' + (tone ? ' ' + tone : '')}>{value}</div>
      <div className="stat-label">{label}</div>
      {/* Each figure carries the number of films it covers. The three totals
          cover different sets, and without the denominators the bar invites
          exactly the comparison that produced a fake $572 loss. */}
      <div className="stat-note">{note}</div>
    </div>
  )
}

export default function StatsBar({ stats }) {
  const { titles, spent, costCount, market, marketCount, gain, comparableCount } = stats
  const [open, setOpen] = useState(readOpen)

  const toggle = () => {
    setOpen((was) => {
      saveOpen(!was)
      return !was
    })
  }

  // The folded line (Stacia's wording, 2026-10-25). A figure nobody has
  // recorded is left out rather than shown as $0.
  const summary = [`${titles} titles`]
  if (costCount > 0) summary.push(`${money(spent)} spent`)
  if (gain != null) summary.push(signedMoney(gain))

  return (
    <div className="stats">
      <button
        type="button"
        className="stats-summary"
        aria-expanded={open}
        onClick={toggle}
      >
        <span>{summary.join(' · ')}</span>
        <span className="stats-caret" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="stats-bar">
          <Stat value={titles} label="Titles" note="in the collection" />
          <Stat value={money(spent)} label="Spent" note={`${costCount} logged`} />
          <Stat value={money(market)} label="Market" note={`${marketCount} logged`} />
          <Stat
            value={gain == null ? '—' : signedMoney(gain)}
            label="Gain"
            note={comparableCount > 0 ? `on ${comparableCount} with both` : 'nothing to compare yet'}
            tone={gain == null ? 'unknown' : gain >= 0 ? 'positive' : 'negative'}
          />
        </div>
      )}
    </div>
  )
}
