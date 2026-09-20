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
  const state = { entries: ['base'], index: 0, left: false, gesture: true, skippable: 0 }

  const history = {
    pushState(s) {
      state.entries = state.entries.slice(0, state.index + 1)
      // Chrome on Android marks an entry added with no recent tap behind it
      // as skippable and steps over it on the next back press. This is the
      // rule that left the app on Stacia's phone, so the fake enforces it.
      state.entries.push({ value: s, skippable: !state.gesture })
      if (!state.gesture) state.skippable += 1
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
    /**
     * A person pressing back. Their press is not a gesture the page can use,
     * so anything the app pushes while handling it is skippable — and Chrome
     * steps over skippable entries on the way past.
     */
    press() {
      while (state.index > 0 && state.entries[state.index]?.skippable) state.index -= 1
      if (state.index === 0) {
        state.left = true
        return
      }
      state.index -= 1
      // ⚠ Chrome judges by whether the person tapped *recently*, not by
      // whether the push happens inside the handler. A press spends the
      // activation, and only a real tap brings it back — so anything pushed
      // after this, in a microtask or three renders later, is skippable
      // unless `tap()` says otherwise.
      state.gesture = false
      handler?.()
    },
    /** The person tapped something: the page may add history again. */
    tap() {
      state.gesture = true
    },
    /** Entries the app added with no tap behind them — Chrome ignores these. */
    skippable: () => state.skippable,
    /** How many entries the app is holding above the collection screen. */
    depth: () => state.index,
    listening: () => handler !== null,
  }
}

test('a panel takes one history entry, added as it opens', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  b.tap()
  back.open(() => {})
  await tick()
  assert.equal(b.depth(), 1)
  assert.equal(back.held(), 1)
  assert.equal(b.skippable(), 0, 'added on a tap, so Chrome keeps it')
})

test('back closes the panel instead of leaving the app', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  let closed = false
  b.tap()
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

test('three stacked panels hold three entries, and unwind in order', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const order = []
  b.tap()
  back.open(() => order.push('detail'), { id: 'detail' })
  b.tap()
  back.open(() => order.push('form'), { id: 'form' })
  b.tap()
  back.open(() => order.push('crop'), { id: 'crop' })
  await tick()
  assert.equal(b.depth(), 3, 'one each, all added on a tap')

  b.press()
  await tick()
  b.press()
  await tick()
  b.press()
  await tick()
  assert.deepEqual(order, ['crop', 'form', 'detail'])
  assert.equal(b.state.left, false, 'three presses closed three panels and no more')
})

// The sequence Stacia ran on her phone on 2026-09-20. It left the app on the
// second press, and her phone's own record showed why: the app added an entry
// while handling the back press, with no tap behind it, and Chrome skipped it.
test('Stacia’s sequence: open, Edit, back, back', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const closed = []

  // 1. Open a film. FilmDetail mounts. (A tap.)
  b.tap()
  back.open(() => closed.push('detail'), { id: 'detail' })
  await tick()

  // 2. Press Edit. The form opens OVER the details, which stay mounted and
  //    hidden — so nothing is rebuilt later and nothing is pushed later.
  b.tap()
  back.open(() => closed.push('form'), { id: 'form' })
  await tick()
  assert.equal(b.depth(), 2, 'one entry each, both from a tap')

  // 3. Back closes the form; the details are simply revealed again.
  b.press()
  await tick()
  assert.deepEqual(closed, ['form'])
  assert.equal(b.state.left, false)
  assert.equal(b.skippable(), 0, 'nothing was added while handling the press')

  // 4. Back closes the details. This is the press that used to leave.
  b.press()
  await tick()
  assert.deepEqual(closed, ['form', 'detail'])
  assert.equal(b.state.left, false, 'the app is still open')

  // 5. Only now does back leave, from the collection screen.
  b.press()
  assert.equal(b.state.left, true)
})

test('nothing is ever pushed while a back press is being handled', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  b.tap()
  back.open(() => {}, { id: 'detail' })
  b.tap()
  back.open(() => {}, { id: 'form' })
  b.tap()
  back.open(() => {}, { id: 'crop' })
  await tick()
  for (let i = 0; i < 3; i += 1) {
    b.press()
    await tick()
  }
  assert.equal(b.skippable(), 0)
  assert.equal(b.state.left, false)
})

test('closing with the X gives the entry back, without closing anything else', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const closed = []
  b.tap()
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

test('the last panel closing by hand hands its entry back, and does not exit', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  const entry = back.open(() => {})
  await tick()
  back.close(entry)
  await tick()
  assert.equal(b.depth(), 0)
  assert.equal(b.state.left, false)
  assert.equal(back.held(), 0)
  assert.equal(b.listening(), false, 'nothing open, nothing listening')
})

// ⚠ Known and accepted: a refusal re-arms without a tap behind it, so Chrome
// may skip that entry and the *next* press can leave the app — during the
// second or so that a save is in flight. The save itself is unaffected; it is
// already on its way to the database and does not depend on the panel.
test('a panel mid-save refuses, and stays guarded', async () => {
  const b = fakeBrowser()
  const back = createPanelBack(b.history, b.subscribe)
  let saving = true
  let closes = 0
  b.tap()
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

  // ⚠ And here is the accepted limit, stated rather than hidden: the entry
  // put back by a refusal has no tap behind it, so Chrome marks it skippable
  // and the *next* press leaves the app instead of closing the form. The
  // window is the second or so a save is in flight, and the save itself is
  // unaffected — it is already on its way to the database. The alternative,
  // letting back close a form mid-save, would hide a failed save's message,
  // which is worse.
  assert.equal(b.state.entries[b.state.index].skippable, true)

  saving = false
  b.press()
  await tick()
  assert.equal(closes, 0, 'the skipped entry means this press left the app')
  assert.equal(b.state.left, true)
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
  b.tap()
  back.open(() => {
    closed = true
  })
  await tick()
  b.press()
  await tick()
  assert.equal(closed, true)
})
