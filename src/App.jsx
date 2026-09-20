import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import Login from './components/Login.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'
import StatsBar from './components/StatsBar.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import FilmCard from './components/FilmCard.jsx'
import FilmDetail from './components/FilmDetail.jsx'
import FilmForm from './components/FilmForm.jsx'
import OptionsManager from './components/OptionsManager.jsx'
import { EMPTY_OPTIONS, loadOptions } from './lib/options.js'
import { ownedObjectPath } from './lib/poster.js'
import { panelBack } from './lib/panelBack.js'
import { removePoster } from './lib/posterStorage.js'
import {
  EMPTY_FILTERS,
  SORT_MODES,
  availableFilterValues,
  computeStats,
  countActiveFilters,
  filterFilms,
  normaliseFilm,
  sortFilms,
} from './lib/collection.js'

// Every column the collection view shows. Listed explicitly rather than
// select('*') so that adding a column to the table cannot quietly start
// shipping data this screen never asked for.
const FILM_COLUMNS = [
  'id',
  'title',
  'release_year',
  'season',
  'season_number',
  'edition',
  'universe',
  'genres',
  'formats',
  'cost',
  'market_value',
  'acquired_on',
  'vendor',
  'status',
  'type',
  'last_watched_on',
  'poster_url',
  // The other two poster columns are needed for their own sake, not for
  // display: `poster_storage_path` is the file a replacement has to delete,
  // and `poster_source` is what says the file belongs to this app at all. A
  // row loaded without them looks exactly like a film whose cover came from
  // somewhere else, and every replaced poster would be left in the bucket.
  'poster_source',
  'poster_storage_path',
  'tmdb_id',
  'tmdb_verified',
].join(',')

/* What a crashed form says about a save that may or may not have happened.
   The one thing it must never do is imply the save succeeded: a write can be
   in flight when the panel dies, and "saved" would be a guess. "Unknown" is
   the honest word, and it tells somebody what to actually do about it. */
const SAVE_UNKNOWN =
  'The rest of the collection is fine — only this window stopped working. ' +
  'If you were part-way through saving, whether it went through is unknown: ' +
  'reload and check the film before entering it again.'

/**
 * The ?debug=1 readout: what the app has done to the browser's history,
 * oldest first. Off unless the address ends in ?debug=1, because it is for
 * chasing a bug on a phone, where there is no console to read.
 */
