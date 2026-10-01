'use strict'

// The fixture repo for the end-to-end scenarios: its files, the seeded state for the round trip, and
// the answers filled into an exported stakeholder file.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const lib = path.join(__dirname, '..', '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const { QUESTIONS } = require('./scenarios.js')

const FIXTURE = {
  'CLAUDE.md': [
    '# CLAUDE.md',
    '',
    '`tally` is a command-line todo list for Node 20 or later. Read `docs/spec.md` before changing anything.',
    '',
    '- No dependencies, runtime or development: use only Node\'s built-in modules.',
    '- Source is in `src/`, tests in `test/`.',
  ],
  'docs/spec.md': [
    '# tally: specification',
    '',
    '`tally` keeps todo lists in one JSON file, `~/.tally.json`.',
    '',
    '## Commands',
    '',
    '- `tally add <list> <text> [--due YYYY-MM-DD]` adds a todo to a list, creating the list if needed.',
    '- `tally list <list>` prints the list\'s open todos: those with a due date first, earliest due date first, then those without one.',
    '- `tally done <list> <n>` marks the n-th todo of the list done.',
    '',
    '## Plans',
    '',
    'Free accounts may keep a limited number of lists; paid accounts have no limit. The product team sets the limit.',
    '',
    '## Constraints',
    '',
    '- The package has no dependencies, runtime or development. Everything, including the tests, uses only Node\'s built-in modules.',
    '- Tests live in `test/` and run with `npm test`.',
  ],
  'src/list.js': [
    '\'use strict\'',
    '',
    '// Returns the open todos of a list in display order (docs/spec.md, `tally list`).',
    'function openTodos(list) {',
    '  const open = list.todos.filter((t) => !t.done)',
    '  const dated = open.filter((t) => t.due).sort((a, b) => a.due.localeCompare(b.due))',
    '  const undated = open.filter((t) => !t.due)',
    '  return [...dated, ...undated]',
    '}',
    '',
    'module.exports = { openTodos }',
  ],
  'package.json': [
    '{',
    '  "name": "tally",',
    '  "version": "0.1.0",',
    '  "private": true',
    '}',
  ],
  'docs/decisions.md': [
    '<!-- decidinator-log v1 -->',
    '',
    '### D-0001 · Storage format',
    '- **Question:** Should tally store its lists in JSON or SQLite?',
    '- **Answer:** JSON, in one file at ~/.tally.json.',
    '- **Rationale:** No dependencies are allowed, and one small file is enough for personal todo lists.',
    '- **Provenance:** user',
    '- **Confidence:** none',
    '- **Rung:** none',
    '- **Sources:** docs/spec.md',
    '- **Assumptions:** none',
    '- **Question ID:** Q-0001',
    '- **Context:** setup',
    '- **Date:** 2026-09-30',
  ],
  'docs/open-questions.md': ['<!-- decidinator-sidecar v1 -->'],
}

const ANSWERS = {
  'Q-0002': 'five lists held in one named constant',
  'Q-0003': 'Alphabetically, by their text.'
}

