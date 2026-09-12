import { useState } from 'react'
import { searchTmdb } from '../lib/tmdb.js'

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
export default function TmdbMatch({ title, year, type, match, onConfirm, onClear }) {
  const [candidates, setCandidates] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [usedYear, setUsedYear] = useState(false)

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
