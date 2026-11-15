import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  featuredTopics,
  filmTriggerState,
  flaggedByMedia,
  indexMedia,
  lookupKey,
  scopeLabel,
  searchTopics,
  showsNotChecked,
  splitForPanel,
  topicsByCategory,
  verdict,
} from './triggers.js'

const alien = { tmdb_verified: true, tmdb_id: 348, tmdb_kind: 'movie', season_number: null }
const buffyS1 = { tmdb_verified: true, tmdb_id: 95, tmdb_kind: 'tv', season_number: 1 }
const buffyAll = { tmdb_verified: true, tmdb_id: 95, tmdb_kind: 'tv', season_number: null }

test('the lookup key is kind, id and season — only for a confirmed match', () => {
  assert.equal(lookupKey(alien), 'movie:348:-1')
  assert.equal(lookupKey(buffyS1), 'tv:95:1')
  assert.equal(lookupKey(buffyAll), 'tv:95:-1')
  assert.equal(lookupKey({ ...alien, tmdb_verified: false }), null)
  assert.equal(lookupKey({ ...alien, tmdb_kind: null }), null)
  // A film is never looked up by season, even if a number is lying around.
  assert.equal(lookupKey({ ...alien, season_number: 3 }), 'movie:348:-1')
})

const media = indexMedia([
  { id: 'm-alien', tmdb_kind: 'movie', tmdb_id: 348, season: -1, lookup_status: 'matched' },
  { id: 'm-b1', tmdb_kind: 'tv', tmdb_id: 95, season: 1, lookup_status: 'matched' },
  { id: 'm-gone', tmdb_kind: 'movie', tmdb_id: 7, season: -1, lookup_status: 'no_match' },
])
const flagged = flaggedByMedia([
  { media_id: 'm-alien', topic_id: 'blood', yes_count: 125, no_count: 1 },
  { media_id: 'm-alien', topic_id: 'dog', yes_count: 7, no_count: 195 },
  { media_id: 'm-b1', topic_id: 'kid', yes_count: 59, no_count: 0 },
  // More yes than no, but on one vote: not flagged by Stacia's rule.
  { media_id: 'm-alien', topic_id: 'kid', yes_count: 1, no_count: 0, is_flagged: true },
])

test('a person with no topics chosen gets nothing at all', () => {
  assert.equal(filmTriggerState(alien, { media, flagged, myTopics: new Set() }).state, 'none-chosen')
})

test('only your own topics are counted', () => {
  const s = filmTriggerState(alien, { media, flagged, myTopics: new Set(['blood', 'dog', 'kid']) })
  assert.deepEqual([s.state, s.count], ['checked', 1])
  const other = filmTriggerState(alien, { media, flagged, myTopics: new Set(['kid']) })
  assert.deepEqual([other.state, other.count], ['checked', 0])
})

test('a season uses its own answer; the whole show is a different lookup', () => {
  const mine = new Set(['kid'])
  assert.equal(filmTriggerState(buffyS1, { media, flagged, myTopics: mine }).count, 1)
  assert.equal(filmTriggerState(buffyAll, { media, flagged, myTopics: mine }).state, 'unchecked')
})

test('every way of not knowing is "not checked", never a clean answer', () => {
  const mine = new Set(['blood'])
  const states = [
    filmTriggerState({ title: 'box set' }, { media, flagged, myTopics: mine }).state,
    filmTriggerState({ ...alien, tmdb_id: 999 }, { media, flagged, myTopics: mine }).state,
    filmTriggerState({ ...alien, tmdb_id: 7 }, { media, flagged, myTopics: mine }).state,
  ]
  assert.deepEqual(states, ['unmatched', 'unchecked', 'not-listed'])
  assert.ok(states.every(showsNotChecked))
  assert.equal(showsNotChecked('checked'), false)
  assert.equal(showsNotChecked('none-chosen'), false)
})

test('the scope is always said', () => {
  assert.equal(scopeLabel(alien, { tmdb_kind: 'movie', season: -1 }), 'For the film')
  assert.equal(scopeLabel(buffyS1, { tmdb_kind: 'tv', season: 1 }), 'Season 1')
  assert.equal(scopeLabel(buffyAll, { tmdb_kind: 'tv', season: -1 }), 'Whole series')
})

test('flagged needs 5 votes and a 5-vote lead (Stacia, 2026-11-15)', () => {
  assert.equal(verdict(5, 0), 'flagged')
  assert.equal(verdict(10, 5), 'flagged')
  assert.equal(verdict(4, 0), 'unsure') // too few votes
  assert.equal(verdict(1, 0), 'unsure') // one vote is never enough
  assert.equal(verdict(40, 37), 'unsure') // too close
  assert.equal(verdict(0, 5), 'no')
  assert.equal(verdict(2, 1), 'unsure')
  assert.equal(verdict(0, 0), 'unanswered')
})

test('the panel splits your topics: flagged, not enough votes, more voted no, no answer', () => {
  const topics = new Map(['blood', 'dog', 'kid', 'spider', 'close'].map((id) => [id, { id, name: id }]))
  const votes = [
    { topic_id: 'blood', yes_count: 125, no_count: 1, is_flagged: true },
    { topic_id: 'dog', yes_count: 7, no_count: 195, is_flagged: false },
    { topic_id: 'spider', yes_count: 0, no_count: 0, is_flagged: false },
    { topic_id: 'close', yes_count: 2, no_count: 0, is_flagged: true },
  ]
  const s = splitForPanel(votes, new Set(['blood', 'dog', 'kid', 'spider', 'close']), topics)
  assert.deepEqual(s.flagged.map((x) => x.topic.id), ['blood'])
  // Nothing is dropped: a weak yes is listed, labelled for what it is.
  assert.deepEqual(s.unsure.map((x) => x.topic.id), ['close'])
  assert.deepEqual(s.votedNo.map((x) => x.topic.id), ['dog'])
  // No row, and a row of 0 and 0, are both "no answer yet" — never "no".
  assert.deepEqual(s.noAnswer.map((x) => x.topic.id), ['kid', 'spider'])
})

test('search finds by name, then keywords, then category, ignoring accents', () => {
  const topics = [
    { id: 1, name: 'a dog dies', keywords: 'canine death', category: 'Animal Death' },
    { id: 2, name: 'someone is injected', keywords: 'needles, syringe', category: 'Medical' },
    { id: 3, name: 'déjà vu', keywords: '', category: 'Mental Health' },
  ]
  assert.deepEqual(searchTopics(topics, 'needle').map((t) => t.id), [2])
  assert.deepEqual(searchTopics(topics, 'DOG').map((t) => t.id), [1])
  assert.deepEqual(searchTopics(topics, 'deja').map((t) => t.id), [3])
  assert.deepEqual(searchTopics(topics, 'medical').map((t) => t.id), [2])
  assert.deepEqual(searchTopics(topics, '  '), [])
})

test('topics group by category, and the featured ones exclude spoilers', () => {
  const topics = [
    { name: 'b', category: 'Fear', dtdd_ordering: 100000 },
    { name: 'a dog dies', category: 'Animal Death', dtdd_ordering: 100 },
    { name: 'a cat dies', category: 'Animal Death', dtdd_ordering: 150 },
    { name: 'twist', category: 'Spoiler', dtdd_ordering: 50, is_spoiler: true },
  ]
  assert.deepEqual(topicsByCategory(topics).map((g) => g.category), ['Animal Death', 'Fear', 'Spoiler'])
  assert.deepEqual(featuredTopics(topics).map((t) => t.name), ['a dog dies', 'a cat dies'])
})
