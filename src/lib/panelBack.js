// Making the phone's back gesture close the open panel instead of leaving
// the app. Asked for by Stacia on 2026-09-20: "I instinctually click the back
// arrow, then I am kicked out of the app" — the film's view panel has an X in
// the corner, and Android's back arrow sits a few millimetres below it.
//
// **One rule: one history entry per open panel, and an entry is only ever
// added while a panel is opening — which is always a tap.** Back lands on the
// top entry, the app closes the top panel. Back from the collection itself
// leaves, which is what a person expects.
//
// ⚠ **Why "only while opening" is the whole design.** Chrome on Android marks
// a history entry as *skippable* when a page adds it without a recent user
// gesture, and silently steps over it on the next back press. The version
// before this one closed the form on back and then re-added an entry for the
// film's details underneath — a push caused by a back press, with no tap
// behind it. Chrome skipped it and left the app. Stacia's phone recorded it
// exactly (2026-09-20):
//
//     open:film-detail push shut:film-detail open:film-form POP
//     close:film-form shut:film-form open:film-detail push   ← skippable
//
// and the next press produced no POP at all. So nothing here re-arms. The
// film's details panel now stays mounted behind the edit form (hidden) rather
// than being destroyed and rebuilt, so both panels keep the entry each of
// them got when it was tapped open.
//
// A second trap, hit first: an earlier version queued "add one" and "remove
// one" as deltas, and a panel replacing another put both in flight at once.
// The browser applied them in its own order and the count drifted for the
// life of the page. So `reconcile` never applies deltas. It compares two
// numbers as they are right now — panels open, entries held — and moves one
// step towards agreement. Drift is corrected at the next reconcile rather
// than accumulating.
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
  let held = 0 // how many history entries we believe we are holding
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
    const wanted = stack.length
    if (wanted > held) {
      // Only ever reached while a panel is opening, which is always a tap.
      const adding = wanted - held
      held = wanted
      start()
      for (let i = 0; i < adding; i += 1) history.pushState({ shelfPanel: true }, '')
      note(`push${adding > 1 ? `x${adding}` : ''}`)
    } else if (wanted < held) {
      // Panels closed by their own buttons leave entries behind. Never more
      // than we hold, so this can never step off the start of the history and
      // out of the app.
      const dropping = held - wanted
      held = wanted
      selfMoveUntil = now() + SELF_MOVE_WINDOW_MS
      history.go(-dropping)
      note(`go-${dropping}`)
    }
    if (held === 0 && stack.length === 0) stop()
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
    // The browser has consumed one of our entries, whatever happens next.
    held = Math.max(0, held - 1)
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
    held: () => held,
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
