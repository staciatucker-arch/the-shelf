import assert from 'node:assert/strict'
import test from 'node:test'

import { duplicateLabel, searchAnswer, shelfDuplicates } from './search.js'

// ---------------------------------------------------------------- the answer line

test('answer line names what was found on both sides', () => {
  assert.equal(
    searchAnswer([{ title: 'Alien', release_year: 1979 }], []),
    'On your shelf: Alien (1979) · Wishlist: none',
  )
})

test('answer line leaves out a wishlist that has not loaded', () => {
  assert.equal(searchAnswer([], null), 'On your shelf: none')
})

test('answer line says none twice when nothing matches', () => {
  assert.equal(searchAnswer([], []), 'On your shelf: none · Wishlist: none')
})

test('answer line names two, then counts the rest', () => {
  const shelf = [
    { title: 'Alien', release_year: 1979 },
    { title: 'Aliens', release_year: 1986 },
    { title: 'Alien 3', release_year: 1992 },
    { title: 'Alien Resurrection' },
  ]
  assert.equal(
    searchAnswer(shelf, [{ title: 'Alien: Romulus', release_year: 2024 }]),
    'On your shelf: Alien (1979), Aliens (1986) +2 more · Wishlist: Alien: Romulus (2024)',
  )
})

test('answer line shows a season rather than the year, as cards do', () => {
  assert.equal(
    searchAnswer([{ title: 'Angel', season: 'Season 2', release_year: 1999 }], []),
    'On your shelf: Angel (Season 2) · Wishlist: none',
  )
})

test('answer line uses only the first line of a box-set title', () => {
  assert.equal(
    searchAnswer([{ title: 'Alien Quadrilogy\nAlien (1979),\nAliens (1986)' }], []),
    'On your shelf: Alien Quadrilogy · Wishlist: none',
  )
})

// ---------------------------------------------------------------- duplicates

const repoBluray = {
  id: 'a', title: 'Repo Man', type: 'Movie', formats: ['Blu-ray'], tmdb_id: 13820, tmdb_verified: true,
}
const thing1982 = { id: 'b', title: 'The Thing', type: 'Movie', formats: ['DVD'], tmdb_id: 1091, tmdb_verified: true }
const buffyS1 = {
  id: 'c', title: 'Buffy the Vampire Slayer', type: 'Series', tmdb_id: 95, tmdb_verified: true, season_number: 1,
}

test('same TMDB record is the same film', () => {
  const got = shelfDuplicates(
    { title: 'Repo Man', type: 'Movie', match: { tmdb_id: 13820, kind: 'movie' } },
    [repoBluray],
  )
  assert.deepEqual(got, [{ film: repoBluray, sameFilm: true }])
})

test('a title match alone is only a "looks like"', () => {
  const got = shelfDuplicates({ title: 'The Thing', type: 'Movie', match: { tmdb_id: 60935, kind: 'movie' } }, [thing1982])
  assert.deepEqual(got, [{ film: thing1982, sameFilm: false }])
})

test('an unmatched title compares ignoring case, article and punctuation', () => {
  const got = shelfDuplicates({ title: 'thing, the', type: '' }, [thing1982])
  assert.equal(got.length, 1)
  assert.equal(got[0].sameFilm, false)
})

test('a part of a title is not a duplicate', () => {
  assert.deepEqual(shelfDuplicates({ title: 'Repo', type: 'Movie' }, [repoBluray]), [])
})

test('an empty title finds nothing', () => {
  assert.deepEqual(shelfDuplicates({ title: '  ', type: 'Movie' }, [repoBluray]), [])
})

test('an unverified id on the shelf is never "the same film"', () => {
  const unverified = { ...repoBluray, tmdb_verified: false }
  const got = shelfDuplicates({ title: 'Repo Man', type: 'Movie', match: { tmdb_id: 13820, kind: 'movie' } }, [unverified])
  assert.deepEqual(got, [{ film: unverified, sameFilm: false }])
})

test('a film and a show sharing an id number are different records', () => {
  const show = { ...repoBluray, title: 'Something Else', type: 'Series' }
  assert.deepEqual(
    shelfDuplicates({ title: 'Repo Man', type: 'Movie', match: { tmdb_id: 13820, kind: 'movie' } }, [show]),
    [],
  )
})

test('another season of the same show is not a duplicate', () => {
  const got = shelfDuplicates(
    { title: 'Buffy the Vampire Slayer', type: 'Series', match: { tmdb_id: 95, kind: 'tv' }, seasonNumber: 2 },
    [buffyS1],
  )
  // Same title still reads alike, but it is never called the same film.
  assert.deepEqual(got, [])
})

test('the same season of the same show is the same', () => {
  const got = shelfDuplicates(
    { title: 'Buffy the Vampire Slayer', type: 'Series', match: { tmdb_id: 95, kind: 'tv' }, seasonNumber: 1 },
    [buffyS1],
  )
  assert.deepEqual(got, [{ film: buffyS1, sameFilm: true }])
})

test('sure matches come first', () => {
  const lookalike = { id: 'd', title: 'Repo Man', type: 'Movie', formats: ['VHS'] }
  const got = shelfDuplicates(
    { title: 'Repo Man', type: 'Movie', match: { tmdb_id: 13820, kind: 'movie' } },
    [lookalike, repoBluray],
  )
  assert.deepEqual(got.map((d) => d.sameFilm), [true, false])
})

test('duplicate label names the format', () => {
  assert.equal(duplicateLabel(repoBluray), 'Repo Man (Blu-ray)')
  assert.equal(duplicateLabel({ title: 'Repo Man', formats: ['Blu-ray', '4K'] }), 'Repo Man (Blu-ray, 4K)')
  assert.equal(duplicateLabel({ title: 'Repo Man', formats: [] }), 'Repo Man')
})
