// Tests for the collection view's rules. Run with `npm test`.
//
// The cases below use the real strings out of the 2026-09-06 backup, not
// invented ones, because the shape of this data is the whole difficulty: the
// old sheet recorded a box set's contents two different ways and never settled
// on one.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPTY_FILTERS,
  availableFilterValues,
  contentsList,
  displayYear,
  filterFilms,
  lastWatched,
  normaliseFilm,
  SORT_MODES,
  sortFilms,
  titleSortKey,
} from './collection.js'

// Four sets keep the list in `title`, under the set's own name, with an empty
// year column.
const matrix = {
  title: 'Matrix Triple Feature\nThe Matrix,\nThe Matrix Reloaded,\nThe Matrix Revolutions',
  edition: '',
}

// Four others keep it in `edition`, with a single-line title.
const alien = {
  title: 'Alien Quadrilogy',
  edition: 'Alien (1979), \nAliens (1986), \nAlien 3 (1992), \nAlien Resurrection (1997)',
}

const ordinary = { title: 'Alien', release_year: 1979, season: '' }

test('a contents list in the title column is found', () => {
  assert.deepEqual(contentsList(matrix), [
    'The Matrix',
    'The Matrix Reloaded',
    'The Matrix Revolutions',
  ])
})

test('a contents list in the edition column is found too', () => {
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

test('an edition that is really a contents list shows no year', () => {
  // Showing its first line alone rendered "Alien (1979)," beside the title,
  // which claims both a wrong year and a comma.
  assert.equal(displayYear(alien), '')
  assert.equal(displayYear(null), '')
})

test('season beats year, and an edition is the last resort', () => {
  // Someone holding series 3 wants "Season 3", not the year the show began.
  assert.equal(displayYear({ release_year: 1997, season: 'Season 3' }), 'Season 3')
  assert.equal(displayYear({ release_year: 1979, season: '' }), '1979')
  // "Volume 1" is the only thing telling the two Three Stooges discs apart,
  // so it has to reach the card when there is nothing else to show.
  assert.equal(displayYear({ release_year: null, season: null, edition: 'Volume 1' }), 'Volume 1')
  assert.equal(displayYear({ release_year: null, season: null, edition: null }), '')
})

test('a leading article does not decide where a title sorts', () => {
  // The old sheet held both conventions, so both must land under "three".
  assert.equal(titleSortKey('The Three Stooges'), titleSortKey('Three Stooges, The'))
})

test('only the first line of a multi-line title decides its place', () => {
  assert.equal(titleSortKey(matrix.title), 'matrix triple feature')
})

// --- Last watched (2026-10-25: "Unwatched" moved here from Status) ----------

const watchedFilms = [
  { title: 'Seen', last_watched_on: '2026-10-01', never_watched: false },
  { title: 'Never', last_watched_on: null, never_watched: true },
  { title: 'Gap', last_watched_on: null, never_watched: false },
].map(normaliseFilm)

const titlesFor = (watched) =>
  filterFilms(watchedFilms, '', { ...EMPTY_FILTERS, watched }).map((f) => f.title)

test('the Last watched filter keeps "never watched" and "not recorded" apart', () => {
  assert.deepEqual(titlesFor(['never']), ['Never'])
  assert.deepEqual(titlesFor(['watched']), ['Seen'])
  assert.deepEqual(titlesFor(['unrecorded']), ['Gap'])
  assert.deepEqual(titlesFor(['never', 'unrecorded']), ['Never', 'Gap'])
})

test('Last watched offers only states some film is in', () => {
  const values = availableFilterValues([watchedFilms[0]]).watched.map((s) => s.value)
  assert.deepEqual(values, ['watched'])
})

test('a row without the column reads as not never-watched', () => {
  assert.equal(normaliseFilm({ title: 'Old' }).never_watched, false)
})

test('lastWatched says "Never watched" only when it is known', () => {
  assert.deepEqual(lastWatched(watchedFilms[1]), { text: 'Never watched', never: true })
  assert.equal(lastWatched(watchedFilms[2]), null)
  // Status no longer means anything here.
  assert.equal(lastWatched(normaliseFilm({ status: 'Unwatched' })), null)
})

// --- Year released sorts (2026-10-25) ---------------------------------------

test('year sorts put unknown years in their own group, ties by title', () => {
  const films = [
    { title: 'B', release_year: 1999 },
    { title: 'A', release_year: 1999 },
    { title: 'Old', release_year: 1942 },
    { title: 'Nobody knows', release_year: null },
  ]
  const newest = sortFilms(films, 'year-desc')
  assert.deepEqual(newest.rows.map((f) => f.title), ['A', 'B', 'Old'])
  assert.deepEqual(newest.unknowns.map((f) => f.title), ['Nobody knows'])
  assert.equal(newest.unknownLabel, 'Unknown year')
  assert.deepEqual(sortFilms(films, 'year-asc').rows.map((f) => f.title), ['Old', 'A', 'B'])
})

test('every sort has a name for the line above the covers', () => {
  for (const mode of SORT_MODES) assert.ok(mode.named, mode.value)
})
