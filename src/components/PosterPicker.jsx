import { useEffect, useRef, useState } from 'react'
import { checkPosterFile } from '../lib/poster.js'
import { firstImageIn, preparePoster, shrinkForCropping } from '../lib/posterImage.js'
import PosterCropper from './PosterCropper.jsx'

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
 * **One row, one button** — a thumbnail and "Choose picture" ("Choose photo"
 * on a phone, beside "Take photo"). The row is labelled Cover, so the buttons
 * name the *source* rather than repeating the outcome; before 2026-09-20 the
 * same button said "Add cover" on a computer and "Choose photo" on a phone,
 * which was two naming systems for one control.
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
 * Drag and paste work on the row itself, and the caption names them **on a
 * computer only**. They were unannounced until 2026-09-20, on the theory that
 * somebody with those habits would try them anyway; Stacia found them only
 * because a test told her to, which is the theory disproved.
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

  // A picture waiting on the crop screen: `{ blob, name }`, where the blob is
  // the working-size copy, never the original. Nothing is chosen until the
  // crop is accepted; Cancel there leaves the film's cover exactly as it was.
  const [cropping, setCropping] = useState(null)

  // Every way in (both buttons, drop, paste) arrives here and goes through
  // the crop screen. The original is shrunk to a working size *first* and
  // then let go — see WORKING_EDGE in posterImage.js for the phone that
  // reloaded when the crop screen showed a full-size camera photo. A file
  // that is refused (wrong type, too big, unreadable HEIC) is refused here,
  // before the crop screen, not after the person has cropped it.
  async function accept(file) {
    if (!file || disabled) return
    setError(null)
    const refusal = checkPosterFile(file)
    if (refusal) {
      setError(refusal)
      return
    }
    setWorking(true)
    const { blob, error: problem } = await shrinkForCropping(file)
    setWorking(false)
    if (problem) {
      setError(problem)
      return
    }
    setCropping({ blob, name: file.name ?? 'poster.jpg' })
  }

  async function finish(picture, crop) {
    setCropping(null)
    setError(null)
    setWorking(true)
    const { blob, width, height, error: problem } = await preparePoster(picture.blob, crop)
    setWorking(false)

    // A refusal is shown and nothing changes. The previous cover, whatever it
    // was, is still the film's cover.
    if (problem) {
      setError(problem)
      return
    }
    onChoose({ blob, width, height, name: picture.name })
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
    // Pixel dimensions used to be shown here. They were machinery: nothing a
    // person does next depends on 1050×787.
    if (chosen?.blob) return 'New cover ready. Press Save to keep it.'
    if (chosen?.cleared) return 'This cover will be deleted when you press Save.'
    // Drag and paste are named, on a computer only. They were deliberately
    // left unannounced when this was built, on the theory that somebody who
    // has those habits will try them anyway. Stacia disproved it on
    // 2026-09-19: she found them only because a test told her to. A feature
    // nobody is told about is found by accident or not at all. Phones, where
    // there is nothing to drag from and rarely a clipboard image, keep the
    // shorter wording.
    if (existingUrl) {
      return touch
        ? 'This is the cover on your shelf.'
        : 'This is the cover on your shelf. Drag and drop a picture, or paste one, to replace it.'
    }
    return touch
      ? 'Take a photo of the case, or pick one from your phone.'
      : 'You can also drag and drop a picture, or paste one.'
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

      {cropping && (
        <PosterCropper
          file={cropping.blob}
          onDone={(crop) => finish(cropping, crop)}
          onCancel={() => setCropping(null)}
        />
      )}

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
            {working ? 'Preparing…' : touch ? 'Choose photo' : 'Choose picture'}
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
              {/* One word for one meaning. This button undid a new pick
                  ('Cancel') or undid a removal ('Keep the cover'); both are
                  the same intention, and naming them differently made the
                  person work out which state they were in. */}
              Undo
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
              Remove cover
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
