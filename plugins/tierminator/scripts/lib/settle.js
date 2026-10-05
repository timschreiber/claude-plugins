// Judging a finished attempt, shared by the hooks that can see one finish: H4 (the worker stopped)
// and H1 (the worker's report arrived as a prompt). Kept in one module so both judge the same way.
'use strict'

const fs = require('fs')
const git = require('./git.js')
const r = require('./run.js')

const short = sha => String(sha ?? '').slice(0, 7)

// A report the run can judge: any but a DONE report whose VERIFY is no verdict.
const readable = report => !!report && (report.status !== 'DONE' || r.verdictOf(report.verify) !== null)

// The worker's report block, from its transcript, newest first. A worker often delivers the block
// through Claude Code's SubagentHandback tool and then ends with a line such as "Task complete.",
// so its last message is not reliably the report. Each assistant message is searched in its tool
// calls' `message` inputs, then its text. Returns the first readable report found; if only
// unreadable ones are found, the newest of those; null when no block is found.
function reportFromTranscript(transcript) {
  let newest = null
  try {
    const lines = fs.readFileSync(transcript, 'utf8').split('\n').filter(Boolean).reverse()
    for (const line of lines) {
      const o = JSON.parse(line)
      if (o.type !== 'assistant') continue
      const c = o.message?.content
      const blocks = typeof c === 'string' ? [{ type: 'text', text: c }] : (c ?? [])
      const candidates = [
        ...blocks.filter(x => x.type === 'tool_use' && typeof x.input?.message === 'string').map(x => x.input.message),
        ...blocks.filter(x => x.type === 'text').map(x => x.text),
      ]
      for (const text of candidates) {
        const report = r.parseReport(text)
        if (!report) continue
        if (readable(report)) return report
        newest ??= report
      }
    }
  } catch {}
  return newest
}

// The worker's report from its message, else its transcript; a report that cannot be read is read again
// from the transcript, which may hold the block intact.
function readReport(text, transcript) {
  const first = r.parseReport(text)
  if (readable(first)) return first
  const again = transcript ? reportFromTranscript(transcript) : null
  return readable(again) ? again : (first ?? again)
}

// Judges the finished attempt (from its report, or the given failure), moves the run on, and returns
// the new state with the notice Claude must be told next. Does the Git work: the checks, and the
// reset before a retry.
function settle(s, cwd, failure) {
  const task = r.currentTask(s)
  const { head } = s.current
  const commits = git.commitsSince(cwd, head)
  const outcome =
    failure ??
    r.judge({
      report: s.current.report,
      taskId: task.id,
      planId: s.planId,
      commits,
      clean: git.isClean(cwd),
      sameBranch: git.branch(cwd) === s.branch,
    })
  let { state: next, action } = r.advance(s, outcome)

  if (action === 'retry') {
    // Never reset away a commit that may have been pushed; stop instead.
    const pushed = commits.find(c => git.isPushed(cwd, c.sha))
    const reset = pushed ? null : git.resetTo(cwd, head)
    const fatal = pushed
      ? `the failed attempt's commit ${short(pushed.sha)} is on a remote branch, so it cannot be reset`
      : !reset.ok
        ? `the reset to ${short(head)} before the retry failed (${reset.failure})`
        : null
    if (fatal) return settled(s, r.advance(s, { ok: false, fatal }), { ok: false, fatal })
  }
  return settled(s, { state: next, action }, outcome)
}
const settled = (s, { state: next, action }, outcome) => ({ ...next, notice: r.noticeText(s, next, action, outcome) })

module.exports = { reportFromTranscript, readReport, settle, settled }
