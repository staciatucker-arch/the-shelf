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
  describeFill,
  joinPhrases,
  matchPatch,
  blankForm,
  changedFields,
  filmToForm,
  formToRow,
  isPickerWrittenLabel,
  matchPanelState,
  newFilmRow,
  seasonNumberForLabel,
  seasonNumberPatch,
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

test('a new row carries an uploaded poster as a complete set of three', () => {
  // The whole point of minting the id in the browser: a cover uploaded
  // against that id arrives on the film's very first insert, so a film is
  // never briefly on the shelf without the poster that was chosen for it.
  const row = newFilmRow({ ...blankForm(), title: 'Alien' }, {
    id: 'uuid-1',
    poster: {
      publicUrl: 'https://x.supabase.co/storage/v1/object/public/posters/u/cover-1.jpg',
      path: 'u/cover-1.jpg',
    },
  })

  assert.equal(row.poster_source, 'upload')
  assert.equal(row.poster_storage_path, 'u/cover-1.jpg')
  assert.match(row.poster_url, /cover-1\.jpg$/)
})

test('a half-described poster fails the insert rather than writing two columns', () => {
  assert.throws(() =>
    newFilmRow({ ...blankForm(), title: 'Alien' }, {
      id: 'uuid-1',
      poster: { publicUrl: 'https://x/y.jpg' },
    }),
  )
})

