// Making the phone's back gesture close the open panel instead of leaving
// the app. Asked for by Stacia on 2026-09-20: "I instinctually click the back
// arrow, then I am kicked out of the app" — the film's view panel has an X in
// the corner, and Android's back arrow sits a few millimetres below it.
//
// The idea is small: a panel that opens adds one entry to the browser's
// history, so back returns to the entry underneath instead of leaving the
// page. The app hears that and closes the panel. Back from the collection
// itself still leaves, which is what a person expects.
//
// Everything hard about this is bookkeeping, and it is all here so that no
// component has to think about it:
//
//   whose back is it   Closing a panel with its X or Cancel has to remove the
//                      entry that panel added, or the history fills with dead
//                      steps and back appears to do nothing. That removal is
//                      itself a history navigation, which fires the same
//                      event as a real back press — so it is counted and
//                      ignored, or closing one panel would close the one
//                      underneath it too.
//   which panel        Panels stack: a film's details, the edit form over it,
//                      the crop screen over that. Back closes the top one
//                      only, so it unwinds in the order they were opened.
//   several at once    Deleting a film closes the form and the details
//                      together. The steps are batched into one history move
//                      rather than two racing ones.
//   one replacing      Pressing Edit closes the film's details and opens the
//   another            form in the same instant. Because the removal is
//                      batched to the end of the tick and the arrival is not,
//                      the two cancel out: one entry is added, one is taken
//                      away, and the depth of the history matches the number
//                      of panels actually open. This is what the
//                      "replacing one panel with another" test pins down.
//
// The browser is injected, so all of this is tested without one.

/**
 * A back-closes-the-panel coordinator over some history-like object.
 *
 * `history` needs `pushState` and `go`; `subscribe(handler)` should call
 * `handler` on popstate and return an unsubscribe function.
 */
export function createPanelBack(history, subscribe) {
  const stack = []
  // Our own history.go() fires the same event a person's back press does.
  // Each step we ask for is counted here and skipped when it arrives.
  let ignoring = 0
  let pendingSteps = 0
  let unsubscribe = null

  function handlePop() {
    if (ignoring > 0) {
      ignoring -= 1
      return
    }
    const top = stack.pop()
    if (!top) return
    // Marked first: the close below unmounts the panel, which calls back into
    // `close`, and that must not ask the browser to go back a second time.
    top.viaBack = true
    // A panel mid-save refuses to close, exactly as its Cancel button does.
    // Its entry is put back, so the press is ignored rather than spending the
    // guard — otherwise the next press would leave the app while a save was
    // in flight.
    if (top.close() === false) {
      top.viaBack = false
      stack.push(top)
      history.pushState({ shelfPanel: top.id }, '')
      return
    }
    if (stack.length === 0) stop()
  }

  function start() {
    if (!unsubscribe) unsubscribe = subscribe(handlePop)
  }

  function stop() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  function flush() {
    if (pendingSteps === 0) return
    const steps = pendingSteps
    pendingSteps = 0
    ignoring += steps
    history.go(-steps)
    if (stack.length === 0) stop()
  }

  return {
    /** A panel has opened. Returns the entry to hand back to `close`. */
    open(close, { id = 'panel' } = {}) {
      const entry = { id, close, viaBack: false }
      start()
      stack.push(entry)
      history.pushState({ shelfPanel: id }, '')
      return entry
    },

    /**
     * A panel has closed. Removes its history entry unless the close came
     * from a back press, in which case the browser has already done it.
     */
    close(entry, { flushNow = false } = {}) {
      if (!entry) return
      const i = stack.lastIndexOf(entry)
      if (i !== -1) stack.splice(i, 1)
      if (!entry.viaBack) {
        pendingSteps += 1
        // Batched to the end of the tick: closing two panels at once should
        // be one history move, not two that race.
        if (flushNow) flush()
        else queueMicrotask(flush)
      }
      if (stack.length === 0 && pendingSteps === 0) stop()
    },

    /** For tests and diagnostics only. */
    depth: () => stack.length,
    flush,
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
