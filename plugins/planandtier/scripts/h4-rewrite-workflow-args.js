// H4: PreToolUse Workflow. When the model launches the saved workflow, replace its args with
// the approved tasks from the state file, so no model ever recalls or retypes them.
// updatedInput replaces the whole tool input, so the original input is spread first.
// It never sets permissionDecision: updatedInput alone is honored, and "allow" would bypass
// the user's permission prompt.
// It does not change the state. The call can still be rejected after this hook runs (a CRLF
// script failed schema validation) or declined at the workflow review, and neither fires a
// failure event, so only H6's PostToolUse marks the launch. Leaving guardDenials alone keeps a
// launch that always fails from resetting the guard on every attempt.
'use strict'

const state = require('./lib/state.js')
const { run, readInput, emit } = require('./lib/hook.js')

const WORKFLOW = 'planandtier:execute-plan'

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  const toolInput = input.tool_input ?? {}
  if (toolInput.name !== WORKFLOW) return

  const current = state.read(input.session_id)
  if (!current || current.phase === 'planning' || !Array.isArray(current.tasks) || current.tasks.length === 0) return

  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...toolInput, args: { tasks: current.tasks } },
    },
  })
})
