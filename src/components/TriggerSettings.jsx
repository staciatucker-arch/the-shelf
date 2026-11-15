import { useEffect, useMemo, useRef, useState } from 'react'
import { lockScroll } from '../lib/scrollLock.js'
import { searchTopics, topicsByCategory } from '../lib/triggers.js'
import { useBackToClose } from './useBackToClose.js'

// ⚠ WORDING IS A DRAFT (2026-11-15) — Stacia writes the UI copy. Built from
// Dana's mock-ups with "triggers" for "warnings" (Stacia's change).

const SPOILER_PREF = 'shelf.showSpoilerTopics'

function readSpoilerPref() {
  try {
    return localStorage.getItem(SPOILER_PREF) === 'yes'
  } catch {
    return false
  }
}

/**
 * A topic's name, or — for a topic whose name is itself a spoiler — a
 * placeholder until tapped (or until the person turns hiding off).
 */
export function TopicName({ topic, showSpoilers, revealed, onReveal }) {
  if (topic.is_spoiler && !showSpoilers && !revealed) {
    return (
      <span className="topic-hidden">
        <span className="spoiler-tag">Spoiler</span> <em>name hidden</em>{' '}
        <button
          type="button"
          className="link-button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onReveal(topic.id)
          }}
        >
          Show
        </button>
      </span>
    )
  }
  return (
    <span>
      {topic.is_spoiler && <span className="spoiler-tag">Spoiler</span>} {topic.name}
    </span>
  )
}

/** One topic with its tick box. */
function TopicRow({ topic, chosen, busy, onToggle, nameProps, showCategory = false }) {
  return (
    <li className="topic-row">
      <label className="check-item">
        <input type="checkbox" checked={chosen} disabled={busy} onChange={() => onToggle(topic.id)} />
        <span className="topic-text">
          <TopicName topic={topic} {...nameProps} />
          {showCategory && topic.category && <span className="topic-category">{topic.category}</span>}
        </span>
      </label>
    </li>
  )
}

/**
 * "Your triggers": each person chooses what they want to know about. Their
 * list is theirs alone — the database lets nobody else read it.
 */
export default function TriggerSettings({ triggers, onClose }) {
  const { topics, topicsById, myTopics, toggle } = triggers
  useBackToClose(onClose, { id: 'trigger-settings' })
  const latestOnClose = useRef(onClose)
  latestOnClose.current = onClose

  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [showSpoilers, setShowSpoilers] = useState(readSpoilerPref)
  const [revealed, setRevealed] = useState(() => new Set())

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

  async function onToggle(id) {
    setError(null)
    setBusyId(id)
    try {
      const result = await toggle(id)
      if (result?.error) setError(`Not saved: ${result.error}`)
    } finally {
      setBusyId(null)
    }
  }

  function setSpoilerPref(on) {
    setShowSpoilers(on)
    try {
      localStorage.setItem(SPOILER_PREF, on ? 'yes' : 'no')
    } catch {
      // Private window: the switch still works for this visit.
    }
  }

  const nameProps = {
    showSpoilers,
    revealed: false,
    onReveal: (id) => setRevealed((r) => new Set(r).add(id)),
  }
  const propsFor = (t) => ({ ...nameProps, revealed: revealed.has(t.id) })

  const mine = useMemo(
    () => [...myTopics].map((id) => topicsById.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)),
    [myTopics, topicsById],
  )
  const starters = useMemo(
    () => topics.filter((t) => t.starter_order != null).sort((a, b) => a.starter_order - b.starter_order),
    [topics],
  )
  const results = useMemo(() => searchTopics(topics, query), [topics, query])
  const groups = useMemo(() => topicsByCategory(topics), [topics])

  return (
    <div className="detail-overlay" onClick={onClose} role="presentation">
      <div
        className="detail-panel trigger-settings"
        role="dialog"
        aria-modal="true"
        aria-label="Your triggers"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-head">
          <div>
            <h2 className="detail-title">Your triggers</h2>
            <p className="muted detail-year">Only you see these.</p>
          </div>
          <div className="detail-head-actions">
            <button type="button" className="detail-close" onClick={onClose}>
              <span aria-hidden="true">×</span>
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>

        <div className="detail-body trigger-body">
          <p className="trigger-how">
            Choose what you want to know about before you watch. A trigger is flagged on a film when
            more DoesTheDogDie users voted yes than no. Votes can be incomplete or wrong.
          </p>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <h3 className="group-label">Your triggers ({mine.length})</h3>
          {mine.length === 0 ? (
            <p className="muted form-hint">None chosen yet. Tick some below.</p>
          ) : (
            <ul className="topic-chips">
              {mine.map((t) => (
                <li key={t.id} className="topic-chip">
                  <TopicName topic={t} {...propsFor(t)} />
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={t.is_spoiler && !showSpoilers && !revealed.has(t.id) ? 'Remove hidden topic' : `Remove ${t.name}`}
                    disabled={busyId === t.id}
                    onClick={() => onToggle(t.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label htmlFor="trigger-search" className="group-label">
            Find a trigger
          </label>
          <input
            id="trigger-search"
            type="search"
            enterKeyHint="search"
            placeholder="Search all 281 — “needles”, “spiders”…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
          {query.trim() !== '' &&
            (results.length === 0 ? (
              <p className="muted form-hint">Nothing matches “{query.trim()}”.</p>
            ) : (
              <ul className="topic-list">
                {results.map((t) => (
                  <TopicRow
                    key={t.id}
                    topic={t}
                    chosen={myTopics.has(t.id)}
                    busy={busyId === t.id}
                    onToggle={onToggle}
                    nameProps={propsFor(t)}
                    showCategory
                  />
                ))}
              </ul>
            ))}

          {starters.length > 0 && (
            <>
              <h3 className="group-label">Starter list</h3>
              <ul className="topic-list">
                {starters.map((t) => (
                  <TopicRow
                    key={t.id}
                    topic={t}
                    chosen={myTopics.has(t.id)}
                    busy={busyId === t.id}
                    onToggle={onToggle}
                    nameProps={propsFor(t)}
                  />
                ))}
              </ul>
            </>
          )}

          <h3 className="group-label">All triggers, by category</h3>
          <div className="topic-groups">
            {groups.map((g) => {
              const picked = g.topics.filter((t) => myTopics.has(t.id)).length
              return (
                <details key={g.category} className="topic-group">
                  <summary>
                    {g.category}{' '}
                    <span className="muted">
                      {g.topics.length}
                      {picked > 0 ? ` · ${picked} chosen` : ''}
                    </span>
                  </summary>
                  <ul className="topic-list">
                    {g.topics.map((t) => (
                      <TopicRow
                        key={t.id}
                        topic={t}
                        chosen={myTopics.has(t.id)}
                        busy={busyId === t.id}
                        onToggle={onToggle}
                        nameProps={propsFor(t)}
                      />
                    ))}
                  </ul>
                </details>
              )
            })}
          </div>

          <label className="check-item spoiler-switch">
            <input type="checkbox" checked={showSpoilers} onChange={(e) => setSpoilerPref(e.target.checked)} />
            Show the names of spoiler triggers
          </label>
          <p className="muted form-hint">
            Some trigger names give away what happens. They stay hidden until you tap Show.
          </p>

          <p className="trigger-credit">
            <a href="https://www.doesthedogdie.com" target="_blank" rel="noopener noreferrer">
              Powered by DoesTheDogDie.com
            </a>
            {' · '}
            <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a>
          </p>
        </div>
      </div>
    </div>
  )
}
