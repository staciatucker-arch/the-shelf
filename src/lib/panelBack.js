// Making the phone's back gesture close the open panel instead of leaving
// the app. Asked for by Stacia on 2026-09-20: "I instinctually click the back
// arrow, then I am kicked out of the app" — the film's view panel has an X in
// the corner, and Android's back arrow sits a few millimetres below it.
//
// **One rule: while any panel is open, the app holds exactly one history
// entry.** Back lands on it, the app closes the top panel, and if anything is
// still open the entry is put back. Back from the collection itself leaves,
// which is what a person expects.
//
// ⚠ **The first version counted history steps and got it wrong.** It pushed
// one entry per panel and removed them one by one. Opening Edit closes the
// film's details and opens the form in the same instant, so a removal and an
// addition were in flight together; the browser applied them in its own
// order, the count drifted, and on Stacia's phone the third back press left
// the app (2026-09-20 — every unit test had passed).
//
// The fix is not better counting. It is not counting at all: after any
// change, `reconcile` compares two facts — is a panel open, do we hold an
// entry — and makes the second match the first. A replacement becomes a
// non-event, because the answer to "is a panel open" never changes. Drift is
// corrected at the next reconcile instead of accumulating.
//
// The browser is injected, so all of this is tested without one.

/** How long a history move the app made itself may account for a pop. */
const SELF_MOVE_WINDOW_MS = 400

/**
 * A back-closes-the-panel coordinator over some history-like object.
 *
 * `history` needs `pushState` and `go`; `subscribe(handler)` should call
 * `handler` on popstate and return an unsubscribe function.
 */
export function createPanelBack(history, subscribe, { now = () => Date.now() } = {}) {
  const stack = []
  // A short record of what the app did to the history and why, for the
  // ?debug=1 readout at the foot of the collection. Kept because this
  // mechanism is invisible by nature: on a phone there is nothing to inspect
  // and no console to read, and two rounds of guessing cost more than this.
  const debugging =
    typeof window !== 'undefined' && window.location?.search?.includes('debug')
  // Kept in localStorage while debugging, because the failure being chased
  // *ends the app*: without this, the one moment worth reading is gone by the
  // time the page can be reopened.
  const log = (() => {
    if (!debugging) return []
    try {
      return JSON.parse(window.localStorage.getItem('shelf-back-log') || '[]')
    } catch {
      return []
    }
  })()
  const watchers = new Set()
  function note(what) {
    log.push(what)
    if (log.length > 24) log.shift()
    if (debugging) {
      try {
        window.localStorage.setItem('shelf-back-log', JSON.stringify(log))
      } catch {
        // Private windows refuse; the readout still works for this visit.
      }
    }
    watchers.forEach((w) => w(log.join(' ')))
  }
  let armed = false // do we currently hold a history entry?
  let scheduled = false
  let unsubscribe = null
  // When the app itself moves the history, the browser reports it exactly
  // like a person's back press. This is a *window*, not a counter: a counter
  // that never receives its event stays wrong for the life of the page and
  // swallows a real press much later — which is the shape of the bug this
  // file exists to avoid repeating.
  let selfMoveUntil = 0

  function start() {
    if (!unsubscribe) unsubscribe = subscribe(handlePop)
  }

  function stop() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  function reconcile() {
    scheduled = false
    const wanted = stack.length > 0
    if (wanted && !armed) {
      armed = true
      start()
      history.pushState({ shelfPanel: true }, '')
      note('push')
    } else if (!wanted && armed) {
      armed = false
      selfMoveUntil = now() + SELF_MOVE_WINDOW_MS
      history.go(-1)
      note('go-1')
    }
    if (!wanted && !armed) stop()
  }

  // Batched to the end of the tick, so a panel closing and another opening in
  // the same commit are seen together rather than one after the other.
  function schedule() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(reconcile)
  }

  function handlePop() {
    if (now() < selfMoveUntil) {
      selfMoveUntil = 0
      note('pop(ours)')
      return
    }
    note('POP')
    // The browser has consumed our entry, whatever happens next.
    armed = false
    const top = stack[stack.length - 1]
    if (!top) {
      note('(nothing open)')
      schedule()
      return
    }
    // Taken off the stack before closing: closing unmounts the panel, which
    // calls back in here, and reconcile must see the world as it will be.
    stack.pop()
    top.viaBack = true
    // A panel mid-save refuses, exactly as its Cancel button does. Putting it
    // back means the press is ignored rather than spending the guard.
    note(`close:${top.id}`)
    if (top.close() === false) {
      top.viaBack = false
      stack.push(top)
      note('refused')
    }
    schedule()
  }

  return {
    /** A panel has opened. Returns the entry to hand back to `close`. */
    open(close, { id = 'panel' } = {}) {
      const entry = { id, close, viaBack: false }
      stack.push(entry)
      note(`open:${id}`)
      schedule()
      return entry
    },

    /** A panel has closed — by its X, by Cancel, or by being replaced. */
    close(entry) {
      if (!entry) return
      const i = stack.lastIndexOf(entry)
      if (i !== -1) stack.splice(i, 1)
      note(`shut:${entry.id}`)
      schedule()
    },

    /** For tests and diagnostics. */
    depth: () => stack.length,
    isArmed: () => armed,
    flush: reconcile,

    /** Forget the recorded events (the ?debug=1 readout's Clear). */
    clearLog() {
      log.length = 0
      if (debugging) {
        try {
          window.localStorage.removeItem('shelf-back-log')
        } catch {
          /* nothing to do */
        }
      }
      watchers.forEach((w) => w(''))
    },

    /** The ?debug=1 readout: the recorded history events, oldest first. */
    watchLog(cb) {
      watchers.add(cb)
      cb(log.join(' '))
      return () => watchers.delete(cb)
    },
  }
}

function browserSubscribe(handler) {
  window.addEventListener('popstate', handler)
  return () => window.removeEventListener('popstate', handler)
}

/** The one every panel in the app uses. */
export const panelBack =
  typeof window === 'undefined'
    ? createPanelBack({ pushState() {}, go() {} }, () => () => {})
    : createPanelBack(window.history, browserSubscribe)
