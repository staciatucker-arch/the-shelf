// Pure helpers for the collection view — no React, no Supabase, no DOM.
//
// Everything here takes rows and returns rows, so the searching, sorting and
// filtering rules can be reasoned about (and later tested) without a browser.
// The behaviour deliberately matches the old app's, which is the interface
// Stacia and Ingrid already know; where it differs, the comment says why.

/** Formats treated as a physical disc/tape rather than a digital licence. */
const PHYSICAL_FORMATS = new Set([
  '4k',
  'blu-ray',
  'dvd',
  'vhs',
  'laserdisc',
  'hd dvd',
  'uhd',
])

export function isPhysicalFormat(format) {
  return PHYSICAL_FORMATS.has(String(format).toLowerCase())
}

/**
 * PostgREST returns `numeric` columns as strings so no precision is lost in
 * transit. Convert once, on the way in, so nothing downstream has to remember
 * that "12.50" is not a number and that "" is not zero.
 */
export function normaliseFilm(row) {
  return {
    ...row,
    cost: row.cost == null ? null : Number(row.cost),
    market_value: row.market_value == null ? null : Number(row.market_value),
    genres: row.genres ?? [],
    formats: row.formats ?? [],
  }
}

/**
 * Sort key for a title, ignoring a leading article.
 *
 * The old data holds the same convention two ways — "The Three Stooges" and
 * "Three Stooges, The" — because the old sheet inverted articles by hand.
 * Sorting is the app's job, not the data's (HANDOFF, "Title conventions that
 * changed"), so both forms sort under T-h-r-e-e.
 *
 * Some box sets also carry their whole contents list across several lines;
 * only the first line identifies the title. See `contentsList`.
 */
export function titleSortKey(title) {
  const firstLine = String(title ?? '').split('\n')[0].trim().toLowerCase()
  return firstLine
    .replace(/,\s*(the|a|an)$/, '') // "Three Stooges, The"
    .replace(/^(the|a|an)\s+/, '') // "The Three Stooges"
    .replace(/[^a-z0-9 ]+/g, ' ') // punctuation must not out-rank letters
    .replace(/\s+/g, ' ')
    .trim()
}

/** The line of a title worth showing on a card. */
export function displayTitle(title) {
  return String(title ?? '').split('\n')[0].trim()
}

/**
 * Same, for the free-text year/season column — but blank when that column is
 * really a box set's contents list.
 *
 * Alien Quadrilogy's year cell reads "Alien (1979), \nAliens (1986), \n…".
 * Showing its first line alone renders "Alien (1979)," beside the title, which
 * states two things that are not true: that the set is from 1979, and that the
 * trailing comma is a year. The list belongs in `contentsList`, so there is
 * nothing left for this to say.
 */
export function displayYear(yearSeason) {
  const raw = String(yearSeason ?? '')
  if (raw.includes('\n')) return ''
  return raw.trim()
}

/**
 * What a box set contains, whichever column happens to hold the list.
 *
 * The old sheet recorded this two ways and never settled on one, so of the
 * eight sets that list their contents, four put the list in `title` under the
 * set's name, and four put it in `year_season` with a single-line title. The
 * two groups do not overlap. Reading only `title` — which is what the detail
 * panel did until 2026-09-10 — makes the other four look as though their
 * contents were never recorded at all.
 *
 * Returns the entries only, never the set's own name, and drops the trailing
 * commas left over from the list having been one spreadsheet cell.
 */
export function contentsList(film) {
  const title = String(film?.title ?? '')
  const yearSeason = String(film?.year_season ?? '')

  const clean = (lines) =>
    lines.map((line) => line.trim().replace(/,$/, '').trim()).filter(Boolean)

  // First line names the set; the rest are its entries.
  if (title.includes('\n')) return clean(title.split('\n').slice(1))
  // Here the title already names the set, so every line is an entry.
  if (yearSeason.includes('\n')) return clean(yearSeason.split('\n'))
  return []
}

export const EMPTY_FILTERS = {
  formats: [],
  types: [],
  statuses: [],
  vendors: [],
  universes: [],
  genres: [],
  blanks: [],
}

export function countActiveFilters(filters) {
  return Object.values(filters).reduce((n, list) => n + list.length, 0)
}

/**
 * Which values are actually worth offering in the filter panel.
 *
 * Derived from the loaded films rather than from the `options` table on
 * purpose: every value offered here is guaranteed to return at least one
 * result, so no filter can lead to an empty shelf. The `options` table is the
 * authority for *data entry* (step 6) — a different job.
 */
export function availableFilterValues(films) {
  const collect = (pick) => {
    const seen = new Set()
    for (const film of films) {
      const value = pick(film)
      if (Array.isArray(value)) value.forEach((v) => v && seen.add(v))
      else if (value) seen.add(value)
    }
    return [...seen].sort((a, b) => a.localeCompare(b))
  }

  return {
    formats: collect((f) => f.formats),
    types: collect((f) => f.type),
    statuses: collect((f) => f.status),
    vendors: collect((f) => f.vendor),
    universes: collect((f) => f.universe),
    genres: collect((f) => f.genres),
  }
}

/** The six "Show Blanks" checkboxes — the data-cleanup workflow. */
export const BLANK_FIELDS = [
  { value: 'poster', label: 'No poster', isBlank: (f) => !f.poster_url },
  { value: 'cost', label: 'No cost', isBlank: (f) => f.cost == null },
  { value: 'market', label: 'No market', isBlank: (f) => f.market_value == null },
  { value: 'type', label: 'No type', isBlank: (f) => !f.type },
  { value: 'status', label: 'No status', isBlank: (f) => !f.status },
  { value: 'genre', label: 'No genre', isBlank: (f) => f.genres.length === 0 },
]

