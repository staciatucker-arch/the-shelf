import { useEffect, useState } from 'react'
import { checkedOn, filmTriggerState, scopeLabel, splitForPanel } from '../lib/triggers.js'
import { TopicName } from './TriggerSettings.jsx'

// ⚠ WORDING IS A DRAFT (2026-11-15) — Stacia writes the UI copy.
//
// Stacia's rules (2026-11-15): call them "triggers", and name nothing until
// the person taps — a flagged topic as much as a spoiler one. So the section
// opens on a count, and a spoiler topic stays hidden even after that tap.
//
// DoesTheDogDie's (terms §6, §13): the credit wherever triggers show; never
// call a film safe or the votes complete; no answer is not "no".

function Credit() {
  return (
    <p className="trigger-credit">
      <a href="https://www.doesthedogdie.com" target="_blank" rel="noopener noreferrer">
        Powered by DoesTheDogDie.com
      </a>
    </p>
  )
}

export default function FilmTriggers({ film, triggers, onOpenSettings }) {
  const { media, flagged, myTopics, topicsById, checkFilms, votesFor, loaded, error: loadError } = triggers
  const s = filmTriggerState(film, { media, flagged, myTopics })

  const [open, setOpen] = useState(false)
  const [votes, setVotes] = useState(null)
  const [voteError, setVoteError] = useState(null)
  const [showNo, setShowNo] = useState(false)
  const [showUnknown, setShowUnknown] = useState(false)
  const [revealed, setRevealed] = useState(() => new Set())
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(null)

  const mediaId = s.row?.id ?? null
  // A different answer (a check just ran, or another film): start closed.
  useEffect(() => {
    setOpen(false)
    setVotes(null)
    setShowNo(false)
    setShowUnknown(false)
  }, [mediaId, film.id])

  async function reveal() {
    setOpen(true)
    if (votes || !mediaId) return
    setVoteError(null)
    const result = await votesFor(mediaId)
    if (result.error) setVoteError(result.error)
    else setVotes(result.votes)
  }

  async function checkNow() {
    setCheckError(null)
    setChecking(true)
    try {
      const result = await checkFilms([film.id])
      const status = result.results?.[0]?.status
      if (result.error) setCheckError(result.error)
      else if (status === 'budget') setCheckError('The monthly limit for checks has been reached. Try again next month.')
      else if (status === 'later') setCheckError('Busy — try again in a minute.')
    } finally {
      setChecking(false)
    }
  }

  const heading = <h3 className="group-label triggers-title">Triggers for you</h3>

  if (!loaded) {
    return (
      <section className="film-triggers">
        {heading}
        <p className="muted reviews-note">{loadError ? `Could not load triggers: ${loadError}` : 'Loading…'}</p>
      </section>
    )
  }

  if (s.state === 'none-chosen') {
    return (
      <section className="film-triggers">
        {heading}
        <p className="muted reviews-note">Choose your triggers to see them here.</p>
        <button type="button" className="ghost form-action" onClick={onOpenSettings}>
          Choose triggers
        </button>
      </section>
    )
  }

  if (s.state !== 'checked') {
    const isBoxSet = String(film.type ?? '').toLowerCase() === 'box set'
    const why =
      s.state === 'unmatched'
        ? isBoxSet
          ? 'Box sets can’t be checked yet.'
          : 'This title has no confirmed database match. Confirm one in Edit, then it can be checked.'
        : s.state === 'not-listed'
          ? 'DoesTheDogDie has no entry for this title.'
          : s.state === 'error'
            ? 'The last check didn’t work.'
            : 'This title hasn’t been checked yet.'
    return (
      <section className="film-triggers">
        {heading}
        <p className="trigger-status">
          <span className="not-checked-tag">Not checked</span> {why}
        </p>
        {(s.state === 'unchecked' || s.state === 'error') && (
          <button type="button" className="ghost form-action" onClick={checkNow} disabled={checking}>
            {checking ? 'Checking…' : 'Check now'}
          </button>
        )}
        {checkError && (
          <p className="error" role="alert">
            {checkError}
          </p>
        )}
        <Credit />
      </section>
    )
  }

  const split = votes ? splitForPanel(votes, myTopics, topicsById) : null
  const nameProps = (t) => ({
    showSpoilers: false,
    revealed: revealed.has(t.id),
    onReveal: (id) => setRevealed((r) => new Set(r).add(id)),
  })

  return (
    <section className="film-triggers">
      <div className="triggers-head">
        {heading}
        <span className="muted trigger-scope">{scopeLabel(film, s.row)}</span>
      </div>

      <div className="trigger-summary">
        <p className={s.count > 0 ? 'trigger-count is-flagged' : 'trigger-count'}>
          {s.count > 0 ? (
            <>
              <span aria-hidden="true">⚠ </span>
              {s.count === 1 ? '1 of your triggers is flagged' : `${s.count} of your triggers are flagged`}
            </>
          ) : (
            'None of your triggers are flagged'
          )}
        </p>
        {!open && (
          <button type="button" className="ghost form-action" onClick={reveal}>
            {s.count > 0 ? 'Show which' : 'Details'}
          </button>
        )}
      </div>

      {open && voteError && (
        <p className="error" role="alert">
          Could not load the details: {voteError}
        </p>
      )}
      {open && !voteError && !split && <p className="muted reviews-note">Loading…</p>}

      {open && split && (
        <>
          {split.flagged.length > 0 && (
            <ul className="trigger-list">
              {split.flagged.map(({ topic, yes, no }) => (
                <li key={topic.id}>
                  <TopicName topic={topic} {...nameProps(topic)} />
                  <span className="muted trigger-votes">
                    {yes} yes · {no} no
                  </span>
                </li>
              ))}
            </ul>
          )}

          {split.votedNo.length > 0 && (
            <div className="trigger-more">
              <p>
                {split.votedNo.length} of your triggers: more voted no{' '}
                <button type="button" className="link-button" onClick={() => setShowNo((v) => !v)}>
                  {showNo ? 'Hide' : 'Show'}
                </button>
              </p>
              {showNo && (
                <ul className="trigger-list quiet">
                  {split.votedNo.map(({ topic, yes, no }) => (
                    <li key={topic.id}>
                      <TopicName topic={topic} {...nameProps(topic)} />
                      <span className="muted trigger-votes">
                        {yes} yes · {no} no
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {split.noAnswer.length > 0 && (
            <div className="trigger-more">
              <p>
                {split.noAnswer.length} of your triggers have no answer yet{' '}
                <button type="button" className="link-button" onClick={() => setShowUnknown((v) => !v)}>
                  {showUnknown ? 'Hide' : 'Which?'}
                </button>
              </p>
              {showUnknown && (
                <ul className="trigger-list quiet">
                  {split.noAnswer.map(({ topic }) => (
                    <li key={topic.id}>
                      <TopicName topic={topic} {...nameProps(topic)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button type="button" className="link-button trigger-hide" onClick={() => setOpen(false)}>
            Hide details
          </button>
        </>
      )}

      {s.row.tmdb_kind === 'tv' && Number(s.row.season) >= 0 && (
        <p className="muted form-hint">Season votes on DoesTheDogDie can include votes for the whole show.</p>
      )}
      {s.row.tmdb_kind === 'tv' && Number(s.row.season) < 0 && (
        <p className="muted form-hint">
          No season is recorded, so these are for the whole series. Pick the season in Edit to see that season’s.
        </p>
      )}
      <p className="muted form-hint">
        Votes from DoesTheDogDie users. They can be incomplete or wrong — a trigger not flagged here may
        still be in it. Checked {checkedOn(s.row.checked_at)}.
      </p>
      <Credit />
    </section>
  )
}
