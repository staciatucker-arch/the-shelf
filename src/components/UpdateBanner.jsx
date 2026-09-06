import { useRegisterSW } from 'virtual:pwa-register/react'

// Replaces the old hard-refresh ritual. A new version never takes over on its
// own — it waits behind this banner until someone chooses, so the app cannot
// reload out from under an edit in progress.
export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="update-banner" role="status">
      <span>Update available</span>
      <button onClick={() => updateServiceWorker(true)}>Reload</button>
      <button className="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  )
}
