import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMENT_MAX,
  cleanDraft,
  cleanRating,
  draftChanged,
  notYetRated,
  othersReviews,
  reviewAction,
  starText,
} from './reviews.js'

const me = 'u-stacia'
const people = [
  { id: 'u-stacia', display_name: 'Stacia' },
  { id: 'u-ingrid', display_name: 'Ingrid' },
]

// ---------------------------------------------------------------- ratings

test('a rating is a whole number from 1 to 5, or nothing', () => {
  assert.equal(cleanRating(4), 4)
  assert.equal(cleanRating('5'), 5)
  assert.equal(cleanRating(0), null) // never zero stars
  assert.equal(cleanRating(6), null)
  assert.equal(cleanRating(3.5), null)
  assert.equal(cleanRating(null), null)
  assert.equal(cleanRating(''), null)
})

test('stars read as filled then empty, and no rating reads as nothing', () => {
  assert.equal(starText(4), '★★★★☆')
  assert.equal(starText(1), '★☆☆☆☆')
  assert.equal(starText(null), '')
})

// ---------------------------------------------------------------- saving

test('a comment of only spaces is no comment', () => {
  assert.deepEqual(cleanDraft({ rating: null, comment: '   ' }), { rating: null, comment: null })
  assert.deepEqual(cleanDraft({ rating: 3, comment: '  great  ' }), { rating: 3, comment: 'great' })
})

test('unchanged means nothing to save, even with extra spaces typed', () => {
  const saved = { rating: 4, comment: 'still the best' }
  assert.equal(draftChanged(saved, { rating: 4, comment: 'still the best  ' }), false)
  assert.equal(reviewAction(saved, { rating: 4, comment: 'still the best' }), 'none')
})

test('a first rating, a changed rating and a new comment are all saves', () => {
  assert.equal(reviewAction(null, { rating: 5, comment: '' }), 'save')
  assert.equal(reviewAction({ rating: 5, comment: null }, { rating: 3, comment: '' }), 'save')
  assert.equal(reviewAction(null, { rating: null, comment: 'loved it' }), 'save')
})

test('clearing both the rating and the comment deletes the row', () => {
  assert.equal(reviewAction({ rating: 4, comment: 'x' }, { rating: null, comment: '' }), 'delete')
})

test('an empty draft with nothing saved does nothing — no empty rows', () => {
  assert.equal(reviewAction(null, { rating: null, comment: '  ' }), 'none')
})

test('a comment over the limit is refused before the database is asked', () => {
  const long = 'a'.repeat(COMMENT_MAX + 1)
  assert.equal(reviewAction(null, { rating: 3, comment: long }), 'too-long')
  assert.equal(reviewAction(null, { rating: 3, comment: 'a'.repeat(COMMENT_MAX) }), 'save')
})

// ---------------------------------------------------------------- listing

test('other people’s reviews carry their names; your own is left out', () => {
  const reviews = [
    { id: 'r1', profile_id: 'u-stacia', rating: 5, comment: null },
    { id: 'r2', profile_id: 'u-ingrid', rating: 4, comment: 'fun' },
  ]
  const others = othersReviews(reviews, people, me)
  assert.deepEqual(others.map((r) => [r.name, r.rating]), [['Ingrid', 4]])
})

test('someone who has not reviewed is listed as not rated yet', () => {
  assert.deepEqual(notYetRated([], people, me), ['Ingrid'])
  assert.deepEqual(notYetRated([{ profile_id: 'u-ingrid', rating: 2 }], people, me), [])
})
