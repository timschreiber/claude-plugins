// H1: put the tiering rules in front of the planner, and a run in progress in front of Claude.
//   (no arg)  UserPromptSubmit: in plan mode, print the rules as added context. Outside plan mode:
//             - if H4 left a notice (a background worker finished, and its report is arriving as a
//               prompt), print it: that is how the run moves on to its next step with nothing typed;
//             - otherwise, for a prompt the user typed while a run is in progress, print where it
//               stands and the next exact dispatch, so "continue" resumes it after an interruption;
//             - a paused run (its tree was dirty at approval) starts here once the tree is clean.
//   enter     PostToolUse EnterPlanMode: the model entered plan mode itself, so add the rules then.
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./lib/state.js')
const git = require('./lib/git.js')
const { dispatchText } = require('./lib/run.js')
const { run, readInput, emit, emitText } = require('./lib/hook.js')

// Subagent reports and task notifications also arrive as prompts; they are not the user speaking.
const fromHarness = prompt => /^\s*<(agent-message|task-notification)\b/.test(String(prompt ?? ''))

function runNote(input) {
  const s = state.read(input.session_id)
  if (!s) return
  if (s.notice) {
    if (!state.write(input.session_id, { ...s, notice: null })) return
    emitText(s.notice)
    return
  }
  if (fromHarness(input.prompt)) return
  const where = () => `${s.done.length} of ${s.tasks.length} tasks are done.`

  if (s.phase === 'paused') {
    const problem = git.problem(s.cwd ?? input.cwd)
    if (problem) {
      emitText(
        `planandtier: the approved plan is still waiting to run, because ${problem}. If the user wants it to ` +
          'run, they need to commit or stash those changes first.'
      )
      return
    }
    const started = { ...s, phase: 'running' }
    delete started.pausedBecause
    if (!state.write(input.session_id, started)) return
    emitText(`planandtier: the working tree is clean now, so the approved plan's run starts. ${dispatchText(started)}`)
    return
  }
  if (s.phase === 'running' && !s.current?.inFlight) {
    emitText(
      `planandtier: a run of the approved plan is in progress. ${where()} If the user wants it to continue, ` +
        `${dispatchText(s)} If they want to stop it, do not dispatch anything and tell them what is done.`
    )
  }
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return

  if (process.argv[2] === 'enter') {
    const rules = fs.readFileSync(path.join(__dirname, '..', 'rules', 'tiering.md'), 'utf8')
    emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: rules } })
  } else if (input.permission_mode === 'plan') {
    emitText(fs.readFileSync(path.join(__dirname, '..', 'rules', 'tiering.md'), 'utf8'))
  } else {
    runNote(input)
  }
})
