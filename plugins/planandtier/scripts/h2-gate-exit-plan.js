// H2: PreToolUse ExitPlanMode. Blocks approval until the plan's task block validates, so an
// invalid plan never reaches the user. It reads the plan FILE first: tool_input.plan is
// whatever the model sent and can be stale after a retry (spike P2).
// A valid block is then moved to the tasks file, leaving a short table in the plan. The dialog
// reads the plan file after this hook runs, and it withholds a plan with a very long line. A plan
// that passes also has its planning's tokens and cost recorded beside it (lib/spend.js).
'use strict'

const fs = require('fs')
const path = require('path')
const { resolvePlan, moveBlock, planIdOf } = require('./lib/sidecar.js')
const { recordPlanning } = require('./lib/spend.js')
const state = require('./lib/state.js')
const git = require('./lib/git.js')
const { run, readInput, emit, debug } = require('./lib/hook.js')

const MAX_DENIALS = 3

const deny = reason =>
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })

// The plan text, and whether it came from the plan file. Only text read from the file is moved,
// so a missing plan file is never created.
function readPlan(toolInput) {
  try {
    const text = fs.readFileSync(toolInput.planFilePath, 'utf8')
    if (text.trim() !== '') return { text, fromFile: true }
  } catch {}
  return { text: typeof toolInput.plan === 'string' ? toolInput.plan : '', fromFile: false }
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id || !state.isArmed(input.session_id)) return
  const toolInput = input.tool_input ?? {}

  const { text, fromFile } = readPlan(toolInput)
  const result = resolvePlan(text)
  if (result.ok) {
    if (result.optOut) return

    // Each task is committed by its worker, and a failed attempt is reset to the commit before it,
    // so a tiered plan needs a Git repository with a clean working tree. This is the user's to fix:
    // it is never passed through, and it does not count toward the denial cap.
    const problem = git.problem(input.cwd)
    if (problem) {
      deny(
        `planandtier: this plan cannot run yet: ${problem}. Tell the user to fix that (commit or stash, or ` +
          'set up the repository) or to ask for an untiered plan ("Tiered execution: off"). ' +
          'Do not call ExitPlanMode again until it is fixed.'
      )
      return
    }

    // A plan that already has its table (a resubmission) stays as it is. If the move fails, the
    // plan reaches the dialog unchanged.
    if (result.section === undefined && fromFile) {
      if (!moveBlock(toolInput.planFilePath, text, result.tasks)) debug('H2: the task block could not be moved')
    }
    // What planning has cost since the last submission (or since arming), beside the plan.
    recordPlanning(input, planIdOf(result, text), toolInput.planFilePath ?? null)
    return
  }

  // After MAX_DENIALS in a row, let the plan through untiered rather than burn turns.
  const current = state.read(input.session_id) ?? { phase: 'planning', tasks: [], denials: 0 }
  if ((current.denials ?? 0) >= MAX_DENIALS) return
  state.write(input.session_id, { ...current, denials: (current.denials ?? 0) + 1 })

  const where = toolInput.planFilePath ? ` (${toolInput.planFilePath})` : ''
  const fix =
    result.section === undefined
      ? `Fix the block in the plan file${where}`
      : `Write the complete "json tiered-tasks" block into the plan file${where} again, in place of the ` +
        'task table between the planandtier:tasks markers'
  let reason =
    'planandtier: the task block is not valid:\n' +
    result.errors.map(e => `- ${e}`).join('\n') +
    `\n\n${fix}, then call ExitPlanMode again. ` +
    'For an untiered plan, add the line "Tiered execution: off" instead.'
  if (result.missingBlock) {
    reason += '\n\n' + fs.readFileSync(path.join(__dirname, '..', 'rules', 'tiering.md'), 'utf8')
  }
  deny(reason)
})
