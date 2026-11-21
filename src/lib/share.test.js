// Tests for the share message. Run with `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  SHARE_MAX,
  filmLine,
  otherNames,
  pickedFilms,
  readShareSettings,
  reviewLine,
  saveShareSettings,
  shareHeading,
  shareMessage,
  tmdbLink,
  togglePick,
} from './share.js'

const ME = 'me-id'
const HER = 'her-id'
const profiles = [
  { id: ME, display_name: 'nanoedith' },
  { id: HER, display_name: 'pagong' },
]

const alien = {
  id: 'f1',
  title: 'Alien',
  release_year: 1979,
  tmdb_id: 348,
  tmdb_kind: 'movie',
  tmdb_verified: true,
  poster_url: 'https://example.supabase.co/storage/v1/object/public/posters/alien.jpg',
  cost: 12.5,
}
const buffy = {
  id: 'f2',
  title: 'Buffy the Vampire Slayer S1',
  season: 'Season 1',
  season_number: 1,
  tmdb_id: 95,
  tmdb_kind: 'tv',
  tmdb_verified: true,
}
const unverified = { id: 'f3', title: 'Dune', release_year: 1984, tmdb_id: 841, tmdb_kind: 'movie', tmdb_verified: false }
const boxSet = {
  id: 'f4',
  title: 'Matrix Triple Feature\nThe Matrix,\nThe Matrix Reloaded,\nThe Matrix Revolutions',
  type: 'Box set',
}

test('TMDB link only for a confirmed match, list from tmdb_kind', () => {
  assert.equal(tmdbLink(alien), 'https://www.themoviedb.org/movie/348')
  assert.equal(tmdbLink(buffy), 'https://www.themoviedb.org/tv/95/season/1')
  assert.equal(tmdbLink({ ...buffy, season_number: null }), 'https://www.themoviedb.org/tv/95')
  assert.equal(tmdbLink(unverified), null)
  assert.equal(tmdbLink(boxSet), null)
  assert.equal(tmdbLink({ ...alien, tmdb_kind: null }), null)
})

test('title line uses the display title and year or season', () => {
  assert.equal(filmLine(alien), 'Alien (1979)')
  assert.equal(filmLine(buffy), 'Buffy the Vampire Slayer S1 (Season 1)')
  assert.equal(filmLine(boxSet), 'Matrix Triple Feature')
})

test('review line: stars, comment, either, or nothing', () => {
  assert.equal(reviewLine('nanoedith', { rating: 4, comment: 'Still\n\nterrifying.' }), 'nanoedith ★★★★☆ “Still terrifying.”')
  assert.equal(reviewLine('nanoedith', { rating: 5, comment: null }), 'nanoedith ★★★★★')
  assert.equal(reviewLine('pagong', { rating: null, comment: 'Loved it' }), 'pagong: “Loved it”')
  assert.equal(reviewLine('pagong', { rating: null, comment: '  ' }), null)
})

test('picking: up to three, tap again to unpick, a fourth is refused and said', () => {
  let state = { picks: [], full: false }
  for (const id of ['f1', 'f2', 'f3']) state = togglePick(state.picks, id)
  assert.deepEqual(state, { picks: ['f1', 'f2', 'f3'], full: false })
  assert.deepEqual(togglePick(state.picks, 'f4'), { picks: ['f1', 'f2', 'f3'], full: true })
  assert.deepEqual(togglePick(state.picks, 'f2'), { picks: ['f1', 'f3'], full: false })
  assert.equal(SHARE_MAX, 3)
})

test('picked films keep their order and drop a film deleted meanwhile', () => {
  const films = [alien, buffy, unverified]
  assert.deepEqual(pickedFilms(['f3', 'gone', 'f1'], films).map((f) => f.id), ['f3', 'f1'])
})

test('heading: our / my shelf by household size, this title / these titles by count', () => {
  assert.equal(shareHeading(1, 2), 'Check out this title from our shelf! 🎬')
  assert.equal(shareHeading(3, 2), 'Check out these titles from our shelf! 🎬')
  assert.equal(shareHeading(2, 1), 'Check out these titles from my shelf! 🎬')
  assert.equal(shareHeading(1, 1), 'Check out this title from my shelf! 🎬')
})

const reviews = [
  { film_id: 'f1', profile_id: ME, rating: 4, comment: 'Still terrifying.' },
  { film_id: 'f1', profile_id: HER, rating: 5, comment: null },
  { film_id: 'f3', profile_id: HER, rating: 2, comment: 'Long.' },
]
const base = { films: [alien, unverified], reviews, profiles, myId: ME }

test('the default message: heading, films, my rating, plain links, not hers', () => {
  assert.equal(
    shareMessage(base),
    [
      'Check out these titles from our shelf! 🎬',
      '',
      'Alien (1979)',
      'nanoedith ★★★★☆ “Still terrifying.”',
      '<https://www.themoviedb.org/movie/348>',
      '',
      'Dune (1984)',
    ].join('\n'),
  )
})

test('each setting adds or leaves out its own lines', () => {
  const both = shareMessage({ ...base, includeOthers: true })
  assert.ok(both.includes('nanoedith ★★★★☆ “Still terrifying.”\npagong ★★★★★\n<https'))
  assert.ok(both.includes('Dune (1984)\npagong ★★☆☆☆ “Long.”'))
  const neither = shareMessage({ ...base, includeMine: false })
  assert.ok(!neither.includes('nanoedith') && !neither.includes('pagong'))
  const hersOnly = shareMessage({ ...base, includeMine: false, includeOthers: true })
  assert.ok(hersOnly.includes('Alien (1979)\npagong ★★★★★'))
})

test('never a cover link, money, or anything not on the list', () => {
  const text = shareMessage({ ...base, films: [alien], includeOthers: true })
  assert.ok(!text.includes('supabase'))
  assert.ok(!text.includes('posters'))
  assert.ok(!text.includes('12.5'))
})

test('other names', () => {
  assert.deepEqual(otherNames(profiles, ME), ['pagong'])
})

test('settings: defaults, remembered per person, survive a broken store', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  assert.deepEqual(readShareSettings(storage, ME), { includeMine: true, includeOthers: false })
  saveShareSettings(storage, ME, { includeMine: false, includeOthers: true })
  assert.deepEqual(readShareSettings(storage, ME), { includeMine: false, includeOthers: true })
  assert.deepEqual(readShareSettings(storage, HER), { includeMine: true, includeOthers: false })
  const broken = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } }
  assert.deepEqual(readShareSettings(broken, ME), { includeMine: true, includeOthers: false })
  saveShareSettings(broken, ME, { includeMine: false, includeOthers: false })
  store.set('shelf.share.' + ME, '{not json')
  assert.deepEqual(readShareSettings(storage, ME), { includeMine: true, includeOthers: false })
})
