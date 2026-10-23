// The only parser and validator for a plan's tiered-tasks block, and the only code that reads or
// rewrites plan text. H2 and H3 reach it through sidecar.js resolvePlan(), which adds the file work.
'use strict'
const { waves } = require('./waves.js')

// Sonnet stops at high, and work harder than sonnet/high goes to opus/medium: with Sonnet 5.5, opus/low
// scores below sonnet/high and sonnet/xhigh below opus/medium or opus/high, and opus/xhigh adds little
// over opus/high (tierminator-tier-findings.md). Haiku 4.5 ignored effort and was dropped. Haiku 5.5 has
// effort levels and is offered at high only, as the floor for fully given mechanical work (xhigh thinks
// much longer and can end a turn with no visible text, which would lose the report).
const ALLOWED = {
  haiku: ['high'],
  sonnet: ['low', 'medium', 'high'],
  opus: ['medium', 'high'],
}

// Pairs that are accepted but run as another tier, the next one up (or the top). The rules never offer
// them; if a plan asks for one anyway, it runs at the tier named here instead of being denied.
const ALIASES = {
  'haiku-low': { model: 'haiku', effort: 'high' },
  'haiku-medium': { model: 'haiku', effort: 'high' },
  'haiku-xhigh': { model: 'sonnet', effort: 'low' },
  'sonnet-xhigh': { model: 'opus', effort: 'medium' },
  'opus-low': { model: 'opus', effort: 'medium' },
  'opus-xhigh': { model: 'opus', effort: 'high' },
}

// The tiers, weakest first. Each is also the name of the agent that runs it (tierminator:<tier>).
// A failed task is retried one step up this ladder.
const TIERS = Object.entries(ALLOWED).flatMap(([model, efforts]) => efforts.map(e => `${model}-${e}`))
// Each tier agent's maxTurns (agents/<tier>.md). Higher effort makes more tool calls on the same task,
// so the limit grows with the tier (tierminator-agent-dispatch-findings.md, turn usage).
const MAX_TURNS = { 'haiku-high': 50, 'sonnet-low': 40, 'sonnet-medium': 60, 'sonnet-high': 100, 'opus-medium': 100, 'opus-high': 150 }
const tierOf = task => `${task.model}-${task.effort}`
const nextTier = tier => {
  const i = TIERS.indexOf(tier)
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null
}
const TASK_KEYS = ['id', 'title', 'model', 'effort', 'prompt']
const OPTIONAL_TASK_KEYS = ['after']
const NO_GRAPH = { setup: [], verify: null, graph: false }
const TOP_KEYS = ['tasks', 'setup', 'verify']
const MAX_SETUP = 10
const MAX_TASKS = 99
const MAX_TITLE = 100
const BLOCK_INFO = 'json tiered-tasks'
const OPT_OUT_LINE = 'Tiered execution: off'

// H2 replaces a valid block with a generated section: a table of the tasks plus the name and hash
// of the tasks file that now holds the block. The markers let a later block replace the section.
const SECTION_START = '<!-- tierminator:tasks -->'
const SECTION_END = '<!-- /tierminator:tasks -->'
const TASKS_FILE_LINE = /^Tasks file: `(.+)` \(sha256 `([0-9a-f]{16})`\)$/

const list = items => items.join(', ').replace(/, ([^,]*)$/, ' or $1')

