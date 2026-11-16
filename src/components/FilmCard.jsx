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
        {/* No tags under the cover. The Physical / Digital tag went on
            2026-11-15; the trigger tags went on 2026-11-16 (Stacia: "it is
            busy since most movies look like they have triggers anyway").
            A cover says nothing about triggers, so a blank one cannot be
            read as "clear": triggers live in the film's own panel. */}
      </button>
    </li>
  )
}
