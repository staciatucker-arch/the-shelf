// Ratings and comments: one review per person per film (Stacia, 2026-11-08).
//
// Pure rules only — no database here, so they can be tested. The table is
// `film_reviews` (migration 20261108120000): rating 1–5 or null, comment or
// null, never both null. A film nobody rated has no rows at all, and that
// shows as "not rated", never as zero stars.

export const STARS = 5
// Same limit as the database's check, so the app refuses before it asks.
export const COMMENT_MAX = 2000

/** A rating as the database stores it: a whole number 1–5, or null. */
export function cleanRating(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= STARS ? n : null
}

/** A comment as the database stores it: trimmed text, or null if empty. */
export function cleanComment(value) {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

/** What a person has typed and tapped, in the shape the table holds. */
export function cleanDraft(draft) {
  return { rating: cleanRating(draft?.rating), comment: cleanComment(draft?.comment) }
}

/** True when the draft says something different from what is saved. */
export function draftChanged(saved, draft) {
  const a = cleanDraft(saved ?? {})
  const b = cleanDraft(draft)
  return a.rating !== b.rating || a.comment !== b.comment
}

/**
 * What saving this draft means:
 *   'none'    — nothing to do (unchanged, or empty with nothing saved)
 *   'delete'  — both cleared, so the person's one row goes
 *   'save'    — write the person's one row (insert or update)
 *   'too-long' — refused before asking the database
 */
export function reviewAction(saved, draft) {
  const raw = String(draft?.comment ?? '').trim()
  if (raw.length > COMMENT_MAX) return 'too-long'
  if (!draftChanged(saved, draft)) return 'none'
  const { rating, comment } = cleanDraft(draft)
  if (rating == null && comment == null) return saved ? 'delete' : 'none'
  return 'save'
}

/**
 * The reviews to list under a film, with each person's name: yours first,
 * then everyone else by name. Your own is left out — it is the form above.
 */
export function othersReviews(reviews, profiles, myId) {
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]))
  return (reviews ?? [])
    .filter((r) => r.profile_id !== myId)
    .map((r) => ({ ...r, name: names.get(r.profile_id) ?? 'Someone' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** People who have not reviewed this film, for a "not rated yet" line. */
export function notYetRated(reviews, profiles, myId) {
  const done = new Set((reviews ?? []).map((r) => r.profile_id))
  return (profiles ?? [])
    .filter((p) => p.id !== myId && !done.has(p.id))
    .map((p) => p.display_name)
    .sort((a, b) => a.localeCompare(b))
}

/** "★★★★☆" — for reading a rating aloud in text (and, later, a share card). */
export function starText(rating) {
  const n = cleanRating(rating)
  if (n == null) return ''
  return '★'.repeat(n) + '☆'.repeat(STARS - n)
}
