import assert from 'node:assert/strict'
import test from 'node:test'

import { drawNext, todayLocal, watchNextGenres, watchNextPool } from './watchNext.js'

const films = [
  { id: 'a', title: 'Alien', type: 'Movie', genres: ['horror', 'sci-fi'] },
  { id: 'b', title: 'Buffy S1', type: 'Series', genres: ['horror'] },
  { id: 'c', title: 'Matrix Triple Feature', type: 'Box set', genres: ['sci-fi'] },
  { id: 'd', title: 'Dune', type: 'Movie', genres: ['sci-fi'] },
  { id: 'e', title: 'Untyped', type: null, genres: ['horror'] },
]

test('only movies are drawn — no seasons, no box sets, nothing untyped', () => {
  assert.deepEqual(watchNextPool(films).map((f) => f.id), ['a', 'd'])
})

test('a genre narrows the draw', () => {
  assert.deepEqual(watchNextPool(films, { genres: ['horror'] }).map((f) => f.id), ['a'])
})

test('several genres match a movie with any of them, as the shelf filter does', () => {
  assert.deepEqual(watchNextPool(films, { genres: ['horror', 'sci-fi'] }).map((f) => f.id), ['a', 'd'])
})

test('no genres chosen means every movie', () => {
  assert.deepEqual(watchNextPool(films, { genres: [] }).map((f) => f.id), ['a', 'd'])
})

test('the genre list offers only genres a movie actually has', () => {
  assert.deepEqual(watchNextGenres(films), ['horror', 'sci-fi'])
})

test('nothing shown in this run is drawn again', () => {
  const pool = watchNextPool(films)
  assert.equal(drawNext(pool, ['a'], () => 0).id, 'd')
  assert.equal(drawNext(pool, ['a', 'd'], () => 0), null)
})

test('the draw covers the whole pool, end to end', () => {
  const pool = watchNextPool(films)
  assert.equal(drawNext(pool, [], () => 0).id, 'a')
  assert.equal(drawNext(pool, [], () => 0.9999).id, 'd')
})

// 9pm in Los Angeles is already tomorrow in UTC.
test('today is the local date, not the UTC one', () => {
  const evening = new Date(2026, 9, 17, 21, 30)
  assert.equal(todayLocal(evening), '2026-10-17')
})
