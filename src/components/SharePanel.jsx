import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { displayTitle, displayYear } from '../lib/collection.js'
import { lockScroll } from '../lib/scrollLock.js'
import {
  DISCORD_LIMIT,
  SHARE_KINDS,
  SHARE_MAX,
  addToShare,
  otherNames,
  shareCandidates,
  shareMessage,
} from '../lib/share.js'
import { useBackToClose } from './useBackToClose.js'

// ⚠ WORDING IS A DRAFT (2026-11-21) except "Movie night?" and "We
// recommend", which are Stacia's. Every visible string here is listed for
// her in HANDOFF.md.

/**
 * The share card: pick up to three films, choose "Movie night?" or "We
 * recommend", add a note, and send the text through the phone's share menu
 * or copy it (Discord). Opened from a film's panel (that film already in) or
 * from the Share icon in the top row (empty).
 *
 * It writes nothing. It reads the chosen films' ratings, because the
 * message carries the sender's rating — and the other person's only when the
 * box is ticked. The message is built by lib/share.js, which never includes
 * a cover link, money or trigger data.
 */
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

export default function SharePanel({ films, userId, initialFilm = null, onClose }) {
  const [chosen, setChosen] = useState(() => (initialFilm ? [initialFilm] : []))
  const [kind, setKind] = useState(SHARE_KINDS[0].id)
  const [note, setNote] = useState('')
  const [includeOthers, setIncludeOthers] = useState(false)
  const [query, setQuery] = useState('')
  const [data, setData] = useState({ status: 'loading', reviews: [], profiles: [], error: null })
  const [sent, setSent] = useState({ status: 'idle', error: null })

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

  // Ratings for the chosen films, re-read whenever the choice changes.
  const ids = chosen.map((f) => f.id).join(',')
  useEffect(() => {
    let live = true
    async function load() {
      const filmIds = ids ? ids.split(',') : []
      const [reviews, profiles] = await Promise.all([
        filmIds.length
          ? supabase.from('film_reviews').select('film_id,profile_id,rating,comment').in('film_id', filmIds)
          : Promise.resolve({ data: [], error: null }),
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

  const others = otherNames(data.profiles, userId)
  const candidates = useMemo(() => shareCandidates(films, query, chosen), [films, query, chosen])
  const message =
    data.status === 'ready' && chosen.length > 0
      ? shareMessage({ kind, note, films: chosen, reviews: data.reviews, profiles: data.profiles, myId: userId, includeOthers })
      : ''
  const tooLong = message.length > DISCORD_LIMIT
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  function choose(film) {
    setChosen((c) => addToShare(c, film))
    setQuery('')
    setSent({ status: 'idle', error: null })
  }

  function remove(id) {
    setChosen((c) => c.filter((f) => f.id !== id))
    setSent({ status: 'idle', error: null })
  }

  async function onShare() {
    try {
      await navigator.share({ text: message })
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
      await navigator.clipboard.writeText(message)
      ok = true
    } catch {
      ok = copyTheOldWay(message)
    }
    setSent(
      ok
        ? { status: 'copied', error: null }
        : { status: 'error', error: 'Couldn’t copy. Press and hold the message to copy it by hand.' },
    )
  }

  return (
    <div className="detail-overlay" role="presentation" onClick={onClose}>
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
                onClick={() => setKind(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>

          <h3 className="group-label reviews-title">
            Films <span className="muted share-count">{chosen.length} of {SHARE_MAX}</span>
          </h3>
          {chosen.length > 0 && (
            <ul className="share-chosen">
              {chosen.map((f) => (
                <li key={f.id}>
                  <span>
                    {displayTitle(f.title)}
                    {displayYear(f) && <span className="muted"> · {displayYear(f)}</span>}
                  </span>
                  <button type="button" className="chip-remove" aria-label={`Remove ${displayTitle(f.title)}`} onClick={() => remove(f.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {chosen.length < SHARE_MAX ? (
            <div className="share-find">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={chosen.length ? 'Add another film from your shelf' : 'Find a film on your shelf'}
                aria-label="Find a film on your shelf"
                enterKeyHint="search"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
              {query.trim() && (
                <ul className="share-results">
                  {candidates.length === 0 && <li className="muted">Nothing on your shelf matches.</li>}
                  {candidates.map((f) => (
                    <li key={f.id}>
                      <button type="button" className="ghost share-result" onClick={() => choose(f)}>
                        {displayTitle(f.title)}
                        {displayYear(f) && <span className="muted"> · {displayYear(f)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="muted share-full">That’s {SHARE_MAX} — the most one share holds.</p>
          )}

          <label className="review-label" htmlFor="share-note">
            Note — optional
          </label>
          <textarea
            id="share-note"
            className="review-comment"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Friday at ours?"
          />

          {others.length > 0 && (
            <label className="check-item share-others">
              <input type="checkbox" checked={includeOthers} onChange={(e) => setIncludeOthers(e.target.checked)} />
              Include {others.join(' and ')}’s {others.length > 1 ? 'ratings' : 'rating'}
            </label>
          )}

          {data.status === 'error' && (
            <p className="error" role="alert">
              Couldn’t load ratings: {data.error}
            </p>
          )}

          {chosen.length === 0 ? (
            <p className="muted">Pick a film to see the message.</p>
          ) : (
            message && (
              <>
                <h3 className="group-label reviews-title">Message</h3>
                <pre className="share-preview">{message}</pre>
                {tooLong && (
                  <p className="error">
                    Too long for one Discord message ({message.length.toLocaleString()} of {DISCORD_LIMIT.toLocaleString()} characters).
                  </p>
                )}
                <div className="share-actions">
                  {canShare && (
                    <button type="button" className="form-action" onClick={onShare}>
                      Share…
                    </button>
                  )}
                  <button type="button" className={canShare ? 'ghost form-action' : 'form-action'} onClick={onCopy}>
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
            )
          )}
          <p className="muted share-small">Ratings and links only — never covers, prices or triggers.</p>
        </div>
      </div>
    </div>
  )
}
