import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ACCEPTED_TYPES,
  JPEG_QUALITY,
  MAX_EDGE,
  checkPosterFile,
  clearedPosterColumns,
  fitWithin,
  ownedObjectPath,
  posterColumns,
  posterObjectPath,
} from './poster.js'

const ID = 'c4a7cc10-88fa-401e-9470-55c62e6e0723'

// --- the three columns move together, or not at all ------------------------

test('a stored poster writes all three columns', () => {
  const columns = posterColumns({
    publicUrl: 'https://x.supabase.co/storage/v1/object/public/posters/a/cover.jpg',
    path: `${ID}/cover-1.jpg`,
  })
  assert.deepEqual(Object.keys(columns).sort(), [
    'poster_source',
    'poster_storage_path',
    'poster_url',
  ])
  assert.equal(columns.poster_source, 'upload')
})

test('a poster with no path in the bucket is refused, not half-written', () => {
  // The failure this rules out: a row claiming an uploaded poster that no
  // later replacement can find, leaking the file it replaced forever.
  assert.throws(() => posterColumns({ publicUrl: 'https://x/y.jpg', path: '' }))
  assert.throws(() => posterColumns({ publicUrl: 'https://x/y.jpg' }))
  assert.throws(() => posterColumns({ publicUrl: '', path: 'a/b.jpg' }))
  assert.throws(() => posterColumns({ path: 'a/b.jpg' }))
})

test('clearing a poster clears all three, and hands back a fresh object', () => {
  const a = clearedPosterColumns()
  assert.deepEqual(a, { poster_url: null, poster_source: null, poster_storage_path: null })

  a.poster_url = 'tampered'
  assert.equal(clearedPosterColumns().poster_url, null)
})

// --- where it lands --------------------------------------------------------

test('the object path is keyed by the film id', () => {
  const path = posterObjectPath(ID, { now: 1700000000000, suffix: 'abc123' })
  assert.equal(path, `${ID}/cover-1700000000000-abc123.jpg`)
  assert.ok(path.startsWith(`${ID}/`))
})

test('a path without a film id is a bug, and says so', () => {
  assert.throws(() => posterObjectPath(''))
  assert.throws(() => posterObjectPath(null))
  assert.throws(() => posterObjectPath('not-a-uuid'))
})

test('two uploads for the same film never collide', () => {
  // Replacement has to be additive: the new file must exist under its own
  // name before the row stops pointing at the old one.
  const first = posterObjectPath(ID, { now: 1700000000000 })
  const second = posterObjectPath(ID, { now: 1700000000001 })
  assert.notEqual(first, second)
})

// --- what may be uploaded --------------------------------------------------

test('an ordinary photo is accepted', () => {
  assert.equal(checkPosterFile({ type: 'image/jpeg', size: 2_400_000 }), null)
  assert.equal(checkPosterFile({ type: 'image/png', size: 900_000 }), null)
  assert.equal(checkPosterFile({ type: 'image/heic', size: 3_000_000 }), null)
})

test('a file with no type is let through for the decoder to judge', () => {
  // Some Androids hand over a .jpg with an empty type. The decode is the real
  // test; refusing here would refuse a perfectly good photo.
  assert.equal(checkPosterFile({ type: '', size: 1000 }), null)
})

test('a PDF or a video is refused before anything is uploaded', () => {
  assert.match(checkPosterFile({ type: 'application/pdf', size: 1000 }), /not an image/i)
  assert.match(checkPosterFile({ type: 'video/mp4', size: 1000 }), /not an image/i)
})

test('an oversized file is refused with its size and the limit', () => {
  const message = checkPosterFile({ type: 'image/jpeg', size: 12 * 1024 * 1024 })
  assert.match(message, /12\.0 MB/)
  assert.match(message, /10 MB/)
})

test('a file exactly at the cap is allowed', () => {
  assert.equal(checkPosterFile({ type: 'image/jpeg', size: 10 * 1024 * 1024 }), null)
})

test('every accepted type is one the bucket policy allows', () => {
  // The bucket's allowed_mime_types, from 20260905120200_storage_posters.sql.
  const bucket = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  for (const type of ACCEPTED_TYPES) assert.ok(bucket.includes(type), type)
})

// --- downscaling -----------------------------------------------------------

test('a big photo is shrunk to the long edge, keeping its shape', () => {
  const { width, height, scaled } = fitWithin(3024, 4032)
  assert.equal(scaled, true)
  assert.equal(height, MAX_EDGE)
  assert.equal(width, Math.round(3024 * (MAX_EDGE / 4032)))
})

test('a landscape photo is shrunk by its width', () => {
  const { width, height } = fitWithin(4000, 2000)
  assert.equal(width, MAX_EDGE)
  assert.equal(height, Math.round(2000 * (MAX_EDGE / 4000)))
})

test('a small scan is left alone rather than blown up', () => {
  const { width, height, scaled } = fitWithin(300, 420)
  assert.deepEqual({ width, height, scaled }, { width: 300, height: 420, scaled: false })
})

test('a photo already at the limit is not touched', () => {
  assert.equal(fitWithin(MAX_EDGE, 800).scaled, false)
})

test('a long thin image never comes out zero pixels wide', () => {
  const { width, height } = fitWithin(4, 6000)
  assert.ok(width >= 1)
  assert.ok(height >= 1)
})

test('the stored size and quality are the ones the plan specifies', () => {
  assert.equal(MAX_EDGE, 1050)
  assert.equal(JPEG_QUALITY, 0.8)
})

// --- which files this app is allowed to delete -----------------------------

test('an uploaded poster names the file it owns', () => {
  assert.equal(
    ownedObjectPath({ poster_source: 'upload', poster_storage_path: `${ID}/cover-1.jpg` }),
    `${ID}/cover-1.jpg`,
  )
})

test('a GitHub or TMDB poster owns no file in the bucket', () => {
  // The 122 films still loading artwork from shelf-life, and TMDB's own art:
  // somebody else's files. Trying to delete them on replacement would be
  // reaching outside what this app stores.
  assert.equal(ownedObjectPath({ poster_source: 'github', poster_url: 'https://gh/x.jpg' }), null)
  assert.equal(ownedObjectPath({ poster_source: 'tmdb', poster_url: 'https://tmdb/x.jpg' }), null)
  assert.equal(ownedObjectPath({ poster_source: 'url', poster_url: 'https://e/x.jpg' }), null)
})

test('a film with no poster owns nothing', () => {
  assert.equal(ownedObjectPath(null), null)
  assert.equal(ownedObjectPath({}), null)
  assert.equal(ownedObjectPath({ poster_source: 'upload', poster_storage_path: null }), null)
  assert.equal(ownedObjectPath({ poster_source: 'upload', poster_storage_path: '  ' }), null)
})
