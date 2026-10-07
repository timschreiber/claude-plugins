'use strict'

// The per-step checks of the Grindinator end-to-end run, as a pure module: the files and records of a
// run go in, a list of named pass or fail checks comes out. It reads no file, runs no git and touches no
// process state.

const STEPS = ['stub-limit', 'harness', 'pilot', 'batch']

const METRICS = ['tasksDone', 'commits', 'decisions', 'openQuestions', 'costUsd', 'turns']

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const str = (v) => (typeof v === 'string' ? v : '')
const num = (v) => typeof v === 'number' && Number.isFinite(v)
const jeq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const round2 = (n) => Math.round(n * 100) / 100

// A check is { name, pass, detail }; detail is '' when it passes and is built only when it fails.
function chk(name, pass, detail) {
  const ok = Boolean(pass)
  return { name, pass: ok, detail: ok ? '' : String(typeof detail === 'function' ? detail() : detail ?? '') }
}

const NO_STATE = 'no state'

// A check that needs the state, which fails with 'no state' when there is none.
function onState(x, name, test, detail) {
  if (!x.state) return chk(name, false, NO_STATE)
  return chk(name, test(x.state), () => detail(x.state))
}

function normalize(inputs) {
  const i = isObj(inputs) ? inputs : {}
  const state = isObj(i.state) ? i.state : null
  const plugins = isObj(i.plugins) ? i.plugins : {}
  return {
    exitCode: typeof i.exitCode === 'number' ? i.exitCode : null,
    state,
    packages: state && isObj(state.packages) ? state.packages : {},
    summary: str(i.summary),
    branch: str(i.branch),
    porcelain: str(i.porcelain),
    subjects: arr(i.subjects),
    decisionsText: str(i.decisionsText),
    openQuestionsText: str(i.openQuestionsText),
    attempts: isObj(i.attempts) ? i.attempts : {},
    plugins,
    stubLog: arr(i.stubLog),
    leftover: i.leftover
  }
}

const stateAttempts = (x, id) => arr(x.packages[id] && x.packages[id].attempts)
const lastOf = (list) => (list.length > 0 ? list[list.length - 1] : undefined)
const lastGate = (x, id) => {
  const a = lastOf(stateAttempts(x, id))
  return a && isObj(a.gate) ? a.gate.status : undefined
}
const entriesOf = (x, id) => arr(x.attempts[id])
const lastResult = (x, id) => {
  const e = lastOf(entriesOf(x, id))
  return e && isObj(e.result) ? e.result : null
}

const stateCheck = (x) =>
  chk('state', x.state !== null && x.state.version === 1, () =>
    x.state === null ? NO_STATE : `state version ${JSON.stringify(x.state.version)}`
  )
const exitCodeCheck = (x) => chk('exit code', x.exitCode === 0, () => (x.exitCode === null ? 'exit code not given' : `exit code ${x.exitCode}`))
const allDone = (x) =>
  onState(
    x,
    'all done',
    () => {
      const ids = Object.keys(x.packages)
      return ids.length > 0 && ids.every((id) => isObj(x.packages[id]) && x.packages[id].status === 'done')
    },
    () => {
      const ids = Object.keys(x.packages)
      if (ids.length === 0) return 'no packages'
      return ids.map((id) => `${id}: ${isObj(x.packages[id]) ? x.packages[id].status : undefined}`).join(', ')
    }
  )
const cleanTree = (x) => chk('clean tree', x.porcelain.trim() === '', () => `uncommitted: ${x.porcelain.trim()}`)
const onRunBranch = (x) =>
  onState(
    x,
    'on run branch',
    (s) => x.branch === s.branch,
    (s) => `on ${JSON.stringify(x.branch)}, run branch ${JSON.stringify(s.branch)}`
  )
const summaryCheck = (x) => chk('summary', x.summary.includes('- Exit code: 0'), 'summary has no "- Exit code: 0" line')

