import assert from 'node:assert/strict'
import test from 'node:test'

import { POSTER_CACHE, RETIRED_CACHES, isPosterRequest, retireOldCaches } from './cacheRules.js'

const req = (href) => ({ url: new URL(href) })
const SUPABASE = 'https://agqheazstgzyvjglxjad.supabase.co'

test('an uploaded cover may be kept', () => {
  assert.equal(isPosterRequest(req(`${SUPABASE}/storage/v1/object/public/posters/abc/cover-1.jpg`)), true)
})

test('a cover still served from GitHub may be kept', () => {
  assert.equal(isPosterRequest(req('https://staciatucker-arch.github.io/shelf-life/posters/x.jpg')), true)
})

test('the collection is never kept', () => {
  assert.equal(isPosterRequest(req(`${SUPABASE}/rest/v1/films?select=*`)), false)
})

test('sign-in is never kept', () => {
  assert.equal(isPosterRequest(req(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`)), false)
  assert.equal(isPosterRequest(req(`${SUPABASE}/auth/v1/user`)), false)
})

test('TMDB lookups are never kept', () => {
  assert.equal(isPosterRequest(req(`${SUPABASE}/functions/v1/tmdb-search`)), false)
})

test('a lookalike host is not trusted', () => {
  assert.equal(isPosterRequest(req('https://supabase.co.evil.example/storage/v1/object/x.jpg')), false)
})

// The function is copied into the service worker as text. If it ever starts
// using something outside itself, this catches it before a build ships a
// service worker that throws on every request.
test('the rule works with nothing around it, as it will in the service worker', () => {
  const standalone = new Function(`return (${isPosterRequest.toString()})`)()
  assert.equal(standalone(req(`${SUPABASE}/storage/v1/object/public/posters/a.jpg`)), true)
  assert.equal(standalone(req(`${SUPABASE}/rest/v1/films`)), false)
})

test('the new store has a different name from every retired one', () => {
  assert.equal(RETIRED_CACHES.includes(POSTER_CACHE), false)
})

test('the old store is deleted, and a missing one is fine', async () => {
  const deleted = []
  const fake = { delete: async (name) => (deleted.push(name), name === 'posters') }
  assert.deepEqual(await retireOldCaches(fake), ['posters'])
  assert.deepEqual(deleted, ['posters'])
  assert.deepEqual(await retireOldCaches(undefined), [])
})
