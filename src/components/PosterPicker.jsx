import { useEffect, useRef, useState } from 'react'
import { firstImageIn, preparePoster } from '../lib/posterImage.js'

/**
 * Choosing the cover for one film. MIGRATION_PLAN.md §6b step 7, route B.
 *
 * **Nothing here uploads anything.** It holds a picture the person has
 * chosen, already shrunk and re-encoded, and hands it up to the form. The
 * upload happens once, when Save is pressed, as part of the same write that
 * saves everything else — so a poster and the film it belongs to are never
 * half-saved with respect to each other, and there is one button to press
 * rather than two things to remember.
 *
 * **One row, one button** — a thumbnail and "Add cover" or "Edit cover".
 * The first version of this was a large dashed drop zone, which was wrong for
 * two reasons: it took a fifth of the form on a phone, where the form is
 * already long, and a dashed rectangle does not tell somebody what it is for
 * the way a button with a verb on it does. The button opens the file picker
 * directly rather than a second window, so photographing a case at the shelf
 * is one tap, not two.
 *
 * Three ways in, because the shelf is photographed in two quite different
 * situations and neither should be the awkward one:
 *
 *   the button    a file picker with no `capture` attribute, so a phone
 *                 offers the camera *and* the photo library, and a computer
 *                 offers the folder the scans are already in. Worth saying
 *                 plainly: taking a photo this way goes through the phone's
 *                 own camera app, so it does **not** use `getUserMedia` and
 *                 is not restricted to secure contexts — the thing that broke
 *                 `crypto.randomUUID` on the dev server's phone address does
 *                 not apply to it.
 *   drag and drop for a flatbed session at the desk, where the scan is
 *                 already a file in a window next to this one.
 *   paste         for a picture on the clipboard, which is how a screenshot
 *                 or a copied image arrives.
 *
 * The last two are left unannounced and work on the row itself. They are
 * desktop habits — somebody who has them will try them, and somebody who has
 * not is not helped by being told about dragging while holding a phone.
 *
 * The thumbnail is the processed image, not the original, so what is on
 * screen is exactly what will be stored — including its orientation, which is
 * the one thing a phone photo routinely gets wrong.
 */
export default function PosterPicker({ film, chosen, onChoose, onRevert, onRemove, disabled }) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  // The thumbnail's object URL, revoked when it is replaced or the form
  // closes. A few megabytes of image would otherwise stay in memory for the
  // life of the page, and a session of adding films would accumulate all of
  // them.
  const [previewUrl, setPreviewUrl] = useState(null)
  useEffect(() => {
    if (!chosen?.blob) {
      setPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(chosen.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [chosen])

  async function accept(file) {
    if (!file || disabled) return
    setError(null)
    setWorking(true)
    const { blob, width, height, error: problem } = await preparePoster(file)
    setWorking(false)

    // A refusal is shown and nothing changes. The previous cover, whatever it
    // was, is still the film's cover.
    if (problem) {
      setError(problem)
      return
    }
    onChoose({ blob, width, height, name: file.name ?? 'poster.jpg' })
  }

  // Paste is listened for on this row rather than the document, so that
  // pasting into the title box above still pastes text into the title box.
  function onPaste(e) {
    const file = firstImageIn(
      Array.from(e.clipboardData?.items ?? [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile()),
    )
    if (file) {
      e.preventDefault()
      accept(file)
    }
  }

  // What the film has on it now, as opposed to what is about to replace it.
  const existingUrl = film?.poster_url ?? null
  const showing = previewUrl ?? (chosen?.cleared ? null : existingUrl)

  const caption = (() => {
    if (working) return 'Preparing the picture…'
    if (chosen?.blob) return `Ready — ${chosen.width}×${chosen.height}. It uploads when you save.`
    if (chosen?.cleared) return 'The cover will be removed when you save.'
    if (existingUrl) return 'The cover on the shelf now.'
    return 'Take a photo or pick a picture. It is shrunk before uploading.'
  })()

  return (
    <div
      className={`poster-row${dragging ? ' is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        accept(firstImageIn(e.dataTransfer?.files))
      }}
      onPaste={onPaste}
      // Focusable so a paste can land here at all — an element with no
      // tabindex never receives a paste event.
      tabIndex={disabled ? -1 : 0}
      aria-label="Cover"
    >
      <div className="poster-thumb">
        {showing ? (
          <img src={showing} alt="" />
        ) : (
          <span className="poster-thumb-empty" aria-hidden="true">
            🖼
          </span>
        )}
      </div>

      <div className="poster-controls">
        <input
          ref={inputRef}
          type="file"
          // Deliberately no `capture` attribute: with it, a phone goes
          // straight to the camera and the photo library becomes unreachable.
          // Without it, both are offered, and a computer opens a file dialog.
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          className="sr-only"
          onChange={(e) => {
            accept(e.target.files?.[0])
            // Cleared so that choosing the same file twice in a row still
            // fires a change event — which it otherwise would not.
            e.target.value = ''
          }}
          disabled={disabled || working}
        />

        <div className="poster-buttons">
          <button
            type="button"
            className="ghost"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || working}
          >
            {working ? 'Preparing…' : showing ? 'Edit cover' : 'Add cover'}
          </button>

          {/* One button, one meaning, decided by what is actually on screen.
              An earlier version used a single "clear" that meant "undo my
              pick" or "delete the cover" depending on state nobody could see
              — so choosing a replacement and changing your mind could delete
              the cover you still had. Backing out of a new pick and removing
              the film's cover are different intentions and are now different
              buttons, never both at once. */}
          {chosen?.blob || chosen?.cleared ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setError(null)
                onRevert()
              }}
              disabled={disabled || working}
            >
              {chosen?.blob ? 'Cancel' : 'Keep the cover'}
            </button>
          ) : existingUrl ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setError(null)
                onRemove()
              }}
              disabled={disabled || working}
            >
              Remove
            </button>
          ) : null}
        </div>

        <p className="poster-caption muted">{caption}</p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
