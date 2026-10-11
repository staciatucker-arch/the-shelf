import assert from 'node:assert/strict'
import test from 'node:test'

import { MIN_REFRESH_GAP_MS, isStale, refreshDecision } from './refresh.js'

const base = { due: true, loaded: true, panelOpen: false, lastLoadedAt: 0, now: MIN_REFRESH_GAP_MS }

test('coming back to a list that is old enough refreshes it', () => {
  assert.equal(refreshDecision(base), 'refresh')
})

test('nothing happens unless the app actually came back', () => {
  assert.equal(refreshDecision({ ...base, due: false }), 'idle')
})

// The edit form holds typing; the detail panel holds a history entry.
test('an open panel makes the refresh wait rather than run or be forgotten', () => {
  assert.equal(refreshDecision({ ...base, panelOpen: true }), 'wait')
})

test('waiting wins over freshness, so the refresh is still owed when the panel closes', () => {
  assert.equal(refreshDecision({ ...base, panelOpen: true, now: 1 }), 'wait')
})

// Taking a cover photo hides the page for a few seconds and shows it again.
test('a list only seconds old is left alone', () => {
  assert.equal(refreshDecision({ ...base, now: MIN_REFRESH_GAP_MS - 1 }), 'drop')
})

// The first load, or its error and Try again button, own the screen.
test('nothing loaded yet means the refresh is dropped, not queued behind the first load', () => {
  assert.equal(refreshDecision({ ...base, loaded: false }), 'drop')
  assert.equal(refreshDecision({ ...base, loaded: false, panelOpen: true }), 'drop')
})

test('the gap can be set, so a test need not wait thirty seconds', () => {
  assert.equal(refreshDecision({ ...base, now: 5, minGap: 5 }), 'refresh')
  assert.equal(refreshDecision({ ...base, now: 4, minGap: 5 }), 'drop')
})

test('a list fetched with no write alongside it is shown', () => {
  assert.equal(isStale(4, 4), false)
})

// A save bumps the counter when it starts and when it lands, so a read that
// overlaps either end of it is caught.
test('a list fetched while a save was in flight is thrown away', () => {
  assert.equal(isStale(4, 5), true)
  assert.equal(isStale(4, 6), true)
})
