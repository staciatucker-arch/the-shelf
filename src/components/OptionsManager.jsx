import { useCallback, useEffect, useState } from 'react'
import {
  OPTION_KINDS,
  OPTION_LABELS,
  addOption,
  deleteOption,
  loadAllOptions,
  loadOptionUsage,
  optionRows,
  setOptionArchived,
} from '../lib/options.js'

/**
 * The pick lists behind the add/edit form.
 *
 * Three things can happen to a value here, and the difference between them is
 * the whole point of the panel:
 *
 *   Add      — offer a new value from now on.
 *   Archive  — stop offering it, and leave every film that holds it alone.
 *   Delete   — only when no film holds it at all.
 *
 * There is deliberately no rename. Films store these values as plain text, not
 * as a reference, so renaming "Sci-Fi" here would not rename it on the forty
 * films that hold it — it would quietly create a second spelling and leave the
 * collection holding both. Renaming for real means rewriting forty film rows,
 * which is a bulk edit of the collection, and that is the one thing this app
 * is built not to do behind anybody's back. Add the new spelling, archive the
 * old one, and change the films you mean to change.
 */
export default function OptionsManager({ onClose, onChanged }) {
  const [kind, setKind] = useState('genre')
  const [options, setOptions] = useState(null)
  const [usage, setUsage] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyValue, setBusyValue] = useState(null)
  const [draft, setDraft] = useState('')

  const refresh = useCallback(async () => {
    setLoadError(null)
    const [{ rows, error: optionError }, { usage: counts, error: usageError }] =
      await Promise.all([loadAllOptions(), loadOptionUsage()])

    // A count this panel could not fetch must not be drawn as zero — that is
    // the number the Delete button is gated on.
    if (optionError || usageError) {
      setLoadError(optionError ?? usageError)
      return
    }
    setOptions(rows)
    setUsage(counts)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !busyValue) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, busyValue])

  /** Every change re-reads from the database rather than patching local state. */
  async function run(key, action) {
    setActionError(null)
    setBusyValue(key)
    const { error } = await action()
    if (error) {
      setActionError(error)
      setBusyValue(null)
      return false
    }
    await refresh()
    onChanged?.()
    setBusyValue(null)
    return true
  }

  const rows = options && usage ? optionRows(kind, options, usage) : null

  return (
    <div className="detail-overlay" role="presentation" onClick={() => !busyValue && onClose()}>
      <div
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Manage the pick lists"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="form-shell">
          <div className="detail-head form-head">
            <h2 className="detail-title">Pick lists</h2>
            <div className="detail-head-actions">
              <button
                type="button"
                className="ghost form-action"
                onClick={onClose}
                disabled={Boolean(busyValue)}
              >
                Done
              </button>
            </div>
          </div>

          <div className="form-body">
            <label htmlFor="options-kind">
              List
              <select
                id="options-kind"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value)
                  setDraft('')
                  setActionError(null)
                }}
              >
                {OPTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {OPTION_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>

            {loadError && (
              <p className="error" role="alert">
                Could not load the lists: {loadError}
              </p>
            )}
            {actionError && (
              <p className="error" role="alert">
                {actionError}
              </p>
            )}

            {!loadError && rows === null && <p className="muted">Loading…</p>}

            {rows && (
              <>
                <div className="option-add">
                  <input
                    type="text"
                    aria-label={`Add to ${OPTION_LABELS[kind]}`}
                    placeholder={`Add to ${OPTION_LABELS[kind]}…`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      run('__add__', () => addOption(kind, draft)).then((ok) => {
                        if (ok) setDraft('')
                      })
                    }}
                  />
                  <button
                    type="button"
                    className="form-action"
                    disabled={Boolean(busyValue) || draft.trim() === ''}
                    onClick={() =>
                      run('__add__', () => addOption(kind, draft)).then((ok) => {
                        if (ok) setDraft('')
                      })
                    }
                  >
                    Add
                  </button>
                </div>

                <ul className="option-list">
                  {rows.length === 0 && (
                    <li className="muted form-hint">This list is empty.</li>
                  )}

                  {rows.map((row) => {
                    const busy = busyValue === row.value
                    return (
                      <li
                        key={row.value}
                        className={
                          'option-row' +
                          (row.archived ? ' is-archived' : '') +
                          (row.onList ? '' : ' is-drifted')
                        }
                      >
                        <div className="option-name">
                          <span>{row.value}</span>
                          <span className="option-meta muted">
                            {row.filmCount === 0
                              ? 'not used'
                              : `${row.filmCount} ${row.filmCount === 1 ? 'film' : 'films'}`}
                            {row.archived && ' · archived'}
                            {!row.onList && ' · not on the list'}
                          </span>
                        </div>

                        <div className="option-actions">
                          {!row.onList ? (
                            <button
                              type="button"
                              className="ghost form-action"
                              disabled={Boolean(busyValue)}
                              onClick={() => run(row.value, () => addOption(kind, row.value))}
                            >
                              {busy ? '…' : 'Add to the list'}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="ghost form-action"
                                disabled={Boolean(busyValue)}
                                onClick={() =>
                                  run(row.value, () => setOptionArchived(row.id, !row.archived))
                                }
                              >
                                {busy ? '…' : row.archived ? 'Offer again' : 'Stop offering'}
                              </button>
                              {row.filmCount === 0 && (
                                <button
                                  type="button"
                                  className="ghost form-action option-delete"
                                  disabled={Boolean(busyValue)}
                                  onClick={() => run(row.value, () => deleteOption(row.id))}
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <p className="form-note muted">
                  “Stop offering” hides a value from the add and edit forms and
                  changes no film — anything already using it keeps it, and
                  keeps showing it. Delete only appears when no film uses the
                  value at all.
                  <br />
                  <br />
                  There is no rename here on purpose. Films store these as plain
                  words, so renaming one would leave every film that uses it
                  spelling it the old way. Add the new spelling, stop offering
                  the old one, and change the films you mean to change.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
