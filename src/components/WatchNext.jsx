import { useEffect, useMemo, useRef, useState } from 'react'
import { displayTitle, displayYear } from '../lib/collection.js'
import { lockScroll } from '../lib/scrollLock.js'
import { drawNext, watchNextGenres, watchNextPool } from '../lib/watchNext.js'
import { useBackToClose } from './useBackToClose.js'

/**
 * Watch Next: one random movie at a time, with spin again.
 *
 * The rules are in lib/watchNext.js. It writes nothing: a pick is only a
 * suggestion, so nothing is marked watched until a person does it on the
 * film itself (Stacia, 2026-10-18). The button hands over to the film's own
 * panel, where Edit holds the last-watched date.
 */
export default function WatchNext({ films, onClose, onOpenFilm }) {
  const [genre, setGenre] = useState('')
  const [shown, setShown] = useState([])
  const [current, setCurrent] = useState(null)

  useBackToClose(onClose, { id: 'watch-next' })
  const latestOnClose = useRef(onClose)
  latestOnClose.current = onClose

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') latestOnClose.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const releaseScroll = lockScroll()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      releaseScroll()
    }
  }, [])

  const genres = useMemo(() => watchNextGenres(films), [films])
  const pool = useMemo(() => watchNextPool(films, { genre }), [films, genre])

  // A new run whenever the genre changes, including the first draw. Keyed on
  // the genre, not the pool: the collection refreshing in the background
  // rebuilds the pool, and that must not throw away the pick on screen.
  const poolRef = useRef(pool)
  poolRef.current = pool
  useEffect(() => {
    const first = drawNext(poolRef.current, [])
    setCurrent(first)
    setShown(first ? [first.id] : [])
  }, [genre])

  function spinAgain() {
    const next = drawNext(pool, shown)
    setCurrent(next)
    if (next) setShown((ids) => [...ids, next.id])
  }

  function startOver() {
    const first = drawNext(pool, [])
    setCurrent(first)
    setShown(first ? [first.id] : [])
  }

  // Wording approved by Stacia, 2026-10-18.
  return (
    <div className="detail-overlay" role="presentation" onClick={onClose}>
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
            <button type="button" className="detail-close" onClick={onClose}>
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

              <div className="watch-actions">
                <button type="button" className="ghost form-action" onClick={spinAgain}>
                  Spin again
                </button>
                <button type="button" className="form-action" onClick={() => onOpenFilm(current)}>
                  Open the film to mark as watched
                </button>
              </div>
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
