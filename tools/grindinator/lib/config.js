// Grindinator configuration (spec R-G2). Two optional JSON files are read: the user file
// (~/.claude/grindinator.json) and the project file (<project>/.claude/grindinator.json).
// Precedence, lowest to highest: built-in DEFAULTS, the user file, the project file, flags.
// Each key is resolved on its own, and an array value is replaced whole, never merged.
// The loader is strict: every problem (unreadable file, bad JSON, unknown key, invalid value,
// invalid flag) is collected and reported, and an invalid value is never applied.
// A flag of kind off (such as --no-decidinator) sets its setting to false.
'use strict'

const fs = require('fs')
const path = require('path')
const { GrindinatorError } = require('./errors.js')

const DEFAULTS = Object.freeze({
  permissionMode: 'bypassPermissions',
  allowedTools: Object.freeze([]),
  model: 'opus',
  effort: 'medium',
  maxTurns: null,
  maxSessionMinutes: 480,
  maxGateMinutes: 60,
  gate: null,
  onFailure: 'stop',
  maxLimitWaits: 3,
  waitWeekly: false,
  preamble: null,
  decidinator: true,
  stopOnOpenQuestions: false
})

const FLAGS = Object.freeze({
  permissionMode: Object.freeze({ option: 'permission-mode', kind: 'string' }),
  allowedTools: Object.freeze({ option: 'allowed-tools', kind: 'list' }),
  model: Object.freeze({ option: 'model', kind: 'string' }),
  effort: Object.freeze({ option: 'effort', kind: 'string' }),
  maxTurns: Object.freeze({ option: 'max-turns', kind: 'integer' }),
  maxSessionMinutes: Object.freeze({ option: 'max-session-minutes', kind: 'integer' }),
  maxGateMinutes: Object.freeze({ option: 'max-gate-minutes', kind: 'integer' }),
  gate: Object.freeze({ option: 'gate', kind: 'string' }),
  onFailure: Object.freeze({ option: 'on-failure', kind: 'string' }),
  maxLimitWaits: Object.freeze({ option: 'max-limit-waits', kind: 'integer' }),
  waitWeekly: Object.freeze({ option: 'wait-weekly', kind: 'flag' }),
  preamble: Object.freeze({ option: 'preamble', kind: 'string' }),
  decidinator: Object.freeze({ option: 'no-decidinator', kind: 'off' }),
  stopOnOpenQuestions: Object.freeze({ option: 'stop-on-open-questions', kind: 'flag' })
})

const PERMISSION_MODES = ['acceptEdits', 'bypassPermissions', 'default']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const ON_FAILURE = ['stop', 'continue']

function userFile(homeDir) {
  return path.join(homeDir, '.claude', 'grindinator.json')
}

function projectFile(projectDir) {
  return path.join(projectDir, '.claude', 'grindinator.json')
}

