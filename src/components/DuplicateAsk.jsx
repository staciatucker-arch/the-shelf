import { useEffect, useRef } from 'react'
import { duplicateLabel } from '../lib/search.js'

/**
 * The question asked when Add is tapped on something that is already there
 * (Stacia, 2026-11-14): "This is a duplicate title. Are you sure you want to
 * add it to your Shelf / Wishlist?" [Go back] [Add anyway].
 *
 * Under the question, what it duplicates and where — so "duplicate" is never
 * an unexplained claim. Go back returns to the form with nothing lost.
 *
 *   where       'Shelf' | 'Wishlist' — where this would be added
 *   onShelf     [{ film, sameFilm }] from shelfDuplicates over the shelf
 *   onWishlist  the same, over the wishlist (the wish form only)
 */
export default function DuplicateAsk({ where, onShelf = [], onWishlist = [], onAdd, onBack }) {
  const backRef = useRef(null)

  useEffect(() => {
    backRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onBack()
      }
    }
    // Capture, so Escape answers this question rather than closing the form.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onBack])

  return (
    <div className="dup-ask-overlay" role="presentation" onClick={onBack}>
      <div
        className="dup-ask"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dup-ask-q"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="dup-ask-q" className="dup-ask-q">
          This is a duplicate title. Are you sure you want to add it to your {where}?
        </p>
        <ul className="dup-ask-list">
          {onShelf.map(({ film, sameFilm }) => (
            <li key={'s' + film.id}>
              {sameFilm ? 'Already on your shelf: ' : 'Looks like a film you have: '}
              {duplicateLabel(film)}
            </li>
          ))}
          {onWishlist.map(({ film: wish }) => (
            <li key={'w' + wish.id}>Already on your wishlist: {duplicateLabel(wish)}</li>
          ))}
        </ul>
        <div className="dup-ask-actions">
          <button type="button" className="ghost form-action" ref={backRef} onClick={onBack}>
            Go back
          </button>
          <button type="button" className="form-action" onClick={onAdd}>
            Add anyway
          </button>
        </div>
      </div>
    </div>
  )
}
