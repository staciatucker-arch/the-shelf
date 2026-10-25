import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import WishForm from './components/WishForm.jsx'
import WishlistPanel, { WishRow } from './components/WishlistPanel.jsx'
import WatchNext from './components/WatchNext.jsx'
import AddedNotice from './components/AddedNotice.jsx'
import { isClockSkewError, withClockSkewRetry } from './lib/loadRetry.js'
import { EMPTY_OPTIONS, loadOptions } from './lib/options.js'
import { ownedObjectPath } from './lib/poster.js'
import { isStale, refreshDecision } from './lib/refresh.js'
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
import {
  WISH_COLUMNS,
  filmStartFromWish,
  normaliseWish,
  postersFromBatch,
  searchWishes,
  wishOfferAfterAdd,
  wishPosterKey,
  wishPosterRequests,
} from './lib/wishlist.js'
import { lookupTmdbBatch } from './lib/tmdb.js'

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
  'never_watched',
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

export default function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  const [films, setFilms] = useState(null)
  // `null`, or `{ text, raw }` — the sentence a person reads, and the
  // server's own words kept in small print underneath so there is something
  // concrete to report when it happens again. 2026-09-24.
  const [loadError, setLoadError] = useState(null)
  const [retrying, setRetrying] = useState(false)

  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState('alpha-asc')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openFilmId, setOpenFilmId] = useState(null)
  const [editingFilmId, setEditingFilmId] = useState(null)
  const [addingFilm, setAddingFilm] = useState(false)
  const [managingOptions, setManagingOptions] = useState(false)

  // The wishlist. Loaded beside the collection; a failure here is said in the
  // wishlist's own places and never blocks the shelf.
  const [wishes, setWishes] = useState(null)
  const [wishError, setWishError] = useState(null)
  const [wishlistOpen, setWishlistOpen] = useState(false)
  // null, { mode: 'add', title }, or { mode: 'edit', id }
  const [wishForm, setWishForm] = useState(null)
  const [focusWishId, setFocusWishId] = useState(null)
  // TMDB posters for matched wishes, by wishPosterKey. Memory only — never
  // written anywhere (Stacia, 2026-10-18; see lib/wishlist.js).
  const [wishPosters, setWishPosters] = useState({})
  const askedPosters = useRef(new Set())
  // After a film is added that is also on the wishlist: { film, match }.
  const [addedNotice, setAddedNotice] = useState(null)
  const [watchNextOpen, setWatchNextOpen] = useState(false)
  // "Move to my Shelf": the wish the add form was started from, if any.
  const [movingWishId, setMovingWishId] = useState(null)

  // The add/edit pick lists. Loaded once alongside the collection; a failure
  // here is not fatal to browsing, so it degrades to empty lists and says so
  // in the form rather than blocking the shelf.
  const [options, setOptions] = useState(EMPTY_OPTIONS)

  // Refreshing when the app comes back into view — see lib/refresh.js.
  // `refreshDue` is state because a refresh that has to wait for a panel to
  // close must cause a re-render when it does; the other two are refs because
  // nothing on screen depends on them.
  const [refreshDue, setRefreshDue] = useState(false)
  const lastLoadedAt = useRef(0)
  const writeCount = useRef(0)

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
    // The error stays on screen until this succeeds, so that pressing Try
    // again leaves the message in place and the button able to say it is
    // working, rather than blanking the screen and looking like a fresh load.
    // The whole collection is 248 rows and a few hundred KB of text, so it is
    // fetched once and then searched, sorted and filtered in memory. That
    // keeps every interaction instant; worth revisiting only if the shelf
    // grows by an order of magnitude.
    //
    // Wrapped in one retry because the first load of the morning carries a
    // one-second-old token, and Supabase's two clocks occasionally disagree
    // by about that much — see lib/loadRetry.js. Only that one self-clearing
    // error is retried; everything else is reported at once.
    const { data, error } = await withClockSkewRetry(() =>
      supabase.from('films').select(FILM_COLUMNS).order('title'),
    )

    // Never let a failure look like an empty collection. The old app's habit
    // of silently degrading is the thing this codebase is built against.
    if (error) {
      setLoadError({
        text: isClockSkewError(error)
          ? 'Could not load the collection — your login could not be verified.'
          : 'Could not load the collection.',
        raw: error.message,
      })
      setFilms(null)
      return
    }
    setLoadError(null)
    lastLoadedAt.current = Date.now()
    setFilms(data.map(normaliseFilm))
  }, [])

  // The same read, for when the app comes back into view. It differs from
  // `loadFilms` in the one way that matters: it has something good on screen
  // already, so a failure leaves that alone instead of replacing the shelf
  // with an error. The next return to the app simply tries again.
  const refreshFilms = useCallback(async () => {
    const writesAtStart = writeCount.current
    const { data, error } = await withClockSkewRetry(() =>
      supabase.from('films').select(FILM_COLUMNS).order('title'),
    )
    if (error) return
    // A save overlapped this read, so the list may predate it — see isStale.
    if (isStale(writesAtStart, writeCount.current)) return
    lastLoadedAt.current = Date.now()
    setFilms(data.map(normaliseFilm))
  }, [])

  // The Try again button. Kept separate from `loadFilms` so the button can say
  // it is working; the app still never reloads itself under someone.
  const retryLoad = useCallback(async () => {
    setRetrying(true)
    try {
      await loadFilms()
    } finally {
      setRetrying(false)
    }
  }, [loadFilms])

  useEffect(() => {
    if (session) loadFilms()
    else setFilms(null)
  }, [session, loadFilms])

  // Read on load and on coming back to the app. A failed refresh leaves what
  // is on screen alone, as the films do; a failed first load says so.
  const loadWishes = useCallback(async ({ quiet = false } = {}) => {
    const { data, error } = await withClockSkewRetry(() =>
      supabase.from('wishlist').select(WISH_COLUMNS).order('title'),
    )
    if (error) {
      if (!quiet) setWishError(error.message)
      return
    }
    setWishError(null)
    setWishes(data.map(normaliseWish))
  }, [])

  useEffect(() => {
    if (session) loadWishes()
    else setWishes(null)
  }, [session, loadWishes])

  // Fetch posters for matched wishes not yet asked about. A failure just
  // means no picture; those keys are let go so a later change asks again.
  useEffect(() => {
    if (!wishes) return
    const items = wishPosterRequests(wishes, askedPosters.current)
    if (items.length === 0) return
    for (const it of items) askedPosters.current.add(it.ref)
    let alive = true
    lookupTmdbBatch(items).then(({ results }) => {
      const found = postersFromBatch(results)
      for (const it of items) if (!(it.ref in found)) askedPosters.current.delete(it.ref)
      if (alive) setWishPosters((current) => ({ ...current, ...found }))
    })
    return () => {
      alive = false
    }
  }, [wishes])

  /** One new wish, one insert, the stored row into state. */
  const addWish = useCallback(async (row) => {
    const { data, error } = await supabase.from('wishlist').insert(row).select(WISH_COLUMNS).single()
    if (error) return { error: error.message }
    setWishes((current) => [...(current ?? []), normaliseWish(data)])
    return { error: null, wish: data }
  }, [])

  /** Only the changed columns of one named wish, confirmed before it shows. */
  const saveWish = useCallback(async (id, patch) => {
    const { data, error } = await supabase
      .from('wishlist')
      .update(patch)
      .eq('id', id)
      .select(WISH_COLUMNS)
      .single()
    if (error) return { error: error.message }
    setWishes((current) => (current ?? []).map((w) => (w.id === id ? normaliseWish(data) : w)))
    return { error: null }
  }, [])

  /** Remove one named wish, and only once the database says it is gone. */
  /** Open Add film filled in from a wish. Nothing moves until that save. */
  const moveWishToShelf = useCallback((id) => {
    setMovingWishId(id)
    setWishlistOpen(false)
    setAddingFilm(true)
  }, [])

  const deleteWish = useCallback(async (id) => {
    const { error } = await supabase.from('wishlist').delete().eq('id', id)
    if (error) return { error: error.message }
    setWishes((current) => (current ?? []).filter((w) => w.id !== id))
    return { error: null }
  }, [])

  const refreshOptions = useCallback(async () => {
    const { options: loaded } = await loadOptions()
    if (loaded) setOptions(loaded)
  }, [])

  useEffect(() => {
    if (session) refreshOptions()
  }, [session, refreshOptions])

  // Coming back to the app makes a refresh due; whether it runs now, waits
  // for a panel to close, or is not worth doing is decided in lib/refresh.js.
  useEffect(() => {
    if (!session) return undefined
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') setRefreshDue(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [session])

  const panelOpen = Boolean(
    openFilmId || editingFilmId || addingFilm || managingOptions ||
      wishlistOpen || wishForm || watchNextOpen,
  )
  const loaded = films !== null

  useEffect(() => {
    const decision = refreshDecision({
      due: refreshDue,
      loaded,
      panelOpen,
      lastLoadedAt: lastLoadedAt.current,
      now: Date.now(),
    })
    if (decision === 'idle' || decision === 'wait') return
    setRefreshDue(false)
    if (decision === 'refresh') {
      refreshFilms()
      // The pick lists too: a genre the other person added should be offered.
      refreshOptions()
      loadWishes({ quiet: true })
    }
  }, [refreshDue, loaded, panelOpen, refreshFilms, refreshOptions, loadWishes])

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
    // Counted at both ends, so a refresh that overlaps either is discarded.
    writeCount.current += 1
    const { data, error } = await supabase
      .from('films')
      .update(patch)
      .eq('id', id)
      .select(FILM_COLUMNS)
      .single()
    writeCount.current += 1

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
    writeCount.current += 1
    const { data, error } = await supabase
      .from('films')
      .insert(row)
      .select(FILM_COLUMNS)
      .single()
    writeCount.current += 1

    if (error) return { error: error.message, film: null }

    const film = normaliseFilm(data)
    setFilms((current) => (current ? [...current, film] : current))
    return { error: null, film }
  }, [])

  /** Remove one named row, and only once the database says it is gone. */
  const deleteFilm = useCallback(async (film) => {
    const { id } = film
    writeCount.current += 1
    const { error } = await supabase.from('films').delete().eq('id', id)
    writeCount.current += 1
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

  // The sort list with its headings: consecutive modes sharing a group go
  // under one <optgroup>; A → Z, with no group, stands alone.
  const sortOptions = []
  for (const mode of SORT_MODES) {
    const option = (
      <option key={mode.value} value={mode.value}>
        {mode.label}
      </option>
    )
    const last = sortOptions[sortOptions.length - 1]
    if (!mode.group) sortOptions.push(option)
    else if (last?.group === mode.group) last.options.push(option)
    else sortOptions.push({ group: mode.group, options: [option] })
  }
  const shown = visible.rows.length + visible.unknowns.length
  const isNarrowed = Boolean(query.trim()) || activeFilterCount > 0
  const searching = query.trim() !== ''
  const wishHits = useMemo(() => searchWishes(wishes ?? [], query), [wishes, query])

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
          <button
            className="ghost"
            onClick={() => {
              setFocusWishId(null)
              setWishlistOpen(true)
            }}
          >
            Wishlist{wishes && wishes.length > 0 ? ` (${wishes.length})` : ''}
          </button>
          {/* Beside Wishlist, as the other way in that is not about one film
              (Stacia, 2026-10-18). Only once the films are loaded. */}
          {films && (
            <button className="ghost" onClick={() => setWatchNextOpen(true)}>
              Watch Next
            </button>
          )}
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main>
        {loadError && (
          <div className="error" role="alert">
            <p className="error-message">{loadError.text}</p>
            <button className="ghost" onClick={retryLoad} disabled={retrying}>
              {retrying ? 'Trying…' : 'Try again'}
            </button>
            <p className="error-detail">{loadError.raw}</p>
          </div>
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

              {/* Two fixed rows, never wrapping (Stacia, 2026-10-25): search,
                  then Filter and Sort together with Add film on the right.
                  The count sits on its own line, next to what it counts. */}
              <div className="controls-row">
                <button
                  type="button"
                  className={'ghost filter-toggle' + (activeFilterCount ? ' has-filters' : '')}
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
                </button>

                {/* The closed button says which sort is on, in a short form
                    that fits; the real <select> lies over it, invisible, so
                    the phone's own picker opens with the full list. */}
                <label className="sort-button">
                  <span className="sort-button-text" aria-hidden="true">
                    ⇅ {SORT_MODES.find((m) => m.value === sortMode)?.short}
                  </span>
                  <select
                    className="sort-select"
                    aria-label="Sort"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value)}
                  >
                    {sortOptions.map((item) =>
                      item.group ? (
                        <optgroup key={item.group} label={item.group}>
                          {item.options}
                        </optgroup>
                      ) : (
                        item
                      ),
                    )}
                  </select>
                </label>

                <button type="button" className="add-film" onClick={() => setAddingFilm(true)}>
                  <span aria-hidden="true">+</span> Add film
                </button>
              </div>
            </div>

            <p className="muted result-count">
              {isNarrowed ? `${shown} of ${films.length}` : `${films.length} titles`}
            </p>

            <FilterPanel
              open={filtersOpen}
              values={filterValues}
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters(EMPTY_FILTERS)}
              onClose={() => setFiltersOpen(false)}
              onManageCategories={() => setManagingOptions(true)}
            />

            {/* While searching, one search answers both questions a shop
                raises — do we own it, do we want it (Stacia, 2026-10-11). */}
            {searching && <h2 className="section-divider search-divider">On your shelf ({shown})</h2>}

            {shown === 0 ? (
              searching ? (
                /* Same look as the wishlist's line below, so the two
                   sections read as a pair (Stacia, 2026-10-18). */
                <p className="muted">Nothing on your shelf matches.</p>
              ) : (
                <p className="empty-state">
                  No titles match. Try a shorter search, or clear the filters.
                </p>
              )
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

            {searching && (
              <section className="wish-results">
                <h2 className="section-divider search-divider">On your wishlist ({wishHits.length})</h2>
                {wishError && (
                  <p className="error" role="alert">
                    Could not load the wishlist: {wishError}
                  </p>
                )}
                {wishHits.length > 0 && (
                  <ul className="wish-list">
                    {wishHits.map((wish) => (
                      <WishRow
                        key={wish.id}
                        wish={wish}
                        posterUrl={wishPosters[wishPosterKey(wish)] ?? null}
                        onEdit={() => setWishForm({ mode: 'edit', id: wish.id })}
                        onRemove={() => deleteWish(wish.id)}
                        onMove={() => moveWishToShelf(wish.id)}
                      />
                    ))}
                  </ul>
                )}
                {wishHits.length === 0 && !wishError && (
                  <p className="muted">Nothing on your wishlist matches.</p>
                )}
                {/* Wording approved by Stacia, 2026-10-18. */}
                {shown === 0 && wishHits.length === 0 && (
                  <button
                    type="button"
                    className="form-action"
                    onClick={() => setWishForm({ mode: 'add', title: query.trim() })}
                  >
                    Add “{query.trim()}” to your wishlist
                  </button>
                )}
              </section>
            )}
          </>
        )}
        {/* TMDB's terms require this notice and one of their approved logos
            in every app that uses their data (themoviedb.org/about/
            logos-attribution). Worded by TMDB, not by us; kept small and
            below the shelf, never more prominent than the app itself. */}
        <p className="credit muted">
          <img
            className="credit-logo"
            src={`${import.meta.env.BASE_URL}tmdb-logo.svg`}
            alt="TMDB"
            width="96"
            height="12"
          />
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
        {/* Which build this is. Small, grey, and at the very bottom, where it
            answers "did my phone get the new one?" without being in the way
            of anything. */}
        <p className="build-stamp muted">{__BUILD_STAMP__}</p>
      </main>

      {/* Kept mounted, and hidden, while the edit form is over it. Not a
          cosmetic choice: rebuilding it when the form closes would mean
          adding a history entry with no tap behind it, which Chrome on
          Android skips — see panelBack.js. */}
      {openFilm && !addingFilm && (
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
            hidden={Boolean(editingFilm)}
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
          onDismiss={() => {
            setAddingFilm(false)
            setMovingWishId(null)
          }}
          dismissLabel="Close the form"
        >
          <FilmForm
            film={null}
            start={
              movingWishId
                ? filmStartFromWish((wishes ?? []).find((w) => w.id === movingWishId))
                : null
            }
            options={options}
            onCancel={() => {
              setAddingFilm(false)
              setMovingWishId(null)
            }}
            onSaved={async (row) => {
              const result = await addFilm(row)
              // The new film opens on success, so the thing just added is the
              // thing on screen — and its missing cover is visible immediately
              // rather than discovered later.
              if (!result.error) {
                setAddingFilm(false)
                setOpenFilmId(result.film.id)
                // Only now, after the save is confirmed: is this on the
                // wishlist? Nothing is removed from it without a tap.
                const offer = wishOfferAfterAdd(result.film, wishes ?? [], movingWishId)
                setAddedNotice(offer ? { film: result.film, match: offer } : null)
                setMovingWishId(null)
              }
              return result
            }}
          />
        </ErrorBoundary>
      )}

      {managingOptions && (
        <ErrorBoundary
          overlay
          title="Categories stopped working."
          detail="The rest of the collection is fine. If you were part-way through adding or renaming a value, whether it went through is unknown — reopen Categories and check before trying again."
          onDismiss={() => setManagingOptions(false)}
          dismissLabel="Close"
        >
          <OptionsManager
            onClose={() => setManagingOptions(false)}
            onChanged={refreshOptions}
          />
        </ErrorBoundary>
      )}

      {wishlistOpen && (
        <ErrorBoundary
          overlay
          title="The wishlist stopped working."
          detail="The rest of the collection is fine. If you were removing a wish, reopen the wishlist and check."
          onDismiss={() => setWishlistOpen(false)}
          dismissLabel="Close"
        >
          <WishlistPanel
            wishes={wishes}
            posters={wishPosters}
            loadError={wishError}
            focusId={focusWishId}
            hidden={Boolean(wishForm)}
            onClose={() => setWishlistOpen(false)}
            onAdd={() => setWishForm({ mode: 'add', title: '' })}
            onEdit={(id) => setWishForm({ mode: 'edit', id })}
            onRemove={deleteWish}
            onMove={moveWishToShelf}
          />
        </ErrorBoundary>
      )}

      {wishForm && (wishForm.mode === 'add' || (wishes ?? []).some((w) => w.id === wishForm.id)) && (
        <ErrorBoundary
          overlay
          title="The wish form stopped working."
          detail="The rest of the collection is fine. If you were saving, reopen the wishlist and check before entering it again."
          onDismiss={() => setWishForm(null)}
          dismissLabel="Close the form"
        >
          <WishForm
            wish={wishForm.mode === 'edit' ? (wishes ?? []).find((w) => w.id === wishForm.id) ?? null : null}
            initialTitle={wishForm.mode === 'add' ? wishForm.title : ''}
            options={options}
            onCancel={() => setWishForm(null)}
            onSaved={async (rowOrPatch) => {
              const result =
                wishForm.mode === 'edit'
                  ? await saveWish(wishForm.id, rowOrPatch)
                  : await addWish(rowOrPatch)
              if (!result.error) setWishForm(null)
              return result
            }}
            onDelete={
              wishForm.mode === 'edit'
                ? async () => {
                    const result = await deleteWish(wishForm.id)
                    if (!result.error) setWishForm(null)
                    return result
                  }
                : undefined
            }
          />
        </ErrorBoundary>
      )}

      {watchNextOpen && (
        <ErrorBoundary
          overlay
          title="Watch Next stopped working."
          detail="The rest of the collection is fine. Watch Next saves nothing, so nothing has changed."
          onDismiss={() => setWatchNextOpen(false)}
          dismissLabel="Close"
        >
          <WatchNext
            films={films ?? []}
            onClose={() => setWatchNextOpen(false)}
            onOpenFilm={(film) => {
              setWatchNextOpen(false)
              setOpenFilmId(film.id)
            }}
          />
        </ErrorBoundary>
      )}

      {addedNotice && (
        <AddedNotice
          film={addedNotice.film}
          match={addedNotice.match}
          onRemove={deleteWish}
          onView={() => {
            setFocusWishId(addedNotice.match.wish.id)
            setAddedNotice(null)
            setOpenFilmId(null)
            setWishlistOpen(true)
          }}
          onClose={() => setAddedNotice(null)}
        />
      )}

      <UpdateBanner />
    </>
  )
}
