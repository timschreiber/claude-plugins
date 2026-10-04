// H3: PostToolUse ExitPlanMode. The user approved a plan made after /tierminator:plan: start the run
// (lib/execute.js) and give the main thread its first dispatch. It acts only while the session is active
// and planning; a plan-mode plan made without /tierminator:plan is not tiered. The plan FILE is the
// approved text: the dialog shows the file as H2 left it, and the user can edit it there.
// tool_response.plan and tool_input.plan are fallbacks; when there is no readable plan file, the plan
// text is saved beside the session state and run from there. When H2 moved the block, the tasks come from
// the tasks file the plan names. Whatever happens, planning is over: unless a run started, the session is
// made inactive again.
'use strict'

const fs = require('fs')
const path = require('path')
const { resolvePlan } = require('./lib/sidecar.js')
const state = require('./lib/state.js')
const { executePlan } = require('./lib/execute.js')
const { run, readInput, emit } = require('./lib/hook.js')

const PRUNE_DAYS = 7

const readable = file => {
  try {
    return fs.readFileSync(file, 'utf8').trim() !== ''
  } catch {
    return false
  }
}

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

const context = additionalContext =>
  emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } })

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id || input.tool_response?.isAgent) return
  const id = input.session_id
  if (!state.isActive(id) || state.read(id)?.phase !== 'planning') return
  const end = () => {
    state.deactivate(id)
    state.remove(id)
  }

  const text = readPlan(input)
  const result = resolvePlan(text)

  if (result.optOut) {
    end()
    return
  }

  if (!result.ok && result.section !== undefined) {
    // The plan holds only the task table, so it cannot be implemented from its text either.
    end()
    context(
      "tierminator: the approved plan's tasks could not be loaded, so nothing will run: " +
        result.errors.slice(0, 3).join('; ') + '. Tell the user and suggest planning again. ' +
        'Do not implement the plan yourself: its task prompts are not in the plan.'
    )
    return
  }

  if (!result.ok) {
    // Only reachable after H2's denial cap: run untiered, and say so.
    end()
    context(
      'tierminator: the approved plan has no valid task block, so it will not run as tiered tasks: ' +
        result.errors.slice(0, 3).join('; ') + '. Tell the user, then implement the plan normally.'
    )
    return
  }

  let planFile = input.tool_response?.filePath ?? input.tool_input?.planFilePath
  if (!planFile || !readable(planFile)) {
    planFile = state.fileFor(id)?.replace(/\.json$/, '.plan.md')
    try {
      fs.mkdirSync(path.dirname(planFile), { recursive: true })
      fs.writeFileSync(planFile, text)
    } catch {
      end()
      context(
        'tierminator: the approved tasks could not be saved, so they cannot run as tiered tasks. Tell the user, ' +
          'then implement the plan normally.'
      )
      return
    }
  }

  const note = executePlan(input, JSON.stringify(planFile), { approved: true })
  if (state.read(id)?.phase !== 'running') end()
  state.prune(PRUNE_DAYS)
  context(note)
})
