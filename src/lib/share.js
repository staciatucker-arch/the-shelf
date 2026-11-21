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

import { displayTitle, displayYear } from './collection.js'
import { starText } from './reviews.js'

/** At most this many films in one share (Stacia, 2026-11-21). */
export const SHARE_MAX = 3

/** Discord refuses a message longer than this. */
export const DISCORD_LIMIT = 2000

// The two button labels and the "Check out…" headings are Stacia's
// ("Movie night?" 2026-11-08; "Check this out." and its headings
// 2026-11-21). ⚠ The emoji are a draft.
export const SHARE_KINDS = [
  { id: 'movie-night', label: 'Movie night?', heading: () => 'Movie night? 🍿' },
  {
    id: 'recommend',
    label: 'Check this out.',
    heading: (count) =>
      count === 1
        ? 'Check out this title from my collection! 🎬'
        : 'Check out these titles from my collection! 🎬',
  },
]

export function shareKind(id) {
  return SHARE_KINDS.find((k) => k.id === id) ?? SHARE_KINDS[0]
}

/** The message's first line for this kind and number of films. */
export function shareHeading(kind, count) {
  return shareKind(kind).heading(count)
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
 * Tap a cover in select mode: picked → unpicked, or added at the end.
 * Returns { picks, full } — full is true when the tap was refused because
 * SHARE_MAX are already picked, so the screen can say so rather than
 * silently ignore it (Dana, 2026-11-21).
 */
export function togglePick(picks, id) {
  if (picks.includes(id)) return { picks: picks.filter((p) => p !== id), full: false }
  if (picks.length >= SHARE_MAX) return { picks, full: true }
  return { picks: [...picks, id], full: false }
}

/** The picked films, in the order picked, skipping any deleted meanwhile. */
export function pickedFilms(picks, films) {
  const byId = new Map(films.map((f) => [f.id, f]))
  return picks.map((id) => byId.get(id)).filter(Boolean)
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
  const lines = [shareHeading(kind, films.length)]
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

// ---------------------------------------------------------------- edit in place
// The message box can be edited freely, and the switch and tick box change
// only their own lines (Stacia, 2026-11-21: no "replace your changes?"
// question). Each looks for the exact line it wrote; if the person has
// changed or deleted that line, it is left alone — a switch never rewrites
// what someone typed.

/**
 * Swap the heading for another kind's. The old heading is replaced wherever
 * it starts a line, keeping anything typed after it on that line ("Movie
 * night? 🍿 Friday at ours?"). Not found → the text is returned unchanged.
 */
export function switchHeading(text, fromKind, toKind, count) {
  const from = shareHeading(fromKind, count)
  const to = shareHeading(toKind, count)
  const lines = String(text).split('\n')
  const i = lines.findIndex((line) => line.startsWith(from))
  if (i === -1) return text
  lines[i] = to + lines[i].slice(from.length)
  return lines.join('\n')
}

/**
 * Add or remove the other people's rating lines, film by film. Each film is
 * found by its title line; additions go after the sender's own line if it is
 * still there, else straight under the title; removals take out only lines
 * that match exactly, within that film's block (up to the next blank line).
 */
export function setOthersInText(text, { films, reviews, profiles, myId, include }) {
  const names = new Map(profiles.map((p) => [p.id, p.display_name]))
  const lines = String(text).split('\n')
  let from = 0

  for (const film of films) {
    const title = filmLine(film)
    const at = lines.indexOf(title, from)
    if (at === -1) continue
    from = at + 1

    const forFilm = reviews.filter((r) => r.film_id === film.id)
    const mine = forFilm.find((r) => r.profile_id === myId)
    const mineLine = mine ? reviewLine(names.get(myId) ?? 'Me', mine) : null
    const otherLines = forFilm
      .filter((r) => r.profile_id !== myId)
      .map((r) => ({ name: names.get(r.profile_id) ?? 'Someone', r }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, r }) => reviewLine(name, r))
      .filter(Boolean)

    let end = at + 1
    while (end < lines.length && lines[end].trim() !== '') end += 1
    const block = lines.slice(at + 1, end)

    if (include) {
      const missing = otherLines.filter((l) => !block.includes(l))
      if (!missing.length) continue
      const pos = lines[at + 1] === mineLine ? at + 2 : at + 1
      lines.splice(pos, 0, ...missing)
    } else {
      const kept = block.filter((l) => !otherLines.includes(l))
      lines.splice(at + 1, block.length, ...kept)
    }
  }
  return lines.join('\n')
}
