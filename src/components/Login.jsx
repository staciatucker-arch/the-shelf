import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Two accounts exist and public signup is turned off, so this is a sign-in
// form only — there is deliberately no "create account" path.
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    // On success the auth listener in App swaps this screen out, so there is
    // nothing to do here but surface a failure honestly.
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  return (
    <div className="centre">
      <form className="card login" onSubmit={handleSubmit}>
        <h1>The Shelf</h1>
        <p className="muted">Sign in to see the collection.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="error" role="alert">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
