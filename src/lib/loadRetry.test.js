import assert from 'node:assert/strict'
import test from 'node:test'

import { RETRY_DELAY_MS, isClockSkewError, withClockSkewRetry } from './loadRetry.js'

// The message the live app actually showed on 2026-09-24.
const SKEW = { message: 'JWT issued at future' }

test('the error Stacia saw is recognised', () => {
  assert.equal(isClockSkewError(SKEW), true)
})

test('the other clock claim is recognised too', () => {
  assert.equal(isClockSkewError({ message: 'JWT not yet valid' }), true)
})

test('a plain string is accepted, since that is what loadOptions passes on', () => {
  assert.equal(isClockSkewError('JWT issued at future'), true)
})

// The whole point of the narrowness: these are real answers, not hiccups.
// Retrying them would turn an outage into a slower outage.
test('a real failure is never treated as a hiccup', () => {
  assert.equal(isClockSkewError({ message: 'JWT expired' }), false)
  assert.equal(isClockSkewError({ message: 'permission denied for table films' }), false)
  assert.equal(isClockSkewError({ message: 'invalid signature' }), false)
  assert.equal(isClockSkewError({ message: 'Failed to fetch' }), false)
})

test('no error at all is not a hiccup', () => {
  assert.equal(isClockSkewError(null), false)
  assert.equal(isClockSkewError(undefined), false)
  assert.equal(isClockSkewError({}), false)
})

test('success is returned untouched, and tried only once', async () => {
  let calls = 0
  const result = await withClockSkewRetry(async () => {
    calls += 1
    return { data: [{ title: 'Alien' }], error: null }
  })
  assert.equal(calls, 1)
  assert.deepEqual(result, { data: [{ title: 'Alien' }], error: null })
})

test('a clock hiccup is retried once and then succeeds', async () => {
  let calls = 0
  let waited = null
  const result = await withClockSkewRetry(
    async () => {
      calls += 1
      if (calls === 1) return { data: null, error: SKEW }
      return { data: [{ title: 'Alien' }], error: null }
    },
    { sleep: async (ms) => { waited = ms } },
  )
  assert.equal(calls, 2)
  assert.equal(waited, RETRY_DELAY_MS)
  assert.equal(result.error, null)
  assert.deepEqual(result.data, [{ title: 'Alien' }])
})

// One retry, not a loop. A database whose clock is genuinely wrong must still
// reach the person rather than being hidden behind endless quiet retries.
test('a persistent hiccup is retried exactly once and then reported', async () => {
  let calls = 0
  const result = await withClockSkewRetry(
    async () => {
      calls += 1
      return { data: null, error: SKEW }
    },
    { sleep: async () => {} },
  )
  assert.equal(calls, 2)
  assert.equal(result.error, SKEW)
  assert.equal(result.data, null)
})

test('a real failure is reported immediately, with no wait', async () => {
  let calls = 0
  let slept = false
  const denied = { message: 'permission denied for table films' }
  const result = await withClockSkewRetry(
    async () => {
      calls += 1
      return { data: null, error: denied }
    },
    { sleep: async () => { slept = true } },
  )
  assert.equal(calls, 1)
  assert.equal(slept, false)
  assert.equal(result.error, denied)
})

// Never let a failure look like an empty collection — the rule the whole
// codebase is built against. A retried-and-still-failing load returns the
// error, never `data: []`.
test('a failed load never hands back an empty collection', async () => {
  const result = await withClockSkewRetry(async () => ({ data: null, error: SKEW }), {
    sleep: async () => {},
  })
  assert.notEqual(result.error, null)
  assert.notDeepEqual(result.data, [])
})
