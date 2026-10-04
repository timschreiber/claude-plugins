// H3: PostToolUse ExitPlanMode. The user approved the plan: start the run and give the main thread
// its first dispatch. The plan FILE is the approved text: the dialog shows the file as H2 left it,
// and the user can edit it there. tool_response.plan and tool_input.plan are fallbacks. When H2
// moved the block, the tasks come from the tasks file the plan names.
'use strict'

const fs = require('fs')
const { resolvePlan, planIdOf, writeTasksFile } = require('./lib/sidecar.js')
const state = require('./lib/state.js')
const git = require('./lib/git.js')
const { startRun, dispatchText } = require('./lib/run.js')
const { recordRunStart } = require('./lib/spend.js')
const { run, readInput, emit } = require('./lib/hook.js')

const PRUNE_DAYS = 7

function readPlan(input) {
  const response = input.tool_response ?? {}
  for (const file of [response.filePath, input.tool_input?.planFilePath]) {
    try {
      const text = fs.readFileSync(file, 'utf8')
      if (text.trim() !== '') return text
    } catch {}
  }
  if (typeof response.plan === 'string' && response.plan.trim() !== '') return response.plan
  return typeof input.tool_input?.plan === 'string' ? input.tool_input.plan : ''
}

// The tasks file the workers read. H2 normally wrote one next to the plan; if it could not, the
// tasks are written beside the session state instead. null if that fails too.
function tasksFileFor(input, result) {
  if (result.section?.file) return result.section.file
  const file = state.fileFor(input.session_id)?.replace(/\.json$/, '.tasks.json')
  return writeTasksFile([file], JSON.stringify({ tasks: result.tasks }, null, 2))
}

const context = additionalContext =>
  emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } })

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id || input.tool_response?.isAgent || !state.isActive(input.session_id)) return

  const text = readPlan(input)
  const result = resolvePlan(text)

  if (result.optOut) {
    state.remove(input.session_id) // an untiered plan replaces any earlier tiered one
    return
  }

  if (!result.ok && result.section !== undefined) {
    // The plan holds only the task table, so it cannot be implemented from its text either.
    state.remove(input.session_id)
    context(
      "tierminator: the approved plan's tasks could not be loaded, so nothing will run: " +
        result.errors.slice(0, 3).join('; ') + '. Tell the user and suggest planning again. ' +
        'Do not implement the plan yourself: its task prompts are not in the plan.'
    )
    return
  }

  if (!result.ok) {
    // Only reachable after H2's denial cap: run untiered, and say so.
    state.remove(input.session_id)
    context(
      'tierminator: the approved plan has no valid task block, so it will not run as tiered tasks: ' +
        result.errors.slice(0, 3).join('; ') + '. Tell the user, then implement the plan normally.'
    )
    return
  }

  const cannotSave = () =>
    context(
      'tierminator: the approved tasks could not be saved, so they cannot run as tiered tasks. Tell the user, ' +
        'then implement the plan normally.'
    )
  const tasksFile = tasksFileFor(input, result)
  if (!tasksFile) return cannotSave()

  const started = {
    ...startRun({
      tasks: result.tasks,
      tasksFile,
      tasksHash: result.section?.hash ?? null,
      planFile: input.tool_response?.filePath ?? input.tool_input?.planFilePath ?? null,
      branch: git.branch(input.cwd),
      planId: planIdOf(result, text),
    }),
    cwd: input.cwd ?? null,
  }

  // H2 checked the tree when the plan was submitted; it may have changed while the user read the
  // plan. Then the run waits, unguarded, and H1 resumes it on the user's next message once the
  // tree is clean.
  const problem = git.problem(input.cwd)
  const saved = problem ? { ...started, phase: 'paused', pausedBecause: problem } : started
  if (!state.write(input.session_id, saved)) return cannotSave()
  recordRunStart(input, saved)
  state.prune(PRUNE_DAYS)

  const count = `${result.tasks.length} tiered tasks (T01 to ${result.tasks[result.tasks.length - 1].id})`
  if (problem) {
    context(
      `tierminator: the plan (${count}) is approved but cannot start: ${problem}. ` +
        'Tell the user to commit or stash; the run starts at their next message after that. ' +
        'Do not implement the plan or edit files.'
    )
    return
  }
  context(
    `tierminator: the user approved ${count} and wants them run. Dispatch them one at a time, exactly as ` +
      'tierminator says. Do not implement the plan yourself. ' +
      dispatchText(started)
  )
})
