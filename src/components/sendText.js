// Hand a piece of text to the phone: its share menu where there is one
// (Discord is in it, and on recent Android so is Copy), else the clipboard.
//
// Returns 'shared' | 'copied' | 'cancelled' | 'failed'. "Shared" and
// "copied" are claimed only once the phone has said yes.

/** The pre-clipboard-API way: select hidden text and ask for a copy. */
function copyTheOldWay(text) {
  const box = document.createElement('textarea')
  box.value = text
  box.setAttribute('readonly', '')
  box.style.position = 'fixed'
  box.style.opacity = '0'
  document.body.appendChild(box)
  box.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  box.remove()
  return ok
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyTheOldWay(text)
  }
}

export async function sendText(text) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (e) {
      // Closing the share menu without picking an app is not an error.
      if (e?.name === 'AbortError') return 'cancelled'
      // Anything else: fall through to copying.
    }
  }
  return (await copy(text)) ? 'copied' : 'failed'
}
