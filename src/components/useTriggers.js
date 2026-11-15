import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { flaggedByMedia, indexMedia } from '../lib/triggers.js'

// Everything the trigger screens read, for the signed-in person.
//
//   topics    DoesTheDogDie's topics (281), with the starter list marked
//   myTopics  the topic ids this person chose — their rows only
//   media     current answers (under 30 days old) by lookup key
//   flagged   for each answer, which of MY topics are flagged
//
// Reads only. The two writes — choosing a topic, removing one — each name
// one row, wait for the database, and only then change what is on screen.
// "Check now" asks dtdd-lookup, which writes the cache itself.

const TOPIC_COLUMNS = 'id,name,category,is_spoiler,keywords,starter_order,dtdd_ordering'
const MEDIA_COLUMNS = 'id,tmdb_kind,tmdb_id,season,lookup_status,checked_at'
const PAGE = 1000

/** Every row of a query, page by page: the API stops at 1,000 rows. */
async function allRows(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) return { data: null, error }
    out.push(...data)
    if (data.length < PAGE) return { data: out, error: null }
  }
}

export function useTriggers(userId) {
  const [topics, setTopics] = useState(null)
  const [myTopics, setMyTopics] = useState(new Set())
  const [media, setMedia] = useState(new Map())
  const [flagged, setFlagged] = useState(new Map())
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const loadAnswers = useCallback(async (mine) => {
    const [m, v] = await Promise.all([
      allRows(() => supabase.from('v_dtdd_current').select(MEDIA_COLUMNS).order('id')),
      mine.size === 0
        ? Promise.resolve({ data: [], error: null })
        : allRows(() =>
            supabase
              .from('v_dtdd_votes')
              .select('media_id,topic_id,is_flagged')
              .eq('is_flagged', true)
              .in('topic_id', [...mine])
              .order('media_id'),
          ),
    ])
    const problem = m.error ?? v.error
    if (problem) return problem
    setMedia(indexMedia(m.data))
    setFlagged(flaggedByMedia(v.data))
    return null
  }, [])

  const load = useCallback(async () => {
    if (!userId) return
    setError(null)
    const [t, p] = await Promise.all([
      supabase.from('trigger_topics').select(TOPIC_COLUMNS).order('name'),
      supabase.from('profile_trigger_prefs').select('topic_id').eq('profile_id', userId),
    ])
    const problem = t.error ?? p.error
    if (problem) {
      setError(problem.message)
      return
    }
    const mine = new Set(p.data.map((r) => r.topic_id))
    setTopics(t.data)
    setMyTopics(mine)
    const answerProblem = await loadAnswers(mine)
    if (answerProblem) setError(answerProblem.message)
    setLoaded(true)
  }, [userId, loadAnswers])

  useEffect(() => {
    // A different person: nothing of the last one's choices stays.
    setTopics(null)
    setMyTopics(new Set())
    setMedia(new Map())
    setFlagged(new Map())
    setLoaded(false)
    load()
  }, [load])

  /** Choose or remove one topic. One row; resolved only on confirmation. */
  const toggle = useCallback(
    async (topicId) => {
      const choosing = !myTopics.has(topicId)
      const { error: problem } = choosing
        ? await supabase.from('profile_trigger_prefs').insert({ profile_id: userId, topic_id: topicId })
        : await supabase
            .from('profile_trigger_prefs')
            .delete()
            .eq('profile_id', userId)
            .eq('topic_id', topicId)
      // Already there / already gone means the database agrees with the tap.
      if (problem && problem.code !== '23505') return { error: problem.message }
      const next = new Set(myTopics)
      if (choosing) next.add(topicId)
      else next.delete(topicId)
      setMyTopics(next)
      const answerProblem = await loadAnswers(next)
      return { error: answerProblem ? answerProblem.message : null }
    },
    [myTopics, userId, loadAnswers],
  )

  /** Ask DoesTheDogDie about films with no current answer, then re-read. */
  const checkFilms = useCallback(
    async (filmIds) => {
      const { data, error: problem } = await supabase.functions.invoke('dtdd-lookup', {
        body: { action: 'check', film_ids: filmIds },
      })
      if (problem) return { error: problem.message, results: [] }
      if (data?.error) return { error: String(data.error), results: [] }
      const answerProblem = await loadAnswers(myTopics)
      return { error: answerProblem ? answerProblem.message : null, results: data?.results ?? [] }
    },
    [myTopics, loadAnswers],
  )

  /** One answer's votes on my topics, for the film panel. */
  const votesFor = useCallback(
    async (mediaId) => {
      if (myTopics.size === 0) return { votes: [], error: null }
      const { data, error: problem } = await supabase
        .from('v_dtdd_votes')
        .select('topic_id,yes_count,no_count,is_flagged')
        .eq('media_id', mediaId)
        .in('topic_id', [...myTopics])
      return problem ? { votes: null, error: problem.message } : { votes: data, error: null }
    },
    [myTopics],
  )

  const topicsById = useMemo(() => new Map((topics ?? []).map((t) => [t.id, t])), [topics])

  return {
    loaded,
    error,
    topics: topics ?? [],
    topicsById,
    myTopics,
    media,
    flagged,
    reload: load,
    toggle,
    checkFilms,
    votesFor,
  }
}
