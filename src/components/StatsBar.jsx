import { money, signedMoney } from '../lib/collection.js'

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

  return (
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
  )
}
