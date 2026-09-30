'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs')
const os = require('os')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const R = require(path.join(lib, 'resolution.js'))
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const { DEFAULTS } = require(path.join(lib, 'config.js'))

const v = (rung, confidence, ok = true, answer = 'A' + rung) => ({
  rung,
  ok,
  verdict: { answer, confidence }
})

test('bestAnswer', () => {
  const rows = [
    [[], null],
    [[v(1, 'high', false)], null],
    [[v(1, 'high'), v(2, 'medium')], 1],
    [[v(1, 'medium'), v(2, 'medium')], 2],
    [[v(1, 'high'), v(2, 'high')], 2],
    [[v(3, 'low'), v(1, 'low')], 3],
    [[v(1, 'low'), v(2, 'low', false)], 1],
    [[v(1, 'high', true, '  '), v(2, 'low')], 2],
    ['nope', null]
  ]
  for (const [input, rung] of rows) {
    const best = R.bestAnswer(input)
    assert.equal(best === null ? null : best.rung, rung, JSON.stringify(input))
  }
})

test('optionsFor', () => {
  const o1 = [{ label: 'X', tradeoffs: 'x' }]
  const o2 = [{ label: 'Y', tradeoffs: 'y' }]
  const a = { rung: 1, ok: true, verdict: { answer: 'a', confidence: 'high', options: o1 } }
  const b = { rung: 2, ok: true, verdict: { answer: 'b', confidence: 'low', options: o2 } }
  assert.deepEqual(R.optionsFor([a, b], a), o1)
  const c = { rung: 3, ok: true, verdict: { answer: 'c', confidence: 'high', options: [] } }
  assert.deepEqual(R.optionsFor([a, b, c], c), o2)
  assert.deepEqual(R.optionsFor([c], c), [])
  assert.deepEqual(R.optionsFor([], null), [])
})

test('title', () => {
  assert.equal(R.title({ header: ' Color ', question: 'Which?' }), 'Color')
  const t = R.title({ header: '', question: 'q'.repeat(70) })
  assert.equal(t.length, 60)
  assert.ok(t.endsWith('...'))
  assert.equal(R.title({ question: 'Which\n  color?' }), 'Which color?')
})

test('contextLabel', () => {
  assert.equal(R.contextLabel({ DECIDINATOR_CONTEXT: ' a;b  c ' }, 's1', 'main'), 'a,b c')
  assert.equal(R.contextLabel({}, 's1', 'main'), 'session s1 on main')
  assert.equal(R.contextLabel({}, 's1', null), 'session s1')
})

test('sidecarContext', () => {
  assert.equal(R.sidecarContext({ context: ' ctx ' }, 'label'), 'ctx')
  assert.equal(R.sidecarContext({ context: '  ' }, 'label'), 'label')
})

function models(decisions, questions) {
  const logText = [decisionLog.MARKER, '', ...decisions.flatMap(([id, d]) => [...decisionLog.render(id, d), ''])].join('\n')
  const sideText = [sidecar.MARKER, '', ...questions.flatMap(([id, q]) => [...sidecar.render(id, q), ''])].join('\n')
  return { log: decisionLog.parse(logText), side: sidecar.parse(sideText) }
}

const dec = (question, extra = {}) => ({
  title: 'T',
  question,
  answer: 'A',
  rationale: 'r',
  provenance: 'oracle-unconfirmed',
  confidence: 'low',
  rung: 1,
  questionId: 'Q-0009',
  context: 'c',
  date: '2026-01-01',
  ...extra
})
const que = (question, status = 'open') => ({
  topic: 'Topic',
  question,
  context: 'c',
  options: [],
  provisionalAnswer: 'p',
  status
})
const dupVerdict = (id) => [{ rung: 1, ok: true, verdict: { answer: 'a', confidence: 'low', duplicate_of: id } }]

test('findDuplicate', () => {
  const q = { id: 'Q-0010', question: 'Should we use tabs?' }

  let m = models([], [['Q-0001', que('Something else')], ['Q-0002', que('Another thing')]])
  assert.equal(R.findDuplicate(q, dupVerdict('Q-0002'), m.log, m.side).id, 'Q-0002')

  m = models([['D-0001', dec('Unrelated', { sidecar: 'Q-0002' })]], [['Q-0001', que('Something else')], ['Q-0002', que('Another thing')]])
  assert.equal(R.findDuplicate(q, dupVerdict('D-0001'), m.log, m.side).id, 'Q-0002')

  m = models([], [['Q-0001', que('Something else')], ['Q-0002', que('SHOULD we use TABS')]])
  assert.equal(R.findDuplicate(q, [], m.log, m.side).id, 'Q-0002')

  m = models([['D-0001', dec('should we use tabs!', { sidecar: 'Q-0001' })]], [['Q-0001', que('Different wording entirely')]])
  assert.equal(R.findDuplicate(q, [], m.log, m.side).id, 'Q-0001')

  m = models([], [['Q-0001', que('Should we use tabs?', 'answered')]])
  assert.equal(R.findDuplicate(q, dupVerdict('Q-0001'), m.log, m.side), null)

  m = models([], [['Q-0001', que('Nothing alike')]])
  assert.equal(R.findDuplicate(q, [], m.log, m.side), null)
  assert.equal(R.findDuplicate(q, [], null, null), null)
})

