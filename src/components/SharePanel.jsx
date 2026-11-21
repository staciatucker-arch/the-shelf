import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { lockScroll } from '../lib/scrollLock.js'
import {
  DISCORD_LIMIT,
  SHARE_KINDS,
  otherNames,
  setRatingsInText,
  shareMessage,
  switchHeading,
} from '../lib/share.js'
import { useBackToClose } from './useBackToClose.js'

// ⚠ WORDING IS A DRAFT (2026-11-21) except "Movie night?" and "Check this
// out.", which are Stacia's. Every visible string here is listed for her in
// HANDOFF.md.

/** The pre-clipboard-API way: select hidden text and ask for a copy. */
function copyTheOldWay(text) {
  const box = document.createElement('textarea')
  box.value = text
  box.setAttribute('readonly', '')
  box.style.position = 'fixed'
  box.style.opacity = '0'
  document.body.appendChild(box)
  box.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  box.remove()
  return ok
}

/**
 * The share card, stripped down (Stacia's option B from Dana's review,
 * 2026-11-21). The films are already chosen — on the shelf in select mode,
 * or the one film whose panel it was opened from. What is left:
 *
 *   - "Movie night?" / "Check this out." and a tick box each for your own
 *     rating and the other person's, which write the message;
 *   - the message itself, in a box that can be edited freely (the note goes
 *     in there — there is no separate Note field);
 *   - Share… (the phone's share menu, where there is one) and Copy.
 *
 * The switch and the tick box edit the text in place (Stacia, 2026-11-21):
 * the switch swaps only the heading, the tick box adds or removes only the
 * other person's rating lines. Anything typed stays, and nothing asks.
 *
 * It writes nothing. The starting text comes from lib/share.js, which never
 * includes a cover link, money or trigger data.
 */
