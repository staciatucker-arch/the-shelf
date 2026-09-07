import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import Login from './components/Login.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'
import StatsBar from './components/StatsBar.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import FilmCard from './components/FilmCard.jsx'
import FilmDetail from './components/FilmDetail.jsx'
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
  'year_season',
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
  'tmdb_id',
  'tmdb_verified',
].join(',')

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

  return (
    <>
      <header className="bar">
        <h1>The Shelf</h1>
        <div className="bar-right">
          <span className="muted">{session.user.email}</span>
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
      </main>

      {openFilm && <FilmDetail film={openFilm} onClose={() => setOpenFilmId(null)} />}

      <UpdateBanner />
    </>
  )
}
