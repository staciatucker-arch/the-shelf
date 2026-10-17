/**
 * One page-scroll lock shared by every panel that sits over the shelf.
 *
 * Each panel used to save `body.style.overflow` when it opened and put that
 * value back when it closed. With two open at once — the details panel and
 * the edit form over it — the form saved "hidden", the panel's own value.
 * Deleting a film closes both together; the panel restored "" and then the
 * form restored "hidden", so the shelf was left unable to scroll with nothing
 * open over it (found on a phone, 2026-10-17).
 *
 * So the lock is counted instead: the first holder saves the page's own value
 * and the last one to let go restores it, whatever order they close in.
 *
 * Returns the release function. Releasing twice is harmless.
 */
export function createScrollLock(style) {
  let holders = 0
  let saved = ''
  return function lock() {
    if (holders === 0) {
      saved = style.overflow
      style.overflow = 'hidden'
    }
    holders += 1
    let released = false
    return function release() {
      if (released) return
      released = true
      holders -= 1
      if (holders === 0) style.overflow = saved
    }
  }
}

let shared = null

/** Lock page scrolling for as long as the caller holds the returned release. */
export function lockScroll() {
  shared ??= createScrollLock(document.body.style)
  return shared()
}
