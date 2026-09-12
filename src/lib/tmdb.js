import { supabase } from './supabase.js'

// Talking to the `tmdb-search` Edge Function.
//
// TMDB_KEY is a secret and lives only on the function, so the browser never
// touches TMDB directly — it asks the function, signed in, and the function
// asks TMDB. See supabase/functions/tmdb-search/index.ts in the data repo.
//
// The one rule this module exists to hold: it returns *candidates*, never a
// match. Nothing here picks. The old app took results[0] silently and that is
// how 213 films ended up carrying an id nobody had looked at.

/** TMDB keeps films and television in separate id namespaces. */
function kindFor(type) {
  return String(type ?? '').toLowerCase() === 'series' ? 'tv' : 'movie'
}

/**
 * Candidates for a title, best first.
 *
 * Returns `{ candidates, usedYear, error }`. A failure is reported, never
 * swallowed into an empty list: "TMDB could not be reached" and "TMDB has
 * never heard of this film" lead to different decisions, and showing the
 * first as the second is how somebody ends up adding a duplicate.
 */
export async function searchTmdb({ title, year, type }) {
  const query = String(title ?? '').trim()
  if (query === '') return { candidates: [], usedYear: false, error: null }

  const { data, error } = await supabase.functions.invoke('tmdb-search', {
    body: {
      action: 'search',
      title: query,
      // A free-text year column holds "Season 2" and box-set lists as well as
      // years, so only send something that is actually a year.
      year: /^\d{4}$/.test(String(year ?? '').trim()) ? String(year).trim() : undefined,
      type: kindFor(type),
      limit: 8,
    },
  })

  if (error) return { candidates: [], usedYear: false, error: error.message }
  if (data?.error) return { candidates: [], usedYear: false, error: String(data.error) }

  return {
    candidates: data?.candidates ?? [],
    // The function retries without the year when a year-narrowed search finds
    // nothing. Worth saying so, or the results look wrong rather than wider.
    usedYear: Boolean(data?.query?.used_year),
    error: null,
  }
}
