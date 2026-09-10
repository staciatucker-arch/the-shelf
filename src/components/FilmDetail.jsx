import { useEffect, useRef } from 'react'
import {
  contentsList,
  displayTitle,
  displayYear,
  filmGain,
  lastWatched,
  money,
} from '../lib/collection.js'

function formatClass(format) {
  const key = String(format).toLowerCase()
  if (key === '4k' || key === 'uhd') return 'fmt-4k'
  if (key === 'blu-ray') return 'fmt-bluray'
  if (key === 'dvd') return 'fmt-dvd'
  if (key === 'vhs') return 'fmt-vhs'
  return 'fmt-digital'
}

function statusClass(status) {
  const key = String(status).toLowerCase()
  if (key === 'keep') return 'status-tag keep'
  if (key === 'unwatched') return 'status-tag unwatched'
  if (key.includes('sell')) return 'status-tag sell'
  return 'status-tag'
}

function Detail({ label, children }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd>{children ?? <span className="muted">—</span>}</dd>
    </div>
  )
}

/**
 * One film, on its own, in a bounded panel over the shelf.
 *
 * Deliberately a modal rather than an in-place expansion: reading a film's
 * detail while its neighbours crowd the edges of the screen is noisy, and on a
 * phone the expansion pushed everything else around. Here the rest of the
 * collection stays put and comes back untouched when the panel closes.
 */
export default function FilmDetail({ film, onClose, onEdit }) {
  const closeRef = useRef(null)

  useEffect(() => {
    // Escape closes, as it does in every other dialog anyone has used.
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    // Stop the shelf behind the panel scrolling under a finger or a wheel.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    closeRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  if (!film) return null

  const title = displayTitle(film.title)
  const year = displayYear(film.year_season)
  const contents = contentsList(film)
  const watched = lastWatched(film)
  const gain = filmGain(film)

  return (
    <div
      className="detail-overlay"
      // A click on the backdrop closes; a click inside the panel must not,
      // so the panel stops the event rather than the backdrop guessing.
      onClick={onClose}
      role="presentation"
    >
      <div
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-head">
          <div>
            <h2 className="detail-title">{title}</h2>
            {year && <p className="detail-year muted">{year}</p>}
          </div>
          <div className="detail-head-actions">
            {onEdit && (
              <button type="button" className="ghost detail-edit" onClick={onEdit}>
                Edit
              </button>
            )}
            <button type="button" className="detail-close" onClick={onClose} ref={closeRef}>
              <span aria-hidden="true">×</span>
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-art">
            {film.poster_url ? (
              <img src={film.poster_url} alt={`Cover of ${title}`} />
            ) : (
              <div className="no-poster">no poster</div>
            )}
          </div>

          <div className="detail-facts">
            {contents.length > 0 && (
              // Eight box sets record what they contain. Listed as a list —
              // the entries are the useful part, and running them together as
              // one wrapped paragraph is how four of these sets went unnoticed
              // for a week. The wording of each entry is left exactly as
              // recorded; tidying it is a human edit, not something to do
              // behind anyone's back.
              <div className="film-contents">
                <div className="film-contents-label">
                  Includes {contents.length} {contents.length === 1 ? 'title' : 'titles'}
                </div>
                <ul>
                  {contents.map((entry, i) => (
                    <li key={`${entry}-${i}`}>{entry}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="tag-row">
              {film.status && <span className={statusClass(film.status)}>{film.status}</span>}
              {film.type && <span className="meta-tag">{film.type}</span>}
              {film.universe && <span className="meta-tag universe-tag">{film.universe}</span>}
            </div>

            {film.formats.length > 0 && (
              <div className="tag-row">
                {film.formats.map((f) => (
                  <span key={f} className={'format-badge ' + formatClass(f)}>
                    {f}
                  </span>
                ))}
              </div>
            )}

            {film.genres.length > 0 && (
              <div className="tag-row">
                {film.genres.map((g) => (
                  <span key={g} className="genre-chip">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Two rows, each one a theme: what it is worth and what we plan
                to do with it, then where it came from and its life since. */}
            <dl className="detail-grid">
              <Detail label="Spent">{money(film.cost, { decimals: 2 })}</Detail>
              <Detail label="Market">{money(film.market_value, { decimals: 2 })}</Detail>
              <Detail label="Gain">
                {gain == null ? null : (
                  <span className={gain >= 0 ? 'up' : 'down'}>
                    {(gain < 0 ? '−' : '+') + money(Math.abs(gain), { decimals: 2 })}
                  </span>
                )}
              </Detail>
              <Detail label="Bought from">{film.vendor}</Detail>
              <Detail label="Acquired">{film.acquired_on}</Detail>
              <Detail label="Last watched">
                {watched &&
                  (watched.derived ? (
                    // Read off the status, not recorded as a date — styled so
                    // it never passes for one.
                    <span className="derived">{watched.text}</span>
                  ) : (
                    watched.text
                  ))}
              </Detail>
            </dl>

            {/* Admin, not a browsing fact: the id number means nothing to a
                reader, and its real job is feeding trigger lookups. Kept
                visible but subordinate, because whether the match is confirmed
                decides whether trigger data can be trusted at all — roughly
                one inherited id in twelve points at a different film. */}
            <p className="detail-admin">
              {film.tmdb_id ? (
                <>
                  TMDB {film.tmdb_id} ·{' '}
                  <span className={film.tmdb_verified ? 'ok' : 'unverified'}>
                    {film.tmdb_verified ? 'match confirmed' : 'match not yet confirmed'}
                  </span>
                </>
              ) : (
                <span className="unverified">No TMDB match yet</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
