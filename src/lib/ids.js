// Minting the id for a new row.
//
// The browser makes the id, not the database. That is what lets an insert be a
// single statement carrying the title, the pick lists, the confirmed match and
// (in §6b step 7) a poster already uploaded against this id — instead of an
// insert followed by a patch, with a moment in between where a half-written
// film exists.
//
// **`crypto.randomUUID()` alone is not enough**, and this module exists
// because of how that failed. It is a *secure-context* API: it is defined on
// HTTPS and on `localhost`, and **undefined on a plain-http address like
// `http://192.168.1.47:5173`** — which is exactly the URL `npm run dev --host`
// prints for testing on a phone. Calling it there throws while the form is
// rendering, and with no error boundary above it React unmounts the whole
// page: pressing "Add film" turned the screen black, with nothing said.
//
// It passed every test and worked on the Mac the entire time, because
// `localhost` is a secure context. Only a real phone on the real dev server
// showed it.
//
// `crypto.getRandomValues` carries no such restriction — it is available in
// insecure contexts and in every browser that can run this app — so a v4 UUID
// is built from it directly when `randomUUID` is missing. The ids are the same
// shape and the same quality of randomness; only the convenience wrapper is
// unavailable.

/** Sixteen random bytes, shaped and punctuated as a v4 UUID. */
function uuidFromBytes(bytes) {
  // The two fields that make a random UUID say so: version 4 in the high
  // nibble of byte 6, variant 10x in the top bits of byte 8. Postgres `uuid`
  // would accept the bytes without them, but then the id would claim to be a
  // kind of UUID it is not.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/**
 * A new v4 UUID, wherever this is running.
 *
 * Never falls back to `Math.random`. An id is a primary key, and a weak one
 * would collide quietly and much later — the kind of failure this rebuild
 * exists to rule out. Every browser that can run this app has
 * `getRandomValues`; if one genuinely does not, that is worth an error saying
 * so rather than a row with a guessable id.
 */
export function newId() {
  const source = globalThis.crypto

  // The good path: HTTPS, or localhost on the Mac.
  if (typeof source?.randomUUID === 'function') return source.randomUUID()

  // The phone on the dev server's network address, and anywhere else that is
  // not a secure context.
  if (typeof source?.getRandomValues === 'function') {
    return uuidFromBytes(source.getRandomValues(new Uint8Array(16)))
  }

  throw new Error('This browser has no secure random number generator.')
}
