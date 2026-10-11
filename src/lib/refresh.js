// When to fetch the collection again without being asked.
// Written 2026-10-11 — the last unbuilt half of cut C4 ("the app refetches on
// focus") and the review's "no refetch on focus" finding of 2026-09-18.
//
// Until now the collection was loaded once per sign-in. An installed app left
// open on a phone showed the same rows for days, so an edit made on one
// person's phone never reached the other's screen.
//
// The rule is deliberately timid, because a refresh replaces the list every
// open panel is reading from:
//
//   * Only when the app comes back into view — never on a timer.
//   * Never while a panel is open. The edit form holds typing that a new list
//     must not disturb; the detail panel owns a history entry (panelBack.js)
//     that must not be orphaned by its film vanishing underneath it. The
//     refresh waits and runs when the last panel closes.
//   * Not if the list is only seconds old. Taking a cover photo, or glancing
//     at a message, hides and re-shows the page; that is not a reason to ask
//     the database again.
//
// A refresh only ever READS. It cannot weaken the core invariant; what it
// must not do is replace a row somebody just saved with an older copy of it,
// which is what `isStale` below is for.

/** A list younger than this is not refreshed on return. */
export const MIN_REFRESH_GAP_MS = 30_000

/**
 * What to do about a refresh that became due when the app came back.
 *
 *   'idle'    — nothing is due
 *   'wait'    — due, but a panel is open; ask again when it closes
 *   'drop'    — due, but pointless: nothing is loaded yet (the first load, or
 *               its error and Try again button, own the screen), or the list
 *               is fresh enough
 *   'refresh' — fetch now
 */
export function refreshDecision({ due, loaded, panelOpen, lastLoadedAt, now, minGap = MIN_REFRESH_GAP_MS }) {
  if (!due) return 'idle'
  if (!loaded) return 'drop'
  if (panelOpen) return 'wait'
  if (now - lastLoadedAt < minGap) return 'drop'
  return 'refresh'
}

/**
 * True when a fetched list must be thrown away rather than shown.
 *
 * A save, an add or a delete bumps a counter when it starts and again when
 * the database answers. A refresh notes the counter as it sets off; if the
 * counter has moved by the time the list arrives, a write overlapped the read
 * and the list may predate it. Showing it would put the old row back on
 * screen — the write would be safe in the database and invisible in the app,
 * which is the one thing a person cannot tell apart from a lost save.
 */
export function isStale(countAtStart, countNow) {
  return countAtStart !== countNow
}
