import { displayTitle, displayYear, isPhysicalFormat } from '../lib/collection.js'

/**
 * One tile in the grid. Opening a film is FilmDetail's job — a tile stays a
 * tile, so the shelf never reflows under a tap.
 */
export default function FilmCard({ film, onOpen }) {
  const title = displayTitle(film.title)
  const year = displayYear(film.year_season)

  const hasPhysical = film.formats.some(isPhysicalFormat)
  const hasDigital = film.formats.some((f) => !isPhysicalFormat(f))

  return (
    <li className="film-card">
      <button type="button" className="film-summary" onClick={onOpen}>
        <div className="film-art">
          {film.poster_url ? (
            <img src={film.poster_url} alt="" loading="lazy" />
          ) : (
            <div className="no-poster">no poster</div>
          )}
        </div>

        <span className="film-title">{title}</span>
        {year && <span className="film-year">{year}</span>}

        <span className="badge-row">
          {hasPhysical && <span className="format-badge fmt-physical">Physical</span>}
          {hasDigital && <span className="format-badge fmt-digital">Digital</span>}
        </span>
      </button>
    </li>
  )
}
