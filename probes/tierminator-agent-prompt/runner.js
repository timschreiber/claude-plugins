// Runs the tierminator-agent-prompt probe: headless claude sessions with hooks from --settings only (no user
// settings, so no installed plugin loads). The main session makes one Agent call whose prompt tells the subagent to
// reply APPLE; a PreToolUse hook on Agent appends a line that tells it to reply PINEAPPLE instead. See hook.js.
//
//   node probes/tierminator-agent-prompt/runner.js [cell ...]   run those cells (default all), print one line each
//   node probes/tierminator-agent-prompt/runner.js --list       print the cell names, one per line
//   node probes/tierminator-agent-prompt/runner.js --check      read the evidence file; exit 1 on a failed cell
//
// Evidence: probes/evidence/tierminator-agent-prompt-results.json. A run of selected cells replaces only those
// cells of an existing file. Sessions are persisted (no --no-session-persistence), because the SubagentStop hook
// reads the subagent's transcript.
'use strict'
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const HOOK = path.join(__dirname, 'hook.js').replace(/\\/g, '/')
const EVIDENCE = path.join(__dirname, '..', 'evidence', 'tierminator-agent-prompt-results.json')

const entry = role => ({ type: 'command', command: `node "${HOOK}" ${role}` })
const settingsFor = inject => {
  const s = { hooks: { PostToolUse: [{ matcher: 'Agent', hooks: [entry('post')] }], SubagentStop: [{ hooks: [entry('stop')] }] } }
  if (inject) s.hooks.PreToolUse = [{ matcher: 'Agent', hooks: [entry(`inject ${inject}`)] }]
  return s
}

const call = (description, prompt, before = '') =>
  `${before}Call the Agent tool exactly once with subagent_type "general-purpose", description "${description}", and ` +
  `this exact prompt: "${prompt}" Then reply with exactly what the subagent returned and nothing else.`
// contra cells: the pointer asks for APPLE; the contra hook's line asks for PINEAPPLE.
const CONTRA = call('probe', 'PROBE_POINTER Reply with exactly the word APPLE and nothing else.')
// consistent cells: the pointer names a task whose text the consistent hook adds; no text asks for APPLE.
const POINTER = 'PROBE_POINTER Task: T01. The text of task T01 follows this line; do exactly what it says.'
const BARE = call('T01', POINTER)
const TOLD = call('T01', POINTER, 'A PreToolUse hook in this session adds the full text of task T01 to the prompt of that Agent call, after its last line. ')

const cell = (name, prompt, inject, mode, expect, extra = {}) => ({ name, prompt, inject, mode, tools: null, expect, ...extra })
const CELLS = [
  cell('n0', CONTRA, null, 'bypassPermissions', 'apple'),
  cell('i1', CONTRA, 'contra', 'bypassPermissions', 'info'),
  cell('i2', CONTRA, 'contra', 'manual', 'info', { tools: 'Agent' }),
  cell('i3', CONTRA, 'contra', 'auto', 'info'),
  cell('c1', BARE, 'consistent', 'bypassPermissions', 'pineapple'),
  cell('c2', BARE, 'consistent', 'manual', 'pineapple', { tools: 'Agent' }),
  ...['a', 'b', 'c'].map(x => cell('c3' + x, BARE, 'consistent', 'auto', 'pineapple')),
  ...['a', 'b', 'c'].map(x => cell('c4' + x, TOLD, 'consistent', 'auto', 'pineapple')),
]

