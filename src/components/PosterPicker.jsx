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
 *   the button    a file picker with no `capture` attribute: the photo
 *                 library on a phone, the folder the scans are in on a
 *                 computer.
 *   Take photo    touch screens only. A second picker *with*
 *                 `capture="environment"`, which opens the rear camera
 *                 directly. It exists because the assumption above it was
 *                 wrong: this was built believing a picker without `capture`
 *                 offers "camera or library" on a phone. Older Android did.
 *                 Stacia's Android on 2026-09-19 went straight to the system
 *                 photo picker, which has no camera in it — so the camera was
 *                 unreachable. Taking a photo this way goes through the
 *                 phone's own camera app, so it does **not** use
 *                 `getUserMedia` and is not restricted to secure contexts —
 *                 the thing that broke `crypto.randomUUID` on the dev
 *                 server's phone address does not apply to it. A photo taken
 *                 here also never lands in the phone's gallery.
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
  const cameraRef = useRef(null)

  // A finger rather than a mouse is the best available proxy for "has a
  // camera and is being held". Read once: a device does not change pointer
  // mid-form. A laptop with a touch screen reports `fine` for its trackpad,
  // so it gets no camera button — correct, since a webcam cannot photograph
  // a DVD case usefully.
  const [touch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true,
  )

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
    return touch
      ? 'Take a photo of the case, or choose one you already have.'
      : 'Pick a picture. It is shrunk before uploading.'
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
        {touch && (
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              accept(e.target.files?.[0])
              e.target.value = ''
            }}
            disabled={disabled || working}
          />
        )}

        <div className="poster-buttons">
          {touch && (
            <button
              type="button"
              className="ghost"
              onClick={() => cameraRef.current?.click()}
              disabled={disabled || working}
            >
              Take photo
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || working}
          >
            {working
              ? 'Preparing…'
              : touch
                ? 'Choose photo'
                : showing
                  ? 'Edit cover'
                  : 'Add cover'}
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
