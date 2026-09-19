import { JPEG_QUALITY, MAX_EDGE, checkPosterFile, cropRect, fitWithin } from './poster.js'

// Turning whatever came off a phone or a scanner into the one thing the app
// stores: a JPEG no wider or taller than 1050 px. MIGRATION_PLAN.md §6b step 7.
//
// This happens in the browser, before the upload, for three reasons:
//
//   size     a modern phone photo is 3–6 MB; the same cover at 1050 px is
//            around a quarter of a megabyte. 248 of those is a shelf that
//            opens quickly on a phone, and a free tier nowhere near its 1 GB.
//   format   HEIC is what an iPhone produces and what a plain <img> cannot
//            render outside Safari. Re-encoding means the poster looks the
//            same to both of you rather than working for one.
//   rotation the browser applies the EXIF orientation flag when it decodes,
//            so the pixels that come out are already the right way up. The
//            re-encode drops the flag along with the rest of the metadata,
//            which is what stops a photo that looked fine in the picker from
//            arriving on its side.
//
// Nothing here talks to Supabase; it hands back a Blob for `posterStorage.js`
// to upload.

/**
 * Decode a file into something drawable, whatever the browser supports.
 *
 * `createImageBitmap` is the fast path and honours EXIF orientation when
 * asked. Safari has supported the options argument only since 17, so an
 * <img> element is kept as the fallback — it applies orientation by itself.
 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Either the options argument or the format was refused. Fall through
      // to the <img> path, which may still manage it.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('decode failed'))
      img.src = url
    })
  } finally {
    // Revoked whichever way it went: the bitmap has its own copy of the
    // pixels by now, and a leaked object URL holds the whole file in memory.
    URL.revokeObjectURL(url)
  }
}

function dimensionsOf(source) {
  return {
    width: source.width ?? source.naturalWidth ?? 0,
    height: source.height ?? source.naturalHeight ?? 0,
  }
}

/**
 * A file from a picker, a drop or a paste, as a poster-sized JPEG.
 *
 * `crop` is optional, in percentages, from the crop screen. It is applied to
 * the full-resolution photo *before* shrinking, in the same single draw — so
 * a tight crop of a 4000 px phone photo still comes out at up to 1050 px,
 * and there is only ever one JPEG encode.
 *
 * Returns `{ blob, width, height, error }`. A failure is always a sentence
 * naming what to do about it — never a thrown exception and never a silent
 * null, because the one thing worse than refusing a photo is accepting it
 * and storing something broken.
 */
export async function preparePoster(file, crop = null) {
  const refusal = checkPosterFile(file)
  if (refusal) return { blob: null, width: 0, height: 0, error: refusal }

  let source
  try {
    source = await decode(file)
  } catch {
    // Overwhelmingly this is HEIC in a browser that is not Safari. Naming the
    // likely cause and the actual fix beats "could not read file".
    return {
      blob: null,
      width: 0,
      height: 0,
      error:
        'This browser could not read that image. If it came from an iPhone it is ' +
        'probably HEIC — setting Camera → Formats to “Most Compatible” saves photos ' +
        'as JPEG, or emailing the photo to yourself converts it on the way.',
    }
  }

  const { width: sourceWidth, height: sourceHeight } = dimensionsOf(source)
  if (!sourceWidth || !sourceHeight) {
    return { blob: null, width: 0, height: 0, error: 'That image appears to be empty.' }
  }

  const area = cropRect(sourceWidth, sourceHeight, crop)
  const { width, height } = fitWithin(area.width, area.height, MAX_EDGE)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    return { blob: null, width: 0, height: 0, error: 'This browser could not resize the image.' }
  }

  // White underneath, because a PNG scan with a transparent margin would
  // otherwise come out with black edges once it is flattened into a JPEG.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, area.x, area.y, area.width, area.height, 0, 0, width, height)
  source.close?.()

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )

  if (!blob) {
    return { blob: null, width: 0, height: 0, error: 'This browser could not re-encode the image.' }
  }

  return { blob, width, height, error: null }
}

/**
 * The first usable image on a clipboard or in a drop, or null.
 *
 * A paste from a screenshot tool arrives as `image/png` with no name; a drag
 * out of Finder arrives as a real file. Both are `File` objects here, so both
 * take the same path from this point on.
 */
export function firstImageIn(list) {
  const files = Array.from(list ?? [])
  return files.find((f) => String(f?.type ?? '').startsWith('image/')) ?? files[0] ?? null
}