test('userAnswer', () => {
  const Qt = 'Which?'
  assert.equal(R.userAnswer({ tool_response: { answers: { [Qt]: ' Red ' } } }, Qt), 'Red')
  assert.equal(R.userAnswer({ tool_input: { answers: { [Qt]: 'Blue' } } }, Qt), 'Blue')
  assert.equal(
    R.userAnswer({ tool_response: { answers: { [Qt]: 'Red' }, annotations: { [Qt]: { notes: ' because ' } } } }, Qt),
    'Red\nNotes: because'
  )
  assert.equal(R.userAnswer({ tool_response: { answers: { [Qt]: ['Red', 'Blue'] } } }, Qt), 'Red, Blue')
  assert.equal(R.userAnswer({ tool_response: { answers: {} } }, Qt), null)
  assert.equal(R.userAnswer(null, Qt), null)
})

// ---- onFinal, onUserAnswer, counts ----

let tmp
let savedProject
let savedContext
beforeEach(() => {
  tmp = fs.mkdtempSync(os.tmpdir() + '/decidinator-resolution-')
  savedProject = process.env.CLAUDE_PROJECT_DIR
  savedContext = process.env.DECIDINATOR_CONTEXT
  process.env.CLAUDE_PROJECT_DIR = tmp
  delete process.env.DECIDINATOR_CONTEXT
})
afterEach(() => {
  if (savedProject === undefined) delete process.env.CLAUDE_PROJECT_DIR
  else process.env.CLAUDE_PROJECT_DIR = savedProject
  if (savedContext === undefined) delete process.env.DECIDINATOR_CONTEXT
  else process.env.DECIDINATOR_CONTEXT = savedContext
  fs.rmSync(tmp, { recursive: true, force: true })
})

const cfg = () => ({ ...DEFAULTS, rungs: [...DEFAULTS.rungs] })
const input = () => ({ session_id: 's1', cwd: tmp })
const logPath = () => path.join(tmp, 'docs', 'decisions.md')
const sidePath = () => path.join(tmp, 'docs', 'open-questions.md')
const readLog = () => {
  const r = decisionLog.read(logPath())
  assert.ok(r.ok, r.error)
  return r.model.entries.map((e) => e.decision)
}
const readSide = () => {
  const r = sidecar.read(sidePath())
  assert.ok(r.ok, r.error)
  return r.model.entries.map((e) => e.question)
}

const verdictEntry = (rung, confidence, extra = {}) => ({
  rung,
  ok: true,
  verdict: {
    question_id: 'Q-0001',
    rung,
    kind: 'answer',
    status: 'resolved',
    answer: 'Answer ' + rung,
    rationale: 'Because ' + rung,
    options: [],
    sources: ['src-' + rung],
    assumptions: ['asm-' + rung],
    confidence,
    flags: [],
    duplicate_of: null,
    ...extra
  }
})

function stateWith(id, question, verdicts, extra = {}) {
  return {
    v: 1,
    order: [id],
    questions: { [id]: { id, question, header: '', status: 'final-unresolved', rung: 1, verdicts, dispatches: [], ...extra } },
    passThrough: null
  }
}

const seedLog = (d) => {
  const r = decisionLog.append(logPath(), { title: 'T', rationale: 'r', context: 'c', sources: [], assumptions: [], ...d })
  assert.ok(r.ok, r.error)
  return r
}
const seedSide = (q) => {
  const r = sidecar.append(sidePath(), { topic: 'T', context: 'c', options: [], ...q })
  assert.ok(r.ok, r.error)
  return r
}

const resolvedCtx = () => ({ outcome: { outcome: 'resolved', rung: 1 }, mode: 'ask', cfg: cfg(), input: input() })

test('onFinal resolved writes an oracle-unconfirmed decision', () => {
  const s = stateWith('Q-0001', 'Which limit?', [verdictEntry(1, 'high')], { status: 'resolved' })
  const out = R.onFinal(s, 'Q-0001', resolvedCtx())
  const log = readLog()
  assert.equal(log.length, 1)
  assert.equal(log[0].id, 'D-0001')
  assert.equal(log[0].provenance, 'oracle-unconfirmed')
  assert.equal(log[0].answer, 'Answer 1')
  assert.equal(log[0].rationale, 'Because 1')
  assert.equal(log[0].confidence, 'high')
  assert.equal(log[0].rung, 1)
  assert.deepEqual(log[0].sources, ['src-1'])
  assert.equal(log[0].questionId, 'Q-0001')
  assert.equal(log[0].context, 'session s1')
  assert.equal(out.questions['Q-0001'].decision, 'D-0001')
  assert.equal(fs.existsSync(sidePath()), false)
})

