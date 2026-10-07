'use strict'

// Returns the number of words in text: runs of non-whitespace characters.
function wordCount(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string')
  const words = text.trim().split(/\s+/)
  return words[0] === '' ? 0 : words.length
}

module.exports = { wordCount }
