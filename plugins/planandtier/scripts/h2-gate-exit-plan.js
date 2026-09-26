// H2: PreToolUse ExitPlanMode. Blocks approval until the plan's task block validates, so an
// invalid plan never reaches the user. It reads the plan FILE first: tool_input.plan is
// whatever the model sent and can be stale after a retry (spike P2).
'use strict'

const fs = require('fs')
const path = require('path')
const { parsePlan } = require('./lib/tasks.js')
const state = require('./lib/state.js')
const { run, readInput, emit } = require('./lib/hook.js')

const MAX_DENIALS = 3

function readPlan(toolInput) {
  try {
    const text = fs.readFileSync(toolInput.planFilePath, 'utf8')
    if (text.trim() !== '') return text
  } catch {}
  return typeof toolInput.plan === 'string' ? toolInput.plan : ''
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  const toolInput = input.tool_input ?? {}

  const result = parsePlan(readPlan(toolInput))
  if (result.ok) return

  // After MAX_DENIALS in a row, let the plan through untiered rather than burn turns.
  const current = state.read(input.session_id) ?? { phase: 'planning', tasks: [], denials: 0 }
  if ((current.denials ?? 0) >= MAX_DENIALS) return
  state.write(input.session_id, { ...current, denials: (current.denials ?? 0) + 1 })

  const where = toolInput.planFilePath ? ` (${toolInput.planFilePath})` : ''
  let reason =
    'planandtier: the plan cannot be approved yet, because its task block is not valid:\n' +
    result.errors.map(e => `- ${e}`).join('\n') +
    `\n\nFix the block in the plan file${where}, then call ExitPlanMode again. If the user asked for ` +
    'a normal, untiered plan, add the line "Tiered execution: off" instead.'
  if (result.missingBlock) {
    reason += '\n\n' + fs.readFileSync(path.join(__dirname, '..', 'rules', 'tiering.md'), 'utf8')
  }

  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })
})
