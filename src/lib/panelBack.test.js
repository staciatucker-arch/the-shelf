import assert from 'node:assert/strict'
import test from 'node:test'

import { createPanelBack } from './panelBack.js'

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * A browser's session history, small enough to see all of it.
 *
 * It keeps real entries and a real position, and it records the thing that
 * actually went wrong on Stacia's phone: pressing back when there is nothing
 * left to go back to **leaves the app**.
 */
function fakeBrowser() {
  let handler = null
  const state = { entries: ['base'], index: 0, left: false }

  const history = {
    pushState(s) {
      state.entries = state.entries.slice(0, state.index + 1)
      state.entries.push(s)
      state.index += 1
    },
    go(delta) {
      const target = state.index + delta
      if (target < 0) {
        state.left = true
        return
      }
      state.index = target
      handler?.()
    },
  }

  return {
    history,
    state,
    subscribe: (h) => {
      handler = h
      return () => {
        handler = null
      }
    },
    /** A person pressing back. */
    press() {
      if (state.index === 0) {
        state.left = true
        return
      }
      state.index -= 1
      handler?.()
    },
    /** How many entries the app is holding above the collection screen. */
    depth: () => state.index,
    listening: () => handler !== null,
  }
}

test('a panel arms exactly one history entry', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  back.open(() => {})
  await tick()
  assert.equal(b.depth(), 1)
  assert.equal(back.isArmed(), true)
})

test('back closes the panel instead of leaving the app', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  let closed = false
  back.open(() => {
    closed = true
  })
  await tick()
  b.press()
  await tick()
  assert.equal(closed, true)
  assert.equal(b.state.left, false, 'the app is still open')
  assert.equal(b.depth(), 0)
})

test('three stacked panels still hold one entry, and unwind in order', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const order = []
  back.open(() => order.push('detail'), { id: 'detail' })
  back.open(() => order.push('form'), { id: 'form' })
  back.open(() => order.push('crop'), { id: 'crop' })
  await tick()
  assert.equal(b.depth(), 1, 'one entry, not three')

  b.press()
  await tick()
  b.press()
  await tick()
  b.press()
  await tick()
  assert.deepEqual(order, ['crop', 'form', 'detail'])
  assert.equal(b.state.left, false, 'three presses closed three panels and no more')
})

// The sequence Stacia ran on her phone on 2026-09-20, which left the app on
// the third press. Each step is written the way the app really behaves.
test('Stacia’s sequence: open, Edit, crop, back three times', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const closed = []

  // 1. Open a film. FilmDetail mounts.
  let detail = back.open(() => closed.push('detail'), { id: 'detail' })
  await tick()

  // 2. Press Edit. React unmounts FilmDetail and mounts FilmForm in ONE
  //    commit: cleanups first, then mounts. This is what broke the counting
  //    version — the two must cancel out, not fight.
  back.close(detail)
  const form = back.open(
    () => {
      closed.push('form')
      // Cancelling the form brings the film's details back, as App does.
      detail = back.open(() => closed.push('detail'), { id: 'detail' })
    },
    { id: 'form' },
  )
  await tick()
  assert.equal(b.depth(), 1, 'a replacement is not a net change')

  // 3. Open the crop screen over the form.
  back.open(() => closed.push('crop'), { id: 'crop' })
  await tick()

  // 4. Three back presses.
  b.press()
  await tick()
  assert.deepEqual(closed, ['crop'])
  assert.equal(b.state.left, false)

  b.press()
  await tick()
  assert.deepEqual(closed, ['crop', 'form'])
  assert.equal(b.state.left, false)

  b.press()
  await tick()
  assert.deepEqual(closed, ['crop', 'form', 'detail'])
  assert.equal(b.state.left, false, 'the app is still open after three presses')
  assert.ok(form)

  // 5. Only now does back leave, from the collection screen.
  b.press()
  assert.equal(b.state.left, true)
})

test('closing with the X gives the entry back, without closing anything else', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const closed = []
  back.open(() => closed.push('detail'), { id: 'detail' })
  const form = back.open(() => closed.push('form'), { id: 'form' })
  await tick()

  back.close(form) // Cancel
  await tick()
  assert.deepEqual(closed, [], 'the panel underneath is untouched')
  assert.equal(b.depth(), 1, 'still armed for the panel that is still open')

  b.press()
  await tick()
  assert.deepEqual(closed, ['detail'])
  assert.equal(b.depth(), 0)
  assert.equal(b.state.left, false)
})

test('the last panel closing by hand hands the entry back, and does not exit', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const entry = back.open(() => {})
  await tick()
  back.close(entry)
  await tick()
  assert.equal(b.depth(), 0)
  assert.equal(b.state.left, false)
  assert.equal(back.isArmed(), false)
  assert.equal(b.listening(), false, 'nothing open, nothing listening')
})

test('a panel mid-save refuses, and stays guarded', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  let saving = true
  let closes = 0
  back.open(() => {
    if (saving) return false
    closes += 1
    return true
  })
  await tick()

  b.press()
  await tick()
  assert.equal(closes, 0, 'it did not close mid-save')
  assert.equal(b.depth(), 1, 'and it is armed again')
  assert.equal(b.state.left, false)

  saving = false
  b.press()
  await tick()
  assert.equal(closes, 1)
})

// The counting version could leave a stuck "ignore the next pop" and swallow
// a real press for the life of the page. The window expires instead.
test('a self-move that never reports back does not swallow a later press', async () => {
  const b = fakeBrowser()
  let clock = 1000
  const back = createPanelBack(b.history, b.subscribe, { now: () => clock })
  const entry = back.open(() => {})
  await tick()

  // Close by hand. The app asks to go back; pretend the browser never says so.
  b.history.go = () => {}
  back.close(entry)
  await tick()

  // Much later, a real press must still be heard.
  clock += 5000
  let closed = false
  back.open(() => {
    closed = true
  })
  await tick()
  b.press()
  await tick()
  assert.equal(closed, true)
})
