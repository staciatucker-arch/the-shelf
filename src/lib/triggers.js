// Triggers: the rules, with no database and no React, so they can be tested.
// MIGRATION_PLAN.md §6b step 9, and "Design decisions, 2026-11-15".
//
// Where the data comes from (all read-only to the app):
//   trigger_topics          DoesTheDogDie's 281 topics: name, category, flags
//   profile_trigger_prefs   one row per topic a person chose — their own only
//   v_dtdd_current          one row per lookup less than 30 days old
//   v_dtdd_votes            yes / no counts per topic, current lookups only
//
// The rules this file holds:
//   * A film's answer is found by (tmdb_kind, tmdb_id, season) — the same
//     key dtdd-lookup stores under. Only a CONFIRMED match has one.
//   * Flagged = at least MIN_VOTES votes, with yes ahead of no by at least
//     MIN_LEAD (Stacia, 2026-11-15). DoesTheDogDie's own `is_flagged` is
//     only "more yes than no", which flagged 1,277 film/trigger pairs on a
//     single vote. Answers that are close, or have few votes, are still
//     shown on the film — as "Not enough votes yet" — never dropped.
//   * A topic nobody voted on has "no answer yet". Never "no".
//   * No answer at all reads "not checked". Nothing here can produce "safe".
//   * Only the signed-in person's own topics count.

/** Stacia's rule, 2026-11-15: 5 votes or more, and yes ahead by 5 or more. */
export const MIN_VOTES = 5
export const MIN_LEAD = 5

/**
 * What one topic's votes amount to:
 *   'flagged'    enough votes, and clearly yes
 *   'no'         enough votes, and clearly no
 *   'unsure'     some votes, but too few or too close to say
 *   'unanswered' no votes at all
 */
export function verdict(yes, no) {
  const y = Math.max(0, Number(yes) || 0)
  const n = Math.max(0, Number(no) || 0)
  if (y + n === 0) return 'unanswered'
  if (y + n >= MIN_VOTES && y - n >= MIN_LEAD) return 'flagged'
  if (y + n >= MIN_VOTES && n - y >= MIN_LEAD) return 'no'
  return 'unsure'
}

/** The lookup key a film's answer is stored under, or null if it has none. */
export function lookupKey(film) {
  if (!film?.tmdb_verified || film.tmdb_id == null) return null
  const kind = film.tmdb_kind
  if (kind !== 'movie' && kind !== 'tv') return null
  const season = kind === 'tv' && Number.isInteger(film.season_number) ? film.season_number : -1
  return `${kind}:${Number(film.tmdb_id)}:${season}`
}

/** The key of a row from v_dtdd_current. */
export function mediaKey(row) {
  return `${row.tmdb_kind}:${Number(row.tmdb_id)}:${Number(row.season)}`
}

/** v_dtdd_current rows by key. */
export function indexMedia(rows) {
  return new Map((rows ?? []).map((r) => [mediaKey(r), r]))
}

/** Vote counts by lookup and topic, from v_dtdd_votes rows. */
export function indexVotes(rows) {
  const out = new Map()
  for (const v of rows ?? []) {
    if (!out.has(v.media_id)) out.set(v.media_id, new Map())
    out.get(v.media_id).set(v.topic_id, { yes: Number(v.yes_count) || 0, no: Number(v.no_count) || 0 })
  }
  return out
}

/**
 * Where one film stands for one person.
 *
 *   'none-chosen'  the person has picked no topics — nothing to say
 *   'unmatched'    no confirmed TMDB match, so it cannot be looked up
 *   'unchecked'    matched, but no current answer (new, or not run yet)
 *   'not-listed'   looked up; DoesTheDogDie has no entry for it
 *   'error'        the last lookup failed
 *   'checked'      an answer exists — see `count`, `noCount`, `items`
 *
 * For a TV season, each trigger uses the season's own votes when the season
 * has at least MIN_VOTES on it; otherwise the whole show's, marked
 * `fromSeries` (Stacia, 2026-11-16 — DoesTheDogDie's season answers are
 * often thin or empty). A season's own clear answer always wins: Buffy S1's
 * "a dog dies" is 0 yes / 24 no for the season, though the show says yes.
 *
 * `thin` is true when an answer exists but none of your triggers has a clear
 * answer either way — the cover then says "not enough votes", because a
 * blank cover must only ever mean "checked, and clear".
 */
