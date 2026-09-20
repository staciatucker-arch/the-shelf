import { useEffect, useRef } from 'react'
import { panelBack } from '../lib/panelBack.js'

/**
 * While this panel is open, the phone's back gesture closes it instead of
 * leaving the app. See `panelBack.js` for how, and why it is not as simple as
 * it sounds.
 *
 * Put it in the panel itself rather than in the thing that opens it, so a
 * panel cannot exist without it. `onClose` should be whatever the panel's own
 * X or Cancel does — back is deliberately the same action, not a special one,
 * so there is one way to close and no second code path to keep in step.
 *
 * ⚠ A panel that refuses to close while it is saving should pass `enabled:
 * false` at that moment, exactly as it greys out its own Cancel button.
 */
export function useBackToClose(onClose, { id = 'panel', enabled = true } = {}) {
  // The latest onClose, without re-registering the panel every render: a new
  // history entry per keystroke would be a very strange app to use.
  const latest = useRef(onClose)
  latest.current = onClose

  const blocked = useRef(false)
  blocked.current = !enabled

  useEffect(() => {
    const entry = panelBack.open(() => {
      // false means "I refused": panelBack then puts the history entry back.
      if (blocked.current) return false
      latest.current?.()
      return true
    }, { id })
    return () => panelBack.close(entry)
  }, [id])
}
