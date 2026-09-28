// /planandtier:execute-plan [plan path] [--from Txx]: picks a saved plan up again, for when its
// session is gone (SessionEnd deletes the run state and the arming flag). H1 calls executePlan() with
// the UserPromptSubmit input and prints the note it returns; the skill only tells Claude to follow it.
//   - A planandtier plan (a task table or a raw task block) runs tiered, from its first task that is
//     not already committed on this branch, and the session is armed.
//   - A plain plan runs without planandtier: Claude implements it as usual.
//   - A planandtier plan whose tasks cannot be loaded is refused: its prompts are not in the plan.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const state = require('./state.js')
const git = require('./git.js')
const { resolvePlan, planIdOf, sidecarPath, writeTasksFile } = require('./sidecar.js')
const { extractBlock } = require('./tasks.js')
const { startRun, dispatchText, skippedEntry, doneLabel } = require('./run.js')
const { recordRunStart } = require('./spend.js')

const PREFIX = 'planandtier:'
const LISTED = 5

// Claude Code's default plans directory. A custom plansDirectory setting is not visible to hooks.
const plansDir = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'plans')

// The words after the command: a path (quoted or not; unquoted words are joined with spaces) and an
// optional --from Txx. Returns {path, from} or {error}.
function parseArgs(rest) {
  const tokens = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m
  while ((m = re.exec(String(rest ?? '')))) tokens.push(m[1] ?? m[2] ?? m[3])
  let from = null
  const words = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '--from' || t.startsWith('--from=')) {
      const value = t === '--from' ? tokens[++i] : t.slice('--from='.length)
      if (!/^T\d+$/i.test(value ?? '')) return { error: '--from needs a task id, such as --from T03' }
      from = value.toUpperCase()
    } else {
      words.push(t)
    }
  }
  return { path: words.length ? words.join(' ') : null, from }
}

function resolvePath(p, cwd) {
  const expanded = p === '~' || /^~[\\/]/.test(p) ? path.join(os.homedir(), p.slice(1)) : p
  return path.resolve(typeof cwd === 'string' && cwd ? cwd : process.cwd(), expanded)
}

// The most recently changed plans in the plans directory that hold a planandtier table or block.
function recentPlans(dir = plansDir(), limit = LISTED) {
  let names
  try {
    names = fs.readdirSync(dir).filter(n => n.endsWith('.md'))
  } catch {
    return []
  }
  const plans = []
  for (const name of names) {
    try {
      const file = path.join(dir, name)
      const text = fs.readFileSync(file, 'utf8')
      const { blocks, sections } = extractBlock(text)
      if (blocks.length === 0 && sections.length === 0) continue
      const result = resolvePlan(text)
      plans.push({
        file,
        title: /^#[ \t]+(.+?)\s*$/m.exec(text)?.[1] ?? name,
        tasks: result.ok ? result.tasks.length : null,
        mtime: fs.statSync(file).mtimeMs,
      })
    } catch {}
  }
  return plans.sort((a, b) => b.mtime - a.mtime).slice(0, limit)
}

function listNote(dir = plansDir()) {
  const plans = recentPlans(dir)
  const custom = 'If the plans directory was changed with the plansDirectory setting, the path has to be typed.'
  if (plans.length === 0) {
    return `${PREFIX} no plan path was given, and there are no planandtier plans in ${dir}. ${custom} Tell the user.`
  }
  const rows = plans.map(
    p =>
      `- ${p.file}: "${p.title}", ${p.tasks === null ? 'tasks cannot be loaded' : `${p.tasks} tasks`}, changed ` +
      new Date(p.mtime).toISOString().slice(0, 16).replace('T', ' ')
  )
  return (
    `${PREFIX} no plan path was given. These are the most recent planandtier plans in ${dir}, newest first:\n` +
    `${rows.join('\n')}\n` +
    'Show them to the user and ask which one to run. They run it by typing /planandtier:execute-plan followed ' +
    `by its path. Do not run anything yourself. ${custom}`
  )
}

// Where the run starts: {start, done} or {error}. Tasks already committed on the branch with this
// plan's id are skipped, as long as they are a leading run of the plan; --from overrides that.
function startPoint(tasks, committed, from) {
  const ids = tasks.map(t => t.id)
  const entry = (t, reason) => skippedEntry(t.id, committed[t.id] ?? null, committed[t.id] ? 'committed' : reason)
  if (from) {
    const start = ids.indexOf(from)
    if (start < 0) return { error: `the plan has no task ${from}; its tasks are ${ids[0]} to ${ids[ids.length - 1]}` }
    return { start, done: tasks.slice(0, start).map(t => entry(t, 'from')) }
  }
  let start = 0
  while (start < tasks.length && committed[tasks[start].id]) start++
  const later = ids.slice(start + 1).filter(id => committed[id])
  if (later.length) {
    return {
      error:
        `${later.join(', ')} ${later.length === 1 ? 'is' : 'are'} already committed on this branch, but ` +
        `${ids[start]} is not. Tell the user, and that they can choose where to start by typing the command ` +
        'again with --from and a task id',
    }
  }
  return { start, done: tasks.slice(0, start).map(t => entry(t, 'committed')) }
}

