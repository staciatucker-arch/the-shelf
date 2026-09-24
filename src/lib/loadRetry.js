// Surviving a one-second disagreement between Supabase's own clocks.
// Written 2026-09-24, after the live app showed Stacia
// "Could not load the collection: JWT issued at future" at 5:12 AM.
//
// What happened, verified against the live system that morning: her Mac's
// clock, Supabase's auth service and Supabase's database agreed to the second
// when checked 14 minutes later, and an old token (the anon key) passed the
// database's JWT check normally. So nothing was misconfigured and nothing was
// broken — the skew was transient and on Supabase's side.
//
// The shape of it matters more than the incident. A login token is minted by
// Supabase's auth service and then checked by its database service, which are
// two different machines with two different clocks. The app asks for the
// collection the instant a session appears (App.jsx), so on the first open of
// the day — when the overnight token has expired and a brand-new one is
// minted — that request carries a token roughly one second old. If the
// database's clock is trailing the auth service's by even a moment, the token
// looks like it was issued in the future and the request is refused outright.
//
// It is therefore a *first request after a refresh* failure, which is to say
// it is almost always the first thing anyone does in the morning, and it
// clears by itself within a second or two.
//
// This does not weaken the core invariant. A genuine failure still fails
// loudly and still refuses to look like an empty collection; only this one
// narrow, self-clearing timing accident gets a second chance, and only one.

/** How long to wait before the second attempt. The observed skew was ~1s. */
export const RETRY_DELAY_MS = 1200

/**
 * True only for the clock-disagreement family of token errors.
 *
 * Deliberately narrow. An expired token, a bad signature or a permission
 * refusal are all real answers that a retry would only repeat more slowly —
 * matching them would turn every genuine outage into a sluggish one. These
 * two phrases are the ones that mean "correct token, wrong moment":
 *
 *   "JWT issued at future"  — the `iat` claim is ahead of the checker's clock
 *   "JWT not yet valid"     — the `nbf` claim is, same cause
 *
 * Matched on the message text because PostgREST does not give this family a
 * code of its own; the body Stacia saw was the bare message.
 */
export function isClockSkewError(error) {
  if (!error) return false
  const message = typeof error === 'string' ? error : error.message
  if (typeof message !== 'string') return false
  return /issued at future/i.test(message) || /not yet valid/i.test(message)
}

/**
 * Run `attempt` once; if it fails *only* because of clock skew, wait and run
 * it exactly once more. Returns whatever `attempt` returns, so it drops in
 * around a Supabase query without changing its `{ data, error }` shape.
 *
 * `sleep` is injectable so the tests do not spend a real second waiting.
 */
export async function withClockSkewRetry(attempt, { delay = RETRY_DELAY_MS, sleep = defaultSleep } = {}) {
  const first = await attempt()
  if (!isClockSkewError(first?.error)) return first
  await sleep(delay)
  return attempt()
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
