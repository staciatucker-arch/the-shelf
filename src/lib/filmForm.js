// Pure helpers for the add/edit form (§6b step 6) — no React, no Supabase.
//
// The form's job is to turn one film row into editable strings and back into a
// patch. Both directions live here so the rules can be reasoned about without
// mounting a component: what counts as empty, what counts as changed, and what
// is refused before it ever reaches the database.

/** Columns this form owns. Deliberately NOT the whole row — see below. */
export const EDITABLE_FIELDS = [
  'title',
  'release_year',
  'season',
  'edition',
  'universe',
  'genres',
  'formats',
  'cost',
  'market_value',
  'acquired_on',
  'vendor',
  'status',
  'type',
  'last_watched_on',
]

// What this form must never write, and why it is absent rather than disabled:
//
//   poster_url, poster_source, poster_storage_path — a poster is chosen in the
//   poster modal (§6b step 7), which writes all three together. An edit form
//   that could set poster_url alone would be able to leave a row claiming an
//   uploaded poster with no file behind it.
//
//   tmdb_id, tmdb_verified — identity is decided by a human confirming a
//   candidate, never as a side effect of editing something else. That coupling
//   is exactly what produced 213 unverified ids in the old app (HANDOFF,
//   "Adding a title"). The confirm step sets these, and nothing else does.

/** Turns a film row into the form's own string-shaped state. */
export function filmToForm(film) {
  const text = (v) => (v == null ? '' : String(v))
  return {
    title: text(film.title),
    // Both edited as text so that clearing a box means "unknown" rather than
    // snapping back to a stale value.
    release_year: film.release_year == null ? '' : String(film.release_year),
    season: text(film.season),
    edition: text(film.edition),
    universe: text(film.universe),
    genres: [...(film.genres ?? [])],
    formats: [...(film.formats ?? [])],
    // Money arrives as a number and is edited as text, so that clearing the
    // box means "unknown" rather than snapping back to a stale figure.
    cost: film.cost == null ? '' : String(film.cost),
    market_value: film.market_value == null ? '' : String(film.market_value),
    acquired_on: text(film.acquired_on),
    vendor: text(film.vendor),
    status: text(film.status),
    type: text(film.type),
    last_watched_on: text(film.last_watched_on),
  }
}

