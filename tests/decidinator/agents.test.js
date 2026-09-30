'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const vd = require('../../plugins/decidinator/scripts/lib/verdict.js')

const AGENTS = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'agents')
const RUNGS = [
  { file: 'oracle-1.md', name: 'oracle-1', model: 'claude-opus-5-5', effort: 'high' },
  { file: 'oracle-2.md', name: 'oracle-2', model: 'claude-opus-5-5', effort: 'xhigh' },
  { file: 'oracle-3.md', name: 'oracle-3', model: 'claude-fable-5-1', effort: 'high' }
]
const DISALLOWED = 'Edit, Write, NotebookEdit, AskUserQuestion, Agent'

// Splits an agent file into its frontmatter fields and its prompt body (everything after the closing ---).
function readAgent(file) {
  const text = fs.readFileSync(path.join(AGENTS, file), 'utf8').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  assert.ok(m, `${file} has no frontmatter`)
  const fields = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { fields, body: m[2] }
}

test('the three oracle agents share an identical prompt body', () => {
  const bodies = RUNGS.map((r) => readAgent(r.file).body)
  for (let i = 1; i < bodies.length; i++) {
    assert.equal(bodies[i], bodies[0], `${RUNGS[i].file} prompt body differs from ${RUNGS[0].file}`)
  }
})

test('each oracle has its rung model and effort, 30 turns, and the read-only tool denials', () => {
  for (const r of RUNGS) {
    const { fields } = readAgent(r.file)
    assert.equal(fields.name, r.name, r.file)
    assert.equal(fields.model, r.model, r.file)
    assert.equal(fields.effort, r.effort, r.file)
    assert.equal(fields.maxTurns, '30', r.file)
    assert.equal(fields.disallowedTools, DISALLOWED, r.file)
  }
})

test('the example verdict block in the prompt body is valid', () => {
  const r = vd.parseVerdict(readAgent(RUNGS[0].file).body, { questionId: 'Q-0007', rung: 1 })
  assert.equal(r.ok, true, r.reason)
})
