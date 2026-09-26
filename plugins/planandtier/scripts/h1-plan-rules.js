// H1: put the tiering rules in front of the planner.
//   (no arg)  UserPromptSubmit: in plan mode, print the rules as added context.
//   enter     PostToolUse EnterPlanMode: the model entered plan mode itself, so add them then.
'use strict'

const fs = require('fs')
const path = require('path')
const { run, readInput, emit, emitText } = require('./lib/hook.js')

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  const rules = fs.readFileSync(path.join(__dirname, '..', 'rules', 'tiering.md'), 'utf8')

  if (process.argv[2] === 'enter') {
    emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: rules } })
  } else if (input.permission_mode === 'plan') {
    emitText(rules)
  }
})