test('onFinal ask mode final-unresolved changes nothing', () => {
  const s = stateWith('Q-0001', 'Which limit?', [verdictEntry(1, 'low')])
  const out = R.onFinal(s, 'Q-0001', { outcome: { outcome: 'final-unresolved', rung: 1 }, mode: 'ask', cfg: cfg(), input: input() })
  assert.deepEqual(out, s)
  assert.equal(fs.existsSync(logPath()), false)
  assert.equal(fs.existsSync(sidePath()), false)
})

const finalSidecar = { outcome: { outcome: 'final-unresolved', rung: 2 }, mode: 'sidecar' }

test('onFinal sidecar mode writes a provisional decision and a new entry', () => {
  const opts = [{ label: 'Five', tradeoffs: 'small' }, { label: 'Ten', tradeoffs: 'big' }]
  const s = stateWith('Q-0001', 'Which limit?', [verdictEntry(1, 'medium'), verdictEntry(2, 'high', { options: opts })], { context: 'Building X' })
  const out = R.onFinal(s, 'Q-0001', { ...finalSidecar, cfg: cfg(), input: input() })
  const log = readLog()
  assert.equal(log.length, 1)
  assert.equal(log[0].id, 'D-0001')
  assert.equal(log[0].provenance, 'oracle-provisional')
  assert.equal(log[0].rung, 2)
  assert.equal(log[0].sidecar, 'Q-0001')
  const side = readSide()
  assert.equal(side.length, 1)
  assert.equal(side[0].id, 'Q-0001')
  assert.equal(side[0].status, 'open')
  assert.equal(side[0].provisionalDecision, 'D-0001')
  assert.deepEqual(side[0].dependsOn, ['session s1'])
  assert.equal(side[0].context, 'Building X')
  assert.deepEqual(side[0].options, opts)
  assert.equal(out.questions['Q-0001'].decision, 'D-0001')
  assert.equal(out.questions['Q-0001'].sidecarEntry, 'Q-0001')
})

test('onFinal sidecar mode: a duplicate found by hash extends the entry', () => {
  seedLog({ question: 'Which limit?', answer: 'P', provenance: 'oracle-provisional', confidence: 'medium', rung: 1, questionId: 'Q-0001', sidecar: 'Q-0001' })
  seedSide({ id: 'Q-0001', question: 'WHICH LIMIT', provisionalAnswer: 'P', provisionalDecision: 'D-0001', dependsOn: ['wp-1'], status: 'open' })
  const s = stateWith('Q-0002', 'Which limit?', [verdictEntry(2, 'low')])
  const out = R.onFinal(s, 'Q-0002', { ...finalSidecar, cfg: cfg(), input: input() })
  const side = readSide()
  assert.equal(side.length, 1)
  assert.deepEqual(side[0].dependsOn, ['wp-1', 'session s1'])
  const log = readLog()
  assert.equal(log.length, 2)
  assert.equal(log[1].id, 'D-0002')
  assert.equal(log[1].answer, 'P')
  assert.equal(log[1].provenance, 'oracle-provisional')
  assert.equal(log[1].confidence, 'medium')
  assert.equal(log[1].rung, 1)
  assert.equal(log[1].sidecar, 'Q-0001')
  assert.equal(out.questions['Q-0002'].duplicateOf, 'Q-0001')
  assert.equal(out.questions['Q-0002'].decision, 'D-0002')
})

test('onFinal sidecar mode: a duplicate named by duplicate_of', () => {
  seedLog({ question: 'Which limit?', answer: 'P', provenance: 'oracle-provisional', confidence: 'medium', rung: 1, questionId: 'Q-0001', sidecar: 'Q-0001' })
  seedSide({ id: 'Q-0001', question: 'Something quite different', provisionalAnswer: 'P', provisionalDecision: 'D-0001', dependsOn: ['wp-1'], status: 'open' })
  const s = stateWith('Q-0002', 'An unrelated wording', [verdictEntry(2, 'low', { duplicate_of: 'Q-0001' })])
  const out = R.onFinal(s, 'Q-0002', { ...finalSidecar, cfg: cfg(), input: input() })
  const side = readSide()
  assert.equal(side.length, 1)
  assert.deepEqual(side[0].dependsOn, ['wp-1', 'session s1'])
  assert.equal(out.questions['Q-0002'].duplicateOf, 'Q-0001')
})

