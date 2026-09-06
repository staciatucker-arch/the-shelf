# The Shelf

Stacia and Ingrid's home media collection — a React + Vite PWA on GitHub Pages,
backed by Supabase.

**Live:** https://staciatucker-arch.github.io/the-shelf/

## The three repositories, and why

| Repo | Visibility | Holds |
|---|---|---|
| `the-shelf` (this one) | public | the app. Public because GitHub Pages on a free account requires it |
| `the-shelf-data` | **private** | docs, database migrations, Edge Functions, scripts, CSV exports, nightly backups |
| `shelf-life` | public | **the old app (still live) and all 122 posters.** Do not deploy anything here |

⚠ **Never point a deploy at `shelf-life`.** It serves the old app at its root
and the posters the database still references at `/posters/`. A Pages deploy
publishes only the built app and removes everything else at that path, which
would destroy both at once.

## Running it locally

```sh
npm install
npm run dev
```

Configuration is in `.env`, committed deliberately. `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are public values — they ship inside the JavaScript
bundle either way. What protects the collection is that the anon role has no
table privileges at all and no row-level-security policy grants it anything:
querying `films` with that key returns `42501 permission denied`, verified by
test, even though the table holds 248 rows.

The secret keys — `TMDB_KEY`, `DTDD_KEY`, and the Supabase service-role key —
are Edge Function secrets and CLI credentials. None of them belongs in this
repo or in a browser.

## Deploying

Push to `main`. The Action builds and publishes. There is no manual step, and
no hard refresh: a new version waits behind an "Update available" banner until
someone chooses to take it.

## What is here so far

This is the Phase 1 scaffold (MIGRATION_PLAN §6b step 2): sign-in, session
handling, the PWA shell and update banner, and a plain grid of the collection.
The grid exists to prove the chain works end to end — sign in, get a JWT, reach
PostgREST, pass row-level security — not as the finished interface. The real
collection UI is step 5.
