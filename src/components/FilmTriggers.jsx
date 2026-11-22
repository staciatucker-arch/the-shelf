import { useEffect, useRef, useState } from 'react'
import {
  MIN_LEAD,
  filmTriggerState,
  scopeLabel,
  splitForPanel,
  summaryCounts,
} from '../lib/triggers.js'
import { TopicName } from './TriggerSettings.jsx'
import { useBackToClose } from './useBackToClose.js'

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
      {' · '}
      <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a>
    </p>
  )
}

// The explanation, moved off the panel into a pop-up behind an ⓘ (Stacia,
// after Dana, 2026-11-22): people learn how triggers work when they set them
// up, so the panel no longer repeats it every time. Back, ×, Escape and a tap
// outside all close the pop-up only, never the film's panel.
// "Nov 15" — the order Stacia wrote it in the pop-up (2026-11-22).
function checkedMonthDay(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TriggerInfo({ onClose, children }) {
  const closeRef = useRef(null)
  useBackToClose(onClose, { id: 'trigger-info' })

  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // Capture, so Escape closes this pop-up rather than the film's panel.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="trigger-info-overlay" role="presentation" onClick={onClose}>
      <div
        className="trigger-info"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trigger-info-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="trigger-info-head">
          <h3 id="trigger-info-title" className="group-label">About triggers</h3>
          <button type="button" className="ghost trigger-info-close" ref={closeRef} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function FilmTriggers({ film, triggers, onOpenSettings }) {
  const { media, votes, myTopics, topicsById, checkFilms, loaded, error: loadError } = triggers
  const s = filmTriggerState(film, { media, votes, myTopics })

  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState(() => new Set())
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const mediaId = s.row?.id ?? null
  // A different answer (a check just ran, or another film): start closed.
  useEffect(() => {
    setOpen(false)
  }, [mediaId, film.id])

  function reveal() {
    setOpen(true)
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

  const split = splitForPanel(s.items, topicsById)
  // Every trigger with any votes came from the whole series.
  const answered = s.items.filter((i) => i.yes + i.no > 0)
  const allFromSeries = answered.length > 0 && answered.every((i) => i.fromSeries)
  const counts = summaryCounts(s)
  const countLine = [
    counts.no > 0 && `${counts.no} more voted no`,
    counts.unsure > 0 && `${counts.unsure} not enough votes`,
    counts.unanswered > 0 && `${counts.unanswered} no answer yet`,
  ]
    .filter(Boolean)
    .join(' · ')
  const nameProps = (t) => ({
    showSpoilers: false,
    revealed: revealed.has(t.id),
    onReveal: (id) => setRevealed((r) => new Set(r).add(id)),
  })

  return (
    <section className="film-triggers">
      <div className="triggers-head">
        <div className="triggers-title-row">
          {heading}
          <button
            type="button"
            className="trigger-info-button"
            onClick={() => setInfoOpen(true)}
            aria-label="About triggers"
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">ⓘ</span>
          </button>
        </div>
        {/* Where the votes come from, by colour (Stacia, after Dana,
            2026-11-22): green "Season N" when the season's own votes are
            used, lavender "Whole series" otherwise. A season whose every
            answered trigger fell back to the series says "Whole series" —
            Angel S1 and S2 said "Season N · some whole series" when all of
            it was the series, which Stacia found confusing. A real mix shows
            the season; the details list marks each "whole series" trigger. */}
        {scopeLabel(film, s.row) &&
          (Number(s.row.season) >= 0 && !allFromSeries ? (
            <span className="trigger-scope is-season">{scopeLabel(film, s.row)}</span>
          ) : (
            <span className="trigger-scope is-series">Whole series</span>
          ))}
      </div>

      <div className="trigger-summary">
        <p className={s.count > 0 ? 'trigger-count is-flagged' : 'trigger-count'}>
          {s.count > 0 ? (
            <>
              <span aria-hidden="true">⚠ </span>
              {s.count === 1 ? '1 of your triggers is flagged' : `${s.count} of your triggers are flagged`}
            </>
          ) : counts.mostlyUnclear ? (
            // Nothing flagged and most of your triggers unclear (Dana,
            // 2026-11-16) — must not lead with "none flagged", which reads
            // as an all-clear. Wording: Dana's pick.
            `Not enough votes yet for ${counts.unclear} of your ${counts.total} triggers`
          ) : (
            'None of your triggers are flagged'
          )}
        </p>
        {/* The rest, counted, before any tap (Dana, 2026-11-16). Counts
            only — nothing is named until Details. Zeros are left out. */}
        {countLine && <p className="trigger-counts muted">{countLine}</p>}
        {!open && (
          <button type="button" className="ghost form-action" onClick={reveal}>
            {s.count > 0 ? 'Show which' : 'Details'}
          </button>
        )}
      </div>

      {open && (
        <>
          {/* Every group at once (Stacia, 2026-11-22): one tap shows it all,
              instead of a Show per group. Close or thinly-voted answers are
              listed, never dropped (Stacia's rule, 2026-11-15). */}
          {[
            ['Flagged', split.flagged, false],
            ['Not enough votes', split.unsure, true],
            ['Voted no', split.votedNo, true],
            ['No answer yet', split.noAnswer, true],
          ]
            .filter(([, list]) => list.length > 0)
            .map(([label, list, quiet]) => (
              <div className="trigger-group" key={label}>
                <h4 className="trigger-group-label">
                  {label} <span className="muted">({list.length})</span>
                </h4>
                <ul className={quiet ? 'trigger-list quiet' : 'trigger-list'}>
                  {list.map(({ topic, yes, no, fromSeries }) => (
                    <li key={topic.id}>
                      <TopicName topic={topic} {...nameProps(topic)} />
                      {label !== 'No answer yet' && (
                        <span className="muted trigger-votes">
                          {yes} yes · {no} no{fromSeries ? ' · whole series' : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          <button type="button" className="link-button trigger-hide" onClick={() => setOpen(false)}>
            Hide details
          </button>
        </>
      )}

      {/* Kept on the panel (Dana, 2026-11-22): the one thing that must not
          hide behind a tap is that a count is not an all-clear. The date is
          in the pop-up. */}
      <p className="muted form-hint">Based on viewer votes, which can miss things.</p>
      {infoOpen && (
        <TriggerInfo onClose={() => setInfoOpen(false)}>
          {/* Stacia's own wording, 2026-11-22. */}
          <div className="trigger-defs">
            <p><strong>Flagged:</strong> yes votes ahead by {MIN_LEAD}+.</p>
            <p><strong>Voted no:</strong> no votes ahead by {MIN_LEAD}+.</p>
            <p><strong>Anything else:</strong> not enough votes, or too close to call.</p>
          </div>
          <p className="muted form-hint">Votes come from DoesTheDogDie users and can be wrong or missing.</p>
          <p className="muted form-hint">
            Checked {checkedMonthDay(s.row.checked_at)}. Answers are automatically re-checked about every two weeks.
          </p>
          {s.row.tmdb_kind === 'tv' && (
            <p className="muted form-hint">
              <strong>Shows:</strong> If there are not enough votes on a show’s individual season, triggers for the
              whole series will be used.
            </p>
          )}
        </TriggerInfo>
      )}
      <Credit />
    </section>
  )
}