function git(repoDir, args) {
  const r = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' })
  if (r.error || r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.error ? r.error.message : r.stderr}`)
}

function seed(repoDir) {
  const logFile = path.join(repoDir, 'docs', 'decisions.md')
  const sideFile = path.join(repoDir, 'docs', 'open-questions.md')
  const decisions = [
    {
      title: 'Free-plan list limit',
      question: QUESTIONS.humanOnly.question,
      answer: 'Five lists, held in one named constant.',
      rationale: 'Provisional: the product team sets the limit.',
      provenance: 'oracle-provisional',
      confidence: 'medium',
      rung: 1,
      sources: ['docs/spec.md'],
      assumptions: [],
      flags: [],
      questionId: 'Q-0002',
      context: 'Implementing the free-plan list limit in tally add.',
      date: '2026-09-30',
      sidecar: 'Q-0002'
    },
    {
      title: 'Equal due dates order',
      question: QUESTIONS.specSilent.question,
      answer: 'In the order they were added.',
      rationale: 'A stable sort on the due date keeps insertion order, as the undated todos already do.',
      provenance: 'oracle-provisional',
      confidence: 'medium',
      rung: 1,
      sources: ['docs/spec.md', 'src/list.js'],
      assumptions: [],
      flags: [],
      questionId: 'Q-0003',
      context: 'Writing the ordering tests for src/list.js.',
      date: '2026-09-30',
      sidecar: 'Q-0003'
    }
  ]
  const questions = [
    {
      id: 'Q-0002',
      topic: 'Free-plan list limit',
      question: QUESTIONS.humanOnly.question,
      context: 'Implementing the free-plan list limit in tally add.',
      options: [
        { label: '3 lists', tradeoffs: 'Pushes more users to paid plans sooner.' },
        { label: '5 lists', tradeoffs: 'A friendlier free tier, with fewer upgrades.' }
      ],
      provisionalAnswer: 'Five lists, held in one named constant.',
      provisionalDecision: 'D-0002',
      dependsOn: ['e2e-seed'],
      stakeholder: 'Product team',
      status: 'open'
    },
    {
      id: 'Q-0003',
      topic: 'Equal due dates order',
      question: QUESTIONS.specSilent.question,
      context: 'Writing the ordering tests for src/list.js.',
      options: [
        { label: 'Added', tradeoffs: 'Stable and predictable; matches the undated todos.' },
        { label: 'Alphabetical', tradeoffs: 'Easier to scan, but reorders todos when their text changes.' }
      ],
      provisionalAnswer: 'In the order they were added.',
      provisionalDecision: 'D-0003',
      dependsOn: ['e2e-seed'],
      status: 'open'
    }
  ]
  for (const d of decisions) {
    const r = decisionLog.append(logFile, d)
    if (!r.ok) throw new Error(r.error)
  }
  for (const q of questions) {
    const r = sidecar.append(sideFile, q)
    if (!r.ok) throw new Error(r.error)
  }
}

function setupRepo(n, repoDir) {
  n = String(n)
  fs.rmSync(repoDir, { recursive: true, force: true })
  for (const [rel, lines] of Object.entries(FIXTURE)) {
    const file = path.join(repoDir, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, lines.join('\n') + '\n')
  }
  if (n === '6') {
    const file = path.join(repoDir, '.claude', 'decidinator.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ rungs: ['decidinator:oracle-1', 'decidinator:oracle-2'] }, null, 2) + '\n')
  }
  if (n === '7') seed(repoDir)
  git(repoDir, ['init', '-q'])
  git(repoDir, ['add', '-A'])
  git(repoDir, ['-c', 'user.name=decidinator-e2e', '-c', 'user.email=decidinator-e2e@example.invalid', 'commit', '-q', '-m', 'fixture'])
}

function fillAnswers(base) {
  const file = path.join(base, 'repo', 'docs', 'stakeholders.md')
  const original = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(path.join(base, 'stakeholders-exported.md'), original)
  const lines = original.split('\n')
  const filled = new Set()
  let current = null
  for (let i = 0; i < lines.length; i++) {
    const m = /^### (Q-\d{4,})\b/.exec(lines[i])
    if (m) current = m[1]
    if (current === null || !Object.hasOwn(ANSWERS, current) || filled.has(current)) continue
    const cr = lines[i].endsWith('\r')
    if ((cr ? lines[i].slice(0, -1) : lines[i]) === '- **Answer:**') {
      lines[i] = '- **Answer:** ' + ANSWERS[current] + (cr ? '\r' : '')
      filled.add(current)
    }
  }
  const ids = [...filled].sort()
  if (ids.length !== 2 || ids[0] !== 'Q-0002' || ids[1] !== 'Q-0003') {
    throw new Error('expected blank Answer lines for Q-0002 and Q-0003 in ' + file)
  }
  const text = lines.join('\n')
  fs.writeFileSync(file, text)
  fs.writeFileSync(path.join(base, 'stakeholders-answered.md'), text)
  return file
}

module.exports = { FIXTURE, ANSWERS, setupRepo, fillAnswers }
