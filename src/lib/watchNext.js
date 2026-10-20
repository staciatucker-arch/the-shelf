// Watch Next — one film at a time, drawn at random from the shelf.
//
// Decided with Stacia, 2026-10-11:
//   * one pick at a time, with a spin-again button (a swipe-and-match picker
//     stays parked);
//   * an optional genre filter, as the old app had — several genres since
//     2026-10-20, matching any of them, as the shelf's Genre filter does;
//   * Movies only — no series seasons, no box sets;
//   * purely random, no weighting towards unwatched films;
//   * no repeats within one run of spins;
//   * committing to the pick records today as the last-watched date.

/** The films a draw is made from. */
export function watchNextPool(films, { genres = [] } = {}) {
  const wanted = (genres ?? []).map((g) => String(g ?? '').trim()).filter(Boolean)
  return (films ?? []).filter((film) => {
    if (String(film.type ?? '').trim().toLowerCase() !== 'movie') return false
    if (wanted.length && !(film.genres ?? []).some((g) => wanted.includes(g))) return false
    return true
  })
}

/** Genres that at least one movie on the shelf has, sorted. */
export function watchNextGenres(films) {
  const seen = new Set()
  for (const film of watchNextPool(films)) for (const g of film.genres ?? []) seen.add(g)
  return [...seen].sort((a, b) => a.localeCompare(b))
}

/**
 * One film from the pool that has not been shown in this run, or null when
 * every one has. `random` is injectable so the rule can be tested.
 */
export function drawNext(pool, shownIds, random = Math.random) {
  const shown = new Set(shownIds ?? [])
  const left = (pool ?? []).filter((film) => !shown.has(film.id))
  if (left.length === 0) return null
  const index = Math.min(left.length - 1, Math.floor(random() * left.length))
  return left[index]
}

/**
 * Today as YYYY-MM-DD in the person's own time zone — the date they would
 * write down. `toISOString` is UTC, and in the evening in the Americas that
 * is already tomorrow.
 */
export function todayLocal(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
