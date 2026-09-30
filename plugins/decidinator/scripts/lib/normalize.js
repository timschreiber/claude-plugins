// Question normalization for Decidinator: case, whitespace and punctuation are ignored, so two
// phrasings of one question match. The hash of the normalized text is the key for deduplication
// and for the gate's matching.
'use strict'

const crypto = require('crypto')

function normalizeQuestion(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{P}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function questionHash(text) {
  return crypto.createHash('sha256').update(normalizeQuestion(text), 'utf8').digest('hex').slice(0, 16)
}

module.exports = { normalizeQuestion, questionHash }
