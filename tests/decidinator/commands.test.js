'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const state = require('../../plugins/decidinator/scripts/lib/state.js')
const msg = require('../../plugins/decidinator/scripts/lib/messages.js')
const { DEFAULTS } = require('../../plugins/decidinator/scripts/lib/config.js')
const decisionLog = require('../../plugins/decidinator/scripts/lib/decision-log.js')
const sidecar = require('../../plugins/decidinator/scripts/lib/sidecar.js')

const script = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'commands.js')
let root, data, home, project, saved

beforeEach(() => {
  saved = process.env.CLAUDE_PLUGIN_DATA
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-commands-'))
  data = path.join(root, 'data')
  home = path.join(root, 'home')
  project = path.join(root, 'project')
  for (const d of [data, home, project]) fs.mkdirSync(d)
  process.env.CLAUDE_PLUGIN_DATA = data
})

afterEach(() => {
  if (saved === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = saved
  fs.rmSync(root, { recursive: true, force: true })
})

function spawn(prompt, extra = {}) {
  const env = { ...process.env }
  delete env.DECIDINATOR_MODE
  delete env.DECIDINATOR_DEBUG
  Object.assign(env, {
    CLAUDE_PLUGIN_DATA: data,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_PROJECT_DIR: project
  })
  const input = {
    session_id: 's1',
    cwd: project,
    hook_event_name: 'UserPromptSubmit',
    permission_mode: 'default',
    prompt,
    ...extra
  }
  return spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: 'utf8', env })
}

const configFile = () => path.join(project, '.claude', 'decidinator.json')

function writeConfig(content) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(content))
}

test('arm with no config arms in ask mode by command', () => {
  const r = spawn('/decidinator:arm')
  assert.equal(
    r.stdout,
    'decidinator: armed in ask mode. Questions the oracles cannot settle go to the user. /decidinator:disarm turns it off.\n'
  )
  const a = state.readArming('s1')
  assert.equal(a.mode, 'ask')
  assert.equal(a.by, 'command')
})

test('arm takes the mode from the project config', () => {
  writeConfig({ mode: 'sidecar' })
  const r = spawn('/decidinator:arm')
  assert.equal(r.stdout, msg.armed('sidecar') + '\n')
  assert.equal(state.readArming('s1').mode, 'sidecar')
})

test('arm argument is case-insensitive and trimmed', () => {
  assert.equal(spawn('/decidinator:arm SIDECAR').stdout, msg.armed('sidecar') + '\n')
  assert.equal(state.readArming('s1').mode, 'sidecar')
  state.disarm('s1')
  assert.equal(spawn('  /decidinator:arm sidecar  ').stdout, msg.armed('sidecar') + '\n')
  assert.equal(state.readArming('s1').mode, 'sidecar')
})

test('arm with a bad mode changes nothing', () => {
  const r = spawn('/decidinator:arm loud')
  assert.equal(r.stdout, msg.badMode('loud') + '\n')
  assert.equal(state.readArming('s1'), null)
})

test('arm when already armed reports it; a different mode switches and keeps the flag fields', () => {
  state.arm('s1', 'ask', 'command')
  const before = state.readArming('s1')
  assert.equal(spawn('/decidinator:arm ask').stdout, msg.already('ask') + '\n')
  assert.equal(spawn('/decidinator:arm').stdout, msg.already('ask') + '\n')
  assert.equal(spawn('/decidinator:arm sidecar').stdout, msg.switched('ask', 'sidecar') + '\n')
  const after = state.readArming('s1')
  assert.equal(after.mode, 'sidecar')
  assert.equal(after.armedAt, before.armedAt)
  assert.equal(after.by, before.by)
})

test('invalid config keys are ignored and reported', () => {
  writeConfig({ mode: 'loud', guardMaxBlock: 4 })
  const file = configFile()
  const r = spawn('/decidinator:arm')
  assert.equal(
    r.stdout,
    msg.armed('ask') +
      ` Configuration problems, ignored: ${file}: "mode" must be "ask" or "sidecar"; ${file}: "guardMaxBlock" is not a Decidinator setting.` +
      '\n'
  )
  assert.equal(state.readArming('s1').mode, 'ask')
})

