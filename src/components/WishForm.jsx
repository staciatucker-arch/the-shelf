import { useEffect, useMemo, useRef, useState } from 'react'
import { applyMatch, describeFill } from '../lib/filmForm.js'
import { newId } from '../lib/ids.js'
import { lockScroll } from '../lib/scrollLock.js'
import { mapTmdbGenres } from '../lib/tmdbGenres.js'
import {
  blankWish,
  newWishRow,
  validateWish,
  wishPatch,
  wishToForm,
} from '../lib/wishlist.js'
import { FieldError, TokenPicker, TypeChooser } from './formControls.jsx'
import TmdbMatch from './TmdbMatch.jsx'
import { useBackToClose } from './useBackToClose.js'

/* Same rule as the film form's: a failure part-way must not claim the save
   worked, or that it did not. ⚠ Placeholder wording — Stacia's to choose. */
const SAVE_INTERRUPTED =
  'Something went wrong. Close this form and see if your wishlist changed.'

/**
 * One wish — a new one, or one that already exists.
 *
 * Designed with Stacia, 2026-10-11: the same "is this the one?" TMDB step as
 * adding a film, with a way through for titles TMDB lacks; then genres, an
 * optional note and an optional buy link. No price (she listed only note and
 * link), no cover, no season — a wish is for a film, not for a disc in hand.
 *
 * Editing sends only what changed, adding sends one complete row, and both
 * close only on a confirmed write, exactly as the film form does.
 */
