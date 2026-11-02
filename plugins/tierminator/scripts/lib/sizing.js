// Task sizing: flags a task that may be too large for one worker. These are guidelines, not rules:
// ExitPlanMode (H2) and a headless draft (H5) ask the planner to split a flagged task or to keep it
// with a "Keep T03: <why>" line in the plan, a limited number of times. For a graph plan it also flags
// two tasks that may run at the same time yet name the same file. A plan of MIN_CHAIN or more tasks in
// which no task gives "after" and no line starts "Serial: <why>" gets a plan-wide flag. Never throws.
'use strict'

const OVERLAP_PREFIX = 'may run at the same time as '
const MIN_CHAIN = 6
const MAX_FILES = 4
const MAX_PROMPT = { haiku: 3000, sonnet: 4000, opus: 5000 }
const MAX_REVIEWS = 2

const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// The files on the prompt's first "Files to change:" line, or null when it has none.
function filesToChange(prompt) {
  const m = /^[ \t]*Files to change:[ \t]*(.*)$/im.exec(typeof prompt === 'string' ? prompt : '')
  if (!m) return null
  return m[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '')
}

// The reasons a task may be too large, as strings (empty when it looks fine). An opus task's files are
// only expected, so their count and a missing Files line are not flagged.
function flags(task) {
  const out = []
  const prompt = typeof task?.prompt === 'string' ? task.prompt : ''
  if (task?.model !== 'opus') {
    const files = filesToChange(prompt)
    if (files === null) out.push('has no "Files to change:" line')
    else if (files.length > MAX_FILES) out.push(`changes ${files.length} files (guideline: at most ${MAX_FILES})`)
  }
  const max = MAX_PROMPT[task?.model]
  if (max !== undefined && prompt.length > max) {
    out.push(`has a ${thousands(prompt.length)}-character prompt (guideline: at most ${max} for ${task.model})`)
  }
  if (/\b(and|then)\b|;/i.test(typeof task?.title === 'string' ? task.title : '')) {
    out.push('has "and", "then" or ";" in its title, which suggests two changes')
  }
  return out
}

// The ids of the tasks the plan text keeps with a "Keep T03: <why>" line.
function kept(text) {
  const ids = new Set()
  const re = /^[ \t]*Keep (T\d{2}):[ \t]*\S/gm
  let m
  while ((m = re.exec(typeof text === 'string' ? text : '')) !== null) ids.add(m[1])
  return ids
}