// Returns null when the value is valid for the key, else the problem text.
function checkKey(key, value) {
  switch (key) {
    case 'permissionMode':
      return PERMISSION_MODES.includes(value)
        ? null
        : '"permissionMode" must be one of acceptEdits, bypassPermissions, default'
    case 'allowedTools':
      return Array.isArray(value) && value.every(v => typeof v === 'string' && v.trim() !== '')
        ? null
        : '"allowedTools" must be an array of non-empty strings'
    case 'model':
      return typeof value === 'string' && value !== '' && !/\s/.test(value)
        ? null
        : '"model" must be a model name with no spaces, such as "opus"'
    case 'effort':
      return EFFORTS.includes(value) ? null : '"effort" must be one of low, medium, high, xhigh, max'
    case 'maxTurns':
      return value === null || (Number.isInteger(value) && value >= 1)
        ? null
        : '"maxTurns" must be null or a whole number of at least 1'
    case 'maxSessionMinutes':
      return Number.isInteger(value) && value >= 1 ? null : '"maxSessionMinutes" must be a whole number of at least 1'
    case 'maxGateMinutes':
      return Number.isInteger(value) && value >= 1 ? null : '"maxGateMinutes" must be a whole number of at least 1'
    case 'gate':
      return value === null || (typeof value === 'string' && value.trim() !== '')
        ? null
        : '"gate" must be null or a non-empty command'
    case 'onFailure':
      return ON_FAILURE.includes(value) ? null : '"onFailure" must be "stop" or "continue"'
    case 'maxLimitWaits':
      return Number.isInteger(value) && value >= 1 ? null : '"maxLimitWaits" must be a whole number of at least 1'
    case 'waitWeekly':
      return typeof value === 'boolean' ? null : '"waitWeekly" must be true or false'
    case 'preamble':
      return value === null || (typeof value === 'string' && value.trim() !== '' && !value.includes('\0'))
        ? null
        : '"preamble" must be null or a non-empty file path'
    case 'decidinator':
      return typeof value === 'boolean' ? null : '"decidinator" must be true or false'
    case 'stopOnOpenQuestions':
      return typeof value === 'boolean' ? null : '"stopOnOpenQuestions" must be true or false'
    default:
      return null
  }
}

function readFile(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return { values: {}, errors: [] }
    return { values: {}, errors: [`${file}: could not be read (${e.code})`] }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { values: {}, errors: [`${file}: is not valid JSON`] }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { values: {}, errors: [`${file}: must hold a JSON object`] }
  }
  return { values: parsed, errors: [] }
}

// node:util parseArgs options for every setting.
function parseArgsOptions() {
  const options = {}
  for (const { option, kind } of Object.values(FLAGS)) {
    options[option] = { type: kind === 'flag' || kind === 'off' ? 'boolean' : 'string' }
  }
  return options
}

// Turns parseArgs values into config keys; validation happens in load.
function fromFlags(values) {
  const out = {}
  for (const [key, { option, kind }] of Object.entries(FLAGS)) {
    if (!Object.hasOwn(values, option) || values[option] === undefined) continue
    const v = values[option]
    if (kind === 'list') {
      out[key] = String(v).split(',').map(s => s.trim()).filter(s => s !== '')
    } else if (kind === 'integer') {
      out[key] = /^[0-9]+$/.test(v) ? Number(v) : v
    } else if (kind === 'flag') {
      out[key] = true
    } else if (kind === 'off') {
      out[key] = false
    } else {
      out[key] = v
    }
  }
  return out
}

function load({ projectDir, homeDir, flags = {} }) {
  const merged = { ...DEFAULTS, allowedTools: [...DEFAULTS.allowedTools] }
  const errors = []
  const files = [userFile(homeDir), projectFile(projectDir)]
  if (path.resolve(files[0]) === path.resolve(files[1])) files.pop()

  for (const file of files) {
    const { values, errors: problems } = readFile(file)
    errors.push(...problems)
    for (const [key, value] of Object.entries(values)) {
      if (!Object.hasOwn(DEFAULTS, key)) {
        errors.push(`${file}: "${key}" is not a Grindinator setting`)
        continue
      }
      const p = checkKey(key, value)
      if (p) {
        errors.push(`${file}: ${p}`)
        continue
      }
      merged[key] = Array.isArray(value) ? [...value] : value
    }
  }

  for (const [key, value] of Object.entries(fromFlags(flags))) {
    const p = checkKey(key, value)
    if (p) {
      errors.push(`--${FLAGS[key].option}: ${p}`)
      continue
    }
    merged[key] = Array.isArray(value) ? [...value] : value
  }
  return { config: merged, errors }
}

function loadStrict(args) {
  const { config, errors } = load(args)
  if (errors.length > 0) {
    throw new GrindinatorError('the configuration is invalid:\n  ' + errors.join('\n  '))
  }
  return config
}

module.exports = {
  DEFAULTS, FLAGS, userFile, projectFile, checkKey, readFile, parseArgsOptions, fromFlags, load, loadStrict
}
