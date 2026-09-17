import { useEffect, useMemo, useRef, useState } from 'react'
import { displayTitle } from '../lib/collection.js'
import {
  applyMatch,
  blankForm,
  changedFields,
  describeFill,
  filmToForm,
  matchPatch,
  newFilmRow,
  validateForm,
  withCurrent,
} from '../lib/filmForm.js'
import { newId } from '../lib/ids.js'
import { clearedPosterColumns, ownedObjectPath } from '../lib/poster.js'
import { removePoster, uploadPoster } from '../lib/posterStorage.js'
import { mapTmdbGenres } from '../lib/tmdbGenres.js'
import PosterPicker from './PosterPicker.jsx'
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
function TypeChooser({ value, offered, onChange }) {
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

function FieldError({ message }) {
  if (!message) return null
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  )
}

/** A multi-value pick list, matching the filter panel's checkbox idiom. */
function CheckList({ label, selected, offered, onChange, note }) {
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
      {note && <p className="form-hint muted">{note}</p>}
    </fieldset>
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
function TokenPicker({ id, label, selected, offered, onChange, highlight, note }) {
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

/**
 * One film's details — a new one, or one that already exists.
 *
 * Both halves share this form because they are the same twelve columns and the
 * same rules; what differs is what leaves at the end. Editing sends a patch of
 * only what changed and waits for the database to confirm it. Adding sends one
 * complete row, id and all, so a film is never briefly half-written.
 *
 * The poster travels with that same single write, and only when somebody
 * actually chose one — see `PosterPicker` and the ordering note on
 * `onSubmit`. The form's own field list still cannot touch a poster column;
 * see `lib/filmForm.js`.
 *
 * **The shape of the add screen**, rewritten for somebody who has never opened
 * the app: one bordered card at the top holding the three things the search
 * actually uses — the title, what it is, and an optional year — with the
 * button right there beside them. Then a divider saying the rest is optional,
 * because only the title is required and fifteen controls in a flat scroll
 * make them all look equally expected. Before this, the button that does the
 * useful work was the sixth control down, below fields the search exists to
 * fill in.
 */
export default function FilmForm({ film, options, onCancel, onSaved, onDelete }) {
  const adding = !film

  const [form, setForm] = useState(() => (film ? filmToForm(film) : blankForm()))
  const [match, setMatch] = useState(null)
  // The season picked from TMDB's list, kept apart from the label in the form
  // so its NUMBER can be stored. A number here is known; a season typed by
  // hand is not, and trigger warnings must tell those two cases apart.
  const [season, setSeason] = useState(null)
  // Whether the match was deliberately changed in this editing session. Null
  // means untouched — and an untouched match must not appear in the patch at
  // all, or every ordinary save would rewrite the film's identity.
  const [matchTouched, setMatchTouched] = useState(false)
  // The cover chosen in this session, and nothing else. Three possible
  // values, and the difference between the last two matters:
  //   null                     the poster was not touched — it must not
  //                            appear in the write at all, or every ordinary
  //                            save would rewrite the film's artwork
  //   { blob, width, height }  a new picture, prepared but not yet uploaded
  //   { cleared: true }        "remove the cover", which is a real instruction
  //                            and not the same as having chosen nothing
  const [poster, setPoster] = useState(null)
  // What the last confirmed match filled in, as phrases, and which genres it
  // ticked. Both exist so the form can say what it did rather than do it
  // silently in fields nobody is looking at.
  const [filled, setFilled] = useState([])
  const [autoGenres, setAutoGenres] = useState([])
  const [unmappedGenres, setUnmappedGenres] = useState([])

  // Only a series has seasons. Anything else — Movie, Documentary, Box set —
  // does not, so the field is not offered.
  const isSeries = String(form.type ?? '').toLowerCase() === 'series'
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
  // `newId`, not `crypto.randomUUID` — the latter is undefined on a plain-http
  // address, which is what `npm run dev --host` prints for testing on a phone,
  // and calling it here threw during render and blanked the screen. See
  // lib/ids.js.
  const draftId = useMemo(() => (adding ? newId() : null), [adding])

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
  const dirty = adding || patch !== null || matchTouched || poster !== null

  /**
   * Save everything about this film in one write, poster included.
   *
   * The ordering is the whole of §6b step 7 and it is deliberate in both
   * directions:
   *
   *   1. Upload the new image first, under a name nothing points at yet. If
   *      this fails, nothing has been written and the form still holds
   *      everything that was typed.
   *   2. Write the row — once — with the poster columns already on it. For a
   *      new film that is a single insert, so a film is never briefly on the
   *      shelf without the cover chosen for it.
   *   3. If that write failed, delete the file just uploaded. An orphaned
   *      image in a 1 GB bucket is harmless; a row pointing at a file that is
   *      not there, or a film half-created, is not.
   *   4. Only once the database has confirmed the write, delete the file the
   *      row no longer names. Deleting it any earlier would mean a failed
   *      write leaves the film showing a cover that has already gone.
   */
  async function onSubmit(e) {
    e.preventDefault()
    setSaveError(null)

    const found = validateForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    // Editing, with nothing changed: closing is the honest outcome, and
    // writing a row to say so would only bump updated_at and invite a
    // pointless conflict.
    if (!adding && !patch && !matchTouched && !poster) {
      onCancel()
      return
    }

    setSaving(true)

    // Step 1 — the upload, if there is one.
    let uploaded = null
    if (poster?.blob) {
      const result = await uploadPoster(adding ? draftId : film.id, poster.blob)
      if (result.error) {
        setSaving(false)
        setSaveError(`The cover could not be uploaded, so nothing was saved: ${result.error}`)
        return
      }
      uploaded = result
    }

    // What the poster contributes to the write: the three new columns, three
    // nulls, or — when the cover was not touched — nothing at all.
    const posterWrite = uploaded
      ? uploaded.columns
      : poster?.cleared
        ? clearedPosterColumns()
        : null

    // Step 2 — one write, whatever it carries.
    const result = await onSaved(
      adding
        ? newFilmRow(form, {
            id: draftId,
            match,
            season,
            poster: uploaded ? { publicUrl: uploaded.publicUrl, path: uploaded.path } : null,
          })
        : {
            ...(patch ?? {}),
            ...(matchTouched ? matchPatch(match, { season }) : {}),
            ...(posterWrite ?? {}),
          },
    )

    // Step 3 — the row did not land, so the image it would have named must go.
    if (result?.error) {
      if (uploaded) await removePoster(uploaded.path)
      setSaving(false)
      // The panel stays open on failure, holding the entry, so a rejected save
      // never looks like a successful one and nobody loses their typing.
      setSaveError(result.error)
      return
    }

    // Step 4 — the row is written and confirmed. Now, and only now, the file
    // it used to point at can go. `ownedObjectPath` is what keeps this from
    // reaching for a GitHub or TMDB poster, which are not ours to delete.
    if (posterWrite) {
      const previous = ownedObjectPath(film)
      if (previous && previous !== uploaded?.path) await removePoster(previous)
    }

    setSaving(false)
  }

  const heading = adding ? 'Add to the Shelf' : `Edit “${displayTitle(film.title)}”`

  // Confirming a match rewrites several fields at once. Computing the before
  // and after here — rather than inside a state updater, which React may run
  // twice — is what lets the panel name what changed.
  function confirmMatch(candidate) {
    const next = applyMatch(form, candidate, { genreOptions: options.genre })
    setMatch(candidate)
    setSeason(null)
    setMatchTouched(true)
    setFilled(describeFill(form, next))
    setAutoGenres((next.genres ?? []).filter((g) => !(form.genres ?? []).includes(g)))
    // What TMDB called this film that the shelf has no word for. Reported
    // rather than dropped in silence: it is the moment somebody would actually
    // want to know their list is missing something, and adding the word under
    // Manage lists is all it takes to make it map from then on.
    setUnmappedGenres(mapTmdbGenres(candidate.genres, options.genre).unmatched)
    setForm(next)
  }

  const titleField = (
    <>
      <label htmlFor="film-title">
        Title
        {/* A textarea, not a text input: four box sets carry their contents
            list in this column across several lines, and an <input> silently
            collapses newlines. Editing the vendor would have destroyed the
            list. */}
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
    </>
  )

  const typeField = (
    <TypeChooser value={form.type} offered={options.type} onChange={set('type')} />
  )

  const yearField = (
    <div className="year-field">
      <label htmlFor="film-year">
        Year <span className="label-aside">— optional, narrows the search</span>
        <input
          id="film-year"
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
      season={season}
      existingId={!adding && !matchTouched ? film.tmdb_id : null}
      existingVerified={!adding ? film.tmdb_verified : false}
      // Only while adding: when editing, the year belongs with the other
      // details rather than tucked under a button that may not be shown.
      yearField={adding ? yearField : null}
      filled={filled}
      onConfirm={confirmMatch}
      onSeason={(picked) => {
        setSeason(picked)
        setMatchTouched(true)
        setForm((f) => applyMatch(f, match, { season: picked, genreOptions: options.genre }))
      }}
      onClear={() => {
        setMatch(null)
        setSeason(null)
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

            {adding ? (
              /* One card holding everything the search uses, with the button
                 inside it. The old layout put its instructions at the top and
                 the button five fields below them, so on a phone the last step
                 of a three-step instruction was off the screen. */
              <div className="find-card">
                <h3 className="form-section-title">
                  Start with the title — we’ll fill in the rest
                </h3>
                <p className="find-lede">
                  Type a few words. You don’t need the whole title, and you don’t
                  need the year — picking your film from the list fills those in.
                </p>
                {titleField}
                {typeField}
                {matchBlock}
              </div>
            ) : (
              <>
                {titleField}
                {typeField}
                {yearField}
                {matchBlock}
              </>
            )}

            {/* Only the title is required. Saying so outright is what stops
                the fourteen controls below reading as fourteen more questions
                that have to be answered before anything can be saved. */}
            <div className="form-divider">
              <strong>That’s the part that matters.</strong>
              Everything below is optional — add it now, or any time later.
            </div>

            {/* The cover comes first among the optional things because it is
                the one somebody can see from across the room, and because on
                a phone it is done standing at the shelf with the case in
                hand. Nothing is uploaded until Save. */}
            <p className="group-label">Cover</p>

            <PosterPicker
              film={film}
              chosen={poster}
              onChoose={setPoster}
              // Backing out — of a new pick, or of a removal not yet saved.
              // Either way the poster becomes untouched again, which is what
              // keeps it out of the write entirely.
              onRevert={() => setPoster(null)}
              // Removing the cover the film actually has. A real instruction,
              // and it has to survive to the write as three explicit nulls.
              onRemove={() => setPoster({ cleared: true })}
              disabled={busy}
            />

            <p className="group-label">Your copy</p>

            <CheckList
              label="Formats"
              selected={form.formats}
              offered={options.format}
              onChange={set('formats')}
            />

            <label htmlFor="film-edition">
              Edition or contents
              {/* A textarea: four box sets list what is in them here, across
                  several lines, and an <input> silently collapses newlines. */}
              <textarea
                id="film-edition"
                rows={2}
                placeholder="optional — “Volume 1”, or what a box set contains"
                value={form.edition}
                onChange={(e) => set('edition')(e.target.value)}
              />
            </label>

            {/* Shown only for a series, because only a series has one. It is
                normally written by the TMDB picker above — a box set is not a
                season, and conflating the two is what sent "Volume 1" into
                this column in the first place. It stays typeable: when TMDB
                has no season list, or the lookup fails, the picker says to
                type it here, and a read-only box would make that a lie. */}
            {isSeries && (
              <label htmlFor="film-season">
                Season
                <input
                  id="film-season"
                  type="text"
                  placeholder={adding ? 'picked above, or type it' : 'optional'}
                  value={form.season}
                  onChange={(e) => set('season')(e.target.value)}
                />
              </label>
            )}

            <PickList
              label="Status"
              id="film-status"
              value={form.status}
              offered={options.status}
              onChange={set('status')}
            />
            <PickList
              label="Bought from"
              id="film-vendor"
              value={form.vendor}
              offered={options.vendor}
              onChange={set('vendor')}
            />

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

            <p className="group-label">Tags</p>

            <PickList
              label="Universe"
              id="film-universe"
              value={form.universe}
              offered={options.universe}
              onChange={set('universe')}
            />

            <TokenPicker
              id="film-genres"
              label="Genres"
              selected={form.genres}
              offered={options.genre}
              onChange={set('genres')}
              highlight={autoGenres}
              note={
                autoGenres.length > 0
                  ? 'The marked ones came from TMDB. Tap any to remove it.'
                  : null
              }
            />

            {/* A gap in the list, said where somebody would care about it.
                Silently dropping these is what made the old mapping drift:
                the genre list lives in the database and the translation lived
                in code, so a missing word stayed missing for ever. */}
            {unmappedGenres.length > 0 && (
              <p className="form-hint muted">
                TMDB also called this{' '}
                {unmappedGenres.map((name, i) => (
                  <span key={name}>
                    {i > 0 && (i === unmappedGenres.length - 1 ? ' and ' : ', ')}
                    <strong>{name}</strong>
                  </span>
                ))}
                {unmappedGenres.length === 1 ? ', which isn’t' : ', which aren’t'} on
                your list. Add {unmappedGenres.length === 1 ? 'it' : 'them'} under
                Manage lists and TMDB will tick {unmappedGenres.length === 1 ? 'it' : 'them'}{' '}
                from then on.
              </p>
            )}

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

          </div>
        </form>
      </div>
    </div>
  )
}