// A file name in a comparable form: unwrapped, forward slashes, no leading ./, lower case.
function normalizeFile(file) {
  return String(file)
    .trim()
    .replace(/^([`"'])(.*)\1$/, '$2')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^(\.\/)+/, '')
    .toLowerCase()
}

// Map of task id -> Set of the ids it depends on, directly or through other tasks.
function ancestors(tasks) {
  const out = new Map()
  tasks.forEach((t, i) => {
    const deps = Array.isArray(t?.after) ? t.after : i === 0 ? [] : [tasks[i - 1]?.id]
    const set = new Set()
    for (const d of deps) {
      set.add(d)
      for (const a of out.get(d) ?? []) set.add(a)
    }
    out.set(t?.id, set)
  })
  return out
}

// [{id, other, files}] for each pair of tasks with no dependency path between them that name the same file.
function overlaps(tasks) {
  if (!Array.isArray(tasks)) return []
  const anc = ancestors(tasks)
  const files = tasks.map(t => filesToChange(t?.prompt))
  const out = []
  for (let j = 1; j < tasks.length; j++) {
    if (files[j] === null) continue
    for (let i = 0; i < j; i++) {
      if (files[i] === null || anc.get(tasks[j]?.id)?.has(tasks[i]?.id)) continue
      const theirs = new Set(files[i].map(normalizeFile))
      const seen = new Set()
      const shared = []
      for (const f of files[j]) {
        const n = normalizeFile(f)
        if (theirs.has(n) && !seen.has(n)) {
          seen.add(n)
          shared.push(f)
        }
      }
      if (shared.length > 0) out.push({ id: tasks[j].id, other: tasks[i].id, files: shared })
    }
  }
  return out
}

const overlapFlag = o =>
  `${OVERLAP_PREFIX}${o.other}, and both name ${o.files.join(', ')} in "Files to change:": ` +
  `add "${o.other}" to its "after", or keep it with a line "Keep ${o.id}: <why these can share files>"`

// [{id, flags}] for the flagged tasks the plan does not keep.
function review(tasks, text, { graph = false } = {}) {
  const keep = kept(text)
  const list = Array.isArray(tasks) ? tasks : []
  const shared = new Map()
  if (graph === true) {
    for (const o of overlaps(list)) shared.set(o.id, [...(shared.get(o.id) ?? []), overlapFlag(o)])
  }
  const pending = []
  for (const t of list) {
    if (keep.has(t.id)) continue
    const f = [...flags(t), ...(shared.get(t.id) ?? [])]
    if (f.length > 0) pending.push({ id: t.id, flags: f })
  }
  return pending
}

function reviewText(pending) {
  const all = pending.flatMap(p => p.flags)
  const shares = all.some(f => f.startsWith(OVERLAP_PREFIX))
  const large = all.some(f => !f.startsWith(OVERLAP_PREFIX))
  const list = pending.map(p => `- ${p.id}: ${p.flags.join('; ')}`).join('\n')
  if (!shares) {
    return (
      'tierminator: some tasks may be too large for one worker. These are guidelines, not rules:\n' +
      list +
      '\n\nFor each, split it into smaller tasks, or keep it and add a line "Keep T03: <why it stays one task>" ' +
      'to the plan, outside the task block. Then call ExitPlanMode again.'
    )
  }
  if (!large) {
    return (
      'tierminator: some tasks may run at the same time as a task that changes the same file. These are guidelines, not rules:\n' +
      list +
      '\n\nFor each, do as its line says; a Keep line goes in the plan, outside the task block. Then call ExitPlanMode again.'
    )
  }
  return (
    'tierminator: some tasks may be too large for one worker, or may run at the same time as a task that changes the same file. These are guidelines, not rules:\n' +
    list +
    '\n\nSplit a task that may be too large into smaller tasks, or keep it with a line "Keep T03: <why it stays one task>". ' +
    'For a task that shares a file, do as its line says. Keep lines go in the plan, outside the task block. Then call ExitPlanMode again.'
  )
}

// True when the plan text has a "Serial: <why>" line that gives a reason.
function serial(text) {
  return /^[ \t]*Serial:[ \t]*\S/m.test(typeof text === 'string' ? text : '')
}

// The plan-wide flag for a long plan in which no task gives "after", or null.
function chainFlag(tasks, text, { graph = false } = {}) {
  if (graph === true || !Array.isArray(tasks) || tasks.length < MIN_CHAIN || serial(text)) return null
  const n = tasks.length
  return (
    `the plan has ${n} tasks and none gives "after", so they will run one at a time. ` +
    'A task needs an earlier task only if it edits a file that task edits, uses a type, function or file that task creates, or has to see its result in a build or test. ' +
    'Give each task that needs no earlier task "after": [] and each other task an "after" naming only the tasks it needs, ' +
    'and add a "Parallelism:" paragraph to the summary giving the waves. ' +
    'If every task really needs the one before it, add a line "Serial: <why the tasks form a chain>" to the plan, outside the task block, instead'
  )
}

// The whole review text (task flags and the plan-wide flag), or null when nothing is flagged.
function planReview(tasks, text, opts = {}) {
  const pending = review(tasks, text, opts)
  const flag = chainFlag(tasks, text, opts)
  if (pending.length === 0 && flag === null) return null
  if (flag === null) return reviewText(pending)
  if (pending.length === 0) return `tierminator: ${flag}. This is a guideline, not a rule. Then call ExitPlanMode again.`
  return `${reviewText(pending).replace(/ Then call ExitPlanMode again\.$/, '')}\n\nThe plan as a whole: ${flag}. Then call ExitPlanMode again.`
}

module.exports = {
  MAX_FILES,
  MAX_PROMPT,
  MAX_REVIEWS,
  MIN_CHAIN,
  OVERLAP_PREFIX,
  serial,
  chainFlag,
  planReview,
  filesToChange,
  flags,
  kept,
  normalizeFile,
  overlaps,
  overlapFlag,
  review,
  reviewText,
}
