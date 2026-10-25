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

// ---------------------------------------------------------------- Move to my Shelf

import { filmStartFromWish, wishOfferAfterAdd } from './wishlist.js'

test('moving a confirmed wish carries its match and details into the add form', () => {
  const start = filmStartFromWish({ ...thing82, release_year: 1982, genres: ['horror'] })
  assert.deepEqual(start.form, { title: 'The Thing', type: 'Movie', release_year: '1982', genres: ['horror'] })
  assert.deepEqual(start.match, { tmdb_id: 1091, kind: 'movie', title: 'The Thing', year: 1982 })
})

test('moving an unconfirmed wish starts unmatched', () => {
  assert.equal(filmStartFromWish(hailMary).match, null)
  assert.equal(filmStartFromWish(hailMary).form.title, 'Project Hail Mary')
})

test('a series wish carries the television catalogue', () => {
  const start = filmStartFromWish({ id: 'w', title: 'Severance', type: 'Series', tmdb_id: 95396, tmdb_verified: true })
  assert.equal(start.match.kind, 'tv')
})

test('the wish a film was moved from is offered with Remove, even unmatched', () => {
  const film = { title: 'Project Hail Mary (2026)', type: 'Movie', tmdb_id: null, tmdb_verified: false }
  assert.deepEqual(wishOfferAfterAdd(film, [thing82, hailMary], 'w2'), { wish: hailMary, sameFilm: true })
})

test('without an origin, the usual matching decides', () => {
  const film = { title: 'The Thing', type: 'Movie', tmdb_id: 60935, tmdb_verified: true }
  assert.deepEqual(wishOfferAfterAdd(film, [thing82]), { wish: thing82, sameFilm: false })
  assert.equal(wishOfferAfterAdd({ title: 'Alien' }, [thing82]), null)
})

// ---------------------------------------------------------------- wish covers

import { postersFromBatch, wishPosterKey, wishPosterRequests } from './wishlist.js'

test('only a confirmed match has a poster key, in its own catalogue', () => {
  assert.equal(wishPosterKey({ type: 'Movie', tmdb_id: 1091, tmdb_verified: true }), 'movie:1091')
  assert.equal(wishPosterKey({ type: 'Series', tmdb_id: 95396, tmdb_verified: true }), 'tv:95396')
  assert.equal(wishPosterKey({ type: 'Movie', tmdb_id: 1091, tmdb_verified: false }), null)
  assert.equal(wishPosterKey({ type: 'Movie', tmdb_id: null, tmdb_verified: true }), null)
})

test('poster look-ups skip unmatched wishes, repeats and ones already asked', () => {
  const wishes = [
    { id: 'a', type: 'Movie', tmdb_id: 1091, tmdb_verified: true },
    { id: 'b', type: 'Movie', tmdb_id: 1091, tmdb_verified: true },
    { id: 'c', type: 'Series', tmdb_id: 95396, tmdb_verified: true },
    { id: 'd', type: 'Movie', tmdb_id: 5, tmdb_verified: false },
    { id: 'e', type: 'Movie', tmdb_id: 348, tmdb_verified: true },
  ]
  assert.deepEqual(wishPosterRequests(wishes, new Set(['movie:348'])), [
    { ref: 'movie:1091', tmdb_id: 1091, type: 'movie' },
    { ref: 'tv:95396', tmdb_id: 95396, type: 'series' },
  ])
})

test('a batch answer gives TMDB image addresses only, and none for a wrong or missing record', () => {
  const posters = postersFromBatch([
    { ref: 'movie:1091', found: true, wrong_namespace: false, poster_url: 'https://image.tmdb.org/t/p/w342/x.jpg' },
    { ref: 'movie:2', found: true, wrong_namespace: true, poster_url: 'https://image.tmdb.org/t/p/w342/y.jpg' },
    { ref: 'movie:3', found: false },
    { ref: 'movie:4', found: true, wrong_namespace: false, poster_url: 'javascript:alert(1)' },
    { ref: 'movie:5', error: 'timeout' },
  ])
  assert.deepEqual(posters, {
    'movie:1091': 'https://image.tmdb.org/t/p/w342/x.jpg',
    'movie:2': null,
    'movie:3': null,
    'movie:4': null,
  })
})

test('moving a wish to the shelf never carries a cover', () => {
  const start = filmStartFromWish({
    id: 'w', title: 'The Thing', type: 'Movie', tmdb_id: 1091, tmdb_verified: true,
    poster_url: 'https://image.tmdb.org/t/p/w342/x.jpg',
  })
  const fields = [...Object.keys(start.form), ...Object.keys(start.match)]
  assert.ok(!fields.some((k) => k.startsWith('poster')), fields.join(', '))
})

test('a new wish needs What is it?; an existing one does not', () => {
  assert.equal(validateWish({ title: 'Alien' }, { requireType: true }).type, 'Choose what it is.')
  assert.deepEqual(validateWish({ title: 'Alien', type: 'Movie' }, { requireType: true }), {})
  assert.deepEqual(validateWish({ title: 'Alien' }), {})
})
