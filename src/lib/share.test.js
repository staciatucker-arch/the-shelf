// Tests for the share card's message. Run with `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  SHARE_MAX,
  filmLine,
  otherNames,
  pickedFilms,
  reviewLine,
  setOthersInText,
  shareHeading,
  shareMessage,
  switchHeading,
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

const reviews = [
  { film_id: 'f1', profile_id: ME, rating: 4, comment: 'Still terrifying.' },
  { film_id: 'f1', profile_id: HER, rating: 5, comment: null },
  { film_id: 'f3', profile_id: HER, rating: 2, comment: 'Long.' },
]

test('the message: heading, note, films, own rating, plain links', () => {
  const text = shareMessage({
    kind: 'movie-night',
    note: '  Friday at ours?  ',
    films: [alien, unverified],
    reviews,
    profiles,
    myId: ME,
  })
  assert.equal(
    text,
    ['Movie night? 🍿', 'Friday at ours?', '', 'Alien (1979)', 'nanoedith ★★★★☆ “Still terrifying.”', '<https://www.themoviedb.org/movie/348>', '', 'Dune (1984)'].join('\n'),
  )
})

test('the other person is left out unless the box is ticked', () => {
  const without = shareMessage({ kind: 'recommend', films: [alien, unverified], reviews, profiles, myId: ME })
  assert.ok(!without.includes('pagong'))
  const withHer = shareMessage({ kind: 'recommend', films: [alien, unverified], reviews, profiles, myId: ME, includeOthers: true })
  assert.ok(withHer.startsWith('Check out these titles from my collection!'))
  assert.ok(withHer.includes('nanoedith ★★★★☆ “Still terrifying.”\npagong ★★★★★\n<https'))
  assert.ok(withHer.includes('Dune (1984)\npagong ★★☆☆☆ “Long.”'))
})

test('never a cover link, money, or anything not on the list', () => {
  const text = shareMessage({ kind: 'movie-night', films: [alien], reviews, profiles, myId: ME, includeOthers: true })
  assert.ok(!text.includes('supabase'))
  assert.ok(!text.includes('posters'))
  assert.ok(!text.includes('12.5'))
})

test('blank note leaves no blank line under the heading', () => {
  const text = shareMessage({ kind: 'movie-night', note: '   ', films: [boxSet], reviews: [], profiles, myId: ME })
  assert.equal(text, 'Movie night? 🍿\n\nMatrix Triple Feature')
})

test('other names', () => {
  assert.deepEqual(otherNames(profiles, ME), ['pagong'])
})

test('Check this out. heading says title or titles', () => {
  assert.equal(shareHeading('recommend', 1), 'Check out this title from my collection! 🎬')
  assert.equal(shareHeading('recommend', 3), 'Check out these titles from my collection! 🎬')
  assert.equal(shareHeading('movie-night', 2), 'Movie night? 🍿')
})

const base = { films: [alien, unverified], reviews, profiles, myId: ME }

test('switching kind swaps only the heading and keeps a typed note on that line', () => {
  const start = shareMessage({ kind: 'movie-night', ...base })
  const typed = start.replace('Movie night? 🍿', 'Movie night? 🍿 Friday at ours?') + '\nBring snacks'
  const swapped = switchHeading(typed, 'movie-night', 'recommend', 2)
  assert.ok(swapped.startsWith('Check out these titles from my collection! 🎬 Friday at ours?'))
  assert.ok(swapped.endsWith('Bring snacks'))
  assert.equal(switchHeading(swapped, 'recommend', 'movie-night', 2), typed)
  // Heading deleted by hand → nothing to swap, nothing touched.
  const noHeading = typed.split('\n').slice(1).join('\n')
  assert.equal(switchHeading(noHeading, 'movie-night', 'recommend', 2), noHeading)
})

test('the tick box adds and removes the other lines in place, keeping edits', () => {
  const start = shareMessage({ kind: 'movie-night', ...base }) + '\nSee you then!'
  const on = setOthersInText(start, { ...base, include: true })
  assert.equal(on, shareMessage({ kind: 'movie-night', ...base, includeOthers: true }) + '\nSee you then!')
  // Ticking twice adds nothing more.
  assert.equal(setOthersInText(on, { ...base, include: true }), on)
  assert.equal(setOthersInText(on, { ...base, include: false }), start)
})

test('the tick box leaves a film alone if its title line was changed', () => {
  const start = shareMessage({ kind: 'movie-night', ...base }).replace('Alien (1979)', 'ALIEN!!')
  const on = setOthersInText(start, { ...base, include: true })
  assert.ok(!on.includes('pagong ★★★★★'))
  assert.ok(on.includes('Dune (1984)\npagong ★★☆☆☆ “Long.”'))
})
