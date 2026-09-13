// TMDB's genre vocabulary, translated into the shelf's own.
//
// These are two different lists written by different people for different
// reasons. TMDB has 19 broad genres for every film ever made; the shelf has 47
// that describe what Stacia and Ingrid actually sort by — `slasher`, `kaiju`,
// `mecha`, `school life`, `time travel`. The overlap is real but partial, and
// this module is deliberately the only place that knows how they line up.
//
// **Only names already on the shelf's list appear on the right.** A mapping
// that invented a genre would put a value on a film that no filter offers and
// no option list contains, which is how a tag becomes unfindable.
//
// What TMDB says and the shelf has no word for — Horror, Thriller, Family,
// Western, Music, TV Movie — is absent on purpose, not forgotten. See
// UNMAPPED below.

/**
 * TMDB genre name → the shelf's genre, or genres.
 *
 * Television is the reason some entries are arrays: TMDB's TV list pairs
 * genres that its film list keeps apart ("Sci-Fi & Fantasy"), and a show
 * tagged with the pair is honestly both.
 */
export const TMDB_TO_SHELF = {
  // Straight through — same word on both lists.
  Action: ['action'],
  Adventure: ['adventure'],
  Comedy: ['comedy'],
  Crime: ['crime'],
  Documentary: ['documentary'],
  Drama: ['drama'],
  Fantasy: ['fantasy'],
  Mystery: ['mystery'],
  Romance: ['romance'],
  War: ['war'],

  // The same genre under a different name.
  Animation: ['animated'],
  History: ['historical'],
  'Science Fiction': ['sci-fi'],

  // TMDB's television list pairs what its film list separates.
  'Action & Adventure': ['action', 'adventure'],
  'Sci-Fi & Fantasy': ['sci-fi', 'fantasy'],
  'War & Politics': ['war'],
}

/**
 * TMDB genres the shelf has no equivalent for, and why each is left alone.
 *
 * Exported so the decision is visible in the code rather than implied by an
 * absence — and so that adding one later is a deliberate edit here plus a new
 * value on the `genre` option list, never a silent behaviour change.
 *
 *   Horror     — the shelf splits this into `slasher`, `zombie`, `creature`,
 *                `paranormal`, `supernatural` and `psychological`, which is
 *                more useful than the blunt label. Guessing which one TMDB
 *                meant would be wrong more often than right.
 *   Thriller   — no equivalent, and the nearest words on the list
 *                (`psychological`, `crime`) mean something narrower.
 *   Music      — TMDB uses it for both concert films and films about music;
 *                the shelf's `concert` and `musical` are each narrower than
 *                that, so either guess would be wrong about half the time.
 *   Family     — no equivalent.
 *   Western    — no equivalent.
 *   'TV Movie' — a format, not a genre.
 *   Kids, News, Reality, Soap, Talk — television categories for programming
 *                this collection does not hold.
 */
export const UNMAPPED = [
  'Horror',
  'Thriller',
  'Music',
  'Family',
  'Western',
  'TV Movie',
  'Kids',
  'News',
  'Reality',
  'Soap',
  'Talk',
]

/**
 * The shelf genres a TMDB record implies — de-duplicated, order preserved.
 *
 * Takes whatever TMDB returned: `[{ id, name }]` from a lookup, or bare
 * strings. Anything unrecognised is dropped rather than passed through, so a
 * genre TMDB adds next year cannot arrive on a film as a value nothing on the
 * shelf offers.
 */
export function shelfGenresFor(tmdbGenres) {
  const out = []
  for (const entry of tmdbGenres ?? []) {
    const name = typeof entry === 'string' ? entry : entry?.name
    for (const shelf of TMDB_TO_SHELF[String(name ?? '').trim()] ?? []) {
      if (!out.includes(shelf)) out.push(shelf)
    }
  }
  return out
}

/**
 * The genres a match would add to what somebody has already ticked.
 *
 * Additive only, and that is the whole point: a confirmed match may suggest,
 * but it may never untick a genre a person chose. Returns just the new ones,
 * so the form can say how many arrived and mark which they were.
 */
export function genresToAdd(current, tmdbGenres) {
  const have = current ?? []
  return shelfGenresFor(tmdbGenres).filter((g) => !have.includes(g))
}
