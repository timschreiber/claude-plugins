// Decidinator configuration. Two optional JSON files are read: the user file
// (~/.claude/decidinator.json) and the project file (<project>/.claude/decidinator.json).
// Precedence, lowest to highest: built-in DEFAULTS, the user file, the project file. Each key is
// resolved on its own, and an array value (rungs) is replaced whole, never merged.
// The loader is lenient: an invalid value or an unknown key is ignored on its own (the
// lower-precedence value applies) and reported as a warning naming the file and key. It never
// refuses a configuration.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const MODES = ['ask', 'sidecar']

const DEFAULTS = Object.freeze({
  mode: 'ask',
  rungs: Object.freeze(['decidinator:oracle-1', 'decidinator:oracle-2', 'decidinator:oracle-3']),
  decisionLog: 'docs/decisions.md',
  sidecar: 'docs/open-questions.md',
  guardMaxBlocks: 3,
  nudgeOnPlainTextQuestions: true
})

const RUNG_PATTERN = /^[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$/

function userFile(homeDir) {
  return path.join(homeDir, '.claude', 'decidinator.json')
}

function projectFile(projectDir) {
  return path.join(projectDir, '.claude', 'decidinator.json')
}

function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd()
}

// Returns null when the value is valid for the key, else the problem text.
function checkKey(key, value) {
  switch (key) {
    case 'mode':
      return MODES.includes(value) ? null : '"mode" must be "ask" or "sidecar"'
    case 'rungs': {
      const shapeOk = Array.isArray(value) && value.length >= 1 &&
        value.every(v => typeof v === 'string' && RUNG_PATTERN.test(v))
      if (!shapeOk) {
        return '"rungs" must be a non-empty array of agent names such as "decidinator:oracle-1"'
      }
      return new Set(value).size === value.length ? null : '"rungs" must not name the same agent twice'
    }
    case 'decisionLog':
    case 'sidecar':
      return typeof value === 'string' && value.trim() !== '' && !value.includes('\0')
        ? null
        : `"${key}" must be a non-empty file path`
    case 'guardMaxBlocks':
      return Number.isInteger(value) && value >= 1 ? null : '"guardMaxBlocks" must be a whole number of at least 1'
    case 'nudgeOnPlainTextQuestions':
      return typeof value === 'boolean' ? null : '"nudgeOnPlainTextQuestions" must be true or false'
    default:
      return null
  }
}

function readFile(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return { values: {}, problems: [] }
    return { values: {}, problems: [`${file}: could not be read (${e.code})`] }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { values: {}, problems: [`${file}: is not valid JSON`] }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { values: {}, problems: [`${file}: must hold a JSON object`] }
  }
  return { values: parsed, problems: [] }
}

function applyEnvPath(merged, raw, key) {
  if (raw === undefined || raw.trim() === '') return
  merged[key] = raw.trim()
}

function load({ projectDir: project, homeDir }) {
  const merged = { ...DEFAULTS, rungs: [...DEFAULTS.rungs] }
  const warnings = []
  const files = [userFile(homeDir), projectFile(project)]
  if (path.resolve(files[0]) === path.resolve(files[1])) files.pop()

  for (const file of files) {
    const { values, problems } = readFile(file)
    warnings.push(...problems)
    for (const [key, value] of Object.entries(values)) {
      if (!Object.hasOwn(DEFAULTS, key)) {
        warnings.push(`${file}: "${key}" is not a Decidinator setting`)
        continue
      }
      const p = checkKey(key, value)
      if (p) {
        warnings.push(`${file}: ${p}`)
        continue
      }
      merged[key] = Array.isArray(value) ? [...value] : value
    }
  }

  applyEnvPath(merged, process.env.DECIDINATOR_LOG, 'decisionLog')
  applyEnvPath(merged, process.env.DECIDINATOR_SIDECAR, 'sidecar')

  const norm = s => path.posix.normalize(s.replace(/\\/g, '/'))
  if (norm(merged.decisionLog) === norm(merged.sidecar)) {
    warnings.push('"decisionLog" and "sidecar" must name different files; the defaults are used')
    merged.decisionLog = DEFAULTS.decisionLog
    merged.sidecar = DEFAULTS.sidecar
  }
  return { config: merged, warnings }
}

function forInput(input) {
  return load({ projectDir: projectDir(input), homeDir: os.homedir() })
}

module.exports = { MODES, DEFAULTS, userFile, projectFile, projectDir, checkKey, readFile, load, forInput }