/** Blank optional text is stored as null, never as an empty string. */
function textOrNull(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

function numberOrNull(value) {
  const trimmed = String(value ?? '').trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * A release year, or null.
 *
 * Refuses anything that is not four digits rather than coercing it. "199" and
 * "nineteen ninety" are mistakes, and storing 199 would put a film two
 * millennia in the past while looking like a real answer. `validateForm`
 * reports the mistake; this just declines to invent a number from it.
 */
function yearOrNull(value) {
  const trimmed = String(value ?? '').trim()
  return /^\d{4}$/.test(trimmed) ? Number(trimmed) : null
}

/**
 * What the form is asking the row to become — every editable column, resolved
 * to the types the database expects.
 */
export function formToRow(form) {
  return {
    // Multi-line titles are real: four box sets carry their contents list in
    // this column (four others carry it in `season`). Trimmed at the ends
    // only, so the lines survive.
    title: String(form.title ?? '').trim(),
    release_year: yearOrNull(form.release_year),
    // Written by the TMDB season picker, not typed.
    season: textOrNull(form.season),
    // Free text, multi-line on purpose: "Volume 1", "Part 1 (2021)", or a box
    // set's list of what is in it.
    edition: textOrNull(form.edition),
    universe: textOrNull(form.universe),
    genres: [...form.genres],
    formats: [...form.formats],
    cost: numberOrNull(form.cost),
    market_value: numberOrNull(form.market_value),
    acquired_on: textOrNull(form.acquired_on),
    vendor: textOrNull(form.vendor),
    status: textOrNull(form.status),
    type: textOrNull(form.type),
    last_watched_on: textOrNull(form.last_watched_on),
  }
}

/**
 * Everything wrong with the form, keyed by field.
 *
 * These duplicate the table's own `check` constraints on purpose. The database
 * is still the authority — it will refuse a bad row whatever this says — but a
 * constraint violation surfaces as Postgres error text, which is not an
 * explanation anybody should have to read.
 */
export function validateForm(form) {
  const errors = {}

  if (String(form.title ?? '').trim() === '') {
    errors.title = 'A title is required.'
  }

  // A year is four digits or nothing. Refusing "199" matters because
  // yearOrNull would otherwise store null silently and the box would appear
  // to have been accepted; saying so is the difference between a blank
  // meaning "unknown" and a blank meaning "your typing was discarded".
  const year = String(form.release_year ?? '').trim()
  if (year !== '' && !/^\d{4}$/.test(year)) {
    errors.release_year = 'A year is four digits, like 1999 — or leave it blank.'
  }

  for (const [field, label] of [['cost', 'Spent'], ['market_value', 'Market value']]) {
    const raw = String(form[field] ?? '').trim()
    if (raw === '') continue
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) errors[field] = `${label} must be a number, or left blank.`
    else if (parsed < 0) errors[field] = `${label} cannot be negative.`
    // numeric(10, 2) — ten digits total, two after the point.
    else if (parsed > 99999999.99) errors[field] = `${label} is larger than this field can hold.`
  }

  for (const [field, label] of [
    ['acquired_on', 'Acquired'],
    ['last_watched_on', 'Last watched'],
  ]) {
    const raw = String(form[field] ?? '').trim()
    if (raw === '') continue
    // <input type="date"> yields YYYY-MM-DD or nothing, but a browser that
    // falls back to a text box can yield anything at all.
    //
    // Parsing is not enough to prove a date is real: Date.parse("2021-02-30")
    // succeeds, because JavaScript quietly rolls the surplus day over into
    // March. Postgres does not, so the row would be refused with error text
    // nobody should have to read. Requiring the parsed date to spell itself
    // back out unchanged is what actually catches the 30th of February.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || new Date(raw + 'T00:00:00Z').toISOString().slice(0, 10) !== raw) {
      errors[field] = `${label} must be a real date, or left blank.`
    }
  }

  return errors
}

function sameArray(a, b) {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((value, i) => value === right[i])
}

/**
 * Only the columns that actually changed.
 *
 * The update deliberately carries a patch rather than the whole row. Sending
 * every column would mean each save rewrites twelve fields with whatever this
 * browser happened to be holding — so if Ingrid records a cost on her phone
 * while this panel sits open, saving a title here would quietly put the old
 * cost back. That is the old app's defining bug, in miniature: writing state
 * from a stale in-memory copy. A patch touches only what was edited.
 *
 * Returns null when nothing changed, so an unmodified save is no write at all.
 */
export function changedFields(film, form) {
  const next = formToRow(form)
  const patch = {}

  for (const field of EDITABLE_FIELDS) {
    const before = film[field] ?? null
    const after = next[field]

    if (Array.isArray(after)) {
      if (!sameArray(before ?? [], after)) patch[field] = after
      continue
    }
    if (before !== after) patch[field] = after
  }

  return Object.keys(patch).length === 0 ? null : patch
}

/**
 * The offered pick-list values, plus whatever this film already holds.
 *
 * A value can be on a film and absent from the list — it was archived, or the
 * old sheet held a spelling the pick list never had. Offering only the list
 * would mean a checkbox group silently dropping that value the moment anybody
 * saved anything else about the film, and a genre disappearing because someone
 * corrected a title is precisely the kind of quiet loss this rebuild exists to
 * stop. So current values are always shown, whatever the list says.
 */
export function withCurrent(offered, current) {
  const extras = (current ?? []).filter((value) => value && !offered.includes(value))
  return [...offered, ...extras.sort((a, b) => a.localeCompare(b))]
}

