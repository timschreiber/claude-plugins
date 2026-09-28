// The tasks file ("sidecar"). The plan dialog withholds a plan with a very long line, and a task
// prompt is one JSON line, so H2 moves a valid task block into <plan>.tasks.json and leaves a
// short table in the plan. The dialog reads the plan file after H2 runs, so it shows the table.
// Every function here swallows filesystem errors and never throws, because a hook must never fail
// loudly.
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { extractBlock, parseBlock, parsePlan, renderSection, replaceBlock } = require('./tasks.js')

// plan.md -> plan.tasks.json, in the same directory.
function sidecarPath(planFile) {
  const { dir, name } = path.parse(planFile)
  return path.join(dir, `${name}.tasks.json`)
}

// The first 16 hex characters of the text's sha256: enough to tell a changed file from the one
// the table was written for.
const hashOf = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)

// Writes atomically (temp file, then rename). Returns true when the file was written.
function writeFile(file, text) {
  try {
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

// loadSidecar(file, hash) -> {ok: true, tasks} or {ok: false, problem, errors}, where problem is
// 'missing' (unreadable), 'changed' (hash differs from the table's) or 'invalid' (bad block).
function loadSidecar(file, hash) {
  let body
  try {
    body = fs.readFileSync(file, 'utf8')
  } catch {
    return { ok: false, problem: 'missing', errors: [`the tasks file ${file} is missing or unreadable`] }
  }
  const actual = hashOf(body)
  if (actual !== hash) {
    return {
      ok: false,
      problem: 'changed',
      errors: [`the tasks file ${file} has changed since its table was written (sha256 ${actual}, table says ${hash})`],
    }
  }
  const parsed = parseBlock(body)
  if (!parsed.ok) return { ok: false, problem: 'invalid', errors: parsed.errors }
  return { ok: true, tasks: parsed.tasks }
}

// parsePlan(), plus loading the tasks file when the plan has a generated section instead of a
// block. The result has parsePlan's shape; for a section it also carries `section` and, when
// loading failed, `problem`. The section must be exactly the table H2 would write for the loaded
// tasks: the hash only proves the tasks file is unchanged, so a hand-edited table (a changed
// title, a new row) would otherwise be approved while the old tasks run.
function resolvePlan(text) {
  const result = parsePlan(text)
  if (!result.section) return result
  const { file, hash, lines } = result.section
  const loaded = loadSidecar(file, hash)
  if (!loaded.ok) return { ...result, errors: loaded.errors, problem: loaded.problem }
  const expected = renderSection(loaded.tasks, file, hash)
  const same = expected.length === lines.length && expected.every((line, i) => line === lines[i].trimEnd())
  if (!same) {
    return {
      ...result,
      problem: 'edited',
      errors: [`the planandtier task table does not match its tasks file ${file}; the table was edited`],
    }
  }
  return { ...result, ok: true, tasks: loaded.tasks, errors: [] }
}

// Moves the plan's one valid block into the tasks file and writes the plan with the generated
// section in its place. `tasks` are the block's parsed tasks. Returns true when both files were
// written; on false the plan file is unchanged (a tasks file may have been written).
function moveBlock(planFile, text, tasks) {
  const { blocks } = extractBlock(text)
  if (blocks.length !== 1) return false
  const file = sidecarPath(planFile)
  const next = replaceBlock(text, renderSection(tasks, file, hashOf(blocks[0])))
  if (next === null) return false
  return writeFile(file, blocks[0]) && writeFile(planFile, next)
}

module.exports = { sidecarPath, hashOf, loadSidecar, resolvePlan, moveBlock }
