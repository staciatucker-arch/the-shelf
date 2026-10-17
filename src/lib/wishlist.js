// Pure rules for the wishlist — no React, no Supabase, no DOM.
//
// Designed with Stacia on 2026-10-11 (HANDOFF, "design review: wishlist and
// the in-store check"). What matters most here:
//
//   * One search answers "on your shelf" and "on your wishlist" together,
//     because in a shop the question is both at once.
//   * Adding a wish uses the same "is this the one?" TMDB step as a film.
//   * "I Bought It" is gone. Instead, after a film is SAVED to the shelf, the
//     app looks for the same film on the wishlist and offers to remove it.
//     Nothing ever leaves the wishlist without a person tapping, and a match
//     on the title alone is offered as "view" only — one tap must not be able
//     to remove a same-named different film.

import { titleSortKey } from './collection.js'

/** Every column the app reads from `wishlist`. Listed, never select('*'). */
export const WISH_COLUMNS = [
  'id',
  'title',
  'type',
  'release_year',
  'genres',
  'note',
  'buy_url',
  'tmdb_id',
  'tmdb_verified',
  'created_at',
].join(',')

/** TMDB keeps films and television in separate id namespaces. */
export function tmdbKind(type) {
  return String(type ?? '').trim().toLowerCase() === 'series' ? 'tv' : 'movie'
}

export function normaliseWish(row) {
  return { ...row, genres: row.genres ?? [] }
}

/** Wishes whose title contains the search, in title order. */
export function searchWishes(wishes, query) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (needle === '') return []
  return sortWishes(
    (wishes ?? []).filter((w) => String(w.title).toLowerCase().includes(needle)),
  )
}

/** Title order, ignoring a leading article — the same rule as the shelf. */
export function sortWishes(wishes) {
  return [...(wishes ?? [])].sort((a, b) =>
    titleSortKey(a.title).localeCompare(titleSortKey(b.title)),
  )
}

/**
 * The wishes that a film just added to the shelf might be.
 *
 * Returns `[{ wish, sameFilm }]`, same-film matches first.
 *
 *   sameFilm: true   both were confirmed against TMDB and name the same
 *                    record in the same catalogue. Safe to offer "Remove".
 *   sameFilm: false  the titles read the same and nothing more is known.
 *                    "The Thing" (1982) and "The Thing" (2011) land here,
 *                    which is exactly why this case may only offer "View".
 */
export function wishMatchesForFilm(film, wishes) {
  if (!film) return []
  const filmKey = titleSortKey(film.title)
  const filmConfirmed = Boolean(film.tmdb_verified && film.tmdb_id != null)
  const out = []
  for (const wish of wishes ?? []) {
    const sameFilm =
      filmConfirmed &&
      Boolean(wish.tmdb_verified && wish.tmdb_id != null) &&
      Number(wish.tmdb_id) === Number(film.tmdb_id) &&
      tmdbKind(wish.type) === tmdbKind(film.type)
    if (sameFilm) out.push({ wish, sameFilm: true })
    else if (filmKey !== '' && titleSortKey(wish.title) === filmKey) {
      out.push({ wish, sameFilm: false })
    }
  }
  return out.sort((a, b) => Number(b.sameFilm) - Number(a.sameFilm))
}

/**
 * A buy link as something safe to put in an href, or null.
 *
 * Only http and https. Anything else — `javascript:` above all — would run
 * when tapped, and this text is typed by a person, not checked by anyone. A
 * link pasted without its scheme ("amazon.com/…") is the common case on a
 * phone, so it is read as https rather than refused.
 */
export function safeLink(text) {
  const raw = String(text ?? '').trim()
  if (raw === '') return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  let url
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname.includes('.')) return null
  return url.href
}

/** The host of a link, for showing where it goes without the whole address. */
export function linkHost(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------- the form

export function blankWish({ title = '' } = {}) {
  return { title, type: '', release_year: '', genres: [], note: '', buy_url: '' }
}

export function wishToForm(wish) {
  return {
    title: wish.title ?? '',
    type: wish.type ?? '',
    release_year: wish.release_year == null ? '' : String(wish.release_year),
    genres: [...(wish.genres ?? [])],
    note: wish.note ?? '',
    buy_url: wish.buy_url ?? '',
  }
}

/** Field errors, by field. Empty when the wish can be saved. */
export function validateWish(form) {
  const errors = {}
  if (String(form.title ?? '').trim() === '') errors.title = 'A wish needs a title.'
  const year = String(form.release_year ?? '').trim()
  if (year !== '' && !/^\d{4}$/.test(year)) errors.release_year = 'A year is four digits, like 1982.'
  if (String(form.buy_url ?? '').trim() !== '' && !safeLink(form.buy_url)) {
    errors.buy_url = 'That doesn’t look like a web address.'
  }
  return errors
}

/** The form's fields as the columns they are stored in. */
function formColumns(form) {
  const text = (v) => {
    const t = String(v ?? '').trim()
    return t === '' ? null : t
  }
  const year = String(form.release_year ?? '').trim()
  return {
    title: String(form.title ?? '').trim(),
    type: text(form.type),
    release_year: year === '' ? null : Number(year),
    genres: [...(form.genres ?? [])],
    note: text(form.note),
    buy_url: safeLink(form.buy_url),
  }
}

/**
 * The match columns. A confirmed candidate, or null for "no match" — which
 * clears both, so an id is never left behind marked as checked.
 */
function matchColumns(match) {
  return match
    ? { tmdb_id: Number(match.tmdb_id), tmdb_verified: true }
    : { tmdb_id: null, tmdb_verified: false }
}

/** One complete new row, id and all, for a single insert. */
export function newWishRow(form, { id, match = null } = {}) {
  return { id, ...formColumns(form), ...matchColumns(match) }
}

/**
 * Only what changed, or null when nothing did.
 *
 * `matchTouched` says the match was deliberately changed in this session. An
 * untouched match never appears in the patch, so an ordinary edit cannot
 * rewrite what the wish is.
 */
export function wishPatch(wish, form, { match = null, matchTouched = false } = {}) {
  const next = formColumns(form)
  const patch = {}
  for (const [key, value] of Object.entries(next)) {
    const before = wish[key] ?? (key === 'genres' ? [] : null)
    const same = Array.isArray(value)
      ? JSON.stringify(value) === JSON.stringify(before)
      : value === before
    if (!same) patch[key] = value
  }
  if (matchTouched) Object.assign(patch, matchColumns(match))
  return Object.keys(patch).length > 0 ? patch : null
}
