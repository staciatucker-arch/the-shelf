import { displayTitle, displayYear } from '../lib/collection.js'
import { showsNotChecked, showsNotEnoughVotes } from '../lib/triggers.js'

/**
 * One tile in the grid. Opening a film is FilmDetail's job — a tile stays a
 * tile, so the shelf never reflows under a tap.
 */
export default function FilmCard({ film, trigger = null, onOpen }) {
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
            one "Digital" was a 3D Blu-ray). The trigger count sits here:
            a count only, never a name (Stacia, 2026-11-15), and a quiet
            mark when nothing is known, so a blank never reads as fine.
            ⚠ Draft wording. */}
        {trigger && trigger.state === 'checked' && trigger.count > 0 && (
          <span className="badge-row">
            <span className="trigger-tag">
              ⚠ {trigger.count} {trigger.count === 1 ? 'trigger' : 'triggers'}
            </span>
          </span>
        )}
        {/* Checked, but none of your triggers has a clear answer either
            way (Stacia, 2026-11-16): never a blank, which reads as clear. */}
        {showsNotEnoughVotes(trigger) && (
          <span className="badge-row">
            <span className="not-checked-tag">not enough votes</span>
          </span>
        )}
        {trigger && showsNotChecked(trigger.state) && (
          <span className="badge-row">
            <span className="not-checked-tag">not checked</span>
          </span>
        )}
      </button>
    </li>
  )
}