export default function SharePanel({ films, userId, onClose }) {
  const [kind, setKind] = useState(SHARE_KINDS[0].id)
  const [includeMine, setIncludeMine] = useState(true)
  const [includeOthers, setIncludeOthers] = useState(false)
  const [data, setData] = useState({ status: 'loading', reviews: [], profiles: [], error: null })
  const [text, setText] = useState('')
  const [sent, setSent] = useState({ status: 'idle', error: null })
  const boxRef = useRef(null)

  useBackToClose(onClose, { id: 'share' })
  const latestOnClose = useRef(onClose)
  latestOnClose.current = onClose
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') latestOnClose.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const releaseScroll = lockScroll()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      releaseScroll()
    }
  }, [])

  // The chosen films' ratings, read once: the message carries them.
  const ids = films.map((f) => f.id).join(',')
  useEffect(() => {
    let live = true
    async function load() {
      const [reviews, profiles] = await Promise.all([
        supabase.from('film_reviews').select('film_id,profile_id,rating,comment').in('film_id', ids.split(',')),
        supabase.from('profiles').select('id,display_name'),
      ])
      if (!live) return
      const error = reviews.error ?? profiles.error
      if (error) setData({ status: 'error', reviews: [], profiles: [], error: error.message })
      else setData({ status: 'ready', reviews: reviews.data, profiles: profiles.data, error: null })
    }
    load()
    return () => {
      live = false
    }
  }, [ids])

  // The first text, once the ratings are in. Later changes are edits in
  // place (below), never a rebuild.
  useEffect(() => {
    if (data.status !== 'ready') return
    setText(
      shareMessage({ kind, films, reviews: data.reviews, profiles: data.profiles, myId: userId, includeMine, includeOthers }),
    )
  }, [data.status])

  // The box grows to show all of its text, like the comment box on a film.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${box.scrollHeight + 2}px`
  }, [text])

  function changeKind(nextKind) {
    if (data.status !== 'ready' || nextKind === kind) return
    setText((t) => switchHeading(t, kind, nextKind, films.length))
    setKind(nextKind)
    setSent({ status: 'idle', error: null })
  }

  // A tick box for your own rating and one for everyone else's (Stacia,
  // 2026-11-21). Each adds or removes only its own lines.
  function changeRatings(who, include) {
    if (data.status !== 'ready') return
    setText((t) =>
      setRatingsInText(t, { films, reviews: data.reviews, profiles: data.profiles, myId: userId, who, include }),
    )
    if (who === 'mine') setIncludeMine(include)
    else setIncludeOthers(include)
    setSent({ status: 'idle', error: null })
  }

  const others = otherNames(data.profiles, userId)
  const tooLong = text.length > DISCORD_LIMIT
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const ready = data.status === 'ready'

  async function onShare() {
    try {
      await navigator.share({ text })
      setSent({ status: 'shared', error: null })
    } catch (e) {
      // Closing the share menu without picking an app is not an error.
      if (e?.name === 'AbortError') return
      setSent({ status: 'error', error: 'The share menu didn’t open. Try Copy instead.' })
    }
  }

  async function onCopy() {
    // "Copied" is claimed only once the clipboard has said yes. Some phones
    // and browsers refuse the modern clipboard; the older copy command is
    // the fallback, and only if both refuse is the person asked to copy by
    // hand.
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      ok = copyTheOldWay(text)
    }
    setSent(
      ok
        ? { status: 'copied', error: null }
        : { status: 'error', error: 'Couldn’t copy. Press and hold the message to copy it by hand.' },
    )
  }

  return (
    // No close on a tap outside: the message may hold typed text, and a stray
    // tap beside the panel lost it in testing. × and back still close it.
    <div className="detail-overlay" role="presentation">
      <div
        className="detail-panel share-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Share"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-head">
          <h2 className="detail-title">Share</h2>
          <div className="detail-head-actions">
            <button type="button" className="detail-close" onClick={onClose}>
              <span aria-hidden="true">×</span>
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>

        <div className="detail-body share-body">
          <div className="share-kinds" role="radiogroup" aria-label="Kind of share">
            {SHARE_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                className={`ghost share-kind${kind === k.id ? ' is-on' : ''}`}
                onClick={() => changeKind(k.id)}
                disabled={!ready}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* ⚠ Draft wording (2026-11-21). */}
          <label className="check-item share-others">
            <input
              type="checkbox"
              checked={includeMine}
              disabled={!ready}
              onChange={(e) => changeRatings('mine', e.target.checked)}
            />
            Include my rating
          </label>
          {others.length > 0 && (
            <label className="check-item share-others">
              <input
                type="checkbox"
                checked={includeOthers}
                disabled={!ready}
                onChange={(e) => changeRatings('others', e.target.checked)}
              />
              Include {others.join(' and ')}’s {others.length > 1 ? 'ratings' : 'rating'}
            </label>
          )}

          {data.status === 'error' && (
            <p className="error" role="alert">
              Couldn’t load ratings: {data.error}
            </p>
          )}
          {data.status === 'loading' && <p className="muted">Loading…</p>}

          {ready && (
            <>
              <label className="review-label" htmlFor="share-text">
                Message — add a note or change anything
              </label>
              <textarea
                id="share-text"
                ref={boxRef}
                className="review-comment share-text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setSent({ status: 'idle', error: null })
                }}
              />
              {tooLong && (
                <p className="error">
                  Too long for one Discord message ({text.length.toLocaleString()} of {DISCORD_LIMIT.toLocaleString()} characters).
                </p>
              )}
              <div className="share-actions">
                {canShare && (
                  <button type="button" className="form-action" onClick={onShare} disabled={!text.trim()}>
                    Share…
                  </button>
                )}
                <button
                  type="button"
                  className={canShare ? 'ghost form-action' : 'form-action'}
                  onClick={onCopy}
                  disabled={!text.trim()}
                >
                  Copy
                </button>
              </div>
              {sent.status === 'copied' && <p className="ok share-status">✓ Copied — paste it into Discord or a message.</p>}
              {sent.status === 'shared' && <p className="ok share-status">✓ Sent to the share menu.</p>}
              {sent.status === 'error' && (
                <p className="error share-status" role="alert">
                  {sent.error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
