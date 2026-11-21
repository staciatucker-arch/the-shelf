import { SHARE_MAX } from '../lib/share.js'
import { useBackToClose } from './useBackToClose.js'

// ⚠ WORDING IS A DRAFT (2026-11-21) — Stacia writes the UI copy.

/**
 * While picking covers to share, this takes the bottom bar's place (Dana,
 * 2026-11-21): Cancel · "N of 3" · Share, where a thumb already is, and the
 * buttons that would lead somewhere else are gone. Share (Stacia,
 * 2026-11-21, after Dana) sends straight away — no message box.
 *
 * Cancel and the phone's back gesture both leave select mode and throw the
 * picks away (Stacia). Share works from one pick.
 */
export default function ShareSelectBar({ count, message, hidden, busy = false, onCancel, onOk }) {
  useBackToClose(onCancel, { id: 'share-select' })

  return (
    <nav className={'bottom-bar share-select-bar' + (hidden ? ' is-hidden' : '')} aria-label="Choose films to share">
      {message && (
        <p className="share-select-message" role="status">
          {message}
        </p>
      )}
      <button type="button" className="ghost" onClick={onCancel}>
        Cancel
      </button>
      <span className="share-select-count" aria-live="polite">
        {count} of {SHARE_MAX}
      </span>
      <button type="button" className="form-action" onClick={onOk} disabled={count === 0 || busy}>
        Share
      </button>
    </nav>
  )
}