test('a fresh arm prunes old session files', () => {
  const dir = state.sessionsDir()
  fs.mkdirSync(dir, { recursive: true })
  const old = path.join(dir, 'old.json')
  fs.writeFileSync(old, '{}')
  const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
  fs.utimesSync(old, past, past)
  spawn('/decidinator:arm')
  assert.equal(fs.existsSync(old), false)
})

test('disarm removes the flag and the state file', () => {
  state.arm('s1', 'ask', 'command')
  state.write('s1', { a: 1 })
  const r = spawn('/decidinator:disarm')
  assert.equal(r.stdout, msg.DISARMED + '\n')
  assert.equal(state.readArming('s1'), null)
  assert.equal(fs.existsSync(state.fileFor('s1')), false)
  assert.equal(fs.existsSync(state.flagFor('s1')), false)
})

test('disarm when unarmed says so', () => {
  assert.equal(spawn('/decidinator:disarm').stdout, msg.NOT_ARMED + '\n')
})

const zero = msg.statusCounts({ open: 0, unconfirmed: 0 }, DEFAULTS)

test('status reports unarmed, armed by command, armed by env, and config problems', () => {
  assert.equal(spawn('/decidinator:status').stdout, msg.STATUS_UNARMED + zero + '\n')

  state.arm('s1', 'ask', 'command')
  let out = spawn('/decidinator:status').stdout
  assert.equal(out, msg.statusArmed(state.readArming('s1')) + zero + '\n')
  assert.ok(out.includes('/decidinator:arm'))

  state.arm('s1', 'sidecar', 'env')
  out = spawn('/decidinator:status').stdout
  assert.equal(out, msg.statusArmed(state.readArming('s1')) + zero + '\n')
  assert.ok(out.includes('DECIDINATOR_MODE'))

  writeConfig({ mode: 'loud' })
  out = spawn('/decidinator:status').stdout
  assert.ok(out.includes(' Configuration problems, ignored: '))
  assert.ok(out.endsWith('.\n'))
})

test('status counts open sidecar entries and unconfirmed decisions', () => {
  const side = path.join(project, 'docs', 'open-questions.md')
  const log = path.join(project, 'docs', 'decisions.md')
  for (const q of ['Q1?', 'Q2?']) {
    const r = sidecar.append(side, { topic: 'T', question: q, context: 'c', options: [], provisionalAnswer: 'p', dependsOn: [], status: 'open' })
    assert.ok(r.ok, r.error)
  }
  const d = decisionLog.append(log, {
    title: 'T', question: 'Q?', answer: 'A', rationale: 'r', provenance: 'oracle-unconfirmed', confidence: 'low',
    rung: 1, context: 'c', sources: [], assumptions: [], date: '2026-01-01'
  })
  assert.ok(d.ok, d.error)
  const out = spawn('/decidinator:status').stdout
  assert.equal(out, msg.STATUS_UNARMED + msg.statusCounts({ open: 2, unconfirmed: 1 }, DEFAULTS) + '\n')
  assert.ok(out.includes('2 open questions'))
  assert.ok(out.includes('1 unconfirmed decision.'))
})

test('other prompts produce no output', () => {
  for (const p of ['hello', '/decidinator:armed', '/decidinator:reviews', '/planandtier:arm']) {
    assert.equal(spawn(p).stdout, '', p)
  }
  assert.equal(spawn('/decidinator:arm', { agent_id: 'a1' }).stdout, '')
  assert.equal(state.readArming('s1'), null)
})

// --- review, confirm, export and import ---

const walks = require('../../plugins/decidinator/scripts/lib/walks.js')
const Q = require('../../plugins/decidinator/scripts/lib/questions.js')
const exporter = require('../../plugins/decidinator/scripts/lib/export.js')

const sideFile = () => path.join(project, 'docs', 'open-questions.md')
const logFile = () => path.join(project, 'docs', 'decisions.md')
const seedSide = (q) => {
  const r = sidecar.append(sideFile(), { topic: 'Topic', question: 'Q?', context: 'c', options: [], provisionalAnswer: 'P', dependsOn: ['WP-03'], status: 'open', ...q })
  assert.ok(r.ok, r.error)
}
const seedLog = (d) => {
  const r = decisionLog.append(logFile(), { title: 'T', question: 'Q?', answer: 'A', rationale: 'r', context: 'c', confidence: 'high', rung: 1, sources: [], assumptions: [], date: '2026-09-30', ...d })
  assert.ok(r.ok, r.error)
}
const cfg = () => ({ ...DEFAULTS })

