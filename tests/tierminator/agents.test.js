'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { TIERS } = require('../../plugins/tierminator/scripts/lib/tasks.js')

const DIR = path.join(__dirname, '..', '..', 'plugins', 'tierminator', 'agents')
const TURNS = { low: 30, medium: 40, high: 60 }

// {fields, body} from an agent file: simple "key: value" frontmatter between --- lines.
function read(tier) {
  const text = fs.readFileSync(path.join(DIR, `${tier}.md`), 'utf8').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/.exec(text)
  assert.ok(m, `${tier}.md: frontmatter, then a blank line, then the body`)
  const fields = Object.fromEntries(m[1].split('\n').map(l => {
    const i = l.indexOf(':')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }))
  return { fields, body: m[2] }
}

test('there is exactly one agent per tier, and no other agent', () => {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.md')).sort()
  assert.deepEqual(files, TIERS.map(t => `${t}.md`).sort())
})

test('each agent runs its tier: name, model, effort, maxTurns and no nested agents', () => {
  for (const tier of TIERS) {
    const [model, effort] = tier.split('-')
    const { fields } = read(tier)
    assert.equal(fields.name, tier)
    assert.equal(fields.model, model, tier)
    assert.equal(fields.effort, effort, tier)
    assert.equal(Number(fields.maxTurns), TURNS[effort], tier)
    assert.deepEqual(fields.disallowedTools.split(',').map(s => s.trim()).sort(), ['Agent', 'Workflow'])
    assert.match(fields.description, /tierminator/)
  }
})

test('all the agents share one body, which asks for the report block and a trailer commit', () => {
  const bodies = TIERS.map(t => read(t).body)
  for (const [i, body] of bodies.entries()) assert.equal(body, bodies[0], `${TIERS[i]} differs from ${TIERS[0]}`)
  const body = bodies[0]
  assert.match(body, /Tasks file:/)
  assert.match(body, /git commit -m "<the task's title>" -m "Tierminator-Task: <the task's id>" -m "Tierminator-Plan: <the Plan: line's id>"/)
  assert.match(body, /`Plan:` line/)
  assert.match(body, /STATUS: DONE \| FAILED\nCOMMIT: .*\nVERIFY: .*\nNOTE: /)
  assert.match(body, /Never push/)
})
