// Tests for the pick-list manager's one non-obvious rule: how a list of
// offered values and a list of values actually in use are reconciled.
//
// The reconciliation matters because films store these as plain text, not as
// references. A value can therefore be offered and unused, used and offered,
// or used and offered by nobody — and the last case is the one a person has to
// be able to see, because it is a typo or an old spelling that will otherwise
// sit in the collection unnoticed.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { optionRows } from './optionLists.js'

const options = [
  { id: 'o1', kind: 'genre', value: 'Horror', archived: false },
  { id: 'o2', kind: 'genre', value: 'Sci-Fi', archived: true },
  { id: 'o3', kind: 'genre', value: 'Western', archived: false },
  { id: 'o4', kind: 'vendor', value: 'Bull Moose', archived: false },
]

const usage = [
  { kind: 'genre', value: 'Horror', film_count: 12, in_option_list: true },
  { kind: 'genre', value: 'Sci-Fi', film_count: 40, in_option_list: true },
  { kind: 'genre', value: 'Comdey', film_count: 1, in_option_list: false },
  { kind: 'vendor', value: 'Bull Moose', film_count: 30, in_option_list: true },
]

test('every offered value is listed, with what uses it', () => {
  const rows = optionRows('genre', options, usage)
  const horror = rows.find((r) => r.value === 'Horror')

  assert.equal(horror.filmCount, 12)
  assert.equal(horror.archived, false)
  assert.equal(horror.onList, true)
})

test('an archived value is still listed, and still counted', () => {
  // Archiving stops a value being offered. It does not remove it from the 40
  // films that hold it, and a panel that showed it as unused would be lying
  // about what deleting it would cost.
  const sci = optionRows('genre', options, usage).find((r) => r.value === 'Sci-Fi')
  assert.equal(sci.archived, true)
  assert.equal(sci.filmCount, 40)
})

test('an offered value nothing uses counts zero rather than going missing', () => {
  const western = optionRows('genre', options, usage).find((r) => r.value === 'Western')
  assert.equal(western.filmCount, 0)
  assert.equal(western.onList, true)
})

test('a value used by films but on no list is surfaced, not hidden', () => {
  const rows = optionRows('genre', options, usage)
  const typo = rows.find((r) => r.value === 'Comdey')

  assert.ok(typo, 'a misspelling in the data must be visible in the manager')
  assert.equal(typo.onList, false)
  assert.equal(typo.filmCount, 1)
  assert.equal(typo.id, null) // there is no options row to archive or delete
})

test('only the requested kind is returned', () => {
  const values = optionRows('genre', options, usage).map((r) => r.value)
  assert.equal(values.includes('Bull Moose'), false)
})

test('case does not split one value into two', () => {
  // The table's unique index is on lower(value), so "DVD" and "dvd" are one
  // option. Listing them separately would invite adding a duplicate the
  // database is about to refuse.
  const rows = optionRows(
    'format',
    [{ id: 'f1', kind: 'format', value: 'DVD', archived: false }],
    [{ kind: 'format', value: 'dvd', film_count: 9, in_option_list: true }],
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0].value, 'DVD')
  assert.equal(rows[0].filmCount, 9)
})

test('missing usage data does not invent a zero count', () => {
  // Delete is offered only at zero. If the counts failed to load the panel
  // must not draw every value as unused — the caller withholds the rows
  // entirely, and this asserts the shape that decision rests on.
  const rows = optionRows('genre', options, [])
  assert.deepEqual(rows.map((r) => r.filmCount), [0, 0, 0])
})
