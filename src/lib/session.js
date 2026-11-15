// Who is signed in — and when that has actually changed.
// Written 2026-11-15, from the architecture review of that date (bug A1).
//
// The login library hands the app a session through `onAuthStateChange`. It
// does so on sign-in and sign-out, but ALSO every time the page comes back
// into view (it re-reads the stored session and announces SIGNED_IN again),
// and about once an hour when it renews the login token. Each time the
// session is a brand-new object, even though the same person is signed in.
//
// App.jsx used to store whatever it was handed. React saw a new object, so
// everything that loads "when the session changes" — the films, the
// wishlist, the pick lists — reloaded on every return to the app, with a
// form open or not. That bypassed every rule in refresh.js, could blank the
// shelf (and the form over it) on a moment of bad signal, and could feed an
// open edit form a newer row than the one it was opened on.
//
// The rule now: the stored session only changes when the PERSON changes.
// The library keeps the fresh token itself; the app never reads it.

/** The signed-in person's id, or null. */
export function userIdOf(session) {
  return session?.user?.id ?? null
}

/**
 * The session to keep in state when the library announces `next`.
 *
 * Same person as before: the object already held, so nothing re-renders and
 * nothing reloads. Somebody else, or nobody: the new one.
 */
export function keepSession(current, next) {
  const before = userIdOf(current)
  const after = userIdOf(next)
  if (before !== null && before === after) return current
  return next ?? null
}
