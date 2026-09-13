import test from 'node:test'
import assert from 'node:assert/strict'

import { randomFillSync } from 'node:crypto'

import { newId } from './ids.js'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Runs `fn` with `globalThis.crypto` replaced, then puts the real one back. */
function withCrypto(replacement, fn) {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', {
    value: replacement,
    configurable: true,
    writable: true,
  })
  try {
    return fn()
  } finally {
    if (real) Object.defineProperty(globalThis, 'crypto', real)
    else delete globalThis.crypto
  }
}

test('a real UUID comes out', () => {
  assert.match(newId(), V4)
})

test('ids do not repeat', () => {
  const seen = new Set()
  for (let i = 0; i < 500; i += 1) seen.add(newId())
  assert.equal(seen.size, 500)
})

test('it still works where crypto.randomUUID does not exist', () => {
  // THE BUG THIS MODULE EXISTS FOR. `crypto.randomUUID` is a secure-context
  // API: present on HTTPS and on localhost, absent on the plain-http address
  // `npm run dev --host` prints for testing on a phone. Calling it there threw
  // while the form was rendering and, with no error boundary above it, took
  // the whole page down — pressing "Add film" turned the screen black.
  const insecure = { getRandomValues: (a) => randomFillSync(a) }
  withCrypto(insecure, () => {
    const id = newId()
    assert.match(id, V4, 'must still mint a real v4 UUID without randomUUID')
  })
})

test('the fallback sets the version and variant bits properly', () => {
  // Without these the id is 32 random hex characters claiming to be a UUID
  // version it is not. Feeding it all-zero bytes isolates exactly those bits.
  const zeroes = { getRandomValues: (a) => a.fill(0) }
  withCrypto(zeroes, () => {
    const id = newId()
    assert.equal(id, '00000000-0000-4000-8000-000000000000')
    assert.match(id, V4)
  })
})

test('the fallback never reaches for Math.random', () => {
  // An id is a primary key. A weak one collides quietly and much later, which
  // is the class of failure this rebuild exists to rule out — so no generator
  // at all is an error, not an excuse to guess.
  withCrypto({}, () => {
    assert.throws(() => newId(), /no secure random number generator/)
  })
  withCrypto(undefined, () => {
    assert.throws(() => newId(), /no secure random number generator/)
  })
})
