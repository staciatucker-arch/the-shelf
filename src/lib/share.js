// The share card (MIGRATION_PLAN, "Design decisions, 2026-11-08"; settled
// with Stacia 2026-11-21). Pure rules only — no database, no browser — so
// they can be tested.
//
// A share is a piece of text, nothing more: nothing is stored, no table, and
// the friend needs no account. What it may carry is deliberately narrow:
//   - each film's title and year/season
//   - a TMDB link, only for a CONFIRMED match (`tmdb_verified`) — roughly one
//     inherited id in twelve pointed at a different film
//   - the sender's own rating and comment; other people's only when the
//     sender ticks the box (Stacia: "With tick box")
//   - never a cover link (`poster_url`), never trigger data, never money
//
// Links are wrapped in <…>, which Discord shows as a plain link with no
// preview card (Stacia, 2026-11-21: "Plain links").

import { displayTitle, displayYear, searchText } from './collection.js'
import { starText } from './reviews.js'

/** At most this many films in one share (Stacia, 2026-11-21). */
export const SHARE_MAX = 3

/** Discord refuses a message longer than this. */
export const DISCORD_LIMIT = 2000

// ⚠ The two headings are Stacia's (2026-11-08); the emoji are a draft.
export const SHARE_KINDS = [
  { id: 'movie-night', label: 'Movie night?', heading: 'Movie night? 🍿' },
  { id: 'recommend', label: 'We recommend', heading: 'We recommend 🎬' },
]

export function shareKind(id) {
  return SHARE_KINDS.find((k) => k.id === id) ?? SHARE_KINDS[0]
}

/**
 * The film's TMDB page, or null. Only for a confirmed match, and the list
 * (movie / tv) is read from `tmdb_kind`, never guessed from Type (review A2).
 * A TV season links to that season's page.
 */
export function tmdbLink(film) {
  if (!film?.tmdb_verified) return null
  const id = Number(film.tmdb_id)
  if (!Number.isInteger(id) || id <= 0) return null
  if (film.tmdb_kind === 'movie') return `https://www.themoviedb.org/movie/${id}`
  if (film.tmdb_kind === 'tv') {
    const raw = film.season_number
    const season = raw == null || raw === '' ? NaN : Number(raw)
    return Number.isInteger(season) && season >= 0
      ? `https://www.themoviedb.org/tv/${id}/season/${season}`
      : `https://www.themoviedb.org/tv/${id}`
  }
  return null
}

/** "Alien (1979)" — the title line, with year or season when known. */
export function filmLine(film) {
  const title = displayTitle(film?.title)
  const year = displayYear(film)
  return year ? `${title} (${year})` : title
}

/** A comment on one line: a chat message is no place for blank lines. */
function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

/** "nanoedith ★★★★☆ “Still terrifying.”" — or null with nothing to say. */
export function reviewLine(name, review) {
  const stars = starText(review?.rating)
  const comment = oneLine(review?.comment)
  if (!stars && !comment) return null
  const parts = [name]
  if (stars) parts.push(stars)
  if (comment) parts.push(`“${comment}”`)
  return stars ? parts.join(' ') : `${name}: “${comment}”`
}

/**
 * Add a film to the chosen list: no repeats, never more than SHARE_MAX,
 * shelf films only (wishes have no `id` in `films`; the caller passes films).
 */
export function addToShare(chosen, film) {
  if (!film || chosen.some((f) => f.id === film.id)) return chosen
  if (chosen.length >= SHARE_MAX) return chosen
  return [...chosen, film]
}

/**
 * The message itself.
 *
 *   kind           'movie-night' | 'recommend'
 *   note           free text from the sender, may be blank
 *   films          the chosen films, in the order chosen
 *   reviews        film_reviews rows for those films (any people)
 *   profiles       [{ id, display_name }]
 *   myId           the sender
 *   includeOthers  the tick box
 */
export function shareMessage({ kind, note = '', films = [], reviews = [], profiles = [], myId, includeOthers = false }) {
  const names = new Map(profiles.map((p) => [p.id, p.display_name]))
  const lines = [shareKind(kind).heading]
  const cleanNote = String(note ?? '').trim()
  if (cleanNote) lines.push(cleanNote)

  for (const film of films) {
    lines.push('')
    lines.push(filmLine(film))

    const forFilm = reviews.filter((r) => r.film_id === film.id)
    const mine = forFilm.find((r) => r.profile_id === myId)
    const mineLine = mine ? reviewLine(names.get(myId) ?? 'Me', mine) : null
    if (mineLine) lines.push(mineLine)

    if (includeOthers) {
      forFilm
        .filter((r) => r.profile_id !== myId)
        .map((r) => ({ name: names.get(r.profile_id) ?? 'Someone', r }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(({ name, r }) => {
          const line = reviewLine(name, r)
          if (line) lines.push(line)
        })
    }

    const link = tmdbLink(film)
    if (link) lines.push(`<${link}>`)
  }

  return lines.join('\n')
}

/** The other people in the household, for the tick box's wording. */
export function otherNames(profiles, myId) {
  return profiles
    .filter((p) => p.id !== myId)
    .map((p) => p.display_name)
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Films for the picker: a title search over the shelf (box-set contents
 * included, like the main search), leaving out ones already chosen.
 */
export function shareCandidates(films, query, chosen, { max = 8 } = {}) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (!needle) return []
  const taken = new Set(chosen.map((f) => f.id))
  return films
    .filter((f) => !taken.has(f.id) && searchText(f).includes(needle))
    .slice(0, max)
}