const common = (x) => [stateCheck(x), exitCodeCheck(x), allDone(x), cleanTree(x), onRunBranch(x), summaryCheck(x)]

const pluginsCurrent = (x) => {
  const t = isObj(x.plugins.tierminator) ? x.plugins.tierminator : {}
  const d = isObj(x.plugins.decidinator) ? x.plugins.decidinator : {}
  return chk(
    'plugins current',
    t.current === true && d.current === true,
    () => `tierminator ${t.version}, decidinator ${d.version}; update the installed plugins`
  )
}

const ID = 'WP-01'

function stubLimit(x) {
  const attempts = stateAttempts(x, ID)
  const first = attempts[0]
  const argv1 = x.stubLog[1] && x.stubLog[1].argv ? arr(x.stubLog[1].argv)[1] : undefined
  return [
    onState(
      x,
      'limit then complete',
      () => jeq(attempts.map((a) => a && a.outcome), ['limit', 'complete']),
      () => `outcomes ${JSON.stringify(attempts.map((a) => a && a.outcome))}`
    ),
    onState(
      x,
      'relaunched by execute',
      () => jeq(attempts.map((a) => a && a.kind), ['plan', 'execute']),
      () => `kinds ${JSON.stringify(attempts.map((a) => a && a.kind))}`
    ),
    onState(
      x,
      'waited on the result-file reset',
      () => Boolean(first && isObj(first.wait) && first.wait.status === 'woke' && first.wait.source === 'result-file'),
      () => `wait ${JSON.stringify(first ? first.wait : undefined)}`
    ),
    chk(
      'execute from T02',
      typeof argv1 === 'string' && argv1.startsWith('/tierminator:execute ') && argv1.endsWith(' --from T02'),
      () => `second launch argv[1] ${JSON.stringify(argv1)}`
    ),
    chk('limit waits in summary', x.summary.includes('## Limit waits'), 'summary has no "## Limit waits" section'),
    chk('leftovers discarded', x.leftover === false, () => `leftover ${JSON.stringify(x.leftover)}`)
  ]
}

