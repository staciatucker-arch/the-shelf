import test from 'node:test'
import assert from 'node:assert/strict'

import { genresToAdd, shelfGenresFor, TMDB_TO_SHELF, UNMAPPED } from './tmdbGenres.js'

test('TMDB genre names translate to the shelf\'s own words', () => {
  assert.deepEqual(shelfGenresFor([{ name: 'Science Fiction' }]), ['sci-fi'])
  assert.deepEqual(shelfGenresFor([{ name: 'Animation' }]), ['animated'])
  assert.deepEqual(shelfGenresFor([{ name: 'History' }]), ['historical'])
})

test('a paired television genre ticks both halves', () => {
  // TMDB's TV list pairs what its film list keeps apart, and a show tagged
  // "Sci-Fi & Fantasy" is honestly both.
  assert.deepEqual(shelfGenresFor([{ name: 'Sci-Fi & Fantasy' }]), ['sci-fi', 'fantasy'])
  assert.deepEqual(shelfGenresFor([{ name: 'Action & Adventure' }]), ['action', 'adventure'])
})

test('bare strings work as well as TMDB\'s objects', () => {
  assert.deepEqual(shelfGenresFor(['Drama', 'Crime']), ['drama', 'crime'])
})

test('a genre the shelf has no word for is dropped, not invented', () => {
  // Horror is the big one: the shelf splits it into slasher, zombie, creature,
  // paranormal, supernatural and psychological, and guessing which was meant
  // would be wrong more often than right. Passing "Horror" through would put a
  // value on a film that no filter offers and no option list contains.
  assert.deepEqual(shelfGenresFor([{ name: 'Horror' }]), [])
  assert.deepEqual(shelfGenresFor([{ name: 'Thriller' }, { name: 'Western' }]), [])
  for (const name of UNMAPPED) {
    assert.equal(name in TMDB_TO_SHELF, false, `${name} must stay unmapped`)
  }
})

test('a genre TMDB adds in future cannot arrive as an unknown value', () => {
  assert.deepEqual(shelfGenresFor([{ name: 'Competitive Knitting' }]), [])
})

test('nothing at all is not an empty genre list', () => {
  // The Edge Function omits `genres` entirely until it is redeployed to
  // include them, and an absent list must add nothing.
  assert.deepEqual(shelfGenresFor(undefined), [])
  assert.deepEqual(shelfGenresFor(null), [])
})

test('duplicates collapse', () => {
  const both = shelfGenresFor([{ name: 'Action & Adventure' }, { name: 'Action' }])
  assert.deepEqual(both, ['action', 'adventure'])
})

test('genresToAdd never repeats something already ticked', () => {
  assert.deepEqual(genresToAdd(['action'], [{ name: 'Action' }, { name: 'Drama' }]), ['drama'])
})

test('genresToAdd is additive only — it never proposes removing a choice', () => {
  // A confirmed match may suggest; it may not overrule. TMDB knows nothing
  // about why somebody ticked `vampire`.
  const mine = ['vampire', 'slasher']
  const added = genresToAdd(mine, [{ name: 'Drama' }])
  assert.deepEqual(added, ['drama'])
  for (const kept of mine) {
    assert.equal(added.includes(kept), false)
  }
})
