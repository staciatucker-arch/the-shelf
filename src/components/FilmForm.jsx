import { useEffect, useMemo, useRef, useState } from 'react'
import { displayTitle } from '../lib/collection.js'
import { changedFields, filmToForm, validateForm, withCurrent } from '../lib/filmForm.js'

/** A single-value pick list that can still show a value the list has dropped. */
function PickList({ label, id, value, offered, onChange }) {
  const choices = withCurrent(offered, value ? [value] : [])
  return (
    <label htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— none —</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A multi-value pick list, matching the filter panel's checkbox idiom. */
function CheckList({ label, selected, offered, onChange }) {
  const choices = withCurrent(offered, selected)

  function toggle(choice) {
    onChange(
      selected.includes(choice)
        ? selected.filter((v) => v !== choice)
        : [...selected, choice],
    )
  }

  return (
    <fieldset className="form-fieldset">
      <legend>{label}</legend>
      {choices.length === 0 ? (
        <p className="muted form-hint">No values on the list yet.</p>
      ) : (
        <div className="check-grid">
          {choices.map((choice) => (
            <label className="check-item" key={choice}>
              <input
                type="checkbox"
                checked={selected.includes(choice)}
                onChange={() => toggle(choice)}
              />
              {choice}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}

function FieldError({ message }) {
  if (!message) return null
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  )
}

/**
 * Editing one film.
 *
 * Saves a patch of only what changed, waits for the database to confirm it,
 * and hands the confirmed row back — the caller never assumes a write worked.
 * Poster and TMDB fields are absent by design; see `lib/filmForm.js`.
 */
export default function FilmForm({ film, options, onCancel, onSaved }) {
  const [form, setForm] = useState(() => filmToForm(film))
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))

  useEffect(() => {
    function onKeyDown(e) {
      // Escape abandons the edit — but not mid-save, when the write is already
      // in flight and closing would leave nobody watching for its result.
      if (e.key === 'Escape' && !saving) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    titleRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onCancel, saving])

  const patch = useMemo(() => changedFields(film, form), [film, form])
  const dirty = patch !== null

  async function onSubmit(e) {
    e.preventDefault()
    setSaveError(null)

    const found = validateForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    // Nothing changed: closing is the honest outcome, and writing a row to say
    // so would only bump updated_at and invite a pointless conflict.
    if (!patch) {
      onCancel()
      return
    }

    setSaving(true)
    const result = await onSaved(patch)
    setSaving(false)
    // The panel stays open on failure, holding the edit, so a rejected save
    // never looks like a successful one and nobody loses their typing.
    if (result?.error) setSaveError(result.error)
  }

  return (
    <div className="detail-overlay" role="presentation" onClick={() => !saving && onCancel()}>
      <div
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${displayTitle(film.title)}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-head">
          <h2 className="detail-title">Edit “{displayTitle(film.title)}”</h2>
          <button
            type="button"
            className="detail-close"
            onClick={onCancel}
            disabled={saving}
          >
            <span aria-hidden="true">×</span>
            <span className="sr-only">Cancel</span>
          </button>
        </div>

        <form className="form-body" onSubmit={onSubmit}>
          {saveError && (
            <p className="error" role="alert">
              Could not save: {saveError}
            </p>
          )}

          <label htmlFor="film-title">
            Title
            {/* A textarea, not a text input: four box sets carry their whole
                contents list in this column across several lines, and an
                <input> silently collapses newlines. Editing the vendor would
                have destroyed the list. */}
            <textarea
              id="film-title"
              ref={titleRef}
              rows={2}
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
              aria-invalid={Boolean(errors.title)}
            />
          </label>
          <FieldError message={errors.title} />

          <label htmlFor="film-year">
            Year or season
            <textarea
              id="film-year"
              rows={1}
              value={form.year_season}
              onChange={(e) => set('year_season')(e.target.value)}
            />
          </label>
          <p className="form-hint muted">
            Free text — “1979”, “Season 2”, or a box set’s list of years.
          </p>

          <div className="form-pair">
            <div>
              <label htmlFor="film-cost">
                Spent
                <input
                  id="film-cost"
                  type="text"
                  inputMode="decimal"
                  placeholder="unknown"
                  value={form.cost}
                  onChange={(e) => set('cost')(e.target.value)}
                  aria-invalid={Boolean(errors.cost)}
                />
              </label>
              <FieldError message={errors.cost} />
            </div>
            <div>
              <label htmlFor="film-market">
                Market value
                <input
                  id="film-market"
                  type="text"
                  inputMode="decimal"
                  placeholder="unknown"
                  value={form.market_value}
                  onChange={(e) => set('market_value')(e.target.value)}
                  aria-invalid={Boolean(errors.market_value)}
                />
              </label>
              <FieldError message={errors.market_value} />
            </div>
          </div>
          <p className="form-hint muted">
            Leave either blank if you don’t know it. Blank means unknown, not
            zero — the totals count them separately.
          </p>

          <div className="form-pair">
            <div>
              <label htmlFor="film-acquired">
                Acquired
                <input
                  id="film-acquired"
                  type="date"
                  value={form.acquired_on}
                  onChange={(e) => set('acquired_on')(e.target.value)}
                  aria-invalid={Boolean(errors.acquired_on)}
                />
              </label>
              <FieldError message={errors.acquired_on} />
            </div>
            <div>
              <label htmlFor="film-watched">
                Last watched
                <input
                  id="film-watched"
                  type="date"
                  value={form.last_watched_on}
                  onChange={(e) => set('last_watched_on')(e.target.value)}
                  aria-invalid={Boolean(errors.last_watched_on)}
                />
              </label>
              <FieldError message={errors.last_watched_on} />
            </div>
          </div>

          <PickList
            label="Status"
            id="film-status"
            value={form.status}
            offered={options.status}
            onChange={set('status')}
          />
          <PickList
            label="Type"
            id="film-type"
            value={form.type}
            offered={options.type}
            onChange={set('type')}
          />
          <PickList
            label="Bought from"
            id="film-vendor"
            value={form.vendor}
            offered={options.vendor}
            onChange={set('vendor')}
          />
          <PickList
            label="Universe"
            id="film-universe"
            value={form.universe}
            offered={options.universe}
            onChange={set('universe')}
          />

          <CheckList
            label="Formats"
            selected={form.formats}
            offered={options.format}
            onChange={set('formats')}
          />
          <CheckList
            label="Genres"
            selected={form.genres}
            offered={options.genre}
            onChange={set('genres')}
          />

          {/* Said plainly rather than shown as disabled boxes, so neither of
              these looks like something this form forgot to save. */}
          <p className="form-note muted">
            The poster and the TMDB match aren’t edited here — a poster is
            chosen in the poster window, and a TMDB match is set only by
            confirming a candidate.
          </p>

          <div className="btn-row">
            <button type="button" className="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !dirty}>
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
