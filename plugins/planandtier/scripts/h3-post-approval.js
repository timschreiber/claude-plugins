// H3: PostToolUse ExitPlanMode. The user approved the plan: save its tasks and tell the main
// thread to launch the workflow. The plan FILE is the approved text: the dialog shows the file
// as H2 left it, and the user can edit it there. tool_response.plan and tool_input.plan are
// fallbacks. When H2 moved the block, the tasks come from the tasks file the plan names.
// A plan approved after an earlier version was rejected is not launched by the model: its state is
// "awaiting-launch" (no guards) and the user is asked to type /planandtier:execute-plan.
'use strict'

const fs = require('fs')
const { resolvePlan } = require('./lib/sidecar.js')
const state = require('./lib/state.js')
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

const context = additionalContext =>
  emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } })

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id || input.tool_response?.isAgent) return

  const result = resolvePlan(readPlan(input))

  if (result.optOut) {
    state.remove(input.session_id) // an untiered plan replaces any earlier tiered one
    return
  }

  if (!result.ok && result.section !== undefined) {
    // The plan holds only the task table, so it cannot be implemented from its text either.
    state.remove(input.session_id)
    context(
      "planandtier: the approved plan's tasks could not be loaded, so nothing will run. " +
        'Problems: ' + result.errors.slice(0, 3).join('; ') + '. Tell the user, and suggest planning again. ' +
        'Do not implement the plan yourself: its task prompts are not in the plan.'
    )
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

  // H2 counted every version of the plan that reached the dialog. More than one means the user
  // rejected an earlier version, maybe with feedback that changed the tasks. Claude Code shows each
  // workflow worker the user's latest typed prompt as a request that overrides its task, and
  // dialog feedback is not a typed prompt, so a worker could refuse a changed task. The user
  // launches such a plan by typing, which makes that prompt the one relayed.
  const revised = (state.read(input.session_id)?.submissions ?? 0) > 1

  const saved = state.write(input.session_id, {
    phase: revised ? 'awaiting-launch' : 'approved',
    tasks: result.tasks,
    planFile: input.tool_response?.filePath ?? input.tool_input?.planFilePath ?? null,
    tasksFile: result.section?.file ?? null,
    tasksHash: result.section?.hash ?? null,
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
  if (revised) {
    context(
      `planandtier: the user approved this plan with ${result.tasks.length} tiered tasks (T01 to ${last}), ` +
        'after rejecting an earlier version. Do not launch the workflow yourself, do not implement the plan ' +
        'and do not edit files. Workflow workers are shown the user\'s latest typed message as their ' +
        'request, and feedback typed in the plan dialog is not one, so a worker could refuse a changed ' +
        'task. Tell the user the plan is approved and ask them to type /planandtier:execute-plan to run it. ' +
        'Then end your turn.'
    )
    return
  }
  context(
    `planandtier: the user approved this plan with ${result.tasks.length} tiered tasks (T01 to ${last}). ` +
      'Their approval is their request to run it. Do not implement the plan yourself and do not edit files. ' +
      'Your next action is to call the Workflow tool with name "planandtier:execute-plan" and no args; the ' +
      'approved tasks are supplied automatically. Then tell the user the workflow is running.'
  )
})