export function filmTriggerState(film, { media, votes, myTopics }) {
  if (!myTopics || myTopics.size === 0) return { state: 'none-chosen', count: 0 }
  const key = lookupKey(film)
  if (!key) return { state: 'unmatched', count: 0 }
  const row = media?.get(key)
  if (!row) return { state: 'unchecked', count: 0, key }
  if (row.lookup_status === 'no_match') return { state: 'not-listed', count: 0, key, row }
  if (row.lookup_status !== 'matched') return { state: 'error', count: 0, key, row }

  const isSeason = row.tmdb_kind === 'tv' && Number(row.season) >= 0
  const showRow = isSeason ? media.get(`tv:${Number(row.tmdb_id)}:-1`) : null
  const usableShow = showRow?.lookup_status === 'matched' ? showRow : null
  const own = votes?.get(row.id)
  const show = usableShow ? votes?.get(usableShow.id) : null

  const items = []
  for (const topicId of myTopics) {
    let v = own?.get(topicId) ?? { yes: 0, no: 0 }
    let fromSeries = false
    if (isSeason && v.yes + v.no < MIN_VOTES && show) {
      const w = show.get(topicId)
      if (w && w.yes + w.no > v.yes + v.no) {
        v = w
        fromSeries = true
      }
    }
    items.push({ topicId, yes: v.yes, no: v.no, verdict: verdict(v.yes, v.no), fromSeries })
  }
  const count = items.filter((i) => i.verdict === 'flagged').length
  const noCount = items.filter((i) => i.verdict === 'no').length
  return {
    state: 'checked',
    count,
    noCount,
    thin: count === 0 && noCount === 0,
    items,
    key,
    row,
    usedSeries: items.some((i) => i.fromSeries),
  }
}

/** True when a cover should carry the quiet "not checked" mark. */
export function showsNotChecked(state) {
  return state === 'unmatched' || state === 'unchecked' || state === 'not-listed' || state === 'error'
}

/**
 * What the votes on one film's answer cover, in words. Always said, because
 * a season's numbers and a whole show's can disagree (Buffy S1: a dog dies
 * 0 yes; the whole show: 57 yes).
 */
export function scopeLabel(film, row) {
  if (!row) return ''
  if (row.tmdb_kind === 'movie') return 'For the film'
  if (Number(row.season) >= 0) return `Season ${row.season}`
  return 'Whole series'
}

/**
 * One film's answer, split for the panel: your flagged topics, your topics
 * with too few or too close votes to say, your topics where clearly more
 * voted no, and your topics nobody has answered yet. Takes the `items` from
 * filmTriggerState.
 */
export function splitForPanel(items, topicsById) {
  const flagged = []
  const unsure = []
  const votedNo = []
  const noAnswer = []
  for (const item of items ?? []) {
    const topic = topicsById?.get(item.topicId)
    if (!topic) continue
    const entry = { topic, yes: item.yes, no: item.no, fromSeries: item.fromSeries }
    if (item.verdict === 'unanswered') noAnswer.push(entry)
    else if (item.verdict === 'flagged') flagged.push(entry)
    else if (item.verdict === 'no') votedNo.push(entry)
    else unsure.push(entry)
  }
  const byName = (a, b) => a.topic.name.localeCompare(b.topic.name)
  // Most-agreed first: the strongest answers are the ones to read first.
  const byLead = (a, b) => b.yes - b.no - (a.yes - a.no) || byName(a, b)
  return {
    flagged: flagged.sort(byLead),
    unsure: unsure.sort(byLead),
    votedNo: votedNo.sort(byName),
    noAnswer: noAnswer.sort(byName),
  }
}

/** True when a checked film has no clear answer on any of your triggers. */
export function showsNotEnoughVotes(t) {
  return Boolean(t && t.state === 'checked' && t.thin)
}

/**
 * Topics matching a search: by name, keywords or category, case and accent
 * insensitive. Spoiler topics are included — the screen hides their names.
 */
export function searchTopics(topics, query, { limit = 30 } = {}) {
  const needle = fold(query)
  if (needle === '') return []
  const scored = []
  for (const t of topics ?? []) {
    const name = fold(t.name)
    let score = -1
    if (name.startsWith(needle)) score = 0
    else if (name.includes(needle)) score = 1
    else if (fold(t.keywords).includes(needle)) score = 2
    else if (fold(t.category).includes(needle)) score = 3
    if (score >= 0) scored.push([score, t])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name))
  return scored.slice(0, limit).map(([, t]) => t)
}

function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Topics grouped by category, categories A → Z, topics A → Z within. */
export function topicsByCategory(topics) {
  const groups = new Map()
  for (const t of topics ?? []) {
    const c = t.category || 'Other'
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c).push(t)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, list]) => ({ category, topics: list.sort((a, b) => a.name.localeCompare(b.name)) }))
}

/** DoesTheDogDie's own featured topics (their `ordering` sets them apart). */
export function featuredTopics(topics) {
  return (topics ?? [])
    .filter((t) => t.dtdd_ordering != null && t.dtdd_ordering < 100000 && !t.is_spoiler)
    .sort((a, b) => a.dtdd_ordering - b.dtdd_ordering)
}

/** "12 Nov" — when an answer was fetched, said plainly. */
export function checkedOn(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
