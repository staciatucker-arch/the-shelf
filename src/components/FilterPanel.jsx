import { BLANK_FIELDS, countActiveFilters } from '../lib/collection.js'

const GROUPS = [
  { key: 'formats', label: 'Format' },
  { key: 'types', label: 'Type' },
  { key: 'statuses', label: 'Status' },
  { key: 'genres', label: 'Genre' },
  { key: 'universes', label: 'Universe' },
  { key: 'vendors', label: 'Bought from' },
]

// Every checkbox applies immediately. The old app had a "Show Results" button
// because it re-rendered the whole sheet on each change; here the work is a
// filter over 248 rows already in memory, so waiting for a button would only
// add a step.
export default function FilterPanel({ open, values, filters, onChange, onClear, onClose }) {
  if (!open) return null

  function toggle(group, value) {
    const current = filters[group]
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onChange({ ...filters, [group]: next })
  }

  const activeCount = countActiveFilters(filters)

  return (
    <div className="filter-panel" role="region" aria-label="Filters">
      {GROUPS.map(({ key, label }) => {
        const options = values[key] ?? []
        if (!options.length) return null
        return (
          <div className="filter-section" key={key}>
            <div className="filter-section-label">{label}</div>
            <div className="check-grid">
              {options.map((value) => (
                <label className="check-item" key={value}>
                  <input
                    type="checkbox"
                    checked={filters[key].includes(value)}
                    onChange={() => toggle(key, value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </div>
        )
      })}

      <div className="filter-section">
        <div className="filter-section-label">Show blanks</div>
        <p className="filter-hint muted">
          Narrows the shelf to titles that are missing something — the
          cleanup list.
        </p>
        <div className="check-grid">
          {BLANK_FIELDS.map(({ value, label }) => (
            <label className="check-item" key={value}>
              <input
                type="checkbox"
                checked={filters.blanks.includes(value)}
                onChange={() => toggle('blanks', value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="btn-row">
        <button type="button" className="ghost" onClick={onClear} disabled={!activeCount}>
          Clear all
        </button>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
