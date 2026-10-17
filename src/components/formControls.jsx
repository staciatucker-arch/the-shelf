import { useState } from 'react'
import { withCurrent } from '../lib/filmForm.js'

// Form controls shared by the film form and the wish form, so both ask the
// same questions the same way. Moved here unchanged from FilmForm.jsx.

/**
 * What this is — Movie, Series, Documentary or Box set — as visible buttons.
 *
 * It was a `<select>` until now, and that was the wrong control for this job.
 * This is not a preference among equals: it decides **which of TMDB's two
 * catalogues gets searched**, and films and television have separate id
 * namespaces where the same number means different things. A collapsed select
 * showing "— none —" makes the most consequential choice on the screen look
 * like one more optional field, which is exactly how a search for "Buffy"
 * returned the 1992 film to somebody holding the 1997 series.
 *
 * Four options fit on one or two lines at 360px, so there is no reason to hide
 * them. Pressing the chosen one again clears it, which keeps "unset" reachable
 * without a "— none —" button competing for space with the real answers.
 */
export function TypeChooser({ value, offered, onChange }) {
  const choices = withCurrent(offered, value ? [value] : [])
  return (
    <fieldset className="form-fieldset type-chooser">
      <legend>What is it?</legend>
      <div className="seg-row">
        {choices.map((choice) => {
          const on = value === choice
          return (
            <button
              key={choice}
              type="button"
              className={`seg-btn${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onChange(on ? '' : choice)}
            >
              {choice}
            </button>
          )
        })}
      </div>
      <p className="form-hint muted">
        Films and shows are listed separately, so this decides where we look.
      </p>
    </fieldset>
  )
}

export function FieldError({ message }) {
  if (!message) return null
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  )
}

/** How many matches are listed before the rest are left to the filter box. */
const MATCH_LIMIT = 14

/**
 * A long multi-value list, shown as what you chose rather than what you could.
 *
 * The genre list is forty-seven values. As a checkbox grid that is two columns
 * by twenty-four rows — roughly 900px on a 360px phone, about two and a half
 * screens of checkboxes sitting in the middle of the form, and far and away
 * the heaviest thing on it. Formats, at five, has no such problem and keeps
 * its checkboxes.
 *
 * A native `<select multiple>` would be worse rather than better: on a phone
 * it is a cramped scrolling list that never shows what is already chosen, and
 * on a desktop it needs ⌘-click to pick a second value and silently discards
 * the first when somebody does not know that. It also has nowhere to mark
 * which values arrived from TMDB.
 *
 * So: the chosen values sit at the top as chips you can remove, a filter box
 * finds the rest by typing, and the whole list is one press away for browsing.
 * What is on screen is proportional to what you picked, not to how long the
 * list has grown.
 */
export function TokenPicker({ id, label, selected, offered, onChange, highlight, note }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const choices = withCurrent(offered, selected)
  const lit = highlight ?? []

  const unpicked = choices.filter((c) => !selected.includes(c))
  const q = query.trim().toLowerCase()
  const hits = q === '' ? unpicked : unpicked.filter((c) => c.toLowerCase().includes(q))
  // With nothing typed the list stays shut unless somebody asks for it, which
  // is the point of the control; typing opens it on what was typed.
  const visible = q === '' && !showAll ? [] : hits.slice(0, MATCH_LIMIT)
  const hidden = (q === '' && !showAll ? 0 : hits.length) - visible.length

  function add(choice) {
    onChange([...selected, choice])
    setQuery('')
  }

  return (
    <fieldset className="form-fieldset token-field">
      <legend>
        {label}
        {selected.length > 0 && (
          <span className="token-count"> — {selected.length} chosen</span>
        )}
      </legend>

      {selected.length > 0 && (
        <div className="token-chips">
          {selected.map((choice) => (
            <button
              key={choice}
              type="button"
              className={`token-chip${lit.includes(choice) ? ' is-auto' : ''}`}
              onClick={() => onChange(selected.filter((v) => v !== choice))}
            >
              {choice}
              <span className="token-x" aria-hidden="true">×</span>
              <span className="sr-only"> — remove</span>
            </button>
          ))}
        </div>
      )}

      {choices.length === 0 ? (
        <p className="muted form-hint">No values on the list yet.</p>
      ) : (
        <>
          <label htmlFor={id} className="token-search">
            <span className="sr-only">Find a {label.toLowerCase()}</span>
            <input
              id={id}
              type="text"
              className="token-input"
              placeholder={`Type to find a ${label.toLowerCase().replace(/s$/, '')}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter inside a form submits it. Here it means "add the first
                // match", so the default has to be stopped either way — an add
                // form that saves itself because somebody pressed Enter while
                // typing "zom" would be a genuinely bad surprise.
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (hits.length > 0) add(hits[0])
              }}
            />
          </label>

          {visible.length > 0 && (
            <div className="token-matches">
              {visible.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="token-option"
                  onClick={() => add(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}

          {q !== '' && hits.length === 0 && (
            <p className="form-hint muted">
              Nothing on the list matches “{query.trim()}”. New values are added
              under Manage lists.
            </p>
          )}

          {hidden > 0 && (
            <p className="form-hint muted">
              …and {hidden} more. Keep typing to narrow it down.
            </p>
          )}

          {q === '' && unpicked.length > 0 && (
            <button
              type="button"
              className="ghost token-toggle"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? 'Hide the list' : `Show all ${unpicked.length}`}
            </button>
          )}
        </>
      )}

      {note && <p className="form-hint muted">{note}</p>}
    </fieldset>
  )
}
