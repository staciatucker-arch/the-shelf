import { useState } from 'react'
import { displayTitle } from '../lib/collection.js'

/**
 * The message after a film is added that is also on the wishlist.
 *
 * Wording by Stacia, 2026-10-11: "Alien 3 has been added to your Shelf.
 * [Remove from Wishlist] [View in Wishlist]", closed with a small ✕ that keeps
 * the wish. Shown only after the film's save is confirmed.
 *
 * "Remove" is offered only when the wish and the film are the same confirmed
 * TMDB record. A match on the title alone gets "View" only, so one tap cannot
 * remove a same-named different film (lib/wishlist.js, wishMatchesForFilm).
 */
export default function AddedNotice({ film, match, onRemove, onView, onClose }) {
  const [removing, setRemoving] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [error, setError] = useState(null)

  async function remove() {
    setRemoving(true)
    setError(null)
    const result = await onRemove(match.wish.id)
    setRemoving(false)
    if (result?.error) setError(result.error)
    else setRemoved(true)
  }

  return (
    <div className="added-notice" role="status">
      <div className="added-text">
        <p>
          <strong>{displayTitle(film.title)}</strong> has been added to your Shelf.
        </p>
        {/* Wording approved by Stacia, 2026-10-18. */}
        {removed && <p className="muted">Removed from your wishlist.</p>}
        {error && (
          <p className="error" role="alert">
            Could not remove it from the wishlist: {error}
          </p>
        )}
        {!removed && (
          <div className="added-actions">
            {match.sameFilm && (
              <button type="button" className="form-action" onClick={remove} disabled={removing}>
                {removing ? 'Removing…' : 'Remove from Wishlist'}
              </button>
            )}
            <button type="button" className="ghost form-action" onClick={onView} disabled={removing}>
              View in Wishlist
            </button>
          </div>
        )}
      </div>
      <button type="button" className="added-close" onClick={onClose} disabled={removing}>
        <span aria-hidden="true">✕</span>
        <span className="sr-only">Close</span>
      </button>
    </div>
  )
}
