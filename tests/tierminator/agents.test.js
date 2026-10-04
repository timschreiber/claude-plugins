'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { TIERS, MAX_TURNS } = require('../../plugins/tierminator/scripts/lib/tasks.js')

const DIR = path.join(__dirname, '..', '..', 'plugins', 'tierminator', 'agents')

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
    assert.equal(Number(fields.maxTurns), MAX_TURNS[tier], tier)
    assert.deepEqual(fields.disallowedTools.split(',').map(s => s.trim()).sort(), ['Agent', 'Workflow'])
    assert.match(fields.description, /tierminator/)
  }
})

test('the sonnet bodies match each other and the opus bodies match each other, each with the report block and a trailer commit', () => {
  const sonnet = TIERS.filter(t => t.startsWith('sonnet-'))
  const opus = TIERS.filter(t => t.startsWith('opus-'))
  for (const group of [sonnet, opus]) {
    const first = read(group[0]).body
    for (const t of group) assert.equal(read(t).body, first, `${t} differs from ${group[0]}`)
  }
  for (const tier of TIERS) {
    const body = read(tier).body
    assert.match(body, /Tasks file:/, tier)
    assert.match(body, /git commit -m "<the task's title>" -m "Tierminator-Task: <the task's id>" -m "Tierminator-Plan: <the Plan: line's id>"/, tier)
    assert.match(body, /`Plan:` line/, tier)
    assert.match(body, /STATUS: DONE \| FAILED\nCOMMIT: .*\nVERIFY: .*\nNOTE: /, tier)
    assert.match(body, /Never push/, tier)
    assert.ok(body.startsWith('You execute one task'), `${tier} opening line`)
    assert.ok(!body.includes('You make no design decisions'), tier)
  }
  assert.ok(read(sonnet[0]).body.includes("don't choose"))
  assert.ok(read(opus[0]).body.includes('Make routine judgment calls yourself'))
  assert.ok(read(opus[0]).body.includes('The files it names are a starting point, not a limit'))
  assert.ok(read(opus[0]).body.includes("Name each file the task didn't list, and why, in NOTE."))
  assert.ok(!read(opus[0]).body.includes('Stay within the task'))
  assert.ok(!read(sonnet[0]).body.includes('starting point, not a limit'))
})