/* ---------------------------------------------------------------------------
   Adding a new film (§6b step 6, second part)
   ------------------------------------------------------------------------ */

/** A form holding nothing — the starting state for a new film. */
export function blankForm() {
  return filmToForm({})
}

/**
 * What a confirmed TMDB match is allowed to change about the form.
 *
 * Writes the accurate title, and either the chosen season or the year.
 *
 *   **The title is replaced.** What somebody types into the search box is a
 *   fragment meant to find the film — "battlestar", "2001 space" — not the
 *   name they want on the shelf. Leaving it as typed is how a card ended up
 *   reading "Battlestar" instead of "Battlestar Galactica". Getting the
 *   accurate title is half the reason for searching at all; it stays editable
 *   afterwards for the cases that need their own wording.
 *
 *   **A chosen season beats a year.** Picking season 3 is a deliberate act
 *   performed a moment ago, so it wins over whatever the box held. The year,
 *   by contrast, is only ever *offered*: it fills a blank and never replaces
 *   something a person typed, because a year already in the box is a human
 *   statement about a specific edition while TMDB's is a guess about which
 *   record matched.
 *
 *   **It never touches the poster.** Confirming "this is Alien (1979)" says
 *   what the film *is*; it says nothing about which picture belongs on the
 *   shelf, and a scan beats TMDB art permanently rather than until the next
 *   time somebody confirms a match (HANDOFF, "Identity and artwork").
 */
export function applyMatch(form, match, { season = null } = {}) {
  if (!match) return form
  const next = { ...form }

  if (match.title) next.title = String(match.title)

  // The year is offered, never imposed: it fills a blank and leaves alone a
  // year somebody typed, which is a statement about a specific edition.
  if (match.year != null && String(form.release_year ?? '').trim() === '') {
    next.release_year = String(match.year)
  }

  // A season is a deliberate choice made a moment ago, so it wins outright.
  if (season != null) next.season = seasonLabel(season)

  return next
}

/**
 * How a season is written into `season`.
 *
 * TMDB names most seasons "Season 1" already, and names season 0 "Specials",
 * so its own label is used where there is one rather than inventing a format
 * that disagrees with the source. A bare number is accepted for convenience.
 */
export function seasonLabel(season) {
  if (season == null) return ''
  if (typeof season === 'number') return `Season ${season}`
  const name = String(season.name ?? '').trim()
  if (name) return name
  return season.season_number == null ? '' : `Season ${season.season_number}`
}

/**
 * The complete row for a brand-new film — written once, with everything on it.
 *
 * The id is minted here, in the browser, rather than left to the database's
 * default. That is what lets the insert be a single statement carrying the
 * title, the pick lists, the confirmed match and (later, §6b step 7) a poster
 * already uploaded against this id — instead of an insert followed by a patch.
 * A half-written film that exists for a moment with nothing on it is the
 * failure mode this shape rules out.
 *
 * `tmdb_verified` is true only when a human confirmed a candidate, and false
 * otherwise. It is never set as a side effect of anything else: that coupling
 * is what left 213 inherited ids unverified, roughly one in twelve of them
 * pointing at a different film.
 */
export function newFilmRow(form, { id, match = null, season = null } = {}) {
  const row = formToRow(form)

  // Poster columns are absent, not null: a poster is written by the poster
  // modal, which sets url, source and storage path together or not at all.
  return {
    ...row,
    id,
    tmdb_id: match ? match.tmdb_id : null,
    tmdb_verified: Boolean(match),
    // Set only when a human picked the season from TMDB's list, so a number
    // here is known rather than parsed out of free text. Null makes trigger
    // warnings fall back to the whole series, which the badge must then say.
    season_number: seasonNumber(season),
  }
}

/** The number of a picked season, or null. Season 0 is "Specials" and real. */
export function seasonNumber(season) {
  if (season == null) return null
  if (typeof season === 'number') return Number.isInteger(season) ? season : null
  const n = season.season_number
  return Number.isInteger(n) ? n : null
}
