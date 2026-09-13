import { Component } from 'react'

/**
 * What the app says when its own code throws.
 *
 * This exists because of a black screen. On 2026-09-13 `crypto.randomUUID()`
 * threw while the add form was rendering — it is a secure-context API and the
 * dev server's phone address is plain http — and with no boundary anywhere,
 * React unmounted the entire tree. The screen went black and said nothing: no
 * message, no hint which of fifteen controls caused it, and nothing the person
 * holding the phone could report beyond "it went black".
 *
 * The bug took twenty minutes to find once it was described. The silence was
 * the expensive part, and silence is the failure this whole rebuild exists to
 * rule out — unfetched trigger data must read "not yet checked" rather than a
 * false "no triggers", and the old app's "local mode" accepted edits that then
 * evaporated. A blank screen is the same sin wearing different clothes.
 *
 * **A boundary must be a class.** There is no hook equivalent; this is the one
 * component here that is not a function, and deliberately so.
 *
 * **It is not a complete safety net, and must not be described as one.** React
 * boundaries catch errors thrown in rendering, in lifecycle methods and in
 * constructors. They do **not** catch errors in event handlers, in `setTimeout`
 * or in promises that nobody awaited. The 2026-09-13 bug would have been
 * caught, because it happened during render. A throw inside an `onClick` would
 * still go to the console unseen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Logged, never swallowed. A boundary that quietly eats the stack trades a
    // blank screen for a polite blank screen, and the stack is the only thing
    // that makes the next one twenty minutes instead of an afternoon.
    console.error('The Shelf caught an error:', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const { title, detail, onDismiss, dismissLabel = 'Close', overlay } = this.props

    const body = (
      <div className="crash" role="alert">
        <h2 className="crash-title">{title ?? 'Something went wrong.'}</h2>
        {detail && <p className="crash-detail">{detail}</p>}

        {/* The actual message. It is jargon, and it is shown anyway: it is the
            difference between a report somebody can act on and "it went
            black". */}
        <p className="crash-message">
          <code>{String(error?.message || error)}</code>
        </p>

        <div className="crash-actions">
          {onDismiss && (
            <button type="button" className="ghost form-action" onClick={onDismiss}>
              {dismissLabel}
            </button>
          )}
          <button
            type="button"
            className="form-action"
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
        </div>
      </div>
    )

    // A panel that crashed is replaced where it stood, over the collection, so
    // the grid behind it stays visible and usable rather than vanishing along
    // with the thing that actually broke.
    if (!overlay) return body
    return (
      <div className="detail-overlay" role="presentation">
        {body}
      </div>
    )
  }
}
