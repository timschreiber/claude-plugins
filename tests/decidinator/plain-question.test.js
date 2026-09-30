'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const { endsWithQuestion } = require(path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib', 'plain-question.js'))

const TRUE_CASES = [
  'Should I also update the README?',
  'I found two options.\n\nWhich one do you prefer?',
  'Want me to run the tests?  \n\n',
  '**Should I proceed?**',
  'Should I run `npm test`?',
  '```js\nconst a = 1\n```\nShall I commit this?',
  'Which one? (A or B?)',
  'Ready to continue？',
  'Line one\r\nDo you agree?'
]

const FALSE_CASES = [
  'Done. The tests pass.',
  '```\nWhat is this?\n```',
  '~~~\nAny questions?\n~~~',
  'Here is the start:\n```\nwhy?',
  'Run `ls foo?`',
  'Why did it fail? The path was wrong.',
  '',
  '   \n  ',
  undefined,
  null,
  42
]

for (const input of TRUE_CASES) {
  test(`true: ${JSON.stringify(input)}`, () => {
    assert.equal(endsWithQuestion(input), true)
  })
}

for (const input of FALSE_CASES) {
  test(`false: ${JSON.stringify(input)}`, () => {
    assert.equal(endsWithQuestion(input), false)
  })
}
