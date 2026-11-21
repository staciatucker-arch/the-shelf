// The share card (MIGRATION_PLAN, "Design decisions, 2026-11-08"; settled
// with Stacia 2026-11-21). Pure rules only — no database, no browser — so
// they can be tested.
//
// A share is a piece of text, nothing more: nothing is stored, no table, and
// the friend needs no account. What it may carry is deliberately narrow:
//   - each film's title and year/season
//   - a TMDB link, only for a CONFIRMED match (`tmdb_verified`) — roughly one
//     inherited id in twelve pointed at a different film
//   - the sender's own rating and comment, and other people's, each only
//     when that person's setting says so (person menu; mine on, others off
//     by default — Stacia, 2026-11-21)
//   - never a cover link (`poster_url`), never trigger data, never money
//
// Links are wrapped in <…>, which Discord shows as a plain link with no
// preview card (Stacia, 2026-11-21: "Plain links").
//
// There is no message box (Stacia, after Dana's review, 2026-11-21): pick
// covers, tap Share, and the phone's share menu opens with the text — or it
// is copied where there is no share menu. Editing happens in Discord.

import { displayTitle, displayYear } from './collection.js'
import { starText } from './reviews.js'

/** At most this many films in one share (Stacia, 2026-11-21). */
export const SHARE_MAX = 3

/**
 * The message's first line (Stacia, 2026-11-21): "our shelf" when more than
 * one person shares the household, "my shelf" when only one does; "this
 * title" for one film, "these titles" for more. ⚠ The emoji is a draft.
 */
export function shareHeading(count, householdSize) {
  const whose = householdSize > 1 ? 'our' : 'my'
  const what = count === 1 ? 'this title' : 'these titles'
  return `Check out ${what} from ${whose} shelf! 🎬`
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

/** One film's rating lines: the sender's, and everyone else's by name. */
function ratingLines(film, reviews, names, myId) {
  const forFilm = reviews.filter((r) => r.film_id === film.id)
  const mine = forFilm.find((r) => r.profile_id === myId)
  return {
    mine: mine ? reviewLine(names.get(myId) ?? 'Me', mine) : null,
    others: forFilm
      .filter((r) => r.profile_id !== myId)
      .map((r) => ({ name: names.get(r.profile_id) ?? 'Someone', r }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, r }) => reviewLine(name, r))
      .filter(Boolean),
  }
}

/**
 * The message itself.
 *
 *   films          the chosen films, in the order chosen
 *   reviews        film_reviews rows (any films, any people)
 *   profiles       [{ id, display_name }] — the household
 *   myId           the sender
 *   includeMine    the sender's setting for their own rating
 *   includeOthers  the sender's setting for everyone else's
 */
export function shareMessage({ films = [], reviews = [], profiles = [], myId, includeMine = true, includeOthers = false }) {
  const names = new Map(profiles.map((p) => [p.id, p.display_name]))
  const lines = [shareHeading(films.length, profiles.length)]

  for (const film of films) {
    lines.push('')
    lines.push(filmLine(film))
    const rated = ratingLines(film, reviews, names, myId)
    if (includeMine && rated.mine) lines.push(rated.mine)
    if (includeOthers) lines.push(...rated.others)
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

// ------------------------------------------------------------ the two settings
// Whose ratings go in, remembered per person on each phone — a display
// preference, like the money line's open/closed, so the browser keeps it.
// A browser that refuses storage gets the defaults.

export const SHARE_DEFAULTS = { includeMine: true, includeOthers: false }

function settingsKey(userId) {
  return `shelf.share.${userId}`
}

export function readShareSettings(storage, userId) {
  try {
    const raw = JSON.parse(storage.getItem(settingsKey(userId)) ?? 'null')
    return {
      includeMine: typeof raw?.includeMine === 'boolean' ? raw.includeMine : SHARE_DEFAULTS.includeMine,
      includeOthers: typeof raw?.includeOthers === 'boolean' ? raw.includeOthers : SHARE_DEFAULTS.includeOthers,
    }
  } catch {
    return { ...SHARE_DEFAULTS }
  }
}

export function saveShareSettings(storage, userId, settings) {
  try {
    storage.setItem(settingsKey(userId), JSON.stringify(settings))
  } catch {
    // Not remembered on this phone; the defaults come back next time.
  }
}
