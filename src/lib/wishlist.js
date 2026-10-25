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
export function validateWish(form, { requireType = false } = {}) {
  const errors = {}
  // Required when adding (Stacia, 2026-10-25), as for a film.
  if (requireType && String(form.type ?? '').trim() === '') errors.type = 'Choose what it is.'
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

// ---------------------------------------------------------------- wish covers

/*
 * A wish shows TMDB's poster (Stacia, 2026-10-18). Covers on the shelf are
 * scans and uploads only, and a wish has no case to scan, so this is the one
 * place TMDB art appears — and it is never saved: fetched while the app is
 * open, held in memory, never written to the database or the bucket, and not
 * kept by the service worker (cacheRules.js keeps only our own covers). When
 * a wish moves to the shelf the film starts with no cover; see
 * filmStartFromWish below.
 *
 * Only a confirmed match gets one. An id nobody checked could be any film,
 * and a wrong picture is worse than none.
 */

/** The key a wish's poster is looked up under, or null if it has none. */
export function wishPosterKey(wish) {
  if (!wish?.tmdb_verified || wish.tmdb_id == null) return null
  return `${tmdbKind(wish.type)}:${Number(wish.tmdb_id)}`
}

/**
 * The look-ups still needed for these wishes, one per record, skipping keys
 * already in `known` (fetched, or being fetched). Shaped for tmdb-search's
 * `batch` action, with the key as `ref` so the answers can be matched back.
 */
export function wishPosterRequests(wishes, known = new Set()) {
  const seen = new Set(known)
  const items = []
  for (const wish of wishes ?? []) {
    const key = wishPosterKey(wish)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const kind = tmdbKind(wish.type)
    items.push({ ref: key, tmdb_id: Number(wish.tmdb_id), type: kind === 'tv' ? 'series' : 'movie' })
  }
  return items
}

/**
 * Poster addresses from a batch answer, by key. A record TMDB no longer has,
 * or one found only in the other catalogue (so a different title), gets null:
 * no picture. A failed item is left out, so it is asked again next time.
 */
export function postersFromBatch(results) {
  const out = {}
  for (const r of results ?? []) {
    if (!r?.ref || r.error) continue
    // Only TMDB's own image server: this address goes straight into an <img>.
    const url = typeof r.poster_url === 'string' && r.poster_url.startsWith('https://image.tmdb.org/')
      ? r.poster_url
      : null
    out[r.ref] = r.found && !r.wrong_namespace ? url : null
  }
  return out
}

// ---------------------------------------------------------------- moving a wish to the shelf

/**
 * Where the Add film form starts when a wish is moved to the shelf
 * ("Move to my Shelf", Stacia's wording, 2026-10-17).
 *
 * Carries what the wish already knows — title, type, year, genres and a
 * confirmed match — so nothing is retyped or matched twice. Everything about
 * the copy in hand (cover, format, price) is still the person's to add, at
 * home, which is why this opens the form rather than moving anything itself.
 * An unconfirmed wish starts unmatched: an id nobody checked is not a match.
 * It never carries a cover: the TMDB poster a wish shows is not the film's
 * cover (Stacia, 2026-10-18), so the film starts blank until a scan.
 */
export function filmStartFromWish(wish) {
  const confirmed = Boolean(wish?.tmdb_verified && wish.tmdb_id != null)
  return {
    form: {
      title: wish?.title ?? '',
      type: wish?.type ?? '',
      release_year: wish?.release_year == null ? '' : String(wish.release_year),
      genres: [...(wish?.genres ?? [])],
    },
    match: confirmed
      ? {
          tmdb_id: Number(wish.tmdb_id),
          kind: tmdbKind(wish.type),
          title: wish.title,
          year: wish.release_year ?? null,
        }
      : null,
  }
}

/**
 * The wish to offer after a film is added, or null.
 *
 * As `wishMatchesForFilm`, with one addition: when the film was started from
 * a particular wish, that wish is the one — the person chose it — so it is
 * offered with Remove even if the title was edited or it was never matched.
 */
export function wishOfferAfterAdd(film, wishes, fromWishId = null) {
  if (fromWishId) {
    const origin = (wishes ?? []).find((w) => w.id === fromWishId)
    if (origin) return { wish: origin, sameFilm: true }
  }
  return wishMatchesForFilm(film, wishes)[0] ?? null
}
