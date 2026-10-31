'use strict'

// The per-scenario checks of the Tierminator end-to-end run, as a pure module: the facts of a run go in,
// a list of named pass or fail checks comes out. It reads no file, runs no git and touches no process state.
//
// facts = {
//   runs:      [{ exit, timedOut, durationMs }]            one per claude session
//   results:   [result file object | null]                 one per run, the <plan>.result.json
//   snapshots: [{ commits, branches, worktrees }]          taken after each run
//   final:     { commits, merges, branch, status, branches, worktrees, files: { 'src/registry.js': text } }
//   telemetry: [records]                                   the <plan>.telemetry.jsonl records
//   observed:  { permissionLine, allAnswerable }
// }
// A commit is { subject, body }. A task commit has 'Tierminator-Task: Txx' in its body and
// 'Tierminator-Plan: <id>' too. An 'attempt' telemetry record is
// { kind, task, tier, attempt, outcome: 'done' | 'retry' | 'halt', agentId, durationMs, at }.
// A check is { name, ok, detail }.

const arr = (v) => (Array.isArray(v) ? v : [])
const check = (name, ok, detail) => ({ name, ok: Boolean(ok), detail: String(detail ?? '') })

const trailer = (body, key) => {
  const m = new RegExp(`^${key}:[ \\t]*(\\S+)`, 'm').exec(String(body ?? ''))
  return m ? m[1] : null
}

// The Txx ids of the task commits, in the order of the commits given.
const taskIds = (commits) =>
  arr(commits)
    .map((c) => trailer(c && c.body, 'Tierminator-Task'))
    .filter((id) => id !== null)

// A task's 'attempt' records, oldest first.
const attempts = (telemetry, task) =>
  arr(telemetry)
    .filter((r) => r && r.kind === 'attempt' && r.task === task)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

const span = (rec) => ({ start: Date.parse(rec.at) - rec.durationMs, end: Date.parse(rec.at) })

// True when every span was running at one moment: the latest start is before the earliest end.
const overlap = (spans) => {
  const list = arr(spans)
  if (list.length === 0) return false
  return Math.max(...list.map((s) => s.start)) < Math.min(...list.map((s) => s.end))
}

const allAttempts = (facts) => arr(facts.telemetry).filter((r) => r && r.kind === 'attempt')

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

function common(facts, { runs, outcomes, ids }) {
  const f = facts || {}
  const runList = arr(f.runs)
  const results = arr(f.results)
  const final = f.final || {}
  const commits = arr(final.commits)
  const taskCommits = commits.filter((c) => trailer(c && c.body, 'Tierminator-Task') !== null)
  const got = taskIds(commits)
  const planIds = taskCommits.map((c) => trailer(c.body, 'Tierminator-Plan'))
  const sortedGot = [...got].sort()
  const sortedWant = [...arr(ids)].sort()
  const mismatched = arr(outcomes)
    .map((want, i) => ({ i, want, got: results[i] ? results[i].outcome : undefined }))
    .filter((o) => o.got !== o.want)
  return [
    check(
      'sessions finished',
      runList.length === runs && !runList.some((r) => r && r.timedOut),
      `${runList.length} runs (want ${runs}); timed out: ${runList.filter((r) => r && r.timedOut).length}`
    ),
    check(
      'result outcome',
      mismatched.length === 0,
      mismatched.map((o) => `run ${o.i + 1}: ${JSON.stringify(o.got)}, want ${JSON.stringify(o.want)}`).join('; ')
    ),
    check('clean tree', final.status === '', `uncommitted: ${JSON.stringify(final.status)}`),
    check('on run branch', final.branch === 'main', `on ${JSON.stringify(final.branch)}`),
    check('linear history', final.merges === 0, `${final.merges} merge commits`),
    check(
      'one commit per task',
      sameList(sortedGot, sortedWant) && new Set(got).size === got.length,
      `task commits ${got.join(', ') || 'none'}; want ${sortedWant.join(', ')}`
    ),
    check(
      'one plan id',
      planIds.length > 0 && planIds.every((p) => p && p === planIds[0]),
      `plan ids ${JSON.stringify(planIds)}`
    ),
    check(
      'no leftovers',
      arr(final.branches).length === 0 && arr(final.worktrees).length === 1,
      `branches ${JSON.stringify(final.branches)}, worktrees ${arr(final.worktrees).length}`
    )
  ]
}