test('a confirmed match still cannot put its own art on a new row', () => {
  // Uploading a poster does not relax the rule it sits beside: TMDB art is
  // shown while choosing and never saved.
  const row = newFilmRow({ ...blankForm(), title: 'Alien' }, {
    id: 'uuid-1',
    match: confirmedMatch,
    poster: { publicUrl: 'https://x/mine.jpg', path: 'u/mine.jpg' },
  })

  assert.equal(row.poster_url, 'https://x/mine.jpg')
  assert.notEqual(row.poster_url, confirmedMatch.poster_url)
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

/* --- what a confirmed match fills in, and what it says about it ---------- */

/* The shelf's genre list, abridged. Passed in explicitly because the mapping
   follows the LIVE list rather than a table in the source — see
   lib/tmdbGenres.js. Omitting it maps nothing, which is the point. */
const GENRE_LIST = ['action', 'adventure', 'drama', 'fantasy', 'sci-fi', 'vampire']

test('a match adds genres but never unticks one somebody chose', () => {
  const form = { ...blankForm(), genres: ['vampire'] }
  const next = applyMatch(form, {
    tmdb_id: 95,
    title: 'Buffy the Vampire Slayer',
    genres: [{ name: 'Drama' }, { name: 'Sci-Fi & Fantasy' }],
  }, { genreOptions: GENRE_LIST })
  assert.equal(next.genres.includes('vampire'), true, 'a chosen genre survives')
  assert.deepEqual(next.genres, ['vampire', 'drama', 'sci-fi', 'fantasy'])
})

test('a match with no genre list leaves the genres alone', () => {
  // `tmdb-search` omits `genres` until it is redeployed to include them, and
  // an absent list must not read as "this film has no genres".
  const form = { ...blankForm(), genres: ['vampire'] }
  const next = applyMatch(form, { tmdb_id: 95, title: 'Buffy the Vampire Slayer' },
    { genreOptions: GENRE_LIST })
  assert.deepEqual(next.genres, ['vampire'])
})

test('a genre the shelf has no word for never reaches the form', () => {
  const form = blankForm()
  const next = applyMatch(form, { tmdb_id: 1, title: 'x', genres: [{ name: 'Horror' }] },
    { genreOptions: GENRE_LIST })
  assert.deepEqual(next.genres, [])
})

test('the receipt names what the match actually changed', () => {
  const before = { ...blankForm(), title: 'buffy the vamp' }
  const after = applyMatch(before, {
    tmdb_id: 95,
    title: 'Buffy the Vampire Slayer',
    year: 1997,
    genres: [{ name: 'Drama' }, { name: 'Action & Adventure' }],
  }, { genreOptions: GENRE_LIST })
  assert.deepEqual(describeFill(before, after), ['the title', 'the year', '3 genres'])
})

test('the receipt says nothing about a year somebody typed themselves', () => {
  // The year is offered, never imposed, so it must not be claimed either.
  const before = { ...blankForm(), title: 'Alien', release_year: '1979' }
  const after = applyMatch(before, { tmdb_id: 348, title: 'Alien', year: 1979 })
  assert.deepEqual(describeFill(before, after), [])
})

test('one genre is said as "one genre", not "1 genres"', () => {
  const before = blankForm()
  const after = applyMatch(before, { tmdb_id: 1, title: 'x', genres: [{ name: 'Drama' }] },
    { genreOptions: GENRE_LIST })
  assert.deepEqual(describeFill(before, after), ['the title', 'one genre'])
})

test('phrases join the way the shelf writes lists', () => {
  assert.equal(joinPhrases([]), '')
  assert.equal(joinPhrases(['the title']), 'the title')
  assert.equal(joinPhrases(['the title', 'the year']), 'the title and the year')
  assert.equal(
    joinPhrases(['the title', 'the year', '3 genres']),
    'the title, the year and 3 genres',
  )
})

// --- the season's label and its number stay in step (review B1) -------------
//
// `season_number` is what the trigger-warning lookup reads, and it is only
// ever true to say "a person picked this from TMDB's list". Each test below
// is one of the three ways the two columns used to drift apart.

/** A series row whose season was picked from TMDB's list some time ago. */
const season3 = { ...film, title: 'True Blood', type: 'Series', season: 'Season 3', season_number: 3 }
const picked2 = { season_number: 2, name: 'Season 2' }

test('a picked season stores its number beside the label the picker wrote', () => {
  assert.equal(seasonNumberForLabel('Season 2', picked2), 2)
  assert.equal(seasonNumberForLabel('Specials', { season_number: 0, name: 'Specials' }), 0)
})

test('a season picked and then retyped is a typed season, with no number', () => {
  assert.equal(seasonNumberForLabel('Season 2 (UK cut)', picked2), null)
  assert.equal(seasonNumberForLabel('', picked2), null)
  assert.equal(seasonNumberForLabel('Season 2', null), null)
})

test('a new film gets the number only while its label is the picked one', () => {
  const picked = newFilmRow({ ...blankForm(), title: 'True Blood', season: 'Season 2' },
    { id: 'u2', season: picked2 })
  assert.equal(picked.season_number, 2)
  const retyped = newFilmRow({ ...blankForm(), title: 'True Blood', season: 'Season 4' },
    { id: 'u2', season: picked2 })
  assert.equal(retyped.season, 'Season 4')
  assert.equal(retyped.season_number, null)
})

// Route 1: the label retyped by hand while editing.
test('retyping a stored season by hand drops the number it was stored with', () => {
  const form = { ...filmToForm(season3), season: 'Season 4' }
  assert.deepEqual(changedFields(season3, form), { season: 'Season 4' })
  assert.deepEqual(seasonNumberPatch(season3, form), { season_number: null })
})

test('an edit that leaves the season alone leaves its number alone', () => {
  const form = { ...filmToForm(season3), vendor: 'Goodwill' }
  assert.deepEqual(seasonNumberPatch(season3, form), {})
})

test('a hand-typed season with no number needs nothing written', () => {
  const typed = { ...season3, season_number: null }
  const form = { ...filmToForm(typed), season: 'Season 5' }
  assert.deepEqual(seasonNumberPatch(typed, form), {})
})

// Routes 2 and 3: "Not a single season", and re-matching without picking one.
test('changing the match without picking a season clears the number', () => {
  const form = filmToForm(season3)
  assert.deepEqual(seasonNumberPatch(season3, form, { matchTouched: true }), { season_number: null })
})

test('picking a season while editing stores that number, last word after matchPatch', () => {
  const form = { ...filmToForm(season3), season: 'Season 2' }
  const patch = {
    ...changedFields(season3, form),
    ...matchPatch({ tmdb_id: 10545 }, { season: picked2 }),
    ...seasonNumberPatch(season3, form, { picked: picked2, matchTouched: true }),
  }
  assert.equal(patch.season, 'Season 2')
  assert.equal(patch.season_number, 2)
})

test('picking a season and then retyping it while editing stores no number', () => {
  const form = { ...filmToForm(season3), season: 'Season two' }
  const patch = {
    ...matchPatch({ tmdb_id: 10545 }, { season: picked2 }),
    ...seasonNumberPatch(season3, form, { picked: picked2, matchTouched: true }),
  }
  assert.equal(patch.season_number, null)
})

test('a label is picker-written when it is what this session picked', () => {
  assert.equal(isPickerWrittenLabel('Season 2', { picked: picked2 }), true)
  assert.equal(isPickerWrittenLabel('Season 2!', { picked: picked2 }), false)
})

test('a stored label is picker-written only if it came with a number and is untouched', () => {
  assert.equal(isPickerWrittenLabel('Season 3', { film: season3 }), true)
  assert.equal(isPickerWrittenLabel('Season 4', { film: season3 }), false)
  // No number: somebody typed this one, so it is never cleared for them.
  assert.equal(isPickerWrittenLabel('Season 3', { film: { ...season3, season_number: null } }), false)
})

test('an empty label, or a new film with nothing picked, is never picker-written', () => {
  assert.equal(isPickerWrittenLabel('', { film: season3 }), false)
  assert.equal(isPickerWrittenLabel('Season 1', {}), false)
})

// --- which face the match block shows (redesigned 2026-10-11) ---------------

test('adding a film always shows the search, as it did before', () => {
  assert.equal(matchPanelState({ editing: false }), 'search')
  assert.equal(matchPanelState({ editing: false, isBoxSet: true }), 'search')
})

test('a film a person confirmed earlier is one quiet line', () => {
  assert.equal(matchPanelState({ editing: true, existingId: 603, existingVerified: true }), 'matched')
})

// About one inherited id in twelve named a different film.
test('an id nobody confirmed is not shown as a match', () => {
  assert.equal(matchPanelState({ editing: true, existingId: 603, existingVerified: false }), 'ask')
})

test('a film with no id at all asks to be confirmed', () => {
  assert.equal(matchPanelState({ editing: true }), 'ask')
})

test('a box set is never asked to confirm a match, since sets are not matched', () => {
  assert.equal(matchPanelState({ editing: true, isBoxSet: true }), 'boxset')
  assert.equal(matchPanelState({ editing: true, isBoxSet: true, existingId: 10228 }), 'boxset')
})

// A set that was confirmed by a person before the rule existed keeps its
// Remove button rather than hiding the match it has.
test('a box set that somebody did confirm still shows as matched', () => {
  assert.equal(
    matchPanelState({ editing: true, isBoxSet: true, existingId: 1, existingVerified: true }),
    'matched',
  )
})

test('asking for the search shows it, whatever the film had before', () => {
  assert.equal(
    matchPanelState({ editing: true, searching: true, existingId: 603, existingVerified: true }),
    'search',
  )
  assert.equal(matchPanelState({ editing: true, searching: true }), 'search')
})

test('a candidate confirmed in this session wins over everything else', () => {
  assert.equal(
    matchPanelState({ editing: true, confirmedNow: true, existingId: 603, existingVerified: true }),
    'confirmed',
  )
  assert.equal(matchPanelState({ confirmedNow: true }), 'confirmed')
})

// --- never_watched (2026-10-25) ---------------------------------------------

test('ticking Never watched sends only that column', () => {
  assert.deepEqual(changedFields(film, editing({ never_watched: true })), { never_watched: true })
})

test('a row loaded without never_watched is not a change', () => {
  assert.equal(changedFields(film, filmToForm(film)), null)
})

test('a date wins over a stray Never watched tick', () => {
  const row = formToRow(editing({ never_watched: true, last_watched_on: '2026-10-25' }))
  assert.equal(row.never_watched, false)
  assert.equal(row.last_watched_on, '2026-10-25')
})
