import test from 'node:test'
import assert from 'node:assert/strict'
import { keepSession, userIdOf } from './session.js'

const stacia = () => ({ access_token: Math.random(), user: { id: 'u-stacia', email: 's@x' } })
const ingrid = () => ({ access_token: Math.random(), user: { id: 'u-ingrid', email: 'i@x' } })

test('the same person announced again keeps the object already held', () => {
  const held = stacia()
  // What the library does on every return to the app, and on token refresh.
  assert.equal(keepSession(held, stacia()), held)
})

test('signing in from nothing takes the new session', () => {
  const next = stacia()
  assert.equal(keepSession(null, next), next)
})

test('a different person replaces the session', () => {
  const next = ingrid()
  assert.equal(keepSession(stacia(), next), next)
})

test('signing out clears it', () => {
  assert.equal(keepSession(stacia(), null), null)
  assert.equal(keepSession(stacia(), undefined), null)
})

test('a session with no user is nobody', () => {
  assert.equal(userIdOf(null), null)
  assert.equal(userIdOf({}), null)
  assert.equal(userIdOf({ user: { id: 'a' } }), 'a')
})