function matchesFilters(film, filters) {
  // Multi-value columns match if the film has ANY of the selected values;
  // single-value columns must equal one of them.
  if (filters.formats.length && !film.formats.some((v) => filters.formats.includes(v))) return false
  if (filters.genres.length && !film.genres.some((v) => filters.genres.includes(v))) return false
  if (filters.types.length && !filters.types.includes(film.type)) return false
  if (filters.statuses.length && !filters.statuses.includes(film.status)) return false
  if (filters.vendors.length && !filters.vendors.includes(film.vendor)) return false
  if (filters.universes.length && !filters.universes.includes(film.universe)) return false

  // Show Blanks narrows to items missing ANY of the ticked fields, so ticking
  // several widens the cleanup list rather than demanding all of them at once.
  if (filters.blanks.length) {
    const missingSomething = filters.blanks.some((name) => {
      const field = BLANK_FIELDS.find((b) => b.value === name)
      return field ? field.isBlank(film) : false
    })
    if (!missingSomething) return false
  }

  return true
}

export function filterFilms(films, query, filters) {
  const needle = query.trim().toLowerCase()
  return films.filter((film) => {
    if (needle && !String(film.title).toLowerCase().includes(needle)) return false
    return matchesFilters(film, filters)
  })
}

export const SORT_MODES = [
  { value: 'alpha-asc', label: 'A → Z' },
  { value: 'alpha-desc', label: 'Z → A' },
  { value: 'cost-desc', label: 'Spent: High → Low' },
  { value: 'cost-asc', label: 'Spent: Low → High' },
  { value: 'market-desc', label: 'Market: High → Low' },
  { value: 'market-asc', label: 'Market: Low → High' },
]

/**
 * Sort, and — when sorting by money — hand back the films with no figure
 * separately instead of silently treating "unknown" as zero. A film with no
 * recorded cost is not the cheapest thing on the shelf, and burying it at one
 * end of the list is how it stays unrecorded.
 */
export function sortFilms(films, mode) {
  const byTitle = (a, b) => titleSortKey(a.title).localeCompare(titleSortKey(b.title))
  const rows = [...films]

  if (mode === 'alpha-asc') return { rows: rows.sort(byTitle), unknowns: [], unknownLabel: null }
  if (mode === 'alpha-desc') return { rows: rows.sort((a, b) => byTitle(b, a)), unknowns: [], unknownLabel: null }

  const field = mode.startsWith('cost') ? 'cost' : 'market_value'
  const descending = mode.endsWith('-desc')

  const known = rows.filter((f) => f[field] != null)
  const unknowns = rows.filter((f) => f[field] == null).sort(byTitle)

  known.sort((a, b) => (descending ? b[field] - a[field] : a[field] - b[field]))

  return {
    rows: known,
    unknowns,
    unknownLabel: field === 'cost' ? 'Unknown cost' : 'Unknown market value',
  }
}

/**
 * Totals for the stats bar.
 *
 * Computed across the WHOLE collection, not the filtered view — the bar
 * answers "what is the shelf worth?", while the count beside the sort menu is
 * what reflects the filter.
 *
 * **Gain is deliberately NOT `market - spent`.** Those two totals cover
 * different sets of films — 173 have a cost recorded, 58 have a market value —
 * so subtracting one from the other compares a total for 58 films against a
 * total for 173 and produces a large fake loss. It is not a smaller gain; it
 * is the wrong sign. Gain is therefore computed only across the films that
 * carry BOTH figures, and the counts are returned so the bar can show each
 * number's denominator instead of asking anyone to remember it.
 */
export function computeStats(films) {
  let spent = 0
  let market = 0
  let costCount = 0
  let marketCount = 0
  let comparableCost = 0
  let comparableMarket = 0
  let comparableCount = 0

  for (const film of films) {
    if (film.cost != null) {
      spent += film.cost
      costCount += 1
    }
    if (film.market_value != null) {
      market += film.market_value
      marketCount += 1
    }
    if (film.cost != null && film.market_value != null) {
      comparableCost += film.cost
      comparableMarket += film.market_value
      comparableCount += 1
    }
  }

  return {
    titles: films.length,
    spent,
    costCount,
    market,
    marketCount,
    comparableCount,
    // null, not zero, when nothing can be compared yet — "no answer" and
    // "broke even" must never look the same.
    gain: comparableCount > 0 ? comparableMarket - comparableCost : null,
  }
}

/**
 * What to show for "last watched".
 *
 * A status of "Unwatched" is a real statement — 18 films carry it and none of
 * them has a date — so it is worth saying "Never watched" rather than showing
 * the same blank dash as the 223 films where nobody has recorded anything. The
 * two states must stay visibly different: one is knowledge, the other is a
 * gap. Returns null when it is genuinely unknown.
 */
export function lastWatched(film) {
  if (film.last_watched_on) return { text: film.last_watched_on, derived: false }
  if (String(film.status ?? '').toLowerCase() === 'unwatched') {
    return { text: 'Never watched', derived: true }
  }
  return null
}

/**
 * What this one film gained or lost — but only when both figures exist.
 *
 * Returns null if either is missing, rather than treating an unrecorded cost
 * as zero. Only 48 of the 248 films have both, so the honest answer for most
 * of the shelf is "not known", not "broke even".
 */
export function filmGain(film) {
  if (film.cost == null || film.market_value == null) return null
  return film.market_value - film.cost
}

export function money(value, { decimals = 0 } = {}) {
  if (value == null) return null
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function signedMoney(value) {
  const sign = value < 0 ? '−' : '+'
  return sign + money(Math.abs(value))
}
