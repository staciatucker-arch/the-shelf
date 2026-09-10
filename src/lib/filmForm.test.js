// Tests for the add/edit form's rules. Run with `npm test` — Node's own test
// runner, no dependencies, no browser, because `lib/` is deliberately pure.
//
// What is worth testing here is not "does the form work" but the handful of
// rules that protect the collection: that an untouched film produces no write,
// that a patch can never carry a poster or a TMDB id, that a cleared money box
// means unknown rather than zero, and that a multi-line box-set title survives
// a round trip. Each of those is a way the old app lost data.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  changedFields,
  filmToForm,
  formToRow,
  validateForm,
  withCurrent,
} from './filmForm.js'

/** A film with a bit of everything: set values, nulls, and two arrays. */
const film = {
  id: 'u1',
  title: 'Alien',
  year_season: '1979',
  universe: 'Alien',
  genres: ['Horror', 'Sci-Fi'],
  formats: ['Blu-ray'],
  cost: 12.5,
  market_value: null,
  acquired_on: '2021-03-04',
  vendor: 'Bull Moose',
  status: 'Keep',
  type: 'Film',
  last_watched_on: null,
  poster_url: 'https://example.test/alien.jpg',
  poster_source: 'github',
  poster_storage_path: null,
  tmdb_id: 348,
  tmdb_verified: true,
}

const editing = (changes) => ({ ...filmToForm(film), ...changes })

test('an untouched film produces no write at all', () => {
  assert.equal(changedFields(film, filmToForm(film)), null)
})

test('only the edited column is sent', () => {
  assert.deepEqual(changedFields(film, editing({ vendor: 'Amoeba' })), { vendor: 'Amoeba' })
})

test('a patch can never carry poster or TMDB columns', () => {
  // Even if something upstream stuffs them into the form state, they are not
  // in EDITABLE_FIELDS, so they cannot reach the database through this path.
  const tampered = editing({ poster_url: 'https://elsewhere.test/x.jpg', tmdb_id: 999 })
  assert.equal(changedFields(film, tampered), null)
})

test('clearing a money box means unknown, not zero', () => {
  assert.deepEqual(changedFields(film, editing({ cost: '' })), { cost: null })
})

test('a money value can be filled in where there was none', () => {
  assert.deepEqual(changedFields(film, editing({ market_value: '20' })), { market_value: 20 })
})

test('reordering genres is not a change', () => {
  assert.equal(changedFields(film, editing({ genres: ['Sci-Fi', 'Horror'] })), null)
})

test('removing a genre is a change', () => {
  assert.deepEqual(changedFields(film, editing({ genres: ['Horror'] })), { genres: ['Horror'] })
})

test("a box set's multi-line title survives a round trip", () => {
  const boxSet = { ...film, title: 'Alien Quadrilogy\nAlien\nAliens\nAlien³' }
  assert.equal(changedFields(boxSet, filmToForm(boxSet)), null)
})

test('blank optional text is stored as null, not an empty string', () => {
  assert.deepEqual(changedFields(film, editing({ universe: '   ' })), { universe: null })
})

test('a title of only spaces is refused', () => {
  assert.deepEqual(Object.keys(validateForm(editing({ title: '   ' }))), ['title'])
})

test('money must be a non-negative number, or blank', () => {
  assert.deepEqual(validateForm(filmToForm(film)), {})
  assert.deepEqual(Object.keys(validateForm(editing({ cost: '-5' }))), ['cost'])
  assert.deepEqual(Object.keys(validateForm(editing({ cost: 'abc' }))), ['cost'])
  assert.deepEqual(Object.keys(validateForm(editing({ cost: '' }))), [])
  // numeric(10, 2) cannot hold this, and Postgres error text is not an
  // explanation anyone should have to read.
  assert.deepEqual(Object.keys(validateForm(editing({ market_value: '1e9' }))), ['market_value'])
})

test('dates must be YYYY-MM-DD, or blank', () => {
  assert.deepEqual(Object.keys(validateForm(editing({ acquired_on: '03/04/2021' }))), [
    'acquired_on',
  ])
  assert.deepEqual(Object.keys(validateForm(editing({ acquired_on: '' }))), [])
  assert.deepEqual(Object.keys(validateForm(editing({ last_watched_on: '2021-02-30' }))), [
    'last_watched_on',
  ])
})

test('a value the pick list has dropped is still offered', () => {
  // "Noir" was archived, but this film has it. Leaving it out of the checkbox
  // group would delete it the next time anybody saved anything.
  assert.deepEqual(withCurrent(['Horror'], ['Horror', 'Noir']), ['Horror', 'Noir'])
  assert.deepEqual(withCurrent(['Horror', 'Noir'], ['Noir']), ['Horror', 'Noir'])
  assert.deepEqual(withCurrent(['Horror'], []), ['Horror'])
})

test('formToRow resolves every editable column to a database-ready value', () => {
  const row = formToRow(editing({ cost: '  9.99 ', vendor: '  ', last_watched_on: '2024-01-02' }))
  assert.equal(row.cost, 9.99)
  assert.equal(row.vendor, null)
  assert.equal(row.last_watched_on, '2024-01-02')
  assert.deepEqual(row.genres, ['Horror', 'Sci-Fi'])
})
