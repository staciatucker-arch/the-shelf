import { useEffect, useState } from 'react'
import { lookupTmdb, searchTmdb } from '../lib/tmdb.js'

/**
 * Deciding which film this is.
 *
 * Kept visibly separate from the rest of the form because it answers a
 * different question. The fields above describe the object on the shelf; this
 * says which film in the world it is a copy of, which is what the trigger
 * warnings will be looked up against. Getting it wrong does not misspell a
 * vendor — it shows somebody another film's content warnings.
 *
 * So: candidates are listed, a person picks one, and nothing is chosen by
 * default. Leaving it unmatched is a supported answer and says so.
 */
export default function TmdbMatch({
  title, year, type, match, season, onConfirm, onSeason, onClear,
}) {
  const [candidates, setCandidates] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [usedYear, setUsedYear] = useState(false)
  const [seasons, setSeasons] = useState(null)
  const [seasonError, setSeasonError] = useState(null)

  const queryTitle = String(title ?? '').split('\n')[0].trim()
  // The year column is free text — "Season 2", or a box set's contents list.
  // Only a bare year is ever sent to TMDB, so only a bare year can be the
  // thing a search fell back from.
  const searchedYear = /^\d{4}$/.test(String(year ?? '').trim())

  async function runSearch() {
    setError(null)
    setSearching(true)
    const result = await searchTmdb({ title: queryTitle, year, type })
    setSearching(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setUsedYear(result.usedYear)
    setCandidates(result.candidates)
  }

  // Seasons arrive only from /tv/{id}, so they are fetched after a person has
  // confirmed which show it is — never before, because enumerating seasons for
  // a show nobody has chosen would be choosing on their behalf.
  useEffect(() => {
    let cancelled = false
    if (!match || match.kind !== 'tv') {
      setSeasons(null)
      setSeasonError(null)
      return undefined
    }
    setSeasonError(null)
    lookupTmdb({ tmdb_id: match.tmdb_id, kind: match.kind }).then((res) => {
      if (cancelled) return
      if (res.error) {
        // A failure here must not read as "this show has no seasons".
        setSeasonError(res.error)
        setSeasons(null)
        return
      }
      setSeasons(res.details?.seasons ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [match])

  if (match) {
    return (
      <fieldset className="form-fieldset tmdb-block">
        <legend>Which film is this?</legend>
        <div className="tmdb-confirmed">
          <div>
            <strong>{match.title}</strong>
            {match.year ? ` (${match.year})` : ''}
            <p className="form-hint muted">
              Matched on TMDB · id {match.tmdb_id} ·{' '}
              {match.kind === 'tv' ? 'television' : 'film'}
            </p>
          </div>
          <button type="button" className="ghost form-action" onClick={onClear}>
            Change
          </button>
        </div>

        {/* TMDB catalogues shows, not seasons — there is no id for "Buffy
            series 3". The show is the match; the season is a separate choice
            made here, and it is what lets trigger warnings answer for the
            disc in your hand rather than for seven years of television. */}
        {match.kind === 'tv' && (
          <div className="tmdb-season">
            {seasonError && (
              <p className="form-hint muted">
                Could not load the season list: {seasonError}. You can still
                type the season in the box above.
              </p>
            )}

            {!seasonError && seasons === null && (
              <p className="form-hint muted">Looking for seasons…</p>
            )}

            {seasons && seasons.length > 0 && (
              <label htmlFor="tmdb-season-select">
                Which season is this?
                <select
                  id="tmdb-season-select"
                  value={season?.season_number ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value
                    onSeason(
                      raw === ''
                        ? null
                        : seasons.find((se) => String(se.season_number) === raw) ?? null,
                    )
                  }}
                >
                  {/* No season is pre-selected: a box set of the whole run is
                      a real answer, and guessing "Season 1" would put a
                      number on the row that nobody chose. */}
                  <option value="">Not a single season</option>
                  {seasons.map((se) => (
                    <option key={se.season_number} value={se.season_number}>
                      {se.name || `Season ${se.season_number}`}
                      {se.year ? ` — ${se.year}` : ''}
                      {se.episode_count ? ` (${se.episode_count} episodes)` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {seasons && seasons.length === 0 && (
              <p className="form-hint muted">TMDB lists no seasons for this show.</p>
            )}
          </div>
        )}
      </fieldset>
    )
  }

  return (
    <fieldset className="form-fieldset tmdb-block">
      <legend>Which film is this?</legend>

      <p className="form-hint muted tmdb-lead">
        Matching a title to TMDB is what lets the app look up trigger warnings
        later. It doesn’t change the cover. You can leave it unmatched.
      </p>

      <button
        type="button"
        className="ghost form-action"
        onClick={runSearch}
        disabled={searching || queryTitle === ''}
      >
        {searching ? 'Searching…' : candidates ? 'Search again' : 'Search TMDB'}
      </button>
      {queryTitle === '' && (
        <p className="form-hint muted">Type a title above first.</p>
      )}

      {error && (
        <p className="error" role="alert">
          Could not reach TMDB: {error}
        </p>
      )}

      {candidates && candidates.length === 0 && !error && (
        // Distinct from a failure on purpose — see lib/tmdb.js.
        <p className="form-hint muted">
          Nothing on TMDB matched “{queryTitle}”. Box sets often have no record
          at all, which is fine: leave it unmatched.
        </p>
      )}

      {candidates && candidates.length > 0 && (
        <>
          {!usedYear && searchedYear && (
            <p className="form-hint muted">
              Nothing matched that year, so these are matches on the title
              alone.
            </p>
          )}
          <ul className="tmdb-results">
            {candidates.map((candidate) => (
              <li key={`${candidate.kind}-${candidate.tmdb_id}`}>
                <button
                  type="button"
                  className="tmdb-candidate"
                  onClick={() => onConfirm(candidate)}
                >
                  {candidate.poster_url ? (
                    <img src={candidate.poster_url} alt="" loading="lazy" />
                  ) : (
                    <span className="tmdb-noart" aria-hidden="true" />
                  )}
                  <span className="tmdb-candidate-text">
                    <span className="tmdb-candidate-title">
                      {candidate.title}
                      {candidate.year ? ` (${candidate.year})` : ''}
                    </span>
                    {candidate.overview && (
                      <span className="tmdb-candidate-blurb">
                        {candidate.overview.slice(0, 140)}
                        {candidate.overview.length > 140 ? '…' : ''}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="form-hint muted">
            None of these? Leave it unmatched — an unmatched film reads “not yet
            checked”, which is honest. A wrong match is not.
          </p>
        </>
      )}
    </fieldset>
  )
}
