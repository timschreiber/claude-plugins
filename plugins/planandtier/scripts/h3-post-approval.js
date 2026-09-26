// H3: PostToolUse ExitPlanMode. The user approved the plan: save its tasks and tell the main
// thread to launch the workflow. tool_response.plan is the approved text.
'use strict'

const fs = require('fs')
const { parsePlan } = require('./lib/tasks.js')
const state = require('./lib/state.js')
const { run, readInput, emit } = require('./lib/hook.js')

const PRUNE_DAYS = 7

function readPlan(input) {
  const response = input.tool_response ?? {}
  if (typeof response.plan === 'string' && response.plan.trim() !== '') return response.plan
  for (const file of [response.filePath, input.tool_input?.planFilePath]) {
    try {
      const text = fs.readFileSync(file, 'utf8')
      if (text.trim() !== '') return text
    } catch {}
  }
  return typeof input.tool_input?.plan === 'string' ? input.tool_input.plan : ''
}

const context = additionalContext =>
  emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } })

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id || input.tool_response?.isAgent) return

  const result = parsePlan(readPlan(input))

  if (result.optOut) {
    state.remove(input.session_id) // an untiered plan replaces any earlier tiered one
    return
  }

  if (!result.ok) {
    // Only reachable after H2's denial cap: run untiered, and say so.
    state.remove(input.session_id)
    context(
      'planandtier: the approved plan has no valid task block, so it will not run as a tiered workflow. ' +
        'Problems: ' + result.errors.slice(0, 3).join('; ') + '. Tell the user, then implement the plan normally.'
    )
    return
  }

  const saved = state.write(input.session_id, {
    phase: 'approved',
    tasks: result.tasks,
    planFile: input.tool_response?.filePath ?? input.tool_input?.planFilePath ?? null,
    approvedAt: new Date().toISOString(),
    denials: 0,
    guardDenials: 0,
  })
  if (!saved) {
    context(
      'planandtier: the approved tasks could not be saved, so the workflow cannot run. Tell the user, ' +
        'then implement the plan normally.'
    )
    return
  }
  state.prune(PRUNE_DAYS)

  const last = result.tasks[result.tasks.length - 1].id
  context(
    `planandtier: the user approved this plan with ${result.tasks.length} tiered tasks (T01 to ${last}). ` +
      'Their approval is their request to run it. Do not implement the plan yourself and do not edit files. ' +
      'Your next action is to call the Workflow tool with name "planandtier:execute-plan" and no args; the ' +
      'approved tasks are supplied automatically. Then tell the user the workflow is running.'
  )
})
