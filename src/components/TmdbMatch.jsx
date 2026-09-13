import { useEffect, useState } from 'react'
import { joinPhrases } from '../lib/filmForm.js'
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
 *
 * The copy is written for somebody who has never heard of TMDB and has no
 * reason to care what it is. What they want is not an id — it is not having to
 * type the whole title or know the year. So the button says what it does for
 * them, and the catalogue is named only where the name is genuinely useful: on
 * a confirmed record, where it is provenance.
 */
export default function TmdbMatch({
  title, year, type, match, season, existingId, existingVerified,
  yearField, filled,
  onConfirm, onSeason, onClear,
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
  const chosenType = String(type ?? '').trim()
  const isBoxSet = chosenType.toLowerCase() === 'box set'

  // Both refusals are worded as instructions rather than complaints, and are
  // matched by prefix below so they are not dressed up as network failures.
  const NEED_TITLE = 'Type a few words of the title first.'
  const NEED_TYPE = 'Choose what it is first — that’s what decides where we look.'

  async function runSearch() {
    setError(null)
    if (queryTitle === '') {
      setError(NEED_TITLE)
      return
    }
    // Refused rather than guessed. Type decides which of TMDB's two catalogues
    // is searched, and quietly defaulting to film is exactly how a search for
    // Buffy returned the 1992 film to somebody holding the 1997 series.
    if (chosenType === '') {
      setError(NEED_TYPE)
      return
    }
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
      <div className="tmdb-block tmdb-matched">
        <div className="tmdb-confirmed">
          <div className="tmdb-confirmed-what">
            <span className="tmdb-tick" aria-hidden="true">✓</span>
            <div>
              <strong>{match.title}</strong>
              {match.year ? ` (${match.year})` : ''}
              <p className="form-hint muted">
                {match.kind === 'tv' ? 'Television' : 'Film'} · TMDB{' '}
                {match.tmdb_id} · confirmed by you
              </p>
            </div>
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
                Could not load the season list: {seasonError}. You can still type
                the season in the Season box below.
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
                <span className="form-hint muted">
                  Shows are listed whole, so pick the disc you own.
                </span>
              </label>
            )}

            {seasons && seasons.length === 0 && (
              <p className="form-hint muted">
                TMDB lists no seasons for this show — type it in the Season box
                below instead.
              </p>
            )}
          </div>
        )}

        {/* What confirming just did, named. It rewrites the title, fills the
            year and ticks genres in fields that are either scrolled away or
            not yet reached; help nobody can see reads as a glitch, and a box
            filled in silently is one nobody thinks to check. */}
        {filled && filled.length > 0 && (
          <p className="tmdb-receipt">
            Filled in for you: <strong>{joinPhrases(filled)}</strong>. Change any
            of it below.
          </p>
        )}
      </div>
    )
  }

  // Editing a film that already carries an id, which nobody has touched in
  // this session. It is shown rather than silently kept, because roughly one
  // inherited id in twelve names a different film — and because a box set
  // should have none at all.
  if (existingId && !match) {
    return (
      <div className="tmdb-block tmdb-matched">
        <div className="tmdb-confirmed">
          <div className="tmdb-confirmed-what">
            <div>
              <strong>TMDB {existingId}</strong>
              <p className="form-hint muted">
                {existingVerified
                  ? 'Confirmed by a person.'
                  : 'Never confirmed — inherited from the old app, where about one id in twelve names a different film.'}
              </p>
            </div>
          </div>
          <div className="tmdb-existing-actions">
            <button
              type="button"
              className="ghost form-action"
              onClick={() => {
                onClear()
                runSearch()
              }}
            >
              Re-match
            </button>
            <button type="button" className="ghost form-action" onClick={onClear}>
              Clear
            </button>
          </div>
        </div>
        <p className="form-hint muted">
          Clearing leaves it unmatched, which reads “not yet checked”. For a box
          set that is the right answer — TMDB has no record of a set, and
          pointing one at a single disc would show that disc’s warnings as
          though they covered the whole box.
        </p>
      </div>
    )
  }

  // The search itself. No heading of its own: it sits inside the "start with
  // the title" card, which has already said what this is for. Saying it twice
  // on one screen is what turned the second one into furniture.
  return (
    <div className="tmdb-block">
      <button
        type="button"
        className="form-action tmdb-search"
        onClick={runSearch}
        disabled={searching}
      >
        {searching ? 'Searching…' : candidates ? 'Search again' : 'Find this title'}
      </button>

      {/* The year sits here, under the button, rather than above the search
          that exists to fill it in. It still narrows a search — "Total Recall"
          is ambiguous where "Total Recall 1990" is not — so it stays; it is
          just no longer the second thing a newcomer is asked for. */}
      {yearField}

      {/* Shown only when Box set is chosen, because only then is it true. A
          set is in none of TMDB's catalogues, and saying so at the moment of
          the choice saves a search that was always going to come back empty. */}
      {isBoxSet && !candidates && (
        <p className="form-hint muted">
          Box sets usually aren’t listed. Type the name and skip the search —
          unmatched is the right answer for a set.
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error === NEED_TITLE || error === NEED_TYPE
            ? error
            : `Could not reach TMDB: ${error}`}
        </p>
      )}

      {candidates && candidates.length === 0 && !error && (
        // Distinct from a failure on purpose — see lib/tmdb.js.
        <p className="form-hint muted">
          Nothing matched “{queryTitle}”. That’s fine — leave it unmatched and
          fill the details in yourself.
        </p>
      )}

      {candidates && candidates.length > 0 && (
        <div className="tmdb-results-block">
          <p className="tmdb-results-title">Which one is yours?</p>
          {!usedYear && searchedYear && (
            <p className="form-hint muted">
              Nothing matched that year, so these are matches on the title alone.
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
            None of these? Leave it unmatched. It’ll read “not yet checked”,
            which is honest — a wrong match isn’t.
          </p>
        </div>
      )}
    </div>
  )
}
