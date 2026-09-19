// What the installed app is allowed to keep a copy of. Review A1 / security
// S5, 2026-09-18.
//
// The service worker keeps copies of some web requests so a revisited shelf
// opens instantly. The first version kept a copy of *every* request to
// supabase.co — which included the collection itself (`/rest/v1/films`),
// sign-in (`/auth/v1/...`) and TMDB lookups (`/functions/v1/...`). The app
// could therefore open on last time's collection, and once per-person
// trigger preferences exist (step 9), a shared device could show one
// person's preferences to the other. Only pictures are safe to keep: they are
// public already and a stale one is merely an old picture.
//
// ⚠ This function is copied into the service worker AS TEXT. vite-plugin-pwa
// turns `urlPattern` into source code with `toString()`, so the service
// worker gets this function's body and nothing around it. It must therefore
// use nothing from outside itself — no imports, no constants from this file,
// no helpers. A reference to anything outside would be undefined in the
// service worker and every request would throw. `dist/sw.js` is where to look
// to check it survived.

/**
 * True only for a poster image: anything from GitHub Pages (the 122 covers
 * still served from `shelf-life`), or a file in Supabase Storage. Never the
 * database, sign-in, or Edge Functions.
 *
 * Takes `{ url }`, where `url` is a URL object, because that is what Workbox
 * passes.
 */
export function isPosterRequest({ url }) {
  if (url.hostname.endsWith('github.io')) return true
  return url.hostname.endsWith('supabase.co') && url.pathname.startsWith('/storage/v1/object/')
}

/**
 * The name of the store the poster copies live in. Renamed from 'posters' on
 * 2026-09-19, because that older store also holds copies of the collection
 * and sign-in responses. `retireOldCaches` deletes it.
 */
export const POSTER_CACHE = 'poster-images'

/** Stores from earlier versions that must not survive. */
export const RETIRED_CACHES = ['posters']

/**
 * Delete the retired stores. Called once when the app starts. Harmless when
 * there is nothing to delete, and when the browser has no Cache Storage at
 * all (plain http on the dev server's phone address).
 */
export async function retireOldCaches(cacheStorage = globalThis.caches) {
  if (!cacheStorage) return []
  const removed = []
  for (const name of RETIRED_CACHES) {
    try {
      if (await cacheStorage.delete(name)) removed.push(name)
    } catch {
      // A browser refusing to delete is not worth failing startup over.
    }
  }
  return removed
}
