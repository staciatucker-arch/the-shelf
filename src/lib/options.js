import { supabase } from './supabase.js'

// The pick lists behind the add/edit form.
//
// Note these are a different authority from the filter panel's choices. The
// filter offers only values some film actually has, so no filter can lead to
// an empty shelf; data entry offers the curated `options` table, which is
// where a value that nothing uses yet has to come from.

export const OPTION_KINDS = ['genre', 'format', 'status', 'type', 'vendor', 'universe']

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
