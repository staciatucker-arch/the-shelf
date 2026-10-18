import { useEffect, useId, useRef, useState } from 'react'

/**
 * A dropdown that holds several choices (Stacia, 2026-10-18: the filters as
 * dropdowns rather than walls of checkboxes).
 *
 * Closed, it is one button saying what is chosen — "Any", the one or two
 * values, or "3 chosen" — so six groups fit on a phone screen. Open, it is a
 * list of ordinary checkboxes, which phones and screen readers already know
 * how to work. Every tick applies at once, as the filters always have.
 *
 * `options` are strings or `{ value, label }`.
 */
export default function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [narrow, setNarrow] = useState('')
  const rootRef = useRef(null)
  const listId = useId()

  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  const labelOf = (value) => items.find((i) => i.value === value)?.label ?? value

  // Closes on a tap anywhere else, or Escape — the two ways out of any
  // dropdown. Escape is caught here first so it does not also close
  // something behind it.
  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) setNarrow('')
  }, [open])

  function toggle(value) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const summary =
    selected.length === 0
      ? 'Any'
      : selected.length <= 2
        ? selected.map(labelOf).join(', ')
        : `${selected.length} chosen`

  // A box to narrow the long lists (genres, shops); short ones do not need it.
  const showNarrow = items.length > 10
  const needle = narrow.trim().toLowerCase()
  const shownItems = needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items

  return (
    <div className="multi-select" ref={rootRef}>
      <span className="multi-label">{label}</span>
      <button
        type="button"
        className={'multi-button' + (selected.length ? ' has-choice' : '')}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="multi-summary">{summary}</span>
        <span aria-hidden="true" className="multi-chevron">▾</span>
      </button>

      {open && (
        <div className="multi-menu" id={listId} role="group" aria-label={label}>
          {showNarrow && (
            <input
              type="search"
              className="multi-narrow"
              placeholder="Type to narrow…"
              aria-label={`Narrow the ${label} list`}
              value={narrow}
              onChange={(e) => setNarrow(e.target.value)}
            />
          )}
          <div className="multi-options">
            {shownItems.map(({ value, label: text }) => (
              <label className="check-item" key={value}>
                <input
                  type="checkbox"
                  checked={selected.includes(value)}
                  onChange={() => toggle(value)}
                />
                {text}
              </label>
            ))}
            {shownItems.length === 0 && <p className="muted multi-none">Nothing matches.</p>}
          </div>
          {selected.length > 0 && (
            <button type="button" className="ghost multi-clear" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
