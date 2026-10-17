import { useEffect, useRef, useState } from 'react'
import { lockScroll } from '../lib/scrollLock.js'
import { linkHost, safeLink, sortWishes } from '../lib/wishlist.js'
import { useBackToClose } from './useBackToClose.js'

/**
 * One wish as a row. Shared by the wishlist panel and the search results.
 *
 * Remove is on the row itself (Stacia, 2026-10-11: "a wish has its own Remove
 * button — where View in Wishlist lands"), and asks once before it acts. It
 * waits for the database, and says so if the delete was refused.
 */
export function WishRow({ wish, highlighted = false, onEdit, onRemove, onMove }) {
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState(null)
  const ref = useRef(null)
  const link = safeLink(wish.buy_url)

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center' })
  }, [highlighted])

  return (
    <li ref={ref} className={`wish-row${highlighted ? ' is-highlighted' : ''}`}>
      <div className="wish-main">
        <button type="button" className="wish-title" onClick={onEdit}>
          {wish.title}
          {wish.release_year ? <span className="muted"> ({wish.release_year})</span> : null}
        </button>
        <p className="wish-meta muted">
          {[wish.type, (wish.genres ?? []).join(', ')].filter(Boolean).join(' · ')}
        </p>
        {wish.note && <p className="wish-note">{wish.note}</p>}
        {link && (
          <a className="wish-link" href={link} target="_blank" rel="noopener noreferrer">
            {linkHost(link) || 'Link'} ↗
          </a>
        )}
        {error && (
          <p className="error" role="alert">
            Could not remove: {error}
          </p>
        )}
      </div>
      <div className="wish-actions">
        {asking ? (
          <>
            <button type="button" className="ghost form-action" onClick={() => setAsking(false)} disabled={removing}>
              Keep
            </button>
            <button
              type="button"
              className="danger form-action"
              disabled={removing}
              onClick={async () => {
                setError(null)
                setRemoving(true)
                const result = await onRemove()
                setRemoving(false)
                if (result?.error) setError(result.error)
              }}
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </>
        ) : (
          <>
            {/* Stacia's wording, 2026-10-17. Opens Add film already filled
                in from this wish; nothing moves until that save. */}
            {onMove && (
              <button type="button" className="form-action" onClick={onMove}>
                Move to my Shelf
              </button>
            )}
            <button type="button" className="ghost form-action" onClick={() => setAsking(true)}>
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  )
}

/**
 * The whole wishlist, in a panel over the shelf.
 *
 * `hidden` while a wish form is open over it: kept mounted rather than
 * rebuilt, for the same reason as the film details (see panelBack.js).
 */
export default function WishlistPanel({
  wishes, loadError, focusId, hidden = false,
  onClose, onAdd, onEdit, onRemove, onMove,
}) {
  useBackToClose(onClose, { id: 'wishlist' })
  const latestOnClose = useRef(onClose)
  latestOnClose.current = onClose

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !hidden) latestOnClose.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const releaseScroll = lockScroll()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      releaseScroll()
    }
  }, [hidden])

  const sorted = sortWishes(wishes ?? [])

  // ⚠ Placeholder wording throughout — Stacia's to choose.
  return (
    <div
      className={`detail-overlay${hidden ? ' is-hidden' : ''}`}
      aria-hidden={hidden || undefined}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Wishlist"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-head">
          <h2 className="detail-title">Wishlist</h2>
          <div className="detail-head-actions">
            <button type="button" className="form-action" onClick={onAdd}>
              Add a wish
            </button>
            <button type="button" className="detail-close" onClick={onClose}>
              <span aria-hidden="true">×</span>
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>

        <div className="detail-body wish-body">
          {loadError && (
            <p className="error" role="alert">
              Could not load the wishlist: {loadError}
            </p>
          )}
          {!loadError && wishes && sorted.length === 0 && (
            <p className="muted">Nothing on the wishlist yet.</p>
          )}
          {!loadError && !wishes && <p className="muted">Loading the wishlist…</p>}
          {sorted.length > 0 && (
            <ul className="wish-list">
              {sorted.map((wish) => (
                <WishRow
                  key={wish.id}
                  wish={wish}
                  highlighted={wish.id === focusId}
                  onEdit={() => onEdit(wish.id)}
                  onRemove={() => onRemove(wish.id)}
                  onMove={() => onMove(wish.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
