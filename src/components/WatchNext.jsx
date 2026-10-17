import { useEffect, useMemo, useRef, useState } from 'react'
import { displayTitle, displayYear } from '../lib/collection.js'
import { lockScroll } from '../lib/scrollLock.js'
import { drawNext, todayLocal, watchNextGenres, watchNextPool } from '../lib/watchNext.js'
import { useBackToClose } from './useBackToClose.js'

/**
 * Watch Next: one random movie at a time, with spin again.
 *
 * The rules are in lib/watchNext.js. Committing to the pick records today as
 * its last-watched date — a real write, so it waits for the database and says
 * plainly if the date was not saved.
 */
export default function WatchNext({ films, onClose, onWatched }) {
  const [genre, setGenre] = useState('')
  const [shown, setShown] = useState([])
  const [current, setCurrent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useBackToClose(onClose, { id: 'watch-next', enabled: !saving })
  const latestOnClose = useRef(onClose)
  latestOnClose.current = onClose

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !saving) latestOnClose.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const releaseScroll = lockScroll()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      releaseScroll()
    }
  }, [saving])

  const genres = useMemo(() => watchNextGenres(films), [films])
  const pool = useMemo(() => watchNextPool(films, { genre }), [films, genre])

  // A new run whenever the genre changes, including the first draw. Keyed on
  // the genre, not the pool: recording "watched today" updates the film, which
  // rebuilds the pool, and that must not throw away the pick on screen.
  const poolRef = useRef(pool)
  poolRef.current = pool
  useEffect(() => {
    const first = drawNext(poolRef.current, [])
    setCurrent(first)
    setShown(first ? [first.id] : [])
    setDone(false)
    setError(null)
  }, [genre])

  function spinAgain() {
    const next = drawNext(pool, shown)
    setCurrent(next)
    if (next) setShown((ids) => [...ids, next.id])
    setError(null)
  }

  function startOver() {
    const first = drawNext(pool, [])
    setCurrent(first)
    setShown(first ? [first.id] : [])
  }

  async function watchThis() {
    if (!current) return
    setSaving(true)
    setError(null)
    try {
      const result = await onWatched(current, todayLocal())
      if (result?.error) setError(result.error)
      else setDone(true)
    } finally {
      setSaving(false)
    }
  }

  // ⚠ Placeholder wording throughout — Stacia's to choose.
  return (
    <div className="detail-overlay" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="detail-panel watch-next"
        role="dialog"
        aria-modal="true"
        aria-label="Watch Next"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-head">
          <h2 className="detail-title">Watch Next</h2>
          <div className="detail-head-actions">
            <button type="button" className="detail-close" onClick={onClose} disabled={saving}>
              <span aria-hidden="true">×</span>
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>

        <div className="detail-body watch-body">
          <label htmlFor="watch-genre" className="watch-genre">
            Genre
            <select
              id="watch-genre"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              disabled={saving || done}
            >
              <option value="">Any genre</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          {pool.length === 0 && <p className="muted">No movies on the shelf match that genre.</p>}

          {pool.length > 0 && !current && (
            <div className="watch-empty">
              <p>That’s every movie{genre ? ` in ${genre}` : ''} — {pool.length} in all.</p>
              <button type="button" className="form-action" onClick={startOver}>
                Start over
              </button>
            </div>
          )}

          {current && (
            <div className="watch-pick">
              <div className="watch-art">
                {current.poster_url ? (
                  <img src={current.poster_url} alt={`Cover of ${displayTitle(current.title)}`} />
                ) : (
                  <div className="no-poster">no poster</div>
                )}
              </div>
              <h3 className="watch-title">{displayTitle(current.title)}</h3>
              {displayYear(current) && <p className="muted">{displayYear(current)}</p>}
              {current.genres?.length > 0 && (
                <div className="tag-row">
                  {current.genres.map((g) => (
                    <span key={g} className="genre-chip">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {error && (
                <p className="error" role="alert">
                  Could not record it as watched: {error}
                </p>
              )}

              {done ? (
                <p className="watch-done">Enjoy the film. Marked as watched today.</p>
              ) : (
                <div className="watch-actions">
                  <button type="button" className="ghost form-action" onClick={spinAgain} disabled={saving}>
                    Spin again
                  </button>
                  <button type="button" className="form-action" onClick={watchThis} disabled={saving}>
                    {saving ? 'Saving…' : 'Watch this'}
                  </button>
                </div>
              )}
              <p className="form-hint muted">
                {shown.length} of {pool.length} shown this time
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