test('review, confirm and import unarmed say so and create no state', () => {
  for (const c of ['review', 'confirm', 'import']) {
    assert.equal(spawn(`/decidinator:${c} x.md`, { prompt_id: 'p1' }).stdout, msg.needsArming(c) + '\n')
  }
  assert.equal(fs.existsSync(state.fileFor('s1')), false)
})

test('review needs a prompt ID', () => {
  state.arm('s1', 'ask', 'command')
  seedSide({ question: 'One?' })
  assert.equal(spawn('/decidinator:review').stdout, msg.noPromptId('review') + '\n')
})

test('review stores the walk and the pass-through and prints the calls', () => {
  state.arm('s1', 'ask', 'command')
  seedSide({ question: 'One?', provisionalDecision: 'D-0001' })
  seedSide({ question: 'Two?', provisionalAnswer: 'none: no oracle returned a valid verdict' })
  const r = spawn('/decidinator:review', { prompt_id: 'p1' })
  const side = sidecar.read(sideFile()).model
  const items = walks.reviewItems(side)
  assert.equal(items.length, 2)
  assert.equal(r.stdout, msg.walkReply(msg.reviewHead(2, 0, cfg()), msg.REVIEW_CHOICES, cfg(), walks.calls(items)) + '\n')
  const s = state.read('s1')
  assert.deepEqual(s.passThrough, { by: 'review', promptId: 'p1' })
  assert.equal(s.walk.by, 'review')
  assert.equal(s.walk.promptId, 'p1')
  assert.deepEqual(s.walk.items.map((i) => i.key), ['Q-0001', 'Q-0002'])
  assert.equal(Q.passThroughActive(s, 'p1'), true)
})

test('review caps a walk at 12 questions and says how many wait', () => {
  state.arm('s1', 'ask', 'command')
  for (let n = 1; n <= 14; n++) seedSide({ question: `Question number ${n}?` })
  const r = spawn('/decidinator:review', { prompt_id: 'p1' })
  assert.ok(r.stdout.startsWith(msg.reviewHead(12, 2, cfg())))
  assert.equal(state.read('s1').walk.items.length, 12)
  assert.equal((r.stdout.match(/Call \d of 3:/g) ?? []).length, 3)
})

test('review with nothing open says so and stores nothing', () => {
  state.arm('s1', 'ask', 'command')
  seedSide({ status: 'imported' })
  assert.equal(spawn('/decidinator:review', { prompt_id: 'p1' }).stdout, msg.nothingToReview('docs/open-questions.md') + '\n')
  assert.equal(fs.existsSync(state.fileFor('s1')), false)
})

test('review refuses a sidecar with another version', () => {
  state.arm('s1', 'ask', 'command')
  fs.mkdirSync(path.dirname(sideFile()), { recursive: true })
  fs.writeFileSync(sideFile(), '<!-- decidinator-sidecar v2 -->\n')
  const out = spawn('/decidinator:review', { prompt_id: 'p1' }).stdout
  assert.ok(out.startsWith('decidinator: '))
  assert.ok(out.includes('v2 is not supported'))
  assert.ok(out.endsWith('Nothing changed.\n'))
})

test('confirm lists the unconfirmed decisions, highest impact first', () => {
  state.arm('s1', 'ask', 'command')
  seedLog({ question: 'Low impact?', provenance: 'oracle-unconfirmed' })
  seedLog({ question: 'High impact?', provenance: 'oracle-provisional', sidecar: 'Q-0001' })
  seedSide({ question: 'High impact?', dependsOn: ['a', 'b'], provisionalDecision: 'D-0002' })
  seedLog({ question: 'Binding?', provenance: 'user' })
  const r = spawn('/decidinator:confirm', { prompt_id: 'p2' })
  const items = walks.confirmItems(decisionLog.read(logFile()).model, sidecar.read(sideFile()).model)
  assert.deepEqual(items.map((i) => i.key), ['D-0002', 'D-0001'])
  assert.equal(r.stdout, msg.walkReply(msg.confirmHead(2, 0, cfg()), msg.CONFIRM_CHOICES, cfg(), walks.calls(items)) + '\n')
  const s = state.read('s1')
  assert.deepEqual(s.passThrough, { by: 'confirm', promptId: 'p2' })
  assert.deepEqual(s.walk.items.map((i) => i.key), ['D-0002', 'D-0001'])
})

