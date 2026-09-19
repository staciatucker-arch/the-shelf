import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

/**
 * Trim a picture to the case before it becomes the cover.
 *
 * Asked for by Stacia on 2026-09-19, after the first real phone photo kept
 * the shelf around the case. Every way in — camera, library, drag, paste —
 * comes through here, so there is one crop behaviour, not four.
 *
 * **The box starts at the whole picture.** Pressing "Use this" without
 * touching anything keeps the picture exactly as it was taken, so this step
 * can never crop something by surprise. Drag a corner or an edge in to trim;
 * drag inside the box to move it.
 *
 * **Free-form, no fixed shape.** A DVD case, a Blu-ray case, a box set and a
 * flatbed scan are all different proportions; locking the box to one would
 * force either a sliver of shelf or a sliver of cover off.
 *
 * The crop comes back as percentages and is applied to the full-resolution
 * photo in `preparePoster`, so trimming on a small phone preview loses no
 * quality. The preview is an <img>, which turns a phone photo the right way
 * up by itself — the same as the decode in `posterImage.js` — so the box and
 * the pixels it is applied to agree.
 */
export default function PosterCropper({ file, onDone, onCancel }) {
  const [url, setUrl] = useState(null)
  const [crop, setCrop] = useState({ unit: '%', x: 0, y: 0, width: 100, height: 100 })
  const useButtonRef = useRef(null)

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  // Escape backs out, as it does everywhere else a panel opens over the form.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  // Put focus on the main button so a keyboard user is inside the panel.
  useEffect(() => {
    useButtonRef.current?.focus()
  }, [url])

  // Rendered at the top of the page, not inside the edit panel it opens
  // from: a full-screen layer nested in a panel that scrolls or animates can
  // be clipped by it or positioned against it instead of the screen.
  return createPortal(
    <div className="crop-overlay" role="dialog" aria-modal="true" aria-label="Crop the cover">
      <div className="crop-panel">
        <p className="crop-hint">Drag the corners in to the edges of the case.</p>

        <div className="crop-stage">
          {url && (
            <ReactCrop
              crop={crop}
              onChange={(_, percent) => setCrop(percent)}
              keepSelection
              minWidth={30}
              minHeight={30}
            >
              <img
                src={url}
                alt="The picture being cropped"
                className="crop-image"
                // A picture this browser cannot show (HEIC outside Safari)
                // cannot be cropped either. Hand it straight on uncropped, so
                // the person gets the existing, helpful "could not read" message
                // rather than a blank crop screen.
                onError={() => onDone(null)}
              />
            </ReactCrop>
          )}
        </div>

        <div className="crop-buttons">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 })}
          >
            Reset
          </button>
          <button type="button" ref={useButtonRef} onClick={() => onDone(crop)}>
            Use this
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
