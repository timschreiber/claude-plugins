// The unattended mode: a headless session (claude -p) started with /tierminator:plan has no one to approve
// the plan, so the plan is the planning model's final message. This module holds the headless check
// (CLAUDE_CODE_ENTRYPOINT starts with "sdk" headless and is "cli" interactively; see
// tierminator-headless-command-findings.md), the plan file name for a session, the final-message
// extraction (from the Stop input or the transcript) and the planning note. Every function swallows
// errors and returns a "nothing" value, because a hook must never fail loudly.
'use strict'

const fs = require('fs')
const path = require('path')
const { plansDir } = require('./execute.js')

// True in a headless session. A missing entrypoint counts as interactive.
function headless(env = process.env) {
  try {
    return String(env.CLAUDE_CODE_ENTRYPOINT ?? '').startsWith('sdk')
  } catch {
    return false
  }
}

// <plans dir>/tierminator-unattended-<UTC YYYYMMDD-HHmmss>-<session id prefix>.md
function planFileFor(sessionId, now = new Date()) {
  try {
    const stamp = now.toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-')
    const prefix = String(sessionId ?? '').slice(0, 8).replace(/[^A-Za-z0-9_-]/g, '') || 'session'
    return path.join(plansDir(), `tierminator-unattended-${stamp}-${prefix}.md`)
  } catch {
    return ''
  }
}

function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(b => b && b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
}

// The turn's final assistant text: last_assistant_message, else the newest assistant entry in the
// transcript that has text. '' when there is none.
function finalText(input) {
  try {
    const last = input?.last_assistant_message
    if (typeof last === 'string' && last.trim()) return last
    const lines = fs.readFileSync(input?.transcript_path, 'utf8').split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry
      try {
        entry = JSON.parse(lines[i])
      } catch {
        continue
      }
      if (!entry || entry.type !== 'assistant') continue
      const text = textOf(entry.message?.content)
      if (text.trim()) return text
    }
    return ''
  } catch {
    return ''
  }
}

function note(planFile) {
  return (
    'tierminator: unattended run (a headless session started with /tierminator:plan). No one will approve the plan: it runs as soon as you finish planning. ' +
    'Plan the request as the rules below say, but not in plan mode and without ExitPlanMode, which this session does not use. ' +
    'Investigate read-only: read files and run read-only commands; file edits are refused until the run starts. ' +
    'Then end your turn with the complete plan as your final message: the prose summary, then the ## Tasks section with its json tiered-tasks block. ' +
    `Do not write the plan to a file and do not implement anything yourself: when you stop, tierminator saves the plan to ${planFile} and starts the run.`
  )
}

module.exports = { headless, planFileFor, finalText, note }