test('confirm with nothing unconfirmed says so', () => {
  state.arm('s1', 'ask', 'command')
  seedLog({ provenance: 'user' })
  assert.equal(spawn('/decidinator:confirm', { prompt_id: 'p2' }).stdout, msg.nothingToConfirm('docs/decisions.md') + '\n')
})

test('export with no path writes the dated copy of the open entries, armed or not', () => {
  seedSide({ question: 'Open one?' })
  seedSide({ question: 'Done one?', status: 'imported' })
  const date = new Date().toISOString().slice(0, 10)
  const rel = `docs/open-questions-${date}.md`
  assert.equal(spawn('/decidinator:export').stdout, msg.exported(1, 'docs/open-questions.md', rel) + '\n')
  const copy = sidecar.read(path.join(project, rel)).model
  assert.deepEqual(copy.entries.map((e) => e.id), ['Q-0001'])
  assert.deepEqual(copy.marker, { kind: 'sidecar', major: 1 })
})

test('export to an explicit quoted path, and again over its own earlier copy', () => {
  seedSide({ question: 'Open one?' })
  const again = msg.exported(1, 'docs/open-questions.md', 'out dir/copy.md') + '\n'
  assert.equal(spawn('/decidinator:export "out dir/copy.md"').stdout, again)
  assert.ok(fs.existsSync(path.join(project, 'out dir', 'copy.md')))
  assert.equal(spawn('/decidinator:export "out dir/copy.md"').stdout, again)
})

test('export refuses the sidecar, the log, and a file that is not a sidecar copy', () => {
  seedSide({ question: 'Open one?' })
  seedLog({ provenance: 'user' })
  assert.equal(spawn('/decidinator:export docs/open-questions.md').stdout, msg.exportIsOwnFile('docs/open-questions.md', 'the sidecar') + '\n')
  assert.equal(spawn('/decidinator:export docs/decisions.md').stdout, msg.exportIsOwnFile('docs/decisions.md', 'the decision log') + '\n')
  fs.writeFileSync(path.join(project, 'notes.md'), 'my notes\n')
  assert.equal(spawn('/decidinator:export notes.md').stdout, msg.exportWontOverwrite('notes.md') + '\n')
  assert.equal(fs.readFileSync(path.join(project, 'notes.md'), 'utf8'), 'my notes\n')
})

test('export with nothing open says so', () => {
  assert.equal(spawn('/decidinator:export').stdout, msg.nothingToExport('docs/open-questions.md') + '\n')
})

test('the export default path helper matches the command', () => {
  assert.equal(exporter.defaultPath('docs/open-questions.md', '2026-09-30'), 'docs/open-questions-2026-09-30.md')
})

const importer = require('../../plugins/decidinator/scripts/lib/importer.js')

// Exports the open entries, then writes answers (by question ID) into the copy.
function filledCopy(answers) {
  assert.ok(spawn('/decidinator:export in.md').stdout.startsWith('decidinator: exported'))
  const file = path.join(project, 'in.md')
  let text = fs.readFileSync(file, 'utf8')
  for (const [id, a] of Object.entries(answers)) {
    const at = text.indexOf(`### ${id} `)
    const line = text.indexOf('- **Answer:**', at)
    text = text.slice(0, line) + `- **Answer:** ${a}` + text.slice(line + '- **Answer:**'.length)
  }
  fs.writeFileSync(file, text)
}

