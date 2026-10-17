import assert from 'node:assert/strict'
import test from 'node:test'

import { createScrollLock } from './scrollLock.js'

test('one panel locks the page and gives it back', () => {
  const style = { overflow: '' }
  const release = createScrollLock(style)()
  assert.equal(style.overflow, 'hidden')
  release()
  assert.equal(style.overflow, '')
})

// The 2026-10-17 bug: deleting a film closes the details panel and the edit
// form over it together, panel first.
test('two panels closing in the order they opened leave the page scrollable', () => {
  const style = { overflow: '' }
  const lock = createScrollLock(style)
  const panel = lock()
  const form = lock()
  panel()
  assert.equal(style.overflow, 'hidden', 'the form is still open')
  form()
  assert.equal(style.overflow, '')
})

test('two panels closing in the reverse order leave the page scrollable too', () => {
  const style = { overflow: '' }
  const lock = createScrollLock(style)
  const panel = lock()
  const form = lock()
  form()
  panel()
  assert.equal(style.overflow, '')
})

test('releasing twice does not unlock for a panel that is still open', () => {
  const style = { overflow: '' }
  const lock = createScrollLock(style)
  const panel = lock()
  const form = lock()
  form()
  form()
  assert.equal(style.overflow, 'hidden')
  panel()
  assert.equal(style.overflow, '')
})

test("the page's own value is what comes back", () => {
  const style = { overflow: 'auto' }
  const release = createScrollLock(style)()
  release()
  assert.equal(style.overflow, 'auto')
})
