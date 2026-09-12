// Tests for the collection view's rules. Run with `npm test`.
//
// The cases below use the real strings out of the 2026-09-06 backup, not
// invented ones, because the shape of this data is the whole difficulty: the
// old sheet recorded a box set's contents two different ways and never settled
// on one.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { contentsList, displayYear, titleSortKey } from './collection.js'

// Four sets keep the list in `title`, under the set's own name, with an empty
// year column.
const matrix = {
  title: 'Matrix Triple Feature\nThe Matrix,\nThe Matrix Reloaded,\nThe Matrix Revolutions',
  season: '',
}

// Four others keep it in `season`, with a single-line title.
const alien = {
  title: 'Alien Quadrilogy',
  season: 'Alien (1979), \nAliens (1986), \nAlien 3 (1992), \nAlien Resurrection (1997)',
}

const ordinary = { title: 'Alien', release_year: 1979, season: '' }

test('a contents list in the title column is found', () => {
  assert.deepEqual(contentsList(matrix), [
    'The Matrix',
    'The Matrix Reloaded',
    'The Matrix Revolutions',
  ])
})

test('a contents list in the year column is found too', () => {
  // This is the case the detail panel missed until 2026-09-10: it looked only
  // at the title, so these four sets showed nothing at all.
  assert.deepEqual(contentsList(alien), [
    'Alien (1979)',
    'Aliens (1986)',
    'Alien 3 (1992)',
    'Alien Resurrection (1997)',
  ])
})

test('the set’s own name is not repeated as one of its entries', () => {
  assert.ok(!contentsList(matrix).includes('Matrix Triple Feature'))
})

test('an ordinary film has no contents list', () => {
  assert.deepEqual(contentsList(ordinary), [])
  assert.deepEqual(contentsList({}), [])
})

test('a season column that is really a contents list shows no year', () => {
  // Showing its first line alone rendered "Alien (1979)," beside the title,
  // which claims both a wrong year and a comma.
  assert.equal(displayYear(alien), '')
  assert.equal(displayYear(null), '')
})

test('season beats year, and a bare year still shows', () => {
  // Someone holding series 3 wants "Season 3", not the year the show began.
  assert.equal(displayYear({ release_year: 1997, season: 'Season 3' }), 'Season 3')
  assert.equal(displayYear({ release_year: 1979, season: '' }), '1979')
  assert.equal(displayYear({ release_year: null, season: 'Volume 1' }), 'Volume 1')
  assert.equal(displayYear({ release_year: null, season: null }), '')
})

test('a leading article does not decide where a title sorts', () => {
  // The old sheet held both conventions, so both must land under "three".
  assert.equal(titleSortKey('The Three Stooges'), titleSortKey('Three Stooges, The'))
})

test('only the first line of a multi-line title decides its place', () => {
  assert.equal(titleSortKey(matrix.title), 'matrix triple feature')
})
