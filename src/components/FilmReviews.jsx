import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  COMMENT_MAX,
  STARS,
  cleanDraft,
  draftChanged,
  notYetRated,
  othersReviews,
  reviewAction,
  starText,
} from '../lib/reviews.js'

const REVIEW_COLUMNS = 'id,film_id,profile_id,rating,comment,created_at,updated_at'

// ⚠ WORDING IS A DRAFT (2026-11-08) — Stacia writes the UI copy. Every
// visible string in this file is listed for her in HANDOFF.md.

/**
 * Ratings and comments on one film: yours to set, everyone else's to read.
 *
 * One row per person per film (`film_reviews`). Saving writes only your own
 * row — the database refuses anything else — and "Saved" appears only after
 * it confirms. Clearing both the stars and the comment deletes your row.
 */
export default function FilmReviews({ filmId, userId }) {
  const [state, setState] = useState({ status: 'loading', reviews: [], profiles: [], error: null })
  const [draft, setDraft] = useState({ rating: null, comment: '' })
  const [save, setSave] = useState({ status: 'idle', error: null })
  const commentRef = useRef(null)

  // The comment box grows to show all of its text (Stacia, 2026-11-08: the
  // only way to read a long comment was to drag a tiny corner a finger cannot
  // grab). The panel scrolls instead, which a finger can do anywhere.
  useLayoutEffect(() => {
    const box = commentRef.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${box.scrollHeight + 2}px` // + the 1px border, top and bottom
  }, [draft.comment, state.status])

  const mine = state.reviews.find((r) => r.profile_id === userId) ?? null

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }))
    const [reviews, profiles] = await Promise.all([
      supabase.from('film_reviews').select(REVIEW_COLUMNS).eq('film_id', filmId),
      supabase.from('profiles').select('id,display_name'),
    ])
    const error = reviews.error ?? profiles.error
    if (error) {
      setState({ status: 'error', reviews: [], profiles: [], error: error.message })
      return
    }
    const own = reviews.data.find((r) => r.profile_id === userId)
    setDraft({ rating: own?.rating ?? null, comment: own?.comment ?? '' })
    setState({ status: 'ready', reviews: reviews.data, profiles: profiles.data, error: null })
  }, [filmId, userId])

  useEffect(() => {
    load()
  }, [load])

  async function onSave() {
    const action = reviewAction(mine, draft)
    if (action === 'none') return
    if (action === 'too-long') {
      setSave({ status: 'error', error: `A comment can be up to ${COMMENT_MAX} characters.` })
      return
    }
    setSave({ status: 'saving', error: null })

    if (action === 'delete') {
      const { error } = await supabase.from('film_reviews').delete().eq('id', mine.id)
      if (error) return setSave({ status: 'error', error: error.message })
      setState((s) => ({ ...s, reviews: s.reviews.filter((r) => r.id !== mine.id) }))
      setDraft({ rating: null, comment: '' })
      return setSave({ status: 'saved', error: null })
    }

    // One row, named by (film, person). Insert the first time, update after.
    const row = { film_id: filmId, profile_id: userId, ...cleanDraft(draft) }
    const { data, error } = await supabase
      .from('film_reviews')
      .upsert(row, { onConflict: 'film_id,profile_id' })
      .select(REVIEW_COLUMNS)
      .single()
    if (error) return setSave({ status: 'error', error: error.message })
    setState((s) => ({ ...s, reviews: [...s.reviews.filter((r) => r.profile_id !== userId), data] }))
    setDraft({ rating: data.rating, comment: data.comment ?? '' })
    setSave({ status: 'saved', error: null })
  }

  function edit(patch) {
    setDraft((d) => ({ ...d, ...patch }))
    if (save.status !== 'saving') setSave({ status: 'idle', error: null })
  }

  if (state.status === 'loading') {
    return (
      <section className="reviews">
        <h3 className="group-label reviews-title">Ratings</h3>
        <p className="muted reviews-note">Loading ratings…</p>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="reviews">
        <h3 className="group-label reviews-title">Ratings</h3>
        <p className="error" role="alert">
          Could not load ratings: {state.error}
        </p>
        <button type="button" className="ghost form-action" onClick={load}>
          Try again
        </button>
      </section>
    )
  }

  const others = othersReviews(state.reviews, state.profiles, userId)
  const waiting = notYetRated(state.reviews, state.profiles, userId)
  const changed = draftChanged(mine, draft)
  const saving = save.status === 'saving'

  return (
    <section className="reviews">
      <h3 className="group-label reviews-title">Ratings</h3>

      <div className="review-mine">
        <div className="review-label" id={`stars-${filmId}`}>
          Your rating
        </div>
        <div className="stars-row">
          <div className="stars" role="group" aria-labelledby={`stars-${filmId}`}>
            {Array.from({ length: STARS }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`star${draft.rating != null && n <= draft.rating ? ' is-on' : ''}`}
                aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
                aria-pressed={draft.rating === n}
                disabled={saving}
                onClick={() => edit({ rating: n })}
              >
                <span aria-hidden="true">{draft.rating != null && n <= draft.rating ? '★' : '☆'}</span>
              </button>
            ))}
          </div>
          {draft.rating != null ? (
            <button
              type="button"
              className="link-button"
              disabled={saving}
              onClick={() => edit({ rating: null })}
            >
              Clear
            </button>
          ) : (
            <span className="muted reviews-note">Not rated</span>
          )}
        </div>

        <label htmlFor={`comment-${filmId}`} className="review-label">
          Your comment <span className="label-aside">— optional</span>
        </label>
        <textarea
          id={`comment-${filmId}`}
          ref={commentRef}
          className="review-comment"
          rows={2}
          maxLength={COMMENT_MAX}
          value={draft.comment}
          disabled={saving}
          onChange={(e) => edit({ comment: e.target.value })}
        />

        <div className="review-actions">
          <button
            type="button"
            className="form-action"
            disabled={!changed || saving}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save rating'}
          </button>
          {save.status === 'saved' && !changed && (
            <span className="review-saved" role="status">
              ✓ Saved
            </span>
          )}
        </div>
        {save.status === 'error' && (
          <p className="error" role="alert">
            Not saved: {save.error}. Your rating is still here — try again.
          </p>
        )}
      </div>

      {others.map((r) => (
        <div key={r.id} className="review-other">
          <div className="review-who">
            <span className="review-name">{r.name}</span>
            {r.rating != null ? (
              <span className="review-stars" aria-label={`${r.rating} of ${STARS} stars`}>
                {starText(r.rating)}
              </span>
            ) : (
              <span className="muted reviews-note">Not rated</span>
            )}
          </div>
          {r.comment && <p className="review-text">{r.comment}</p>}
        </div>
      ))}

      {waiting.map((name) => (
        <p key={name} className="muted reviews-note">
          {name} has not rated this yet.
        </p>
      ))}
    </section>
  )
}
