import test from 'node:test'
import assert from 'node:assert/strict'

import { genresToAdd, mapTmdbGenres, RENAMES, IGNORED } from './tmdbGenres.js'

/** The shelf's real genre list, abridged — the spellings that matter here. */
const SHELF = [
  'action', 'adventure', 'animated', 'comedy', 'crime', 'documentary', 'drama',
  'fantasy', 'historical', 'mystery', 'paranormal', 'psychological', 'romance',
  'sci-fi', 'slasher', 'supernatural', 'vampire', 'war', 'zombie',
]

test('a genre whose name is already on the list needs no rule', () => {
  // The whole point of the redesign: most of TMDB's genres are simply words
  // the shelf already uses, and nothing has to be written down for those.
  assert.deepEqual(mapTmdbGenres([{ name: 'Drama' }], SHELF).matched, ['drama'])
  assert.deepEqual(mapTmdbGenres([{ name: 'Crime' }], SHELF).matched, ['crime'])
  for (const name of ['Drama', 'Crime', 'Comedy', 'War']) {
    assert.equal(name in RENAMES, false, `${name} must not need a rule`)
  }
})

test('capitals and stray spaces do not stop a name matching', () => {
  assert.deepEqual(mapTmdbGenres(['  DRAMA '], SHELF).matched, ['drama'])
})

test('the shelf\'s own spelling is what gets stored', () => {
  // TMDB says "Science Fiction"; the row must read `sci-fi`, because that is
  // what every filter and every other film on the shelf uses.
  assert.deepEqual(mapTmdbGenres([{ name: 'Science Fiction' }], SHELF).matched, ['sci-fi'])
  assert.deepEqual(mapTmdbGenres([{ name: 'Animation' }], SHELF).matched, ['animated'])
  assert.deepEqual(mapTmdbGenres([{ name: 'History' }], SHELF).matched, ['historical'])
})

test('a paired television genre ticks both halves', () => {
  const { matched } = mapTmdbGenres([{ name: 'Sci-Fi & Fantasy' }], SHELF)
  assert.deepEqual(matched, ['sci-fi', 'fantasy'])
})

test('a genre the list has no word for is reported, not invented', () => {
  // Reported rather than dropped: this is the moment somebody would want to
  // know their list is missing something.
  const { matched, unmatched } = mapTmdbGenres(
    [{ name: 'Drama' }, { name: 'Horror' }, { name: 'Thriller' }],
    SHELF,
  )
  assert.deepEqual(matched, ['drama'])
  assert.deepEqual(unmatched, ['Horror', 'Thriller'])
})

test('adding the word to the list is all it takes — no code change', () => {
  // The drift this redesign exists to fix. The genre list lives in the
  // database; the translation used to live in the source, so adding `horror`
  // through Manage lists did nothing until somebody edited a file.
  const before = mapTmdbGenres([{ name: 'Horror' }], SHELF)
  assert.deepEqual(before.matched, [])
  assert.deepEqual(before.unmatched, ['Horror'])

  const after = mapTmdbGenres([{ name: 'Horror' }], [...SHELF, 'horror'])
  assert.deepEqual(after.matched, ['horror'])
  assert.deepEqual(after.unmatched, [])
})

test('a rule may not conjure a genre that is not on the list', () => {
  // `sci-fi` archived: the rule must tick what survives and nothing else.
  const withoutSciFi = SHELF.filter((g) => g !== 'sci-fi')
  const { matched } = mapTmdbGenres([{ name: 'Sci-Fi & Fantasy' }], withoutSciFi)
  assert.deepEqual(matched, ['fantasy'])
})

test('a rule with nothing left on the list reports the TMDB name', () => {
  const { matched, unmatched } = mapTmdbGenres([{ name: 'Science Fiction' }], ['drama'])
  assert.deepEqual(matched, [])
  assert.deepEqual(unmatched, ['Science Fiction'])
})

test('TMDB categories that are not genres are dropped without comment', () => {
  // "TV Movie" is a format and the rest are programming categories; reporting
  // them would only be noise beside the genres somebody might actually add.
  const { matched, unmatched } = mapTmdbGenres(
    IGNORED.map((name) => ({ name })),
    SHELF,
  )
  assert.deepEqual(matched, [])
  assert.deepEqual(unmatched, [])
})

test('bare strings work as well as TMDB\'s objects', () => {
  assert.deepEqual(mapTmdbGenres(['Drama', 'Crime'], SHELF).matched, ['drama', 'crime'])
})

test('nothing at all is not an empty genre list', () => {
  // `tmdb-search` omits `genres` until it is redeployed to include them.
  assert.deepEqual(mapTmdbGenres(undefined, SHELF).matched, [])
  assert.deepEqual(mapTmdbGenres(null, SHELF).matched, [])
})

test('without the shelf\'s list, nothing maps — it is never guessed', () => {
  // A caller that does not know what genres exist gets none, rather than a
  // fallback to some table's idea of what the list ought to contain.
  assert.deepEqual(mapTmdbGenres([{ name: 'Drama' }], undefined).matched, [])
  assert.deepEqual(mapTmdbGenres([{ name: 'Drama' }], []).matched, [])
})

test('duplicates collapse', () => {
  const { matched } = mapTmdbGenres(
    [{ name: 'Action & Adventure' }, { name: 'Action' }],
    SHELF,
  )
  assert.deepEqual(matched, ['action', 'adventure'])
})

test('genresToAdd never repeats something already ticked', () => {
  assert.deepEqual(
    genresToAdd(['action'], [{ name: 'Action' }, { name: 'Drama' }], SHELF),
    ['drama'],
  )
})

test('genresToAdd is additive only — it never proposes removing a choice', () => {
  // A confirmed match may suggest; it may not overrule. TMDB knows nothing
  // about why somebody ticked `vampire`.
  const mine = ['vampire', 'slasher']
  const added = genresToAdd(mine, [{ name: 'Drama' }], SHELF)
  assert.deepEqual(added, ['drama'])
  for (const kept of mine) {
    assert.equal(added.includes(kept), false)
  }
})