export default function WishForm({ wish, initialTitle = '', options, onCancel, onSaved, onDelete }) {
  const adding = !wish
  const [form, setForm] = useState(() => (wish ? wishToForm(wish) : blankWish({ title: initialTitle })))
  const [match, setMatch] = useState(null)
  const [matchTouched, setMatchTouched] = useState(false)
  const [filled, setFilled] = useState([])
  const [autoGenres, setAutoGenres] = useState([])
  const [unmappedGenres, setUnmappedGenres] = useState([])
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const titleRef = useRef(null)
  const draftId = useMemo(() => (adding ? newId() : null), [adding])
  const busy = saving || deleting

  useBackToClose(onCancel, { id: 'wish-form', enabled: !busy })

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    const releaseScroll = lockScroll()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      releaseScroll()
    }
  }, [onCancel, busy])

  // Focus the title once, on opening — not on every re-render.
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const patch = useMemo(
    () => (wish ? wishPatch(wish, form, { match, matchTouched }) : null),
    [wish, form, match, matchTouched],
  )
  const dirty = adding || patch !== null

  async function onSubmit(e) {
    e.preventDefault()
    setSaveError(null)
    const found = validateWish(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (!adding && !patch) {
      onCancel()
      return
    }
    setSaving(true)
    try {
      const result = await onSaved(
        adding ? newWishRow(form, { id: draftId, match }) : patch,
      )
      if (result?.error) setSaveError(result.error)
    } catch (thrown) {
      console.error('The wish form failed while saving:', thrown)
      setSaveError(`${SAVE_INTERRUPTED} (${thrown?.message ?? String(thrown)})`)
    } finally {
      setSaving(false)
    }
  }

  function confirmMatch(candidate) {
    const next = applyMatch(form, candidate, { genreOptions: options.genre })
    setMatch(candidate)
    setMatchTouched(true)
    setFilled(describeFill(form, next))
    setAutoGenres((next.genres ?? []).filter((g) => !(form.genres ?? []).includes(g)))
    setUnmappedGenres(mapTmdbGenres(candidate.genres, options.genre).unmatched)
    setForm(next)
  }

  // ⚠ Placeholder wording throughout — Stacia's to choose.
  const heading = adding ? 'Add to your wishlist' : `Edit wish`

  const yearField = (
    <div className="year-field">
      <label htmlFor="wish-year">
        Year <span className="label-aside">— optional, narrows the search</span>
        <input
          id="wish-year"
          type="text"
          inputMode="numeric"
          value={form.release_year}
          onChange={(e) => set('release_year')(e.target.value)}
          aria-invalid={Boolean(errors.release_year)}
        />
      </label>
      <FieldError message={errors.release_year} />
    </div>
  )

  const matchBlock = (
    <TmdbMatch
      title={form.title}
      year={form.release_year}
      type={form.type}
      match={match}
      season={null}
      askSeason={false}
      existingId={!adding && !matchTouched ? wish.tmdb_id : null}
      existingVerified={!adding ? wish.tmdb_verified : false}
      editing={!adding}
      yearField={adding ? yearField : null}
      filled={filled}
      onConfirm={confirmMatch}
      onSeason={() => {}}
      onClear={() => {
        setMatch(null)
        setMatchTouched(true)
        setFilled([])
        setAutoGenres([])
        setUnmappedGenres([])
      }}
    />
  )

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
          <div className="detail-head form-head">
            <h2 className="detail-title">{heading}</h2>
            <div className="detail-head-actions">
              <button type="button" className="ghost form-action" onClick={onCancel} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="form-action" disabled={busy || !dirty}>
                {saving ? 'Saving…' : adding ? 'Add to wishlist' : dirty ? 'Save changes' : 'No changes'}
              </button>
            </div>
          </div>

          <div className="form-body">
            {saveError && (
              <p className="error" role="alert">
                Could not save: {saveError}
              </p>
            )}

            <div className={adding ? 'find-card' : undefined}>
              <label htmlFor="wish-title">
                Title
                <input
                  id="wish-title"
                  ref={titleRef}
                  type="text"
                  value={form.title}
                  onChange={(e) => set('title')(e.target.value)}
                  aria-invalid={Boolean(errors.title)}
                />
              </label>
              <FieldError message={errors.title} />
              <TypeChooser value={form.type} offered={options.type} onChange={set('type')} />
              {!adding && yearField}
              {matchBlock}
            </div>

            <div className="form-divider">
              <strong>That’s the part that matters.</strong>
              Everything below is optional.
            </div>

            <TokenPicker
              id="wish-genres"
              label="Genres"
              selected={form.genres}
              offered={options.genre}
              onChange={set('genres')}
              highlight={autoGenres}
              note={autoGenres.length > 0 ? 'The marked ones came from TMDB. Tap any to remove it.' : null}
            />
            {unmappedGenres.length > 0 && (
              <p className="form-hint muted">
                TMDB also called this {unmappedGenres.join(', ')}, not on your list.
              </p>
            )}

            <label htmlFor="wish-note">
              Note
              <textarea
                id="wish-note"
                rows={2}
                placeholder="optional — “want the 4K”, who recommended it"
                value={form.note}
                onChange={(e) => set('note')(e.target.value)}
              />
            </label>

            <label htmlFor="wish-link">
              Where to buy it
              <input
                id="wish-link"
                // Text, not type="url": the browser's own check refuses an
                // address pasted without https:// and blocks the save in
                // silence. safeLink() decides instead, and says why.
                type="text"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="optional — paste a link"
                value={form.buy_url}
                onChange={(e) => set('buy_url')(e.target.value)}
                aria-invalid={Boolean(errors.buy_url)}
              />
            </label>
            <FieldError message={errors.buy_url} />

            {!adding && onDelete && (
              <div className="form-danger">
                {deleteError && (
                  <p className="error" role="alert">
                    Could not remove: {deleteError}
                  </p>
                )}
                {confirmingDelete ? (
                  <>
                    <p className="form-danger-ask">
                      Remove <strong>“{wish.title}”</strong> from your wishlist?
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
                          if (result?.error) setDeleteError(result.error)
                        }}
                      >
                        {deleting ? 'Removing…' : 'Remove'}
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
                    Remove from wishlist
                  </button>
                )}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
