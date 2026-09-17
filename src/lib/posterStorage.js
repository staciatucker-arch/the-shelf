import { posterColumns, posterObjectPath } from './poster.js'
import { supabase } from './supabase.js'

// The `posters` bucket, and only the `posters` bucket.
// MIGRATION_PLAN.md §6b step 7; the bucket is
// supabase/migrations/20260905120200_storage_posters.sql in the data repo.
//
// The bucket is public-read and writable only by a signed-in person, which is
// what lets a plain <img src> show a cover without minting a signed URL on
// every screen. Objects are named by film UUID, so they are not enumerable
// from the outside.
//
// Two things this module is careful about:
//
//   *Upload before write, delete after.* A new file always exists under its
//   own name before any row is told about it, and the file it replaced is
//   deleted only once the database has confirmed the row no longer points at
//   it. The failure that ordering rules out is a film showing a poster that
//   has already been deleted — recoverable only by re-uploading, and invisible
//   until somebody opens that film.
//
//   *An orphan is harmless; a half-written film is not.* If the row write
//   fails after an upload, the file is deleted and nothing is claimed. If that
//   cleanup itself fails, an unreferenced image sits in a bucket with 1 GB
//   free and nobody ever sees it.

const BUCKET = 'posters'

/**
 * Store one prepared image against one film id.
 *
 * `filmId` may name a film that does not exist yet — that is the point. The
 * id is minted in the browser when the add form opens, so a poster can be
 * uploaded against it and arrive on the film's very first insert rather than
 * in a second write.
 *
 * Returns `{ path, publicUrl, columns, error }`. `columns` is the complete
 * set of three, ready to go onto a row exactly as it is.
 */
export async function uploadPoster(filmId, blob) {
  const path = posterObjectPath(filmId)

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    // Never overwrite. Every upload has its own name, so an occupied path
    // means something is wrong and should be heard rather than written over.
    upsert: false,
    // A year. The name changes on every replacement, so a stored poster's
    // bytes never change and the browser may hold it as long as it likes.
    cacheControl: '31536000',
  })

  if (error) return { path: null, publicUrl: null, columns: null, error: error.message }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = data?.publicUrl ?? null

  if (!publicUrl) {
    // The file is up but unreachable, so nothing may be written about it.
    await removePoster(path)
    return {
      path: null,
      publicUrl: null,
      columns: null,
      error: 'The poster uploaded but Supabase gave back no address for it.',
    }
  }

  return { path, publicUrl, columns: posterColumns({ publicUrl, path }), error: null }
}

/**
 * Delete one object by its exact path.
 *
 * Only ever called with a path this app wrote — see `ownedObjectPath` in
 * `poster.js`, which is what keeps a GitHub or TMDB poster from being treated
 * as a file in the bucket.
 *
 * A failure is reported but is never worth failing a save over: by the time
 * this runs, the row has already been written and is correct. The worst case
 * is an image nobody references.
 */
export async function removePoster(path) {
  if (!path) return { error: null }
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  return { error: error ? error.message : null }
}
