import { useEffect, useMemo, useRef, useState } from 'react'
import { displayTitle } from '../lib/collection.js'
import {
  applyMatch,
  blankForm,
  changedFields,
  filmToForm,
  newFilmRow,
  validateForm,
  withCurrent,
} from '../lib/filmForm.js'
import TmdbMatch from './TmdbMatch.jsx'

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
 * One film's details — a new one, or one that already exists.
 *
 * Both halves share this form because they are the same twelve columns and the
 * same rules; what differs is what leaves at the end. Editing sends a patch of
 * only what changed and waits for the database to confirm it. Adding sends one
 * complete row, id and all, so a film is never briefly half-written.
 *
 * Poster columns are absent from both; see `lib/filmForm.js`. The TMDB match
 * appears only when adding, because it is the one moment a human is already
 * deciding what this film is.
 */
export default function FilmForm({ film, options, onCancel, onSaved, onDelete }) {
  const adding = !film

  const [form, setForm] = useState(() => (film ? filmToForm(film) : blankForm()))
  const [match, setMatch] = useState(null)
  // The season picked from TMDB's list, kept apart from the label in the form
  // so its NUMBER can be stored. A number here is known; a season typed by
  // hand is not, and trigger warnings must tell those two cases apart.
  const [season, setSeason] = useState(null)
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const titleRef = useRef(null)

  // Minted once, here, and kept for the life of this form. The poster upload
  // (§6b step 7) will want the same id before the row exists, so that a cover
  // can be stored against the film it belongs to and arrive on the very first
  // insert rather than in a second write.
  const draftId = useMemo(() => (adding ? crypto.randomUUID() : null), [adding])

  // Anything in flight freezes the exits: closing a panel whose write is
  // still unanswered leaves nobody to hear whether it worked.
  const busy = saving || deleting

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))

  useEffect(() => {
    function onKeyDown(e) {
      // Escape abandons the form — but not mid-save, when the write is already
      // in flight and closing would leave nobody watching for its result.
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    titleRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onCancel, busy])

  const patch = useMemo(
    () => (film ? changedFields(film, form) : null),
    [film, form],
  )
  const dirty = adding || patch !== null

  async function onSubmit(e) {
    e.preventDefault()
    setSaveError(null)

    const found = validateForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    // Editing, with nothing changed: closing is the honest outcome, and
    // writing a row to say so would only bump updated_at and invite a
    // pointless conflict.
    if (!adding && !patch) {
      onCancel()
      return
    }

    setSaving(true)
    const result = await onSaved(
      adding ? newFilmRow(form, { id: draftId, match, season }) : patch,
    )
    setSaving(false)
    // The panel stays open on failure, holding the entry, so a rejected save
    // never looks like a successful one and nobody loses their typing.
    if (result?.error) setSaveError(result.error)
  }

  const heading = adding ? 'Add a film' : `Edit “${displayTitle(film.title)}”`

  return (
    <div className="detail-overlay" role="presentation" onClick={() => !busy && onCancel()}>
      <div
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
      >
        <form className="form-shell" onSubmit={onSubmit}>
          {/* The form wraps the header rather than starting below it, so Save
              can be an ordinary submit button while sitting up here. The
              fields scroll under it; the buttons never scroll away. There is
              no separate × — Cancel is the same action, said in a word. */}
          <div className="detail-head form-head">
            <h2 className="detail-title">{heading}</h2>
            <div className="detail-head-actions">
              <button
                type="button"
                className="ghost form-action"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="submit" className="form-action" disabled={busy || !dirty}>
                {saving
                  ? 'Saving…'
                  : adding
                    ? 'Add to the shelf'
                    : dirty
                      ? 'Save changes'
                      : 'No changes'}
              </button>
            </div>
          </div>

          <div className="form-body">
            {saveError && (
              <p className="error" role="alert">
                Could not save: {saveError}
              </p>
            )}

            {/* Identity first: what is this, and which season. Everything
                below it is detail that can wait, which the note after this
                group says out loud so nobody feels obliged to fill it in now. */}
            {adding && (
              <>
                <h3 className="form-section-title">What are you adding to your Shelf?</h3>
                <p className="form-hint muted">Start typing.</p>
              </>
            )}

            <label htmlFor="film-title">
              Title
              {/* A textarea, not a text input: four box sets carry their
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

            {/* Year and season are separate fields as of 2026-09-12. One box
                doing both jobs misled a person in use: "Season 1" typed into a
                field that TMDB search reads as a year. Only the year is ever
                sent to TMDB; the season never is. */}
            <div className="form-pair">
              <div>
                <label htmlFor="film-year">
                  Year
                  <input
                    id="film-year"
                    type="text"
                    inputMode="numeric"
                    placeholder="unknown"
                    value={form.release_year}
                    onChange={(e) => set('release_year')(e.target.value)}
                    aria-invalid={Boolean(errors.release_year)}
                  />
                </label>
                <FieldError message={errors.release_year} />
              </div>
              <div>
                <label htmlFor="film-season">
                  Season
                  {/* A textarea, because four box sets keep their contents
                      list in this column across several lines, and an <input>
                      silently collapses newlines. */}
                  <textarea
                    id="film-season"
                    rows={2}
                    placeholder="optional"
                    value={form.season}
                    onChange={(e) => set('season')(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <p className="form-hint muted">
              Both optional. A season shows on the card instead of the year —
              “Season 2” rather than the year the show began.
            </p>

            {adding && (
              <TmdbMatch
                title={form.title}
                year={form.release_year}
                type={form.type}
                match={match}
                season={season}
                onConfirm={(candidate) => {
                  setMatch(candidate)
                  setSeason(null)
                  // Writes the accurate title, and offers the year. Never the
                  // poster, and never a year somebody already typed.
                  setForm((f) => applyMatch(f, candidate))
                }}
                onSeason={(picked) => {
                  setSeason(picked)
                  setForm((f) => applyMatch(f, match, { season: picked }))
                }}
                onClear={() => {
                  setMatch(null)
                  setSeason(null)
                }}
              />
            )}

            {adding && (
              <p className="form-note muted">
                You can come back and edit everything below at any time.
              </p>
            )}

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

            {!adding && onDelete && (
              <div className="form-danger">
                {deleteError && (
                  <p className="error" role="alert">
                    Could not delete: {deleteError}
                  </p>
                )}

                {confirmingDelete ? (
                  <>
                    {/* The title is spelled out rather than called "this film".
                        A confirmation that does not name what it is about is
                        not a confirmation; it is a second button. */}
                    <p className="form-danger-ask">
                      Permanently remove <strong>“{displayTitle(film.title)}”</strong>{' '}
                      from the shelf? This cannot be undone.
                    </p>
                    <div className="form-danger-actions">
                      <button
                        type="button"
                        className="ghost form-action"
                        onClick={() => setConfirmingDelete(false)}
                        disabled={deleting}
                      >
                        Keep it
                      </button>
                      <button
                        type="button"
                        className="danger form-action"
                        disabled={deleting}
                        onClick={async () => {
                          setDeleteError(null)
                          setDeleting(true)
                          const result = await onDelete()
                          setDeleting(false)
                          // Same rule as saving: the panel stays put unless
                          // the database confirmed the row is gone.
                          if (result?.error) setDeleteError(result.error)
                        }}
                      >
                        {deleting ? 'Removing…' : 'Remove for good'}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ghost form-danger-open"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={busy}
                  >
                    Remove this film from the shelf
                  </button>
                )}
              </div>
            )}

            {/* Said plainly rather than shown as disabled boxes, so neither of
                these looks like something this form forgot to save. */}
            <p className="form-note muted">
              {adding
                ? 'The cover is added separately, in the poster window — so a new film starts without one.'
                : 'The poster and the TMDB match aren’t edited here — a poster is chosen in the poster window, and a TMDB match is set only by confirming a candidate.'}
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