// Scans the plan line by line, tracking fenced code blocks, so a tiered-tasks fence quoted
// inside another fence (as an example) is content, not a block. Returns the bodies of the
// top-level `json tiered-tasks` blocks with their line ranges (fence lines included), whether
// the opt-out line appears outside any fence, and the generated sections outside any fence.
function extractBlock(text) {
  const blocks = []
  const ranges = []
  const sections = []
  let optOut = false
  let open = null // {char, length, info, start, body[]}
  let section = null // {start, end, file, hash, lines[]}

  const lines = String(text).split(/\r?\n/)
  lines.forEach((line, i) => {
    const fence = /^ {0,3}(`{3,}|~{3,})\s*(.*?)\s*$/.exec(line)
    if (open) {
      if (fence && fence[1][0] === open.char && fence[1].length >= open.length && fence[2] === '') {
        if (open.info === BLOCK_INFO) {
          blocks.push(open.body.join('\n'))
          ranges.push({ start: open.start, end: i })
        }
        open = null
      } else {
        open.body.push(line)
      }
    } else if (section) {
      section.lines.push(line)
      const ref = TASKS_FILE_LINE.exec(line.trim())
      if (ref && section.file === null) Object.assign(section, { file: ref[1], hash: ref[2] })
      if (line.trim() === SECTION_END) {
        sections.push({ ...section, end: i })
        section = null
      }
    } else if (fence) {
      open = { char: fence[1][0], length: fence[1].length, info: fence[2], start: i, body: [] }
    } else if (line.trim() === SECTION_START) {
      section = { start: i, end: null, file: null, hash: null, lines: [line] }
    } else if (line.trim() === OPT_OUT_LINE) {
      optOut = true
    }
  })
  if (section) sections.push({ ...section, end: lines.length - 1 }) // unclosed: runs to the end
  return { blocks, ranges, optOut, sections }
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
  for (const key of Object.keys(obj)) {
    if (!TOP_KEYS.includes(key)) {
      errors.push(`block: unknown key "${key}"; allowed keys are ${list(TOP_KEYS)}`)
    }
  }
  if (obj.setup !== undefined) {
    if (!Array.isArray(obj.setup)) {
      errors.push('setup: must be an array of command strings')
    } else {
      if (obj.setup.length > MAX_SETUP) {
        errors.push(`setup: at most ${MAX_SETUP} commands are allowed; found ${obj.setup.length}`)
      }
      obj.setup.forEach((cmd, i) => {
        if (typeof cmd !== 'string' || cmd.trim() === '' || /[\r\n]/.test(cmd)) {
          errors.push(`setup[${i}]: must be one non-empty line`)
        }
      })
    }
  }
  if (obj.verify !== undefined) {
    if (typeof obj.verify !== 'string' || obj.verify.trim() === '' || /[\r\n]/.test(obj.verify)) {
      errors.push('verify: must be one non-empty line')
    }
  }

  const wantIds = obj.tasks.map((_, i) => `T${String(i + 1).padStart(2, '0')}`)
  obj.tasks.forEach((task, i) => {
    const at = `tasks[${i}]`
    if (task === null || typeof task !== 'object' || Array.isArray(task)) {
      errors.push(`${at}: must be an object`)
      return
    }
    const wantId = wantIds[i]
    const where = typeof task.id === 'string' && task.id ? task.id : at

    for (const key of Object.keys(task)) {
      if (![...TASK_KEYS, ...OPTIONAL_TASK_KEYS].includes(key)) {
        errors.push(`${where}: unknown key "${key}"; allowed keys are ${list(TASK_KEYS)}, plus the optional "after"`)
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
    if (typeof task.model === 'string' && !Object.hasOwn(ALIASES, `${task.model}-${task.effort}`)) {
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
    if (task.after !== undefined) {
      if (!Array.isArray(task.after)) {
        errors.push(`${where}.after: must be an array of task ids`)
      } else {
        const seen = new Set()
        for (const dep of task.after) {
          if (typeof dep !== 'string') {
            errors.push(`${where}.after: every entry must be a task id string`)
            continue
          }
          if (seen.has(dep)) errors.push(`${where}.after: "${dep}" is listed twice`)
          else if (dep === wantId) errors.push(`${where}.after: "${dep}" is the task itself`)
          else if (!wantIds.includes(dep)) errors.push(`${where}.after: "${dep}" is not a task id`)
          else if (wantIds.indexOf(dep) > i) {
            errors.push(`${where}.after: "${dep}" comes later; a task can depend only on earlier tasks`)
          }
          seen.add(dep)
        }
      }
    }
  })
  return errors
}

// parseBlock(body) -> {ok, tasks, setup, verify, graph, errors}: one block's JSON text, parsed and validated.
// tasks carry only the known keys plus an explicit after (the previous task's id when the block gives
// none), and an aliased pair is replaced by the tier it runs as. setup and verify come from the block
// (defaults [] and null); graph is true when any task gives after.
function parseBlock(body) {
  let obj
  try {
    obj = JSON.parse(body)
  } catch (e) {
    return { ok: false, tasks: [], ...NO_GRAPH, errors: [`the block is not valid JSON: ${e.message}`] }
  }
  const errors = validate(obj)
  if (errors.length > 0) return { ok: false, tasks: [], ...NO_GRAPH, errors }
  const graph = obj.tasks.some(t => t.after !== undefined)
  const tasks = obj.tasks.map((t, i) => ({
    ...Object.fromEntries(TASK_KEYS.map(k => [k, t[k]])),
    ...ALIASES[`${t.model}-${t.effort}`],
    after: t.after !== undefined ? [...t.after] : i === 0 ? [] : [`T${String(i).padStart(2, '0')}`],
  }))
  return {
    ok: true,
    tasks,
    setup: obj.setup !== undefined ? [...obj.setup] : [],
    verify: obj.verify !== undefined ? obj.verify : null,
    graph,
    errors: [],
  }
}

// parsePlan(text) -> {ok, tasks, setup, verify, graph, optOut, errors, missingBlock, section?}
//   ok + optOut: the plan opted out of tiering; tasks is empty
//   ok, not optOut: tasks holds the validated tasks, with only the known keys plus an explicit
//   after; setup, verify and graph come from the block (see parseBlock)
//   not ok: errors lists every problem; missingBlock is true when the plan has no block, no
//   generated section and no opt-out line at all, so the caller can show the full rules
//   section: present only when the plan has no block but has a generated section. It is
//   {file, hash, lines} when there is one usable section (lines are the section's own lines,
//   markers included); loading that file is file work, so the result is not ok until
//   resolvePlan() loads it. It is null when the sections cannot be used.
function parsePlan(text) {
  const fail = (errors, missingBlock = false) => ({ ok: false, tasks: [], ...NO_GRAPH, optOut: false, errors, missingBlock })
  if (typeof text !== 'string' || text.trim() === '') return fail(['the plan text is empty or unavailable'])

  const { blocks, optOut, sections } = extractBlock(text)
  if (blocks.length === 0 && sections.length > 0) {
    const redo = `write the complete "${BLOCK_INFO}" block into the plan again, in place of the table`
    const unusable = error => ({ ...fail([error]), section: null })
    if (optOut) return unusable(`the plan has both a tierminator task table and the line "${OPT_OUT_LINE}"; keep only one`)
    if (sections.length > 1) return unusable(`found ${sections.length} tierminator task tables; ${redo}`)
    const { file, hash, lines } = sections[0]
    if (file === null) return unusable(`the tierminator task table has no valid "Tasks file:" line; ${redo}`)
    return { ...fail([`the plan's tasks are in ${file}, which has not been loaded`]), section: { file, hash, lines } }
  }
  if (blocks.length === 0) {
    if (optOut) return { ok: true, tasks: [], ...NO_GRAPH, optOut: true, errors: [], missingBlock: false }
    return fail([`no fenced "${BLOCK_INFO}" block found`], true)
  }
  if (blocks.length > 1) {
    return fail([`found ${blocks.length} "${BLOCK_INFO}" blocks; exactly one is allowed`])
  }
  if (optOut) return fail([`the plan has both a "${BLOCK_INFO}" block and the line "${OPT_OUT_LINE}"; keep only one`])

  const parsed = parseBlock(blocks[0])
  if (!parsed.ok) return fail(parsed.errors)
  return { ok: true, tasks: parsed.tasks, setup: parsed.setup, verify: parsed.verify, graph: parsed.graph, optOut: false, errors: [], missingBlock: false }
}

const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// A table cell, or a command shown in the section: a pipe would end the cell, so it is escaped.
const cell = text => String(text).replace(/\|/g, '\\|')

// The After cell of a task that needs no earlier task.
const NO_AFTER = '—'

// The generated section, as lines without line endings; for a graph plan the table gains Wave and After columns
// and is followed by the setup and verify commands, shown verbatim but for escaped pipes since approving the plan
// makes tierminator run them, and by the waves; a serial plan's section ignores setup and verify.
function renderSection(tasks, file, hash, { graph = false, setup = [], verify = null } = {}) {
  if (graph) {
    const waveList = waves(tasks)
    const waveOfId = new Map()
    waveList.forEach((ids, i) => ids.forEach(id => waveOfId.set(id, i + 1)))
    const graphRow = t =>
      `| ${t.id} | ${waveOfId.get(t.id)} | ${t.after?.length ? t.after.join(', ') : NO_AFTER} | ${cell(t.title)} | ${t.model} | ${t.effort} | ${thousands(t.prompt.length)} chars |`
    const notes = [
      ...setup.map(command => `Setup: ${cell(command)}`),
      ...(verify !== null ? [`Verify (after each parallel wave): ${cell(verify)}`] : []),
      'Waves: ' + waveList.map((ids, i) => `${i + 1}: ${ids.join(', ')}`).join(' · '),
    ]
    return [
      SECTION_START,
      `Tasks file: \`${file}\` (sha256 \`${hash}\`)`,
      '',
      '| ID | Wave | After | Title | Model | Effort | Prompt |',
      '|---|---|---|---|---|---|---|',
      ...tasks.map(graphRow),
      '',
      ...notes.flatMap((line, i) => (i === 0 ? [line] : ['', line])),
      '',
      'Open the tasks file to read each prompt before approving.',
      SECTION_END,
    ]
  }
  const row = t =>
    `| ${t.id} | ${cell(t.title)} | ${t.model} | ${t.effort} | ${thousands(t.prompt.length)} chars |`
  return [
    SECTION_START,
    `Tasks file: \`${file}\` (sha256 \`${hash}\`)`,
    '',
    '| ID | Title | Model | Effort | Prompt |',
    '|---|---|---|---|---|',
    ...tasks.map(row),
    '',
    'Open the tasks file to read each prompt before approving.',
    SECTION_END,
  ]
}

// Returns the plan with its one task block (fence lines included) replaced by `sectionLines` and
// every earlier generated section removed. Keeps the plan's line endings: CRLF if it has any,
// else LF. Returns null when the plan does not have exactly one block.
function replaceBlock(text, sectionLines) {
  const { ranges, sections } = extractBlock(text)
  if (ranges.length !== 1) return null
  const [block] = ranges
  const eol = String(text).includes('\r\n') ? '\r\n' : '\n'
  const inSection = i => sections.some(s => i >= s.start && i <= s.end)
  const out = []
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (i === block.start) out.push(...sectionLines)
    else if (i > block.start && i <= block.end) return
    else if (!inSection(i)) out.push(line)
  })
  return out.join(eol)
}

module.exports = {
  ALLOWED, ALIASES, TIERS, MAX_TURNS, tierOf, nextTier, BLOCK_INFO, OPT_OUT_LINE, SECTION_START, SECTION_END,
  extractBlock, validate, parseBlock, parsePlan, renderSection, replaceBlock,
}
