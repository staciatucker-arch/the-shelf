import { displayTitle, displayYear } from '../lib/collection.js'

/**
 * One tile in the grid. Opening a film is FilmDetail's job — a tile stays a
 * tile, so the shelf never reflows under a tap.
 */
export default function FilmCard({ film, onOpen }) {
  const title = displayTitle(film.title)
  const year = displayYear(film)

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
        {/* The Physical / Digital tag was removed 2026-11-15 (Stacia: it
            "does not relate to anything" — every disc is physical, and the
            one "Digital" was a 3D Blu-ray). The trigger count will sit
            here instead. */}
      </button>
    </li>
  )
}
