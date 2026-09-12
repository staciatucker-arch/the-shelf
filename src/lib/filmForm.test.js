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
  applyMatch,
  matchPatch,
  blankForm,
  changedFields,
  filmToForm,
  formToRow,
  newFilmRow,
  validateForm,
  withCurrent,
} from './filmForm.js'

/** A film with a bit of everything: set values, nulls, and two arrays. */
const film = {
  id: 'u1',
  title: 'Alien',
  release_year: 1979,
  season: null,
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

/* --- adding a new film (§6b step 6, second part) ------------------------- */

const confirmedMatch = {
  tmdb_id: 348,
  kind: 'movie',
  title: 'Alien',
  year: 1979,
  poster_url: 'https://image.tmdb.org/t/p/w342/alien.jpg',
}

test('a blank form carries no values and no arrays borrowed from elsewhere', () => {
  const a = blankForm()
  const b = blankForm()
  assert.equal(a.title, '')
  assert.equal(a.cost, '')
  assert.deepEqual(a.genres, [])
  // Two blank forms must not share one array, or typing in the second window
  // would change the first.
  a.genres.push('Horror')
  assert.deepEqual(b.genres, [])
})

test('a new row carries the minted id and every editable column', () => {
  const form = { ...blankForm(), title: 'Alien', cost: '12.50', genres: ['Horror'] }
  const row = newFilmRow(form, { id: 'uuid-1', match: null })

  assert.equal(row.id, 'uuid-1')
  assert.equal(row.title, 'Alien')
  assert.equal(row.cost, 12.5)
  assert.deepEqual(row.genres, ['Horror'])
  // Blank stays unknown on an insert exactly as it does on a patch.
  assert.equal(row.market_value, null)
  assert.equal(row.vendor, null)
})

test('a new row never carries a poster column, even with a match confirmed', () => {
  const row = newFilmRow({ ...blankForm(), title: 'Alien' }, {
    id: 'uuid-1',
    match: confirmedMatch,
  })

  // The match has a poster_url on it; the row must not.
  for (const column of ['poster_url', 'poster_source', 'poster_storage_path']) {
    assert.equal(column in row, false, `${column} must not reach the insert`)
  }
})

test('tmdb_verified is true only when a human confirmed a candidate', () => {
  const unmatched = newFilmRow({ ...blankForm(), title: 'Alien' }, { id: 'u', match: null })
  assert.equal(unmatched.tmdb_id, null)
  assert.equal(unmatched.tmdb_verified, false)

  const matched = newFilmRow({ ...blankForm(), title: 'Alien' }, {
    id: 'u',
    match: confirmedMatch,
  })
  assert.equal(matched.tmdb_id, 348)
  assert.equal(matched.tmdb_verified, true)
})

test('confirming a match fills an empty year, and never the poster', () => {
  const before = { ...blankForm(), title: 'Alien' }
  const after = applyMatch(before, confirmedMatch)

  assert.equal(after.release_year, '1979')
  // Above all: the poster is not the match's business.
  assert.equal('poster_url' in after, false)
  assert.equal('poster_source' in after, false)
})

test('confirming a match replaces the typed title with the accurate one', () => {
  // What gets typed is a search fragment, not the name for the shelf. This is
  // the bug that left a card reading "Battlestar".
  const typed = { ...blankForm(), title: 'battlestar' }
  const match = { tmdb_id: 1972, title: 'Battlestar Galactica', year: 2004, kind: 'tv' }

  assert.equal(applyMatch(typed, match).title, 'Battlestar Galactica')
})

test('a chosen season beats both the year and whatever was typed', () => {
  const typed = { ...blankForm(), title: 'battlestar', release_year: '2004' }
  const match = { tmdb_id: 1972, title: 'Battlestar Galactica', year: 2004, kind: 'tv' }

  // TMDB's own label is used where it has one.
  const s1 = applyMatch(typed, match, { season: { season_number: 1, name: 'Season 1' } })
  assert.equal(s1.season, 'Season 1')

  // Season 0 is "Specials" on TMDB, and is not rewritten into "Season 0".
  const sp = applyMatch(typed, match, { season: { season_number: 0, name: 'Specials' } })
  assert.equal(sp.season, 'Specials')

  // A bare number is accepted too.
  assert.equal(applyMatch(typed, match, { season: 3 }).season, 'Season 3')
})

test('without a season, a match never overwrites a year somebody typed', () => {
  // The box set is a 2003 edition of a 1979 film; the human is right.
  const typed = { ...blankForm(), title: 'Alien', release_year: '2003' }
  assert.equal(applyMatch(typed, confirmedMatch).release_year, '2003')

  // And a contents list in that column is certainly not to be replaced.
  const contents = { ...blankForm(), season: 'Alien (1979),\nAliens (1986),' }
  assert.equal(applyMatch(contents, confirmedMatch).season, contents.season)
})

test('a match with no year still names the film, but invents no year', () => {
  const form = { ...blankForm(), title: 'some unreleased thing' }

  // TMDB knows what it is called even when it has no release date yet, so the
  // title is still worth taking; the empty year stays empty rather than being
  // filled with a guess.
  const after = applyMatch(form, { tmdb_id: 1, title: 'Some Unreleased Thing', year: null })
  assert.equal(after.title, 'Some Unreleased Thing')
  assert.equal(after.release_year, '')
})

test('no match at all changes nothing', () => {
  const form = { ...blankForm(), title: 'Some Unreleased Thing' }
  assert.deepEqual(applyMatch(form, null), form)
})

test('changing a match clears the cached trigger data', () => {
  // dtdd_media_id points at warnings cached for the film the OLD id named.
  // Left in place while the id moves, it would show one title's content
  // warnings under another title's name — silently, at step 9, long after
  // the edit that caused it.
  const patch = matchPatch({ tmdb_id: 95, title: 'Buffy the Vampire Slayer' })
  assert.equal(patch.tmdb_id, 95)
  assert.equal(patch.tmdb_verified, true)
  assert.equal(patch.dtdd_media_id, null)
})

test('clearing a match leaves the film honestly unmatched', () => {
  // What a box set needs: no id at all, reading "not yet checked".
  const patch = matchPatch(null)
  assert.equal(patch.tmdb_id, null)
  assert.equal(patch.tmdb_verified, false)
  assert.equal(patch.dtdd_media_id, null)
  assert.equal(patch.season_number, null)
})

test('a match patch never carries a poster or an editable field', () => {
  const patch = matchPatch({ tmdb_id: 95, title: 'x', poster_url: 'http://tmdb/x.jpg' })
  for (const forbidden of ['poster_url', 'poster_source', 'poster_storage_path', 'title']) {
    assert.equal(forbidden in patch, false, `${forbidden} must not be in a match patch`)
  }
})
