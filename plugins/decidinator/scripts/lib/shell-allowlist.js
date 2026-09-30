// Decides whether one shell command from an oracle is a single read-only gh command: gh search,
// gh repo view, or gh api with no method other than GET. It is deliberately conservative: anything it
// cannot be sure of is refused.
'use strict'

const NOT_ALLOWED = 'it is not one of gh search, gh repo view or gh api'

const OUTSIDE_FORBIDDEN = ';&|<>()$`\\#@'
const DOUBLE_FORBIDDEN = '$`\\'
const SEARCH_KINDS = ['repos', 'code', 'issues', 'prs', 'commits']

// Returns { tokens: string[] } or { problem: string }.
function tokenize(command) {
  if (typeof command !== 'string' || command.trim() === '') return { problem: 'the call has no command' }
  if (/[\r\n]/.test(command)) return { problem: 'the command spans more than one line' }
  const tokens = []
  let state = 'outside'
  let current = null
  for (const ch of command) {
    if (state === 'outside') {
      if (ch === ' ' || ch === '\t') {
        if (current !== null) {
          tokens.push(current)
          current = null
        }
      } else if (OUTSIDE_FORBIDDEN.includes(ch)) {
        return { problem: `it uses \`${ch}\` outside single quotes` }
      } else if (ch === "'") {
        state = 'single'
        if (current === null) current = ''
      } else if (ch === '"') {
        state = 'double'
        if (current === null) current = ''
      } else {
        current = (current ?? '') + ch
      }
    } else if (state === 'single') {
      if (ch === "'") state = 'outside'
      else current += ch
    } else {
      if (ch === '"') state = 'outside'
      else if (DOUBLE_FORBIDDEN.includes(ch)) return { problem: `it uses \`${ch}\` inside double quotes` }
      else current += ch
    }
  }
  if (state !== 'outside') return { problem: 'it has an unclosed quote' }
  if (current !== null) tokens.push(current)
  return { tokens }
}

const webProblem = t => (t.some(a => a === '-w' || a === '--web') ? 'it opens a browser (--web)' : null)

function methodProblem(value) {
  return value.toUpperCase() !== 'GET' ? `gh api with method ${value} is not read-only` : null
}

const headerProblem = value => (/method/i.test(value) ? 'gh api header sets the method' : null)

function checkApi(t) {
  let hasFields = false
  let explicitGet = false
  const method = value => {
    const problem = methodProblem(value)
    if (!problem) explicitGet = true
    return problem
  }
  for (let i = 2; i < t.length; i++) {
    const a = t[i]
    let problem = null
    if (a === '-X' || a === '--method') {
      const value = t[i + 1]
      if (value === undefined) return 'gh api -X needs a method'
      i++
      problem = method(value)
    } else if (a.startsWith('--method=')) {
      problem = method(a.slice('--method='.length))
    } else if (a.startsWith('-X') && a.length > 2) {
      problem = method(a.slice(2))
    } else if (a === '-f' || a === '-F' || a === '--field' || a === '--raw-field') {
      hasFields = true
      i++
    } else if (
      a.startsWith('--field=') ||
      a.startsWith('--raw-field=') ||
      ((a.startsWith('-f') || a.startsWith('-F')) && a.length > 2)
    ) {
      hasFields = true
    } else if (a === '--input' || a.startsWith('--input=')) {
      return 'gh api --input sends a request body'
    } else if (a === '-H' || a === '--header') {
      const value = t[i + 1] ?? ''
      i++
      problem = headerProblem(value)
    } else if (a.startsWith('--header=')) {
      problem = headerProblem(a.slice('--header='.length))
    } else if (a.startsWith('-H') && a.length > 2) {
      problem = headerProblem(a.slice(2))
    } else if (['-q', '--jq', '-t', '--template', '-p', '--preview', '--hostname', '--cache'].includes(a)) {
      i++
    } else if (a.startsWith('-') && !a.startsWith('--') && a.length > 2 && !'XfFHqtp'.includes(a[1])) {
      return `gh api combined short flags (${a}) are not allowed`
    }
    if (problem) return problem
  }
  if (hasFields && !explicitGet) return 'gh api sends -f/-F fields as a POST unless -X GET is given'
  return null
}

// Returns null when the command is allowed, else a problem string.
function check(command) {
  const tk = tokenize(command)
  if (tk.problem) return tk.problem
  const t = tk.tokens
  if (t[0] !== 'gh' || t.length < 3) return NOT_ALLOWED
  if (t[1] === 'search') return SEARCH_KINDS.includes(t[2]) ? webProblem(t) : NOT_ALLOWED
  if (t[1] === 'repo') return t[2] === 'view' ? webProblem(t) : NOT_ALLOWED
  if (t[1] === 'api') return checkApi(t)
  return NOT_ALLOWED
}

module.exports = { tokenize, check, NOT_ALLOWED }
