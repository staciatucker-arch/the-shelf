import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * Everyone's ratings and the household's names, for the share message.
 *
 * Loaded ahead of the tap, whenever something that can share is on screen
 * (select mode, a film's panel, the person menu). It has to be ready before
 * Share is tapped: a phone only opens its share menu or writes the clipboard
 * straight after a tap, and a database round trip in between can use that up.
 * Re-read each time it becomes active, so a rating saved a moment ago is in.
 */
export function useShareData(active) {
  const [data, setData] = useState({ status: 'idle', reviews: [], profiles: [], error: null })

  useEffect(() => {
    if (!active) return undefined
    let live = true
    setData((d) => ({ ...d, status: d.status === 'ready' ? 'ready' : 'loading' }))
    Promise.all([
      supabase.from('film_reviews').select('film_id,profile_id,rating,comment'),
      supabase.from('profiles').select('id,display_name'),
    ]).then(([reviews, profiles]) => {
      if (!live) return
      const error = reviews.error ?? profiles.error
      if (error) setData({ status: 'error', reviews: [], profiles: [], error: error.message })
      else setData({ status: 'ready', reviews: reviews.data, profiles: profiles.data, error: null })
    })
    return () => {
      live = false
    }
  }, [active])

  return data
}
