// The pick lists, minus anything that talks to the database.
//
// Split out from `options.js` for the same reason `collection.js` and
// `filmForm.js` are pure: `npm test` runs these files under plain Node, and a
// module that reaches for `import.meta.env` cannot be loaded there at all. The
// rule that decides what the manager shows is worth testing; the fetch that
// feeds it is not.

export const OPTION_KINDS = ['genre', 'format', 'status', 'type', 'vendor', 'universe']

/** Human labels for the six kinds, in the order the panel shows them. */
export const OPTION_LABELS = {
  genre: 'Genres',
  format: 'Formats',
  status: 'Status',
  type: 'Type',
  vendor: 'Bought from',
  universe: 'Universe',
}

/**
 * One kind's rows for the manager: what is offered, plus what is used and is
 * not offered.
 *
 * Matching is case-insensitive because the table's unique index is — "DVD" and
 * "dvd" are one option, and showing them as two would invite somebody to add
 * the duplicate the database is about to refuse.
 */
export function optionRows(kind, options, usage) {
  const counts = new Map()
  for (const row of usage ?? []) {
    if (row.kind === kind) counts.set(String(row.value).toLowerCase(), row)
  }

  const offered = (options ?? [])
    .filter((row) => row.kind === kind)
    .map((row) => ({
      id: row.id,
      value: row.value,
      archived: Boolean(row.archived),
      filmCount: counts.get(String(row.value).toLowerCase())?.film_count ?? 0,
      onList: true,
    }))

  const known = new Set(offered.map((row) => row.value.toLowerCase()))

  // Values on films that no list offers. Shown rather than hidden: this is a
  // typo, or a spelling the old sheet used, and either way somebody should be
  // able to see it and decide.
  const drifted = [...counts.values()]
    .filter((row) => !known.has(String(row.value).toLowerCase()))
    .map((row) => ({
      id: null,
      value: row.value,
      archived: false,
      filmCount: row.film_count,
      onList: false,
    }))
    .sort((a, b) => a.value.localeCompare(b.value))

  return [...offered, ...drifted]
}
