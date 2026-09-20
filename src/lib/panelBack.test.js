import assert from 'node:assert/strict'
import test from 'node:test'

import { createPanelBack } from './panelBack.js'

/** A browser's history, small enough to see all of it. */
function fakeBrowser() {
  let handler = null
  const moves = []
  const history = {
    pushed: 0,
    pushState() {
      this.pushed += 1
    },
    go(delta) {
      moves.push(delta)
      // A real browser fires popstate once per step it actually moves.
      for (let i = 0; i < Math.abs(delta); i += 1) handler?.()
    },
  }
  const subscribe = (h) => {
    handler = h
    return () => {
      handler = null
    }
  }
  return {
    history,
    subscribe,
    moves,
    back: () => handler?.(),
    listening: () => handler !== null,
  }
}

test('opening a panel adds one history entry', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  back.open(() => {})
  assert.equal(b.history.pushed, 1)
  assert.equal(back.depth(), 1)
})

test('a back press closes the panel instead of leaving the page', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  let closed = false
  back.open(() => {
    closed = true
  })
  b.back()
  assert.equal(closed, true)
  assert.equal(back.depth(), 0)
  // The browser already moved; the app must not ask it to move again.
  assert.deepEqual(b.moves, [])
})

test('back closes the top panel only, and unwinds in order', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const order = []
  const detail = back.open(() => order.push('detail'), { id: 'detail' })
  const form = back.open(() => order.push('form'), { id: 'form' })
  back.open(() => order.push('crop'), { id: 'crop' })

  b.back()
  b.back()
  b.back()
  assert.deepEqual(order, ['crop', 'form', 'detail'])
  assert.equal(back.depth(), 0)
  assert.ok(detail && form)
})

test('closing with the X removes that panel’s entry, and closes nothing else', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const closed = []
  const detail = back.open(() => closed.push('detail'), { id: 'detail' })
  const form = back.open(() => closed.push('form'), { id: 'form' })

  back.close(form, { flushNow: true })
  assert.deepEqual(b.moves, [-1], 'one entry removed')
  assert.deepEqual(closed, [], 'the panel underneath is untouched')
  assert.equal(back.depth(), 1)

  // And the panel underneath still answers a real back press.
  b.back()
  assert.deepEqual(closed, ['detail'])
  assert.ok(detail)
})

test('closing two panels at once is one history move, not two', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const detail = back.open(() => {}, { id: 'detail' })
  const form = back.open(() => {}, { id: 'form' })

  // What deleting a film does: both panels close in the same tick.
  back.close(form)
  back.close(detail)
  back.flush()
  assert.deepEqual(b.moves, [-2])
  assert.equal(back.depth(), 0)
})

test('a panel closed by back is not closed twice', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  let entry = null
  let closes = 0
  entry = back.open(() => {
    closes += 1
    // React unmounts the panel, which calls close() on the way out.
    back.close(entry, { flushNow: true })
  })
  b.back()
  assert.equal(closes, 1)
  assert.deepEqual(b.moves, [], 'the browser had already gone back')
})

test('it stops listening once nothing is open', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const entry = back.open(() => {})
  assert.equal(b.listening(), true)
  back.close(entry, { flushNow: true })
  assert.equal(b.listening(), false)
})

test('closing something already gone does nothing', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  back.close(null, { flushNow: true })
  const entry = back.open(() => {})
  back.close(entry, { flushNow: true })
  back.close(entry, { flushNow: true })
  assert.equal(back.depth(), 0)
})

test('a panel that refuses to close keeps its guard', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  let saving = true
  let closes = 0
  back.open(() => {
    if (saving) return false
    closes += 1
    return true
  })
  const pushedWhileOpen = b.history.pushed

  b.back()
  assert.equal(closes, 0, 'it did not close mid-save')
  assert.equal(back.depth(), 1, 'it is still guarded')
  assert.equal(b.history.pushed, pushedWhileOpen + 1, 'the entry was put back')

  // And once the save finishes, back closes it as normal.
  saving = false
  b.back()
  assert.equal(closes, 1)
  assert.equal(back.depth(), 0)
})

test('replacing one panel with another leaves exactly one entry', () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  let detailClosed = 0
  let formClosed = 0
  const detail = back.open(() => (detailClosed += 1), { id: 'detail' })

  // Pressing Edit: React unmounts the details and mounts the form in one
  // commit, cleanups first. The removal is batched, the push is not.
  back.close(detail)
  back.open(() => (formClosed += 1), { id: 'form' })
  back.flush()

  assert.equal(b.history.pushed, 2)
  assert.deepEqual(b.moves, [-1], 'the two cancel out')
  assert.equal(back.depth(), 1, 'one panel is open, so one entry guards it')

  // And one back press closes the form and nothing else.
  b.back()
  assert.equal(formClosed, 1)
  assert.equal(detailClosed, 0)
  assert.equal(back.depth(), 0)
})
