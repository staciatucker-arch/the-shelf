// Pure helpers for the add/edit form (§6b step 6) — no React, no Supabase.
//
// The form's job is to turn one film row into editable strings and back into a
// patch. Both directions live here so the rules can be reasoned about without
// mounting a component: what counts as empty, what counts as changed, and what
// is refused before it ever reaches the database.

/** Columns this form owns. Deliberately NOT the whole row — see below. */
export const EDITABLE_FIELDS = [
  'title',
  'year_season',
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
    year_season: text(film.year_season),
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
 * What the form is asking the row to become — every editable column, resolved
 * to the types the database expects.
 */
export function formToRow(form) {
  return {
    // Multi-line titles are real: four box sets carry their whole contents
    // list in this column. Trimmed at the ends only, so the lines survive.
    title: String(form.title ?? '').trim(),
    year_season: textOrNull(form.year_season),
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
