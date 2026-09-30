'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { tokenize, check, NOT_ALLOWED } = require(
  path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib', 'shell-allowlist.js')
)

const allowed = [
  'gh search repos "claude code plugin" --limit 3 --json fullName',
  "gh search code 'retry policy' --language go",
  'gh search issues flaky --repo cli/cli',
  'gh repo view cli/cli',
  'gh repo view cli/cli --json description,stargazerCount',
  'gh api repos/cli/cli',
  "gh api repos/{owner}/{repo}/contents/README.md --jq '.content | length'",
  'gh api -X GET search/code -f q=retry',
  'gh api --method=get search/repositories -f q=x',
  'gh api -XGET repos/cli/cli',
  "gh api repos/cli/cli/releases --paginate -q '.[].tag_name'",
  "gh api repos/cli/cli -H 'Accept: application/vnd.github+json'",
  "gh api repos/x/y --jq '.[] | select(.a > 1) | $x'",
  '  gh repo view cli/cli  '
]

for (const command of allowed) {
  test(`allowed: ${JSON.stringify(command)}`, () => {
    assert.equal(check(command), null)
  })
}

const BACKTICK = '`'
const FIELDS = 'gh api sends -f/-F fields as a POST unless -X GET is given'
const WEB = 'it opens a browser (--web)'

const denied = [
  ['gh api repos/cli/cli -X POST', 'gh api with method POST is not read-only'],
  ['gh api --method=PATCH repos/x/y', 'gh api with method PATCH is not read-only'],
  ['gh api -XDELETE repos/x/y', 'gh api with method DELETE is not read-only'],
  ['gh api repos/x/y/issues -f title=hi', FIELDS],
  ['gh api repos/x/y/issues -Ftitle=hi', FIELDS],
  ["gh api graphql -f query='mutation{x}'", FIELDS],
  ['gh api repos/x/y --input body.json', 'gh api --input sends a request body'],
  ["gh api repos/x/y -H 'X-HTTP-Method-Override: DELETE'", 'gh api header sets the method'],
  ['gh api -iXPOST repos/x/y', 'gh api combined short flags (-iXPOST) are not allowed'],
  ['gh api repos/x/y -X', 'gh api -X needs a method'],
  ['gh repo view cli/cli --web', WEB],
  ['gh search repos x -w', WEB],
  ['gh repo clone cli/cli', NOT_ALLOWED],
  ['gh issue create x', NOT_ALLOWED],
  ['gh', NOT_ALLOWED],
  ['gh search', NOT_ALLOWED],
  ['gh search users x', NOT_ALLOWED],
  ['ls -R docs', NOT_ALLOWED],
  ['cd /tmp && gh search repos x', 'it uses `&` outside single quotes'],
  ['gh search repos x | head', 'it uses `|` outside single quotes'],
  ['gh search repos x; rm -rf .', 'it uses `;` outside single quotes'],
  ['gh search repos x > out.txt', 'it uses `>` outside single quotes'],
  ['gh search repos $(whoami)', 'it uses `$` outside single quotes'],
  ['gh search repos "$HOME"', 'it uses `$` inside double quotes'],
  [`gh search repos ${BACKTICK}id${BACKTICK}`, `it uses ${BACKTICK}${BACKTICK}${BACKTICK} outside single quotes`],
  ['gh search repos x # c', 'it uses `#` outside single quotes'],
  ['gh api @body', 'it uses `@` outside single quotes'],
  ['gh search repos a\\ b', 'it uses `\\` outside single quotes'],
  ["gh search repos 'x", 'it has an unclosed quote'],
  ['gh search repos x\nrm -rf .', 'the command spans more than one line'],
  [undefined, 'the call has no command'],
  ['   ', 'the call has no command']
]

for (const [command, problem] of denied) {
  test(`denied: ${JSON.stringify(command)}`, () => {
    assert.equal(check(command), problem)
  })
}

test('tokenize joins quoted pieces and keeps empty tokens', () => {
  assert.deepEqual(tokenize('gh search repos "a b" \'c d\' e"f g"h \'\''), {
    tokens: ['gh', 'search', 'repos', 'a b', 'c d', 'ef gh', '']
  })
})
