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
    assert.equal(fields.model, tier.startsWith('haiku-') ? 'claude-haiku-5-5' : model, tier)
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
    assert.match(body, /No line before this block may start with `STATUS:`, `COMMIT:`, `VERIFY:` or `NOTE:`/, tier)
    assert.match(body, /Never push/, tier)
    assert.match(body, /never through the shell: no heredocs/, tier)
    assert.ok(body.startsWith('You execute one task'), `${tier} opening line`)
    assert.ok(!body.includes('You make no design decisions'), tier)
  }
  const haikuBody = read('haiku-high').body
  assert.ok(haikuBody.includes("run the task's `Verify:` step exactly as written"))
  const start = haikuBody.indexOf('## Check your work')
  assert.ok(start >= 0)
  assert.equal(haikuBody.slice(0, start) + haikuBody.slice(haikuBody.indexOf('## Commit')), read('sonnet-medium').body)
  assert.ok(read(sonnet[0]).body.includes("don't choose"))
  assert.ok(read(opus[0]).body.includes('Make routine judgment calls yourself'))
  assert.ok(read(opus[0]).body.includes('The files it names are a starting point, not a limit'))
  assert.ok(read(opus[0]).body.includes("Name each file the task didn't list, and why, in NOTE."))
  assert.ok(!read(opus[0]).body.includes('Stay within the task'))
  assert.ok(!read(sonnet[0]).body.includes('starting point, not a limit'))
})

const PARALLEL = [
  '## Parallel',
  '',
  'When your message has a `Parallel: yes` line, you work in a Git worktree that was made for you, not in the directory your shell starts in. The `Worktree:` line gives its absolute path in drive-letter form (`C:/...`); WT is that path. The `Tasks file:` path is outside the worktree: read it with the Read tool, as given.',
  '',
  "- First run the `setup` commands, if the tasks file's top-level object has a `setup` list: one at a time, in order, each as a Bash command that starts with `cd \"<WT>\" && `. Stop at the first one that fails: don't do the task and don't commit. End with `STATUS: FAILED`, `COMMIT: NONE`, `VERIFY: NOT RUN` and a NOTE that starts with `SETUP FAILED:` and names the command and its error.",
  "- Your shell forgets any `cd` as soon as a command ends. Start every Bash command with `cd \"<WT>\" && ` followed by the command. Use the Bash tool for every command, never PowerShell.",
  '- Every Write, Edit and Read call takes an absolute path that starts with WT (the tasks file is the one exception). Every Glob and Grep call passes `path` set to WT; without it they search the main tree.',
  '- Never build a path from `pwd` output: it prints `/tmp/...` forms that the file tools resolve to the wrong place.',
  '- The branch checked out in WT is already yours: commit there, and never switch branches or leave WT.',
  '',
].join('\n')

test('every agent has the same Parallel section after its Rules', () => {
  for (const tier of TIERS) {
    const body = read(tier).body
    assert.ok(body.includes(PARALLEL), tier)
    const next = tier === 'haiku-high' ? '## Check your work' : '## Commit'
    const rules = body.indexOf('## Rules')
    const par = body.indexOf('## Parallel')
    assert.ok(rules >= 0 && rules < par, tier)
    assert.ok(par < body.indexOf(next), tier)
    assert.ok(body.includes('SETUP FAILED:'), tier)
    assert.ok(body.includes('cd "<WT>" && '), tier)
  }
})