const IDS3 = ['T01', 'T02', 'T03']

// Three attempt records, all done, one per task.
function threeDone(facts) {
  const recs = allAttempts(facts)
  const tasks = recs.map((r) => r.task).sort()
  return check(
    'three done attempts',
    recs.length === 3 && recs.every((r) => r.outcome === 'done') && sameList(tasks, IDS3),
    `${recs.length} attempts: ${recs.map((r) => `${r.task}:${r.outcome}`).join(', ')}`
  )
}

function ranAtOnce(facts, informational) {
  const recs = allAttempts(facts)
  const yes = overlap(recs.map(span))
  if (informational) return check('ran at once', true, yes ? 'yes' : 'no')
  return check('ran at once', yes, yes ? 'yes' : 'the three attempts did not overlap')
}

function scenario1(facts) {
  const recs = allAttempts(facts)
  const spans = recs.map(span)
  const total = spans.length > 0 ? Math.max(...spans.map((s) => s.end)) - Math.min(...spans.map((s) => s.start)) : 0
  const longest = recs.length > 0 ? Math.max(...recs.map((r) => r.durationMs)) : 0
  const seconds = (ms) => (ms / 1000).toFixed(1)
  return [
    ...common(facts, { runs: 1, outcomes: ['complete'], ids: IDS3 }),
    threeDone(facts),
    ranAtOnce(facts, false),
    check(
      'about the slowest',
      recs.length > 0 && total <= 1.6 * longest,
      `wall ${seconds(total)}s, longest attempt ${seconds(longest)}s, limit ${seconds(1.6 * longest)}s`
    )
  ]
}

function scenario3(facts) {
  const t1 = attempts(facts.telemetry, 'T01')
  const [first, second] = t1
  const retried =
    t1.length === 2 &&
    first.outcome === 'retry' &&
    first.tier === 'sonnet-medium' &&
    second.outcome === 'done' &&
    second.tier === 'sonnet-high'
  const meanwhile = (task) => {
    const list = attempts(facts.telemetry, task)
    return (
      list.length === 1 &&
      list[0].outcome === 'done' &&
      first !== undefined &&
      Date.parse(list[0].at) > Date.parse(first.at)
    )
  }
  return [
    ...common(facts, { runs: 1, outcomes: ['complete'], ids: IDS3 }),
    check(
      'T01 retried in place',
      retried,
      `T01 attempts: ${t1.map((r) => `${r.outcome}/${r.tier}`).join(', ') || 'none'}`
    ),
    check(
      'siblings ran meanwhile',
      meanwhile('T02') && meanwhile('T03'),
      `T02 ${attempts(facts.telemetry, 'T02').length} attempts, T03 ${attempts(facts.telemetry, 'T03').length} attempts`
    )
  ]
}

function scenario6(facts) {
  const got = taskIds(arr((facts.final || {}).commits))
  const spans = allAttempts(facts).map(span).sort((a, b) => a.start - b.start)
  const bad = []
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].start < spans[i - 1].end - 2000) bad.push(i)
  }
  return [
    ...common(facts, { runs: 1, outcomes: ['complete'], ids: IDS3 }),
    check('tasks in order', sameList(got, IDS3), `task commits ${got.join(', ') || 'none'}`),
    check(
      'ran one at a time',
      spans.length > 0 && bad.length === 0,
      bad.length > 0 ? `attempt ${bad.map((i) => i + 1).join(', ')} started before the previous ended` : 'no attempts'
    )
  ]
}

function scenario8(facts) {
  return [
    ...common(facts, { runs: 1, outcomes: ['complete'], ids: IDS3 }),
    threeDone(facts),
    ranAtOnce(facts, true)
  ]
}

const SCENARIOS = { 1: scenario1, 3: scenario3, 6: scenario6, 8: scenario8 }

function scenarioChecks(n, facts) {
  const fn = SCENARIOS[n]
  if (!fn) throw new Error('unknown scenario')
  return fn(facts || {})
}

module.exports = { scenarioChecks, helpers: { taskIds, attempts, span, overlap, common, trailer } }
