import { supabase } from './supabase.js'
import { OPTION_KINDS } from './optionLists.js'

// Re-exported so callers have one place to import a pick list from, whether
// they want the rule or the fetch.
export { OPTION_KINDS, OPTION_LABELS, optionRows } from './optionLists.js'

// The pick lists behind the add/edit form.
//
// Note these are a different authority from the filter panel's choices. The
// filter offers only values some film actually has, so no filter can lead to
// an empty shelf; data entry offers the curated `options` table, which is
// where a value that nothing uses yet has to come from.

const EMPTY = Object.fromEntries(OPTION_KINDS.map((kind) => [kind, []]))

/**
 * Every offerable value, grouped by kind.
 *
 * Archived values are left out — that is what archiving is for — but see
 * `withCurrent` for why they cannot simply vanish from a form.
 */
export async function loadOptions() {
  const { data, error } = await supabase
    .from('options')
    .select('kind,value,sort_order')
    .eq('archived', false)
    .order('sort_order')
    .order('value')

  if (error) return { options: null, error: error.message }

  const grouped = Object.fromEntries(OPTION_KINDS.map((kind) => [kind, []]))
  for (const row of data) {
    if (grouped[row.kind]) grouped[row.kind].push(row.value)
  }
  return { options: grouped, error: null }
}

export { EMPTY as EMPTY_OPTIONS }

/* ---------------------------------------------------------------------------
   Managing the pick lists (§6b step 6)
   ------------------------------------------------------------------------ */

/** Every value including archived ones — the manager has to see what it hides. */
export async function loadAllOptions() {
  const { data, error } = await supabase
    .from('options')
    .select('id,kind,value,sort_order,archived')
    .order('sort_order')
    .order('value')

  if (error) return { rows: null, error: error.message }
  return { rows: data, error: null }
}

/**
 * What the collection actually uses, from `v_option_usage`.
 *
 * Film columns hold plain text, not foreign keys — deliberately, so that
 * dropping "Bull Moose" from the vendor list cannot delete or block the films
 * bought there. The price of that choice is drift: a value can exist on films
 * and on no list at all. This view is how drift is seen instead of guessed.
 */
export async function loadOptionUsage() {
  const { data, error } = await supabase
    .from('v_option_usage')
    .select('kind,value,film_count,in_option_list')

  if (error) return { usage: null, error: error.message }
  return { usage: data, error: null }
}

/** Add one value to one list. The database refuses a case-insensitive duplicate. */
export async function addOption(kind, value) {
  const trimmed = String(value ?? '').trim()
  if (trimmed === '') return { error: 'Type a value first.' }

  const { error } = await supabase.from('options').insert({ kind, value: trimmed })
  if (error) {
    // 23505 is the unique index on (kind, lower(value)) — a real answer, not a
    // failure, so it is worded as one.
    if (error.code === '23505') return { error: `“${trimmed}” is already on this list.` }
    return { error: error.message }
  }
  return { error: null }
}

/**
 * Stop offering a value, or start again.
 *
 * Archiving never touches a film. The value stays on every row that holds it
 * and the form keeps showing it there (see `withCurrent`) — it simply stops
 * being offered for new entries. That is the whole difference between
 * archiving and deleting, and it is why archiving is the safe default.
 */
export async function setOptionArchived(id, archived) {
  const { error } = await supabase.from('options').update({ archived }).eq('id', id)
  return { error: error ? error.message : null }
}

/** Remove a value from a list for good. Only ever offered when nothing uses it. */
export async function deleteOption(id) {
  const { error } = await supabase.from('options').delete().eq('id', id)
  return { error: error ? error.message : null }
}
