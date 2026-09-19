// The rules a poster has to obey, with no browser and no database in sight.
// MIGRATION_PLAN.md §6b step 7.
//
// Everything here is pure so the parts that protect the data can be tested
// without mounting a form or uploading a file: what a file has to be before
// it is accepted, how big the stored image is allowed to get, where in the
// bucket it lands, and — the one that matters most — that the three poster
// columns are only ever written together.
//
// Why all three together, every time:
//
//   poster_url            what an <img> loads
//   poster_source         where it came from ('upload' for anything this app stores)
//   poster_storage_path   the object in the bucket, so a replacement can
//                         delete the file it replaced
//
// A row carrying `poster_source = 'upload'` with no `poster_storage_path`
// claims a file nobody can find, and the next replacement leaks the old one
// forever. A row carrying a path with no url shows "no poster" over an image
// that exists. Neither is reachable from here: there is one function that
// builds the set, one that clears it, and no way to set a single column.

/** The long edge every stored poster is shrunk to fit inside. */
export const MAX_EDGE = 1050

/** JPEG quality for the re-encode. ~200–280 KB for a DVD cover at 1050 px. */
export const JPEG_QUALITY = 0.8

/**
 * What the file picker offers, and what the bucket's own policy allows.
 *
 * HEIC is on the list because that is what an iPhone produces by default and
 * refusing it at the picker would be refusing the commonest photo on the
 * shelf. It is never *stored* as HEIC — everything is re-encoded to JPEG
 * before upload, because a plain <img> cannot render HEIC outside Safari and
 * the same poster would look fine to one of you and broken to the other.
 */
export const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

/** The bucket's own cap, 10 MB, checked here so it fails before the upload. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024

/** Everything stored by this app is an upload, whatever route it arrived by. */
export const POSTER_SOURCE = 'upload'

/**
 * The size a picture becomes once it fits inside a square of `maxEdge`.
 *
 * Never enlarges. A 300 px phone snap of a battered case is not improved by
 * being blown up to 1050, and the file would grow for nothing.
 */
export function fitWithin(width, height, maxEdge = MAX_EDGE) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const longest = Math.max(w, h)
  if (longest <= maxEdge) return { width: w, height: h, scaled: false }

  const ratio = maxEdge / longest
  return {
    // Rounded, then floored to at least 1: a very long thin image must not
    // come out zero pixels wide and fail to encode.
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
    scaled: true,
  }
}

/**
 * The part of the picture to keep, in the source image's own pixels.
 *
 * `crop` is what the crop screen hands back: percentages of the displayed
 * picture (`{ x, y, width, height }`, each 0–100). Percentages rather than
 * screen pixels because the picture is shown shrunk to fit a phone, and a
 * percentage means the same thing at every size — so the box drawn on a
 * 400 px preview lands on exactly the same part of a 4000 px photo.
 *
 * No crop, a malformed one, or one that is effectively the whole picture all
 * give the whole picture. The box is clamped inside the image and never
 * smaller than one pixel, because a zero-sized canvas fails to encode and
 * that would reach Stacia as a broken upload rather than a cover.
 */
export function cropRect(sourceWidth, sourceHeight, crop) {
  const whole = { x: 0, y: 0, width: sourceWidth, height: sourceHeight, cropped: false }
  if (!crop) return whole
  const values = [crop.x, crop.y, crop.width, crop.height].map(Number)
  if (values.some((v) => !Number.isFinite(v))) return whole
  const [px, py, pw, ph] = values
  if (pw <= 0 || ph <= 0) return whole

  const clampPct = (v) => Math.min(100, Math.max(0, v))
  const left = clampPct(px)
  const top = clampPct(py)
  const right = clampPct(px + pw)
  const bottom = clampPct(py + ph)

  let x = Math.floor((left / 100) * sourceWidth)
  let y = Math.floor((top / 100) * sourceHeight)
  let x2 = Math.ceil((right / 100) * sourceWidth)
  let y2 = Math.ceil((bottom / 100) * sourceHeight)
  x = Math.min(x, sourceWidth - 1)
  y = Math.min(y, sourceHeight - 1)
  x2 = Math.max(x2, x + 1)
  y2 = Math.max(y2, y + 1)

  const rect = { x, y, width: x2 - x, height: y2 - y }
  const cropped = !(rect.x === 0 && rect.y === 0 && rect.width === sourceWidth && rect.height === sourceHeight)
  return { ...rect, cropped }
}