const readEvidence = () => {
  try { return JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')) } catch { return null }
}

const runCell = (c, dir) => {
  const log = path.join(dir, `log-${c.name}.jsonl`)
  const settingsFile = path.join(dir, `settings-${c.name}.json`)
  fs.writeFileSync(settingsFile, JSON.stringify(settingsFor(c.inject)))
  const permission = c.tools ? ['--permission-mode', c.mode, '--allowedTools', c.tools] : ['--permission-mode', c.mode]
  const started = Date.now()
  const res = spawnSync(
    'claude',
    ['-p', c.prompt, '--model', 'haiku', ...permission, '--setting-sources', 'project', '--settings', settingsFile,
      '--output-format', 'stream-json', '--verbose', '--max-turns', '6'],
    { cwd: path.join(dir, 'work'), encoding: 'utf8', env: { ...process.env, PROBE_LOG: log }, timeout: 300000, maxBuffer: 64 * 1024 * 1024 }
  )
  const stdout = String(res.stdout ?? '')

  let claudeSessionId = null
  let finalText = null
  const agentCalls = []
  const agentIds = new Set()
  const agentResults = []
  for (const l of stdout.split('\n')) {
    let o
    try { o = JSON.parse(l) } catch { continue }
    if (o.type === 'system' && o.subtype === 'init' && !claudeSessionId) claudeSessionId = o.session_id ?? null
    if (o.type === 'result') finalText = String(o.result ?? '').slice(0, 400)
    const content = o.message?.content
    if (o.parent_tool_use_id || !Array.isArray(content)) continue
    for (const b of content) {
      if (o.type === 'assistant' && b.type === 'tool_use' && b.name === 'Agent') {
        agentCalls.push(String(b.input?.prompt ?? ''))
        agentIds.add(b.id)
      }
      if (o.type === 'user' && b.type === 'tool_result' && agentIds.has(b.tool_use_id)) {
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
        agentResults.push({ isError: !!b.is_error, text: text.slice(0, 600) })
      }
    }
  }

  const hookLog = []
  if (fs.existsSync(log)) {
    for (const l of fs.readFileSync(log, 'utf8').split('\n')) {
      if (!l.trim()) continue
      try { hookLog.push(JSON.parse(l)) } catch {}
    }
  }
  const stop = hookLog.find(h => h.role === 'stop')
  const post = hookLog.find(h => h.role === 'post')
  const facts = {
    modelCallHadInjected: agentCalls.some(p => p.includes('PROBE_INJECTED')),
    subagentFirstMessageHasInjected: !!stop?.firstUser?.includes('PROBE_INJECTED'),
    subagentFirstMessageHasPointer: !!stop?.firstUser?.includes('PROBE_POINTER'),
    postToolUsePromptHasInjected: !!post?.prompt?.includes('PROBE_INJECTED'),
    subagentRan: !!stop,
    agentCallErrored: agentResults.some(r => r.isError),
    subagentReplied: /PINEAPPLE/.test(stop?.last ?? '') ? 'PINEAPPLE' : /APPLE/.test(stop?.last ?? '') ? 'APPLE' : null,
  }
  let pass = null
  if (c.expect === 'apple') pass = facts.subagentReplied === 'APPLE' && !facts.subagentFirstMessageHasInjected
  else if (c.expect === 'pineapple') {
    pass = facts.subagentReplied === 'PINEAPPLE' && facts.subagentFirstMessageHasInjected && !facts.modelCallHadInjected
  }

  const out = {
    name: c.name, expect: c.expect, inject: c.inject, mode: c.mode, tools: c.tools, prompt: c.prompt,
    durationS: Math.round((Date.now() - started) / 1000), exit: res.status, claudeSessionId,
    agentCalls: agentCalls.map(p => p.slice(0, 300)), agentResults, finalText, facts, hookLog, pass,
  }
  if (res.error) out.error = res.error.message
  return out
}

const line = r => `${r.name} expect=${r.expect} pass=${r.pass} ${r.durationS}s exit=${r.exit} ${JSON.stringify(r.facts)}`

const main = () => {
  const args = process.argv.slice(2)
  const names = CELLS.map(c => c.name)

  if (args.includes('--list')) {
    for (const n of names) console.log(n)
    return 0
  }

  if (args.includes('--check')) {
    const ev = readEvidence()
    if (!ev || !ev.cells) { console.log('no evidence file ' + EVIDENCE); return 1 }
    let bad = false
    for (const n of names) {
      const r = ev.cells.find(x => x.name === n)
      if (!r) { console.log(n + ' missing'); bad = true; continue }
      if (r.pass === false) { console.log(line(r)); bad = true }
    }
    return bad ? 1 : 0
  }

  const wanted = args.length ? args : names
  const unknown = wanted.filter(n => !names.includes(n))
  if (unknown.length) { console.error('unknown cell: ' + unknown.join(', ')); return 2 }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-agent-prompt-'))
  const results = []
  try {
    fs.mkdirSync(path.join(dir, 'work'), { recursive: true })
    for (const c of CELLS) {
      if (!wanted.includes(c.name)) continue
      const r = runCell(c, dir)
      results.push(r)
      console.log(line(r))
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }

  const v = spawnSync('claude', ['--version'], { encoding: 'utf8' })
  const claudeVersion = String(v.stdout ?? '').trim()
  const prev = readEvidence()
  const kept = (prev?.cells ?? []).filter(x => !wanted.includes(x.name))
  const cells = [...kept, ...results].sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name))
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true })
  fs.writeFileSync(EVIDENCE, JSON.stringify({ probe: 'tierminator-agent-prompt', date: new Date().toISOString(), claudeVersion, cells }, null, 2) + '\n')
  return 0
}

process.exitCode = main()
