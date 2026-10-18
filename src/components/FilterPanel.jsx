import { BLANK_FIELDS, countActiveFilters } from '../lib/collection.js'
import MultiSelect from './MultiSelect.jsx'

const GROUPS = [
  { key: 'formats', label: 'Format' },
  { key: 'types', label: 'Type' },
  { key: 'statuses', label: 'Status' },
  { key: 'genres', label: 'Genre' },
  { key: 'universes', label: 'Universe' },
  { key: 'vendors', label: 'Bought from' },
]

// Every choice applies immediately. The old app had a "Show Results" button
// because it re-rendered the whole sheet on each change; here the work is a
// filter over 248 rows already in memory, so waiting for a button would only
// add a step.
//
// Each group is a dropdown (Stacia, 2026-10-18). As checkboxes the groups ran
// to 107 boxes and three screens of scrolling on a phone; as dropdowns all
// seven fit on one.
export default function FilterPanel({ open, values, filters, onChange, onClear, onClose, onManageCategories }) {
  if (!open) return null

  const set = (group) => (next) => onChange({ ...filters, [group]: next })
  const activeCount = countActiveFilters(filters)

  return (
    <div className="filter-panel" role="region" aria-label="Filters">
      <div className="filter-grid">
        {GROUPS.map(({ key, label }) => {
          const options = values[key] ?? []
          if (!options.length) return null
          return (
            <MultiSelect
              key={key}
              label={label}
              options={options}
              selected={filters[key]}
              onChange={set(key)}
            />
          )
        })}
        {/* The data-cleanup list: titles missing something. */}
        <MultiSelect
          label="Show blanks"
          options={BLANK_FIELDS}
          selected={filters.blanks}
          onChange={set('blanks')}
        />
      </div>

      <div className="btn-row filter-buttons">
        {/* Stacia's name for what was "Pick lists", moved here from the
            header on 2026-10-18: the header no longer fit on a phone. */}
        <button type="button" className="ghost filter-categories" onClick={onManageCategories}>
          Categories
        </button>
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