function BackDebug() {
  const [line, setLine] = useState('')
  const on = typeof window !== 'undefined' && window.location.search.includes('debug')
  useEffect(() => {
    if (!on) return undefined
    return panelBack.watchLog(setLine)
  }, [on])
  if (!on) return null
  // Fixed and above every panel: the events worth reading happen while a
  // panel is covering the screen.
  return (
    <div className="back-debug">
      <span>back: {line || '(nothing yet)'}</span>
      <button type="button" onClick={() => panelBack.clearLog()}>
        Clear
      </button>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  const [films, setFilms] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState('alpha-asc')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openFilmId, setOpenFilmId] = useState(null)
  const [editingFilmId, setEditingFilmId] = useState(null)
  const [addingFilm, setAddingFilm] = useState(false)
  const [managingOptions, setManagingOptions] = useState(false)

  // The add/edit pick lists. Loaded once alongside the collection; a failure
  // here is not fatal to browsing, so it degrades to empty lists and says so
  // in the form rather than blocking the shelf.
  const [options, setOptions] = useState(EMPTY_OPTIONS)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingSession(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadFilms = useCallback(async () => {
    setLoadError(null)
    // The whole collection is 248 rows and a few hundred KB of text, so it is
    // fetched once and then searched, sorted and filtered in memory. That
    // keeps every interaction instant; worth revisiting only if the shelf
    // grows by an order of magnitude.
    const { data, error } = await supabase.from('films').select(FILM_COLUMNS).order('title')

    // Never let a failure look like an empty collection. The old app's habit
    // of silently degrading is the thing this codebase is built against.
    if (error) {
      setLoadError(error.message)
      setFilms(null)
      return
    }
    setFilms(data.map(normaliseFilm))
  }, [])

  useEffect(() => {
    if (session) loadFilms()
    else setFilms(null)
  }, [session, loadFilms])

  const refreshOptions = useCallback(async () => {
    const { options: loaded } = await loadOptions()
    if (loaded) setOptions(loaded)
  }, [])

  useEffect(() => {
    if (session) refreshOptions()
  }, [session, refreshOptions])

  /**
   * Save one film's changed columns.
   *
   * The whole core invariant lives in these few lines: the update names a
   * single row by its primary key, carries only the fields that were edited,
   * and is awaited. Nothing is claimed to have worked until the database hands
   * back the row it actually stored — and it is *that* row, not the form's
   * hopeful copy, that goes into state. Where the old app rewrote the sheet
   * from whatever the browser was holding, this cannot touch a second row even
   * if it tried.
   */
  const saveFilm = useCallback(async (id, patch) => {
    const { data, error } = await supabase
      .from('films')
      .update(patch)
      .eq('id', id)
      .select(FILM_COLUMNS)
      .single()

    if (error) return { error: error.message }

    setFilms((current) =>
      current ? current.map((f) => (f.id === id ? normaliseFilm(data) : f)) : current,
    )
    return { error: null }
  }, [])

  /**
   * Add one film — a single insert carrying the whole row.
   *
   * The id was minted in the browser, so this is one statement rather than an
   * insert followed by a patch: the film either exists complete or does not
   * exist. A row that is briefly on the shelf with nothing on it is a state
   * nobody should be able to see, and (once posters land in step 7) a state
   * where a cover could be uploaded against a film that never arrived.
   *
   * The stored row is what goes into state, never the form's hopeful copy —
   * so a default the database applied is visible immediately.
   */
  const addFilm = useCallback(async (row) => {
    const { data, error } = await supabase
      .from('films')
      .insert(row)
      .select(FILM_COLUMNS)
      .single()

    if (error) return { error: error.message, film: null }

    const film = normaliseFilm(data)
    setFilms((current) => (current ? [...current, film] : current))
    return { error: null, film }
  }, [])

  /** Remove one named row, and only once the database says it is gone. */
  const deleteFilm = useCallback(async (film) => {
    const { id } = film
    const { error } = await supabase.from('films').delete().eq('id', id)
    if (error) return { error: error.message }

    setFilms((current) => (current ? current.filter((f) => f.id !== id) : current))

    // The film's own uploaded cover goes with it (review A2 / security S4,
    // 2026-09-18). Before this, deleting a film left its photo public in the
    // bucket forever, reachable by anyone holding the URL, with nothing
    // pointing at it and nothing that would ever clean it up.
    //
    // Only after the row delete is confirmed, so a failed delete can never
    // leave a film pointing at a missing cover. Only a path this app wrote:
    // `ownedObjectPath` returns null for GitHub and TMDB posters, which are
    // not files in the bucket and must never be touched from here. A failure
    // is not reported as a failed delete, because the film IS deleted; the
    // worst case is one unreferenced image, which is exactly the old
    // behaviour.
    const path = ownedObjectPath(film)
    if (path) {
      const { error: removeError } = await removePoster(path)
      if (removeError) console.warn('Film deleted, but its cover was not removed:', removeError)
    }
    return { error: null }
  }, [])

  const stats = useMemo(() => computeStats(films ?? []), [films])
  const filterValues = useMemo(() => availableFilterValues(films ?? []), [films])
  const visible = useMemo(
    () => sortFilms(filterFilms(films ?? [], query, filters), sortMode),
    [films, query, filters, sortMode],
  )

  const activeFilterCount = countActiveFilters(filters)
  const shown = visible.rows.length + visible.unknowns.length
  const isNarrowed = Boolean(query.trim()) || activeFilterCount > 0

  if (checkingSession) {
    return (
      <div className="centre">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <>
        <Login />
        <UpdateBanner />
      </>
    )
  }

  const cardFor = (film) => (
    <FilmCard key={film.id} film={film} onOpen={() => setOpenFilmId(film.id)} />
  )

  // Looked up from the live list rather than held as its own copy, so an open
  // panel always shows the current row rather than a snapshot taken on tap.
  const openFilm = films?.find((f) => f.id === openFilmId) ?? null
  const editingFilm = films?.find((f) => f.id === editingFilmId) ?? null

  return (
    <>
      <header className="bar">
        <h1>The Shelf</h1>
        <div className="bar-right">
          <span className="muted">{session.user.email}</span>
          <button className="ghost" onClick={() => setManagingOptions(true)}>
            Pick lists
          </button>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main>
        {loadError && (
          <p className="error" role="alert">
            Could not load the collection: {loadError}
          </p>
        )}

        {!loadError && films === null && <p className="muted">Loading the collection…</p>}

        {films && (
          <>
            <StatsBar stats={stats} />

            <div className="controls">
              <input
                type="search"
                className="search"
                placeholder="Search titles…"
                aria-label="Search titles"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <div className="controls-row">
                <span className="muted result-count">
                  {isNarrowed ? `${shown} of ${films.length}` : `${films.length} titles`}
                </span>

                <select
                  className="sort-select"
                  aria-label="Sort"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                >
                  {SORT_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>

                <button type="button" className="add-film" onClick={() => setAddingFilm(true)}>
                  <span aria-hidden="true">+</span> Add film
                </button>

                <button
                  type="button"
                  className={'ghost filter-toggle' + (activeFilterCount ? ' has-filters' : '')}
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
                </button>
              </div>
            </div>

            <FilterPanel
              open={filtersOpen}
              values={filterValues}
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters(EMPTY_FILTERS)}
              onClose={() => setFiltersOpen(false)}
            />

            {shown === 0 ? (
              <p className="empty-state">
                No titles match. Try a shorter search, or clear the filters.
              </p>
            ) : (
              <>
                <ul className="grid">{visible.rows.map(cardFor)}</ul>

                {visible.unknowns.length > 0 && (
                  <>
                    {/* Films with no figure recorded are shown apart rather
                        than sorted as though they cost nothing. */}
                    <h2 className="section-divider">
                      {visible.unknownLabel} ({visible.unknowns.length})
                    </h2>
                    <ul className="grid">{visible.unknowns.map(cardFor)}</ul>
                  </>
                )}
              </>
            )}
          </>
        )}
        {/* Which build this is. Small, grey, and at the very bottom, where it
            answers "did my phone get the new one?" without being in the way
            of anything. */}
        <p className="build-stamp muted">{__BUILD_STAMP__}</p>
        <BackDebug />
      </main>

      {openFilm && !editingFilm && !addingFilm && (
        <ErrorBoundary
          key={`detail-${openFilm.id}`}
          overlay
          title="This film’s details stopped working."
          detail="The rest of the collection is fine — only this window broke. Nothing was being saved, so nothing has changed."
          onDismiss={() => setOpenFilmId(null)}
          dismissLabel="Close"
        >
          <FilmDetail
            film={openFilm}
            onClose={() => setOpenFilmId(null)}
            onEdit={() => setEditingFilmId(openFilm.id)}
          />
        </ErrorBoundary>
      )}

      {editingFilm && (
        <ErrorBoundary
          key={`edit-${editingFilm.id}`}
          overlay
          title="The edit form stopped working."
          detail={SAVE_UNKNOWN}
          onDismiss={() => setEditingFilmId(null)}
          dismissLabel="Close the form"
        >
          <FilmForm
            film={editingFilm}
            options={options}
            onCancel={() => setEditingFilmId(null)}
            onSaved={async (patch) => {
              const result = await saveFilm(editingFilm.id, patch)
              // Closed only on a confirmed write. A failed save leaves the form
              // open with the edit still in it.
              if (!result.error) setEditingFilmId(null)
              return result
            }}
            onDelete={async () => {
              const result = await deleteFilm(editingFilm)
              // Both panels close together: the detail behind this one is about
              // a film that no longer exists.
              if (!result.error) {
                setEditingFilmId(null)
                setOpenFilmId(null)
              }
              return result
            }}
          />
        </ErrorBoundary>
      )}

      {addingFilm && (
        <ErrorBoundary
          overlay
          title="The add form stopped working."
          detail={SAVE_UNKNOWN}
          onDismiss={() => setAddingFilm(false)}
          dismissLabel="Close the form"
        >
          <FilmForm
            film={null}
            options={options}
            onCancel={() => setAddingFilm(false)}
            onSaved={async (row) => {
              const result = await addFilm(row)
              // The new film opens on success, so the thing just added is the
              // thing on screen — and its missing cover is visible immediately
              // rather than discovered later.
              if (!result.error) {
                setAddingFilm(false)
                setOpenFilmId(result.film.id)
              }
              return result
            }}
          />
        </ErrorBoundary>
      )}

      {managingOptions && (
        <ErrorBoundary
          overlay
          title="Pick lists stopped working."
          detail="The rest of the collection is fine. If you were part-way through adding or renaming a value, whether it went through is unknown — reopen Pick lists and check before trying again."
          onDismiss={() => setManagingOptions(false)}
          dismissLabel="Close"
        >
          <OptionsManager
            onClose={() => setManagingOptions(false)}
            onChanged={refreshOptions}
          />
        </ErrorBoundary>
      )}

      <UpdateBanner />
    </>
  )
}
