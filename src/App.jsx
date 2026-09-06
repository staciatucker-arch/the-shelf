import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import Login from './components/Login.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'

// Phase 1 scaffold. This is deliberately not the collection UI (that is §6b
// step 5) — it exists to prove the whole chain end to end: sign in, get a
// JWT, reach PostgREST, and have row-level security let a logged-in person
// through. The film grid below is the evidence, not the feature.
export default function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  const [films, setFilms] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [total, setTotal] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingSession(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadFilms = useCallback(async () => {
    setLoadError(null)
    const { data, error, count } = await supabase
      .from('films')
      .select('id,title,year_season,formats,poster_url,tmdb_verified', { count: 'exact' })
      .order('title')
      .limit(60)

    // Never let a failure look like an empty collection. The old app's habit
    // of silently degrading is the thing this codebase is built against.
    if (error) {
      setLoadError(error.message)
      setFilms(null)
      return
    }
    setFilms(data)
    setTotal(count)
  }, [])

  useEffect(() => {
    if (session) loadFilms()
    else {
      setFilms(null)
      setTotal(null)
    }
  }, [session, loadFilms])

  if (checkingSession) {
    return <div className="centre"><p className="muted">Loading…</p></div>
  }

  if (!session) return <><Login /><UpdateBanner /></>

  return (
    <>
      <header className="bar">
        <h1>The Shelf</h1>
        <div className="bar-right">
          <span className="muted">{session.user.email}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main>
        {loadError && (
          <p className="error" role="alert">
            Could not load the collection: {loadError}
          </p>
        )}

        {!loadError && films === null && <p className="muted">Loading the collection…</p>}

        {films && (
          <>
            <p className="muted count">
              {total} films in the collection
              {films.length < total ? ` — showing the first ${films.length}` : ''}
            </p>
            <ul className="grid">
              {films.map((f) => (
                <li key={f.id} className="film">
                  {f.poster_url ? (
                    <img src={f.poster_url} alt="" loading="lazy" />
                  ) : (
                    <div className="no-poster" aria-hidden="true">no poster</div>
                  )}
                  <span className="film-title">{f.title}</span>
                  {f.year_season && (
                    <span className="film-year">{f.year_season.split('\n')[0]}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <UpdateBanner />
    </>
  )
}
