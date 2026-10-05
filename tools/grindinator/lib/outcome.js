// Grindinator session outcome (spec Runner contract). Reads the result file Tierminator writes
// and maps it, the stream summary and the run facts to one outcome for the session.
'use strict'

const fs = require('fs')

const RESULT_OUTCOMES = ['complete', 'halted', 'limit', 'no-plan', 'declined']

function readResultFile(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { record: null, problem: null }
    return { record: null, problem: `could not be read (${err.code})` }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { record: null, problem: 'is not valid JSON' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== 1) {
    return { record: null, problem: 'is not a version 1 result file' }
  }
  if (!RESULT_OUTCOMES.includes(parsed.outcome)) {
    return { record: null, problem: `has an unknown outcome "${parsed.outcome}"` }
  }
  return { record: parsed, problem: null }
}

function baseFields(record) {
  if (!record) {
    return { haltedAt: null, planFile: null, tasksFile: null, tasksDone: [], tasksNotRun: [], limit: null }
  }
  return {
    haltedAt: record.haltedAt ?? null,
    planFile: record.planFile ?? null,
    tasksFile: record.tasksFile ?? null,
    tasksDone: Array.isArray(record.tasksDone) ? record.tasksDone.slice() : [],
    tasksNotRun: Array.isArray(record.tasksNotRun) ? record.tasksNotRun.slice() : [],
    limit: record.limit ?? null,
  }
}

function mapOutcome({ result, stream, run, now = new Date() }) {
  const record = result.record
  const base = baseFields(record)

  if (run.interrupted) {
    return { outcome: 'interrupted', reason: 'interrupted by the user', source: 'runner', ...base }
  }
  if (record) {
    return { outcome: record.outcome, reason: record.reason ?? null, source: 'result-file', ...base }
  }
  if (run.spawnError) {
    return {
      outcome: 'crashed',
      reason: `claude could not be started: ${run.spawnError}`,
      source: 'runner',
      ...base,
    }
  }
  if (run.timedOut) {
    return {
      outcome: 'crashed',
      reason: `the session ran past the ${run.capMinutes}-minute cap and was stopped`,
      source: 'runner',
      ...base,
    }
  }
  const last = stream && stream.lastResult
  if (last && last.is_error === true && last.api_error_status === 429) {
    return {
      outcome: 'limit',
      reason: 'a usage limit ended the session (a 429 result in the stream; no result file)',
      source: 'stream',
      ...base,
      limit: { detectedAt: now.toISOString(), resetsAt: null, raw: null },
    }
  }

  let reason = result.problem ? `the result file ${result.problem}` : 'the session ended without a result file'
  if (last && last.is_error === true) {
    reason += `; the last result was an API error (${last.api_error_status ?? 'no status'})`
    const text = String(last.result ?? '').split(/\r?\n/)[0].trim().slice(0, 200)
    if (text) reason += `: ${text}`
  }
  reason += `; exit code ${run.exitCode ?? 'none'}`
  if (run.signal) reason += `, signal ${run.signal}`
  return { outcome: 'crashed', reason, source: 'runner', ...base }
}

module.exports = { RESULT_OUTCOMES, readResultFile, mapOutcome }
