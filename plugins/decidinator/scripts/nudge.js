// Stop hook: when Claude's final message ends with a question in plain text (lib/plain-question.js),
// blocks the stop once and tells Claude to ask through AskUserQuestion. "Once" is stop_hook_active: the
// stop that follows a block carries it, and is let through. Off when nudgeOnPlainTextQuestions is false,
// and while an oracle dispatch is due or running, when the guard is telling Claude to end its turn.
'use strict'

const { runArmed, emit } = require('./lib/hook.js')
const config = require('./lib/config.js')
const state = require('./lib/state.js')
const reasons = require('./lib/reasons.js')
const Q = require('./lib/questions.js')
const { endsWithQuestion } = require('./lib/plain-question.js')

runArmed(async input => {
  if (input.stop_hook_active === true) return
  const cfg = config.forInput(input).config
  if (!cfg.nudgeOnPlainTextQuestions) return
  if (!endsWithQuestion(input.last_assistant_message)) return
  const s = state.read(input.session_id)
  if (s && Q.due(s, cfg.rungs)) return
  emit({ decision: 'block', reason: reasons.NUDGE })
})
