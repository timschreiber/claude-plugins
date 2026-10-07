// The run summary, .grindinator/summary.md, written at the end of every run that reached its
// packages: each package's outcome, attempts, commits and gate result, and why the run stopped
// the open sidecar questions when Decidinator is on, and any usage-limit waits an attempt made.
'use strict'

const path = require('path')
const state = require('./state.js')
const { SOURCE_TEXT } = require('./limit.js')

function summaryPath(root) {
  return path.join(state.stateDir(root), 'summary.md')
}

function cell(text) {
  return String(text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
}

function gateText(gate) {
  if (gate === null || gate === undefined) return '-'
  if (gate.status === 'skipped') return 'none configured'
  if (gate.status === 'passed') return 'passed'
  if (gate.status === 'interrupted') return 'interrupted'
  if (gate.timedOut) return 'failed (timed out)'
  return `failed (exit ${gate.exitCode ?? 'none'})`
}

function outcomeText(attempt) {
  if (!attempt) return '-'
  if (attempt.outcome === null || attempt.outcome === undefined) return 'running'
  if (attempt.haltedAt) return `${attempt.outcome} at ${attempt.haltedAt}`
  return attempt.outcome
}

function waitText(w) {
  const reset = `reset ${w.resetsAt ?? 'unknown'}, ${SOURCE_TEXT[w.source] ?? w.source}`
  switch (w.status) {
    case 'woke': return `waited from ${w.startedAt} to ${w.endedAt} (${reset})`
    case 'interrupted': return `waited from ${w.startedAt}, interrupted at ${w.endedAt} (${reset})`
    case 'waiting': return `waiting since ${w.startedAt ?? 'unknown'} until ${w.wakeAt} (${reset})`
    case 'over-cap': return `did not wait: over the limit-wait cap (${reset})`
    case 'weekly': return `did not wait: the reset is more than 24 hours away (${reset})`
    default: return `${w.status} (${reset})`
  }
}

function renderSummary({ root, st, packages, exitCode, stopReason, now = new Date(), decisions = null }) {
  const lines = [
    `# Grindinator run ${st.runName}`,
    '',
    `- Branch: ${st.branch}`,
    `- Base commit: ${st.baseCommit}`,
    `- Ended: ${now.toISOString()}`,
    `- Exit code: ${exitCode}`,
    `- Stop reason: ${stopReason}`,
    '',
    '| Package | Title | Status | Attempts | Outcome | Commits | Gate |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ]
  const notes = []
  const waits = []
  for (const { id, title } of packages) {
    const attempts = st.packages[id]?.attempts ?? []
    const last = attempts.length ? attempts[attempts.length - 1] : null
    for (const a of attempts) if (a.wait) waits.push(`- ${id}, attempt ${a.n}: ${waitText(a.wait)}`)
    lines.push(
      `| ${id} | ${cell(title)} | ${state.statusOf(root, st, id)} | ${attempts.length} | ${cell(outcomeText(last))} | ${last?.commits ?? '-'} | ${gateText(last?.gate ?? null)} |`
    )
    if (last?.reason) {
      notes.push(
        `- ${id}, attempt ${last.n}: ${cell(last.reason).replace(/\.+$/, '')}. Logs: .grindinator/${last.dir}/`
      )
    }
  }
  if (notes.length) lines.push('', '## Details', '', ...notes)
  if (waits.length) lines.push('', '## Limit waits', '', ...waits)
  if (decisions !== null) {
    lines.push('', '## Open questions', '')
    if (decisions.open.length === 0) {
      lines.push('None.')
    } else {
      for (const q of decisions.open) {
        const deps = q.dependsOn.length ? ` (${q.dependsOn.join(', ')})` : ''
        lines.push(`- ${q.id} · ${cell(q.topic)}${deps}`)
      }
      lines.push(
        '',
        `For a stakeholder copy, run \`/decidinator:export\` in Claude Code in this project. It exports the open questions in ${decisions.sidecar}, which receives a package's questions when the package completes; until then they are only in .grindinator/decisions/open-questions.md.`
      )
    }
  }
  return lines.join('\n') + '\n'
}

function writeSummary(root, text) {
  state.writeAtomic(summaryPath(root), text)
}

module.exports = { summaryPath, renderSummary, waitText, writeSummary }
