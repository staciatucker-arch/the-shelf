import { displayTitle, displayYear, titleSortKey } from './collection.js'
import { tmdbKind } from './wishlist.js'

/**
 * The one-line answer under the search box (Stacia, 2026-11-14, from Dana's
 * review): on a phone the keyboard hides the covers, so the line that is
 * still visible says what was found.
 *
 *   "On your shelf: Alien (1979) · Wishlist: none"
 *
 * At most `max` names per side, then "+n more", so the line stays short.
 */
export function searchAnswer(shelfHits, wishHits, { max = 2 } = {}) {
  const shelf = `On your shelf: ${names(shelfHits, displayYear, max)}`
  // A wishlist that has not loaded (or failed to) is left out, never "none":
  // unknown is not the same as empty.
  if (wishHits == null) return shelf
  const wished = names(wishHits, (w) => (w?.release_year == null ? '' : String(w.release_year)), max)
  return `${shelf} · Wishlist: ${wished}`
}

function names(items, yearOf, max) {
  const list = items ?? []
  if (list.length === 0) return 'none'
  const named = list.slice(0, max).map((item) => {
    const year = yearOf(item)
    return year ? `${displayTitle(item.title)} (${year})` : displayTitle(item.title)
  })
  const more = list.length - named.length
  return more > 0 ? `${named.join(', ')} +${more} more` : named.join(', ')
}

/**
 * Films already on the shelf that a film being added might be — the same
 * rule as `wishMatchesForFilm`. Returns `[{ film, sameFilm }]`, sure ones first.
 *
 *   sameFilm: true   both confirmed against TMDB, same record, same catalogue.
 *                    A different season of the same show is NOT the same.
 *   sameFilm: false  the titles read the same and nothing more is known —
 *                    The Thing (1982) and (2011) land here, so the app may
 *                    only say it "looks like" one, never that it is.
 *
 * It never blocks anything: a second copy on another format is often on
 * purpose (Repo Man on Blu-ray and on 4K).
 */
export function shelfDuplicates({ title, type, match = null, seasonNumber = null }, films) {
  const key = titleSortKey(title)
  const out = []
  for (const film of films ?? []) {
    const filmConfirmed = Boolean(film.tmdb_verified && film.tmdb_id != null)
    const sameRecord =
      match != null &&
      match.tmdb_id != null &&
      filmConfirmed &&
      Number(film.tmdb_id) === Number(match.tmdb_id) &&
      tmdbKind(film.type) === (match.kind ?? tmdbKind(type))
    if (sameRecord) {
      const otherSeason =
        seasonNumber != null &&
        film.season_number != null &&
        Number(seasonNumber) !== Number(film.season_number)
      if (!otherSeason) out.push({ film, sameFilm: true })
    } else if (key !== '' && titleSortKey(film.title) === key) {
      out.push({ film, sameFilm: false })
    }
  }
  return out.sort((a, b) => Number(b.sameFilm) - Number(a.sameFilm))
}

/** "Repo Man (Blu-ray)", or the title alone when no format is recorded. */
export function duplicateLabel(film) {
  const formats = (film?.formats ?? []).filter(Boolean)
  const title = displayTitle(film?.title)
  return formats.length ? `${title} (${formats.join(', ')})` : title
}
