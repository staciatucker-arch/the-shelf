import { useEffect, useRef } from 'react'
import StatsBar from './StatsBar.jsx'

/**
 * What the person icon opens (Stacia, 2026-11-14): who is signed in, the
 * money line, and Sign out. Trigger-warning settings will live here too once
 * step 9 is built — they are each person's own.
 *
 * Closes on a tap outside it or Escape.
 */
export default function UserMenu({ email, stats, onSignOut, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function onPointer(e) {
      // The icon that opened it toggles it itself; ignore taps on it here.
      if (e.target.closest?.('.user-button')) return
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="user-menu" ref={ref} role="dialog" aria-label="Account">
      <p className="muted user-email">{email}</p>
      {stats && <StatsBar stats={stats} />}
      <button type="button" className="ghost" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  )
}