function executePlan(input, rest) {
  const id = input.session_id
  const cwd = input.cwd
  if (input.permission_mode === 'plan') {
    return (
      `${PREFIX} a plan cannot be executed in plan mode: the tasks' subagents work in the session's ` +
      'permission mode, so they could not edit anything. Tell the user to leave plan mode (Shift+Tab) and ' +
      'type the command again.'
    )
  }
  const current = state.read(id)
  if (state.isArmed(id) && (current?.phase === 'running' || current?.phase === 'paused')) {
    return (
      `${PREFIX} a run of a plan is already in progress in this session, so another cannot start. Tell ` +
      'the user to type /planandtier:disarm first if they want to stop it.'
    )
  }
  const args = parseArgs(rest)
  if (args.error) return `${PREFIX} ${args.error}. Tell the user.`
  if (!args.path) return listNote()

  const planFile = resolvePath(args.path, cwd)
  let text
  try {
    text = fs.readFileSync(planFile, 'utf8')
  } catch {
    return `${PREFIX} the plan file ${planFile} cannot be read. Tell the user, and check the path with them.`
  }

  const result = resolvePlan(text)
  if (result.optOut || result.missingBlock) {
    const why = result.optOut ? 'it says "Tiered execution: off"' : 'it has no planandtier task table or task block'
    return (
      `${PREFIX} ${planFile} is not a tiered planandtier plan (${why}), so it runs without planandtier. ` +
      'Read the plan file and implement it in this session as you normally would. planandtier does not ' +
      'arm the session or check Git for it.'
    )
  }
  if (!result.ok && result.section !== undefined) {
    return (
      `${PREFIX} the plan in ${planFile} cannot run, because its tasks cannot be loaded: ` +
      `${result.errors.slice(0, 3).join('; ')}. Its task prompts are not in the plan, so do not implement it ` +
      'yourself. Tell the user, and suggest planning it again.'
    )
  }
  if (!result.ok) {
    return (
      `${PREFIX} the task block in ${planFile} is not valid, so the plan cannot run: ` +
      `${result.errors.slice(0, 5).join('; ')}. Tell the user; they can fix the block or plan again.`
    )
  }

  const problem = git.problem(cwd)
  if (problem) {
    return (
      `${PREFIX} the plan cannot run here, because ${problem}. planandtier commits each task and resets a ` +
      'failed attempt to the commit before it. Tell the user what to fix, and that they can then type the ' +
      'command again.'
    )
  }

  const planId = planIdOf(result, text)
  const committed = git.committedTasks(cwd, planId)
  const point = startPoint(result.tasks, committed, args.from)
  if (point.error) return `${PREFIX} the plan in ${planFile} was not started: ${point.error}.`
  if (point.start >= result.tasks.length) {
    return (
      `${PREFIX} every task in ${planFile} is already committed on this branch: ` +
      `${point.done.map(doneLabel).join(', ')}. Nothing was run. Tell the user.`
    )
  }

  const block = result.section ? null : extractBlock(text).blocks[0]
  const sessionTasks = state.fileFor(id)?.replace(/\.json$/, '.tasks.json')
  const tasksFile = result.section?.file ?? writeTasksFile([sidecarPath(planFile), sessionTasks], block)
  if (!tasksFile) return `${PREFIX} the plan's tasks could not be saved to a tasks file, so it cannot run. Tell the user.`
  if (!state.isArmed(id) && !state.arm(id)) {
    return `${PREFIX} the session could not be armed (its flag file could not be written), so the plan cannot run. Tell the user.`
  }

  const run = {
    ...startRun({
      tasks: result.tasks,
      tasksFile,
      tasksHash: result.section?.hash ?? null,
      planFile,
      branch: git.branch(cwd),
      planId,
      start: point.start,
      done: point.done,
    }),
    cwd,
  }
  if (!state.write(id, run)) return `${PREFIX} the run could not be saved, so the plan cannot run. Tell the user.`
  recordRunStart(input, run)

  const count = `${result.tasks.length} tiered tasks`
  const skipped = point.done.length
    ? ` ${point.done.map(doneLabel).join(', ')} ${point.done.length === 1 ? 'is' : 'are'} not run again.`
    : ''
  return (
    `${PREFIX} the user asked to execute the plan in ${planFile} (${count}), and the session is now armed.` +
    `${skipped} Each task runs in its own subagent at its tier and commits its own work. Your part is only to ` +
    'dispatch them, one at a time, exactly as planandtier tells you. Do not implement the plan yourself. ' +
    dispatchText(run)
  )
}

module.exports = { executePlan, parseArgs, recentPlans, startPoint, plansDir }