test('onFinal sidecar mode: no valid verdict still writes a sidecar entry', () => {
  const bad = { rung: 1, ok: false, verdict: null }
  const s = stateWith('Q-0001', 'Which limit?', [bad, { ...bad, rung: 2 }])
  const out = R.onFinal(s, 'Q-0001', { ...finalSidecar, cfg: cfg(), input: input() })
  const side = readSide()
  assert.equal(side.length, 1)
  assert.equal(side[0].provisionalAnswer, R.NO_ANSWER)
  assert.equal(side[0].provisionalDecision, '')
  assert.equal(fs.existsSync(logPath()), false)
  assert.equal(out.questions['Q-0001'].decision, null)
})

test('onFinal does not throw on a log with an unsupported version', () => {
  fs.mkdirSync(path.dirname(logPath()), { recursive: true })
  const before = '<!-- decidinator-log v2 -->\n'
  fs.writeFileSync(logPath(), before)
  const s = stateWith('Q-0001', 'Which limit?', [verdictEntry(1, 'high')], { status: 'resolved' })
  const out = R.onFinal(s, 'Q-0001', resolvedCtx())
  assert.equal(typeof out.questions['Q-0001'].recordError, 'string')
  assert.ok(out.questions['Q-0001'].recordError.length > 0)
  assert.equal(fs.readFileSync(logPath(), 'utf8'), before)
})

test('onFinal uses DECIDINATOR_CONTEXT as the context', () => {
  process.env.DECIDINATOR_CONTEXT = 'WP-07'
  const s = stateWith('Q-0001', 'Which limit?', [verdictEntry(1, 'high')], { status: 'resolved' })
  R.onFinal(s, 'Q-0001', resolvedCtx())
  assert.equal(readLog()[0].context, 'WP-07')
})

test('onFinal leaves a question that already has a decision unchanged', () => {
  const s = stateWith('Q-0001', 'Which limit?', [verdictEntry(1, 'high')], { status: 'resolved', decision: 'D-0001' })
  const out = R.onFinal(s, 'Q-0001', resolvedCtx())
  assert.deepEqual(out, s)
  assert.equal(fs.existsSync(logPath()), false)
})

test('onUserAnswer records a user decision and supersedes the earlier one', () => {
  const s = stateWith('Q-0001', 'Which limit?', [verdictEntry(1, 'low')])
  const out = R.onUserAnswer(s, 'Q-0001', 'Five', { cfg: cfg(), input: input() })
  const log = readLog()
  assert.equal(log.length, 1)
  assert.equal(log[0].id, 'D-0001')
  assert.equal(log[0].provenance, 'user')
  assert.equal(log[0].confidence, null)
  assert.equal(log[0].rung, null)
  assert.equal(log[0].answer, 'Five')
  assert.equal(out.questions['Q-0001'].status, 'answered')
  assert.equal(out.questions['Q-0001'].decision, 'D-0001')

  const again = R.onUserAnswer(out, 'Q-0001', 'Ten', { cfg: cfg(), input: input() })
  const log2 = readLog()
  assert.equal(log2.length, 2)
  assert.equal(log2[1].id, 'D-0002')
  assert.equal(log2[1].supersedes, 'D-0001')
  assert.equal(log2[0].supersededBy, 'D-0002')
  assert.equal(again.questions['Q-0001'].decision, 'D-0002')
})

test('counts', () => {
  seedSide({ id: 'Q-0001', question: 'One?', provisionalAnswer: 'p', dependsOn: [], status: 'open' })
  seedSide({ id: 'Q-0002', question: 'Two?', provisionalAnswer: 'p', dependsOn: [], status: 'open' })
  seedSide({ id: 'Q-0003', question: 'Three?', provisionalAnswer: 'p', dependsOn: [], status: 'open' })
  assert.ok(sidecar.setStatus(sidePath(), 'Q-0003', 'answered').ok)
  seedLog({ question: 'a?', answer: 'A', provenance: 'oracle-unconfirmed' })
  seedLog({ question: 'b?', answer: 'B', provenance: 'oracle-provisional' })
  seedLog({ question: 'c?', answer: 'C', provenance: 'user' })
  seedLog({ question: 'd?', answer: 'D', provenance: 'oracle-provisional' })
  seedLog({ question: 'd?', answer: 'D2', provenance: 'user', supersedes: 'D-0004' })
  assert.deepEqual(R.counts(tmp, cfg()), { open: 2, unconfirmed: 2 })
  const empty = fs.mkdtempSync(os.tmpdir() + '/decidinator-resolution-empty-')
  try {
    assert.deepEqual(R.counts(empty, cfg()), { open: 0, unconfirmed: 0 })
  } finally {
    fs.rmSync(empty, { recursive: true, force: true })
  }
})