function harness(x) {
  const r = lastResult(x, ID)
  return [
    chk('result file', Boolean(r) && r.version === 1 && r.outcome === 'complete', () =>
      r ? `result version ${JSON.stringify(r.version)}, outcome ${JSON.stringify(r.outcome)}` : 'no result file'
    ),
    onState(
      x,
      'gate passed',
      () => lastGate(x, ID) === 'passed',
      () => `gate ${JSON.stringify(lastGate(x, ID))}`
    ),
    chk('decision logged', /^### D-\d{4,}/m.test(x.decisionsText) && x.decisionsText.includes(ID), 'no decision for WP-01 in the decision log'),
    chk(
      'decisions committed',
      x.subjects.includes('chore(grindinator): decisions for WP-01'),
      'no commit "chore(grindinator): decisions for WP-01"'
    ),
    pluginsCurrent(x)
  ]
}

function pilot(x) {
  const ids = Object.keys(x.packages).sort()
  return [
    onState(
      x,
      'three packages',
      () => jeq(ids, ['WP-01', 'WP-02', 'WP-03']),
      () => `packages ${ids.join(', ') || 'none'}`
    ),
    onState(
      x,
      'result files',
      () => ids.length > 0 && ids.every((id) => (lastResult(x, id) || {}).outcome === 'complete'),
      () => ids.filter((id) => (lastResult(x, id) || {}).outcome !== 'complete').map((id) => `${id}: ${JSON.stringify((lastResult(x, id) || {}).outcome)}`).join(', ')
    ),
    onState(
      x,
      'gates passed',
      () => ids.length > 0 && ids.every((id) => lastGate(x, id) === 'passed'),
      () => ids.filter((id) => lastGate(x, id) !== 'passed').map((id) => `${id}: ${JSON.stringify(lastGate(x, id))}`).join(', ')
    ),
    pluginsCurrent(x)
  ]
}

function batch(x) {
  const ids = Object.keys(x.packages)
  const ok = (id) => ['passed', 'skipped'].includes(lastGate(x, id))
  return [
    onState(
      x,
      'gates passed or none',
      () => ids.every(ok),
      () => ids.filter((id) => !ok(id)).map((id) => `${id}: ${JSON.stringify(lastGate(x, id))}`).join(', ')
    ),
    pluginsCurrent(x)
  ]
}

const SPECIFIC = { 'stub-limit': stubLimit, harness, pilot, batch }

// Runs the checks of one step. pass is true when every check passes. It never throws.
function checkStep(step, inputs) {
  try {
    const fn = SPECIFIC[step]
    if (!fn) return { pass: false, checks: [chk('step', false, `unknown step ${JSON.stringify(step)}`)] }
    const x = normalize(inputs)
    const checks = [...common(x), ...fn(x)]
    return { pass: checks.every((c) => c.pass), checks }
  } catch (e) {
    return { pass: false, checks: [chk('checks', false, `checks failed to run: ${e && e.message}`)] }
  }
}

// Counts the blocks of a decision or open-question file that mention a package.
const blocks = (text, marker) => str(text).split(marker).slice(1)

function sum(values) {
  const nums = values.filter(num)
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null
}

function metrics(inputs) {
  const x = normalize(inputs)
  const out = {}
  const decisionBlocks = blocks(x.decisionsText, /^### D-/m)
  const questionBlocks = blocks(x.openQuestionsText, /^### Q-/m)
  for (const id of Object.keys(x.packages)) {
    const entry = isObj(x.packages[id]) ? x.packages[id] : {}
    const list = arr(entry.attempts)
    const entries = entriesOf(x, id)
    const withTasks = entries.filter((e) => e && isObj(e.result) && Array.isArray(e.result.tasksDone))
    const cost = sum(entries.map((e) => (e && isObj(e.lastResult) ? e.lastResult.total_cost_usd : undefined)))
    out[id] = {
      status: entry.status,
      attempts: list.length,
      outcome: list.length > 0 && list[list.length - 1] ? list[list.length - 1].outcome : null,
      tasksDone: withTasks.length > 0 ? withTasks[withTasks.length - 1].result.tasksDone.length : null,
      commits: list.filter((a) => a && num(a.commits)).reduce((n, a) => n + a.commits, 0),
      costUsd: cost === null ? null : round2(cost),
      turns: sum(entries.map((e) => (e && isObj(e.lastResult) ? e.lastResult.num_turns : undefined))),
      decisions: decisionBlocks.filter((b) => b.includes(id)).length,
      openQuestions: questionBlocks.filter((b) => b.includes(id) && b.includes('**Status:** open')).length
    }
  }
  const total = (key) => Object.values(out).reduce((n, p) => n + (num(p[key]) ? p[key] : 0), 0)
  return {
    packages: out,
    totals: {
      tasksDone: total('tasksDone'),
      commits: total('commits'),
      decisions: total('decisions'),
      openQuestions: total('openQuestions'),
      costUsd: round2(total('costUsd')),
      turns: total('turns')
    }
  }
}

// A Markdown table of two runs' metrics, one row per package and metric, as an array of lines.
function compareText(a, b) {
  const pa = (a && a.metrics && a.metrics.packages) || {}
  const pb = (b && b.metrics && b.metrics.packages) || {}
  const ids = [...new Set([...Object.keys(pa), ...Object.keys(pb)])].sort()
  const cell = (p, id, key) => {
    const v = p[id] ? p[id][key] : undefined
    return v === null || v === undefined ? '-' : String(v)
  }
  const lines = [`| Package | Metric | ${a && a.tag} | ${b && b.tag} |`, '| --- | --- | --- | --- |']
  for (const id of ids) {
    for (const key of METRICS) lines.push(`| ${id} | ${key} | ${cell(pa, id, key)} | ${cell(pb, id, key)} |`)
  }
  return lines
}

module.exports = { STEPS, checkStep, metrics, compareText }