test('import refuses a file without the sidecar marker, with another version, or with no answers', () => {
  state.arm('s1', 'ask', 'command')
  seedSide({ question: 'One?' })
  const before = fs.readFileSync(sideFile(), 'utf8')
  fs.writeFileSync(path.join(project, 'plain.md'), '# notes\n')
  assert.equal(spawn('/decidinator:import plain.md').stdout, msg.importNoMarker('plain.md') + '\n')
  fs.writeFileSync(path.join(project, 'v2.md'), '<!-- decidinator-sidecar v2 -->\n')
  assert.equal(spawn('/decidinator:import v2.md').stdout, msg.importVersion('v2.md', 2) + '\n')
  fs.writeFileSync(path.join(project, 'log.md'), '<!-- decidinator-log v1 -->\n')
  assert.equal(spawn('/decidinator:import log.md').stdout, msg.importNoMarker('log.md') + '\n')
  assert.equal(spawn('/decidinator:import missing.md').stdout, msg.importMissing('missing.md') + '\n')
  assert.equal(spawn('/decidinator:import').stdout, msg.IMPORT_USAGE + '\n')
  filledCopy({})
  assert.equal(spawn('/decidinator:import in.md').stdout, msg.importNoAnswers('in.md') + '\n')
  assert.equal(fs.readFileSync(sideFile(), 'utf8'), before)
  assert.equal(fs.existsSync(logFile()), false)
})

test('import of an answer identical to the provisional one is confirmed without an oracle call', () => {
  state.arm('s1', 'ask', 'command')
  seedLog({ question: 'One?', answer: 'Use Postgres.', provenance: 'oracle-provisional', questionId: 'Q-0001', sidecar: 'Q-0001' })
  seedSide({ question: 'One?', provisionalAnswer: 'Use Postgres.', provisionalDecision: 'D-0001' })
  filledCopy({ 'Q-0001': 'use postgres' })
  const out = spawn('/decidinator:import in.md', { prompt_id: 'p1' }).stdout
  assert.ok(out.includes('Confirmed (1):\n- Q-0001 → D-0002 (supersedes D-0001): same as the provisional answer.'))
  assert.equal(out.includes('Agent'), false)
  assert.equal(out.includes('Waiting'), false)
  assert.equal(state.read('s1')?.importJob ?? null, null)
  const d = decisionLog.read(logFile()).model.entries.map((e) => e.decision)
  assert.equal(d[1].provenance, 'stakeholder')
  assert.equal(d[1].answer, 'use postgres')
  assert.equal(d[0].supersededBy, 'D-0002')
  assert.equal(sidecar.read(sideFile()).model.entries[0].question.status, 'imported')
})

test('import of a different answer waits for an oracle judgment and stores the job', () => {
  state.arm('s1', 'ask', 'command')
  seedLog({ question: 'One?', answer: 'Use Postgres.', provenance: 'oracle-provisional', questionId: 'Q-0001', sidecar: 'Q-0001' })
  seedSide({ question: 'One?', provisionalAnswer: 'Use Postgres.', provisionalDecision: 'D-0001' })
  filledCopy({ 'Q-0001': 'Use MySQL' })
  const out = spawn('/decidinator:import in.md', { prompt_id: 'p1' }).stdout
  assert.ok(out.includes('Waiting for oracle judgment (1):\n- Q-0001 → D-0002 (supersedes D-0001)'))
  assert.equal((out.match(/subagent_type: decidinator:oracle-1/g) ?? []).length, 1)
  assert.ok(out.includes('Decidinator question Q-0001\nRung: 1'))
  const job = state.read('s1').importJob
  assert.equal(job.items[0].cls, 'waiting')
  assert.equal(job.items[0].dispatched, false)
  assert.equal(importer.stopStep(job), 'remind')
})

test('import reports an entry that is already imported as skipped', () => {
  state.arm('s1', 'ask', 'command')
  seedSide({ question: 'One?' })
  seedSide({ question: 'Two?' })
  filledCopy({ 'Q-0001': 'X', 'Q-0002': 'Y' })
  sidecar.setStatus(sideFile(), 'Q-0002', 'imported')
  const out = spawn('/decidinator:import in.md', { prompt_id: 'p1' }).stdout
  assert.ok(out.includes('Skipped (1):\n- Q-0002: already imported in docs/open-questions.md.'))
  assert.ok(out.includes('Changed (1):\n- Q-0001 → D-0001: no provisional answer to compare. Depends on: WP-03.'))
})
