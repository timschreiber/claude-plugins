// The only parser and validator for a plan's tiered-tasks block. H2 and H3 both call
// parsePlan(); nothing else in the plugin reads plan text.
'use strict'

const EFFORTS = ['low', 'medium', 'high', 'xhigh']
const ALLOWED = { sonnet: EFFORTS, opus: EFFORTS }
const TASK_KEYS = ['id', 'title', 'model', 'effort', 'prompt']
const MAX_TASKS = 99
const MAX_TITLE = 100
const BLOCK_INFO = 'json tiered-tasks'
const OPT_OUT_LINE = 'Tiered execution: off'

const list = items => items.join(', ').replace(/, ([^,]*)$/, ' or $1')

// Scans the plan line by line, tracking fenced code blocks, so a tiered-tasks fence quoted
// inside another fence (as an example) is content, not a block. Returns the bodies of the
// top-level `json tiered-tasks` blocks and whether the opt-out line appears outside any fence.
function extractBlock(text) {
  const blocks = []
  let optOut = false
  let open = null // {char, length, info, body[]}

  for (const line of String(text).split(/\r?\n/)) {
    const fence = /^ {0,3}(`{3,}|~{3,})\s*(.*?)\s*$/.exec(line)
    if (open) {
      if (fence && fence[1][0] === open.char && fence[1].length >= open.length && fence[2] === '') {
        if (open.info === BLOCK_INFO) blocks.push(open.body.join('\n'))
        open = null
      } else {
        open.body.push(line)
      }
    } else if (fence) {
      open = { char: fence[1][0], length: fence[1].length, info: fence[2], body: [] }
    } else if (line.trim() === OPT_OUT_LINE) {
      optOut = true
    }
  }
  return { blocks, optOut }
}

// Returns the list of problems with a parsed block; empty means valid. Collects every
// problem so the planner can fix them in one pass.
function validate(obj) {
  const errors = []
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return ['block must be a JSON object of the form {"tasks": [...]}']
  }
  if (!Array.isArray(obj.tasks) || obj.tasks.length === 0) {
    return ['block must have a non-empty "tasks" array']
  }
  if (obj.tasks.length > MAX_TASKS) {
    errors.push(`at most ${MAX_TASKS} tasks are allowed; found ${obj.tasks.length}`)
  }

  obj.tasks.forEach((task, i) => {
    const at = `tasks[${i}]`
    if (task === null || typeof task !== 'object' || Array.isArray(task)) {
      errors.push(`${at}: must be an object`)
      return
    }
    const wantId = `T${String(i + 1).padStart(2, '0')}`
    const where = typeof task.id === 'string' && task.id ? task.id : at

    for (const key of Object.keys(task)) {
      if (!TASK_KEYS.includes(key)) {
        errors.push(`${where}: unknown key "${key}"; allowed keys are ${list(TASK_KEYS)}`)
      }
    }
    for (const key of TASK_KEYS) {
      if (typeof task[key] !== 'string') errors.push(`${where}.${key}: must be a string`)
    }

    if (typeof task.id === 'string' && task.id !== wantId) {
      errors.push(`${where}.id: expected "${wantId}" (ids run T01, T02, ... in order)`)
    }
    if (typeof task.title === 'string') {
      if (task.title.trim() === '' || /[\r\n]/.test(task.title)) {
        errors.push(`${where}.title: must be one non-empty line`)
      } else if (task.title.length > MAX_TITLE) {
        errors.push(`${where}.title: must be at most ${MAX_TITLE} characters`)
      }
    }
    if (typeof task.model === 'string') {
      if (!Object.hasOwn(ALLOWED, task.model)) {
        errors.push(`${where}.model: "${task.model}" is not allowed; use ${list(Object.keys(ALLOWED))}`)
      } else if (typeof task.effort === 'string' && !ALLOWED[task.model].includes(task.effort)) {
        errors.push(`${where}.effort: "${task.effort}" is not allowed for ${task.model}; use ${list(ALLOWED[task.model])}`)
      }
    }
    if (typeof task.prompt === 'string') {
      if (task.prompt.trim() === '') errors.push(`${where}.prompt: must not be empty`)
      else if (!task.prompt.includes('Verify:')) {
        errors.push(`${where}.prompt: must contain a "Verify:" step that fails if the task is incomplete`)
      }
    }
  })
  return errors
}

// parsePlan(text) -> {ok, tasks, optOut, errors, missingBlock}
//   ok + optOut: the plan opted out of tiering; tasks is empty
//   ok, not optOut: tasks holds the validated tasks, with only the known keys
//   not ok: errors lists every problem; missingBlock is true when the plan has no block
//   and no opt-out line at all, so the caller can show the full rules
function parsePlan(text) {
  const fail = (errors, missingBlock = false) => ({ ok: false, tasks: [], optOut: false, errors, missingBlock })
  if (typeof text !== 'string' || text.trim() === '') return fail(['the plan text is empty or unavailable'])

  const { blocks, optOut } = extractBlock(text)
  if (blocks.length === 0) {
    if (optOut) return { ok: true, tasks: [], optOut: true, errors: [], missingBlock: false }
    return fail([`no fenced "${BLOCK_INFO}" block found`], true)
  }
  if (blocks.length > 1) {
    return fail([`found ${blocks.length} "${BLOCK_INFO}" blocks; exactly one is allowed`])
  }
  if (optOut) return fail([`the plan has both a "${BLOCK_INFO}" block and the line "${OPT_OUT_LINE}"; keep only one`])

  let obj
  try {
    obj = JSON.parse(blocks[0])
  } catch (e) {
    return fail([`the block is not valid JSON: ${e.message}`])
  }
  const errors = validate(obj)
  if (errors.length > 0) return fail(errors)

  const tasks = obj.tasks.map(t => Object.fromEntries(TASK_KEYS.map(k => [k, t[k]])))
  return { ok: true, tasks, optOut: false, errors: [], missingBlock: false }
}

module.exports = { ALLOWED, BLOCK_INFO, OPT_OUT_LINE, extractBlock, validate, parsePlan }