/**
 * Whether this file can be uploaded at all, said in words a person can act on.
 *
 * Returns null when the file is fine, and a sentence when it is not. The
 * sentence is shown as-is, so it names the fix rather than the rule.
 */
export function checkPosterFile(file) {
  if (!file) return 'No file was chosen.'

  const type = String(file.type ?? '').toLowerCase()

  // Some Androids hand over a .jpg with an empty type. The decode attempt
  // that follows is the real test, so an unlabelled file is let through
  // rather than rejected on a technicality.
  if (type !== '' && !ACCEPTED_TYPES.includes(type)) {
    return 'That is not an image this app can use. A JPEG, PNG or WEBP works.'
  }

  if (typeof file.size === 'number' && file.size > MAX_SOURCE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return `That image is ${mb} MB, and the limit is 10 MB. A photo taken at a lower resolution will be well under it.`
  }

  return null
}

/**
 * Where one poster lives in the bucket.
 *
 * Keyed by the film's UUID, so a cover can be uploaded against a film that
 * does not exist in the database yet — that is what lets a new film arrive in
 * a single insert with its poster already on it.
 *
 * The filename inside that folder is unique per upload rather than fixed.
 * Two reasons, both learned elsewhere in this project: a fixed name would be
 * cached by the browser and by the phone, so a replaced poster would keep
 * showing the old picture until somebody cleared their cache — and a fixed
 * name means the replacement overwrites the original before the row that
 * points at it has been updated, which is a window where a failed write
 * leaves the film showing a poster that is already gone. A new name each time
 * makes replacement strictly additive: upload, write the row, then delete the
 * file the row no longer names.
 */
export function posterObjectPath(filmId, { now = Date.now(), suffix = null } = {}) {
  const id = String(filmId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('A poster path needs the film’s id.')
  }
  const tail = suffix ?? Math.random().toString(36).slice(2, 8)
  return `${id}/cover-${now}-${tail}.jpg`
}

/**
 * The three columns for a poster that has just been stored. All or nothing.
 *
 * Throws rather than returning a partial set: a caller that has lost the path
 * has a bug, and writing two of three columns would hide it until the next
 * replacement leaked a file.
 */
export function posterColumns({ publicUrl, path }) {
  const url = String(publicUrl ?? '').trim()
  const objectPath = String(path ?? '').trim()
  if (url === '' || objectPath === '') {
    throw new Error('A stored poster needs both its URL and its path in the bucket.')
  }
  return {
    poster_url: url,
    poster_source: POSTER_SOURCE,
    poster_storage_path: objectPath,
  }
}

/**
 * The three columns for a film with no poster.
 *
 * A fresh object each call, so no caller can mutate a shared constant and
 * change what "no poster" means for everybody else.
 */
export function clearedPosterColumns() {
  return { poster_url: null, poster_source: null, poster_storage_path: null }
}

/**
 * The file in the bucket this row owns, or null.
 *
 * Only an upload has one. The 122 films whose artwork still loads from the
 * old `shelf-life` repo carry `poster_source = 'github'` and a URL pointing
 * outside Supabase; TMDB art is likewise somebody else's file. Deleting on
 * the strength of `poster_url` alone would mean trying to delete those, so
 * the path column — which only an upload sets — is the only thing consulted.
 */
export function ownedObjectPath(film) {
  if (!film) return null
  if (film.poster_source !== POSTER_SOURCE) return null
  const path = String(film.poster_storage_path ?? '').trim()
  return path === '' ? null : path
}
