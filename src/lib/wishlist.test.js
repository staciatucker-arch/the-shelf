import assert from 'node:assert/strict'
import test from 'node:test'

import {
  newWishRow,
  safeLink,
  searchWishes,
  validateWish,
  wishMatchesForFilm,
  wishPatch,
  wishToForm,
} from './wishlist.js'

const thing82 = { id: 'w1', title: 'The Thing', type: 'Movie', tmdb_id: 1091, tmdb_verified: true }
const hailMary = { id: 'w2', title: 'Project Hail Mary', type: null, tmdb_id: null, tmdb_verified: false }

// ---------------------------------------------------------------- search

test('search finds wishes by any part of the title, ignoring case', () => {
  assert.deepEqual(searchWishes([thing82, hailMary], 'hail').map((w) => w.id), ['w2'])
  assert.deepEqual(searchWishes([thing82, hailMary], 'THING').map((w) => w.id), ['w1'])
})

test('an empty search lists no wishes, so the shelf is not cluttered', () => {
  assert.deepEqual(searchWishes([thing82, hailMary], '   '), [])
})

// ---------------------------------------------------------------- after-add check

test('the same confirmed film on both is a same-film match', () => {
  const film = { title: 'The Thing', type: 'Movie', tmdb_id: 1091, tmdb_verified: true }
  assert.deepEqual(wishMatchesForFilm(film, [thing82]), [{ wish: thing82, sameFilm: true }])
})

// The reason "Remove" is never offered on a title alone.
test('the same title as a different film is only a title match', () => {
  const remake = { title: 'The Thing', type: 'Movie', tmdb_id: 60935, tmdb_verified: true }
  assert.deepEqual(wishMatchesForFilm(remake, [thing82]), [{ wish: thing82, sameFilm: false }])
})

test('an unconfirmed film is never a same-film match, even with the same id', () => {
  const film = { title: 'The Thing', type: 'Movie', tmdb_id: 1091, tmdb_verified: false }
  assert.equal(wishMatchesForFilm(film, [thing82])[0].sameFilm, false)
})

test('the same number in the other catalogue is a different title', () => {
  const show = { title: 'Something Else', type: 'Series', tmdb_id: 1091, tmdb_verified: true }
  assert.deepEqual(wishMatchesForFilm(show, [thing82]), [])
})

test('titles match however the article is written', () => {
  const film = { title: 'Thing, The', type: 'Movie', tmdb_id: null, tmdb_verified: false }
  assert.equal(wishMatchesForFilm(film, [thing82]).length, 1)
})

test('a film with nothing in common with any wish matches nothing', () => {
  const film = { title: 'Alien', type: 'Movie', tmdb_id: 348, tmdb_verified: true }
  assert.deepEqual(wishMatchesForFilm(film, [thing82, hailMary]), [])
})

test('same-film matches come before title matches', () => {
  const titleOnly = { id: 'w3', title: 'The Thing', type: 'Movie', tmdb_id: null, tmdb_verified: false }
  const film = { title: 'The Thing', type: 'Movie', tmdb_id: 1091, tmdb_verified: true }
  const found = wishMatchesForFilm(film, [titleOnly, thing82])
  assert.deepEqual(found.map((m) => m.sameFilm), [true, false])
})

// ---------------------------------------------------------------- links

test('a web address is kept, and one pasted without https gets it', () => {
  assert.equal(safeLink('https://www.amazon.com/dp/B0'), 'https://www.amazon.com/dp/B0')
  assert.equal(safeLink('amazon.com/dp/B0'), 'https://amazon.com/dp/B0')
})

test('anything that is not a web page is refused', () => {
  assert.equal(safeLink('javascript:alert(1)'), null)
  assert.equal(safeLink('JavaScript:alert(1)'), null)
  assert.equal(safeLink('data:text/html,hi'), null)
  assert.equal(safeLink('just some words'), null)
  assert.equal(safeLink(''), null)
})

// ---------------------------------------------------------------- the form

test('a wish needs only a title', () => {
  assert.deepEqual(validateWish({ title: 'Alien' }), {})
  assert.ok(validateWish({ title: '  ' }).title)
})

test('a bad year or a bad link is said, not saved', () => {
  const errors = validateWish({ title: 'Alien', release_year: '79', buy_url: 'javascript:x' })
  assert.ok(errors.release_year)
  assert.ok(errors.buy_url)
})

test('a new wish is one complete row, with the match marked as confirmed', () => {
  const row = newWishRow(
    { title: ' Alien ', type: 'Movie', release_year: '1979', genres: ['horror'], note: '', buy_url: '' },
    { id: 'abc', match: { tmdb_id: 348, kind: 'movie' } },
  )
  assert.deepEqual(row, {
    id: 'abc',
    title: 'Alien',
    type: 'Movie',
    release_year: 1979,
    genres: ['horror'],
    note: null,
    buy_url: null,
    tmdb_id: 348,
    tmdb_verified: true,
  })
})

test('a new wish without a match carries no id', () => {
  const row = newWishRow({ title: 'Alien' }, { id: 'abc' })
  assert.equal(row.tmdb_id, null)
  assert.equal(row.tmdb_verified, false)
})

test('an edit with nothing changed is no patch at all', () => {
  const wish = { ...thing82, release_year: 1982, genres: ['horror'], note: null, buy_url: null }
  assert.equal(wishPatch(wish, wishToForm(wish)), null)
})

test('an edit sends only what changed, and never the match unless it was touched', () => {
  const wish = { ...thing82, release_year: 1982, genres: [], note: null, buy_url: null }
  const form = { ...wishToForm(wish), note: 'the 4K one' }
  assert.deepEqual(wishPatch(wish, form), { note: 'the 4K one' })
})

test('removing a match clears the id as well as the tick', () => {
  const wish = { ...thing82, release_year: 1982, genres: [], note: null, buy_url: null }
  assert.deepEqual(wishPatch(wish, wishToForm(wish), { match: null, matchTouched: true }), {
    tmdb_id: null,
    tmdb_verified: false,
  })
})
