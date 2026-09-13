// TMDB's genre vocabulary, translated into the shelf's own.
//
// These are two different lists written by different people for different
// reasons. TMDB has nineteen broad genres for every film ever made; the shelf
// has its own, describing what Stacia and Ingrid actually sort by — `slasher`,
// `kaiju`, `mecha`, `school life`, `time travel`.
//
// **The shelf's list is read from the database, never hardcoded here.** That
// is the whole design. An earlier version of this file listed all thirteen
// mappings by hand, which meant the translation lived in code while the genre
// list lived in the `options` table — so adding `horror` through Manage lists
// did nothing until somebody edited this file and redeployed the app. The two
// drifted apart by construction.
//
// Now a TMDB genre is matched against the shelf's actual list **by name**, and
// the table below holds only the genuine exceptions: the handful where the two
// lists use different words for the same thing, or where TMDB pairs two of the
// shelf's genres into one of its own. Everything else needs no rule at all,
// and a genre added to the list starts mapping the moment it is saved — no
// code change, no deploy.

/**
 * The only genres that need a rule written down.
 *
 * Everything absent from this table is matched by name instead, so this stays
 * short on purpose: each entry is a place where TMDB and the shelf genuinely
 * disagree about wording, not a place where they happen to agree.
 *
 * The arrays are why television needs its own entries: TMDB's TV list pairs
 * genres that its film list keeps apart, and a show tagged "Sci-Fi & Fantasy"
 * is honestly both.
 *
 * A rule's targets are still checked against the live list — a rule may not
 * conjure a genre that has been archived or was never there.
 */
export const RENAMES = {
  // The same genre, a different word.
  Animation: ['animated'],
  History: ['historical'],
  'Science Fiction': ['sci-fi'],

  // TMDB's television list pairs what its film list separates.
  'Action & Adventure': ['action', 'adventure'],
  'Sci-Fi & Fantasy': ['sci-fi', 'fantasy'],
  'War & Politics': ['war'],
}

/**
 * TMDB categories that are not genres at all, dropped without comment.
 *
 * Everything else that fails to match is *reported* rather than discarded, so
 * the form can say "TMDB also called this Horror, which isn't on your list"
 * and the gap becomes a prompt instead of a silent loss. These would only ever
 * be noise: "TV Movie" is a format, and the rest are television programming
 * categories for things this collection does not hold.
 */
export const IGNORED = ['TV Movie', 'Kids', 'News', 'Reality', 'Soap', 'Talk']

/** The name as it is compared: case and surrounding space carry no meaning. */
const key = (value) => String(value ?? '').trim().toLowerCase()

/**
 * What a TMDB record's genres mean on this shelf.
 *
 * Takes whatever TMDB returned — `[{ id, name }]` from a lookup, or bare
 * strings — together with **the shelf's current genre list**, and returns:
 *
 *   `matched`   — the shelf's own genres, in the shelf's own spelling
 *   `unmatched` — TMDB's names that this list has no word for
 *
 * Nothing is ever invented. A name that matches nothing is reported, never
 * passed through, because a genre no filter offers and no option list contains
 * is a tag nobody can ever find again.
 */
export function mapTmdbGenres(tmdbGenres, offered) {
  // The shelf's own spelling, found by a case-insensitive name. Built from the
  // live list, so what is mappable today depends on what is on the list today.
  const bySpelling = new Map()
  for (const value of offered ?? []) {
    if (value) bySpelling.set(key(value), value)
  }

  const ignored = new Set(IGNORED.map(key))
  const matched = []
  const unmatched = []

  for (const entry of tmdbGenres ?? []) {
    const name = String((typeof entry === 'string' ? entry : entry?.name) ?? '').trim()
    if (name === '' || ignored.has(key(name))) continue

    // A rule first, if there is one — then, and only then, the name itself.
    const rule = RENAMES[name]
    const hits = rule
      ? rule.map((g) => bySpelling.get(key(g))).filter(Boolean)
      : [bySpelling.get(key(name))].filter(Boolean)

    if (hits.length === 0) {
      if (!unmatched.includes(name)) unmatched.push(name)
      continue
    }
    for (const hit of hits) {
      if (!matched.includes(hit)) matched.push(hit)
    }
  }

  return { matched, unmatched }
}

/**
 * The genres a match would add to what somebody has already ticked.
 *
 * Additive only, and that is the point: a confirmed match may suggest, but it
 * may never untick a genre a person chose. TMDB knows nothing about why
 * somebody tagged a film `vampire`.
 */
export function genresToAdd(current, tmdbGenres, offered) {
  const have = current ?? []
  return mapTmdbGenres(tmdbGenres, offered).matched.filter((g) => !have.includes(g))
}
