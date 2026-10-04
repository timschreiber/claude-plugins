// Task sizing: flags a task that may be too large for one worker. These are guidelines, not rules:
// ExitPlanMode (H2) and a headless draft (H5) ask the planner to split a flagged task or to keep it
// with a "Keep T03: <why>" line in the plan, a limited number of times. Never throws.
'use strict'

const MAX_FILES = 4
const MAX_PROMPT = { sonnet: 4000, opus: 5000 }
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

// The reasons a task may be too large, as strings (empty when it looks fine).
function flags(task) {
  const out = []
  const prompt = typeof task?.prompt === 'string' ? task.prompt : ''
  const files = filesToChange(prompt)
  if (files === null) out.push('has no "Files to change:" line')
  else if (files.length > MAX_FILES) out.push(`changes ${files.length} files (guideline: at most ${MAX_FILES})`)
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

// [{id, flags}] for the flagged tasks the plan does not keep.
function review(tasks, text) {
  const keep = kept(text)
  const pending = []
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (keep.has(t.id)) continue
    const f = flags(t)
    if (f.length > 0) pending.push({ id: t.id, flags: f })
  }
  return pending
}

function reviewText(pending) {
  return (
    'tierminator: some tasks may be too large for one worker. These are guidelines, not rules:\n' +
    pending.map(p => `- ${p.id}: ${p.flags.join('; ')}`).join('\n') +
    '\n\nFor each, split it into smaller tasks, or keep it and add a line "Keep T03: <why it stays one task>" ' +
    'to the plan, outside the task block. Then call ExitPlanMode again.'
  )
}

module.exports = { MAX_FILES, MAX_PROMPT, MAX_REVIEWS, filesToChange, flags, kept, review, reviewText }
