// Oracle verdict blocks: find the last fenced `decidinator-verdict` block in a reply, validate every
// field against the spec, and return the spec's fallback (unresolved, low) with the reason when the
// block is missing or invalid, so a bad reply escalates instead of stalling. Never throws.
'use strict'

const KINDS = ['researchable', 'human-only']
const STATUSES = ['resolved', 'unresolved']
const CONFIDENCES = ['high', 'medium', 'low']
const FLAGS = ['spec-silent', 'spec-contradiction', 'cross-cutting', 'conflicts-binding']

const OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/

// Returns the bodies of the fences whose info string is exactly `decidinator-verdict`, in order.
// A fence nested inside another fence (for example a ```markdown example) is not a block.
function extractBlocks(text) {
  const blocks = []
  let open = null
  for (const line of String(text).split(/\r?\n/)) {
    if (open === null) {
      const m = OPEN_RE.exec(line)
      if (m) open = { char: m[1][0], size: m[1].length, info: m[2].trim(), body: [] }
      continue
    }
    const close = new RegExp(`^ {0,3}\\${open.char}{${open.size},}\\s*$`)
    if (close.test(line)) {
      if (open.info === 'decidinator-verdict') blocks.push(open.body.join('\n'))
      open = null
    } else {
      open.body.push(line)
    }
  }
  if (open !== null && open.info === 'decidinator-verdict') blocks.push(open.body.join('\n'))
  return blocks
}

function fallback(expected = {}) {
  return {
    question_id: expected.questionId ?? null,
    rung: expected.rung ?? null,
    kind: 'researchable',
    status: 'unresolved',
    answer: '',
    rationale: '',
    options: [],
    sources: [],
    assumptions: [],
    confidence: 'low',
    flags: [],
    duplicate_of: null
  }
}

const isText = (v) => typeof v === 'string' && v.trim() !== ''
const isTextArray = (v) => Array.isArray(v) && v.every(isText)

// Returns {ok:true, verdict} or {ok:false, reason, verdict: fallback}.
function parseVerdict(reply, expected = {}) {
  const fail = (reason) => ({ ok: false, reason, verdict: fallback(expected) })
  if (typeof reply !== 'string') return fail('no reply text')
  const blocks = extractBlocks(reply)
  if (blocks.length === 0) return fail('no decidinator-verdict block')
  let v
  try {
    v = JSON.parse(blocks[blocks.length - 1])
  } catch {
    return fail('verdict block is not valid JSON')
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return fail('verdict block is not a JSON object')

  if (typeof v.question_id !== 'string' || !/^Q-\d{4,}$/.test(v.question_id)) {
    return fail('"question_id" must be a question ID such as Q-0007')
  }
  if (expected.questionId !== undefined && v.question_id !== expected.questionId) {
    return fail(`"question_id" is ${v.question_id}, expected ${expected.questionId}`)
  }
  if (!Number.isInteger(v.rung) || v.rung < 1) return fail('"rung" must be a whole number of at least 1')
  if (expected.rung !== undefined && v.rung !== expected.rung) return fail(`"rung" is ${v.rung}, expected ${expected.rung}`)
  if (!KINDS.includes(v.kind)) return fail('"kind" must be "researchable" or "human-only"')
  if (!STATUSES.includes(v.status)) return fail('"status" must be "resolved" or "unresolved"')
  if (!isText(v.answer)) return fail('"answer" must be a non-empty string')
  if (!isText(v.rationale)) return fail('"rationale" must be a non-empty string')

  const options = v.options === undefined ? [] : v.options
  const optionsOk = Array.isArray(options) &&
    options.every((o) => o !== null && typeof o === 'object' && !Array.isArray(o) && isText(o.label) && typeof o.tradeoffs === 'string')
  if (!optionsOk) return fail('"options" must be an array of {label, tradeoffs} objects')
  if (v.status === 'unresolved' && options.length === 0) {
    return fail('"options" must list at least one option when "status" is "unresolved"')
  }

  const sources = v.sources === undefined ? [] : v.sources
  if (!isTextArray(sources)) return fail('"sources" must be an array of non-empty strings')
  const assumptions = v.assumptions === undefined ? [] : v.assumptions
  if (!isTextArray(assumptions)) return fail('"assumptions" must be an array of non-empty strings')

  if (!CONFIDENCES.includes(v.confidence)) return fail('"confidence" must be "high", "medium" or "low"')

  const flags = v.flags === undefined ? [] : v.flags
  if (!Array.isArray(flags) || !flags.every((f) => FLAGS.includes(f))) {
    return fail(`"flags" may only contain ${FLAGS.map((f) => `"${f}"`).join(', ')}`)
  }

  const dup = v.duplicate_of === undefined || v.duplicate_of === null ? null : v.duplicate_of
  if (dup !== null && !(typeof dup === 'string' && /^[DQ]-\d{4,}$/.test(dup))) {
    return fail('"duplicate_of" must be a D- or Q- ID such as D-0003')
  }

  return {
    ok: true,
    verdict: {
      question_id: v.question_id,
      rung: v.rung,
      kind: v.kind,
      status: v.status,
      answer: v.answer,
      rationale: v.rationale,
      options: options.map((o) => ({ label: o.label, tradeoffs: o.tradeoffs })),
      sources: [...sources],
      assumptions: [...assumptions],
      confidence: v.confidence,
      flags: [...new Set(flags)],
      duplicate_of: dup
    }
  }
}

module.exports = { KINDS, STATUSES, CONFIDENCES, FLAGS, extractBlocks, fallback, parseVerdict }
