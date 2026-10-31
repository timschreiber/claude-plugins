// Runs the tierminator-bash-timeout probe: headless claude sessions with hooks from --settings only (no user
// settings, so no installed plugin loads), a slow Bash command (8 s) that a hook gives a 3 s timeout, in the
// main session and in a subagent. See hook.js for the hook roles.
//
//   node probes/tierminator-bash-timeout/runner.js [cell ...]   run those cells (default all), print one line each
//   node probes/tierminator-bash-timeout/runner.js --list       print the cell names, one per line
//   node probes/tierminator-bash-timeout/runner.js --check      read the evidence file; exit 1 on a failed cell
//
// Evidence: probes/evidence/tierminator-bash-timeout-results.json. A run of selected cells replaces only those
// cells of an existing file.
'use strict'
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const HOOK = path.join(__dirname, 'hook.js').replace(/\\/g, '/')
const EVIDENCE = path.join(__dirname, '..', 'evidence', 'tierminator-bash-timeout-results.json')
const CMD = 'node -e "setTimeout(()=>console.log(\'SLOWDONE\'),8000)" # PROBE_TIMEOUT'

const entry = role => ({ type: 'command', command: `node "${HOOK}" ${role}` })
const settingsFor = (roles, env) => {
  const pre = roles.filter(r => r !== 'log').map(entry)
  const s = { hooks: {} }
  if (env) s.env = env
  if (pre.length) s.hooks.PreToolUse = [{ matcher: 'Bash', hooks: pre }]
  if (roles.includes('log')) s.hooks.PostToolUse = [{ matcher: 'Bash', hooks: [entry('log')] }]
  return s
}

const MAIN = `Run this exact Bash command with the Bash tool, do not change it, and then reply with exactly the text of the tool result and nothing else:\n${CMD}`
const SUB = `Call the Agent tool exactly once with subagent_type "general-purpose" and this prompt: "Run this exact Bash command with the Bash tool, do not change it, and reply with exactly the text of the tool result and nothing else:\n${CMD}". Then reply with exactly what the subagent returned.`

const cell = (name, prompt, roles, expect, extra = {}) => ({ name, prompt, roles, env: null, mode: 'bypassPermissions', tools: null, expect, ...extra })
const CELLS = [
  cell('r0', MAIN, [], 'completes'),
  cell('r1', MAIN, ['timeout'], 'backgrounded'),
  cell('r2', SUB, ['timeout'], 'backgrounded'),
  ...['a', 'b', 'c'].map(x => cell('r3' + x, MAIN, ['timeout', 'rewrite'], 'info')),
  ...['a', 'b', 'c'].map(x => cell('r4' + x, MAIN, ['rewrite', 'timeout'], 'info')),
  cell('r5', MAIN, [], 'backgrounded', { env: { BASH_DEFAULT_TIMEOUT_MS: '3000' } }),
  cell('r6', SUB, [], 'backgrounded', { env: { BASH_DEFAULT_TIMEOUT_MS: '3000' } }),
  cell('r7', MAIN, ['timeout'], 'backgrounded', { mode: 'default', tools: 'Bash,Agent' }),
  cell('r8', SUB, ['timeout'], 'backgrounded', { mode: 'default', tools: 'Bash,Agent' }),
  cell('r9', MAIN, ['deny', 'timeout'], 'denied'),
]

const readEvidence = () => {
  try { return JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')) } catch { return null }
}

const runCell = (c, dir) => {
  const roles = [...c.roles, 'log']
  const log = path.join(dir, `log-${c.name}.jsonl`)
  const settingsFile = path.join(dir, `settings-${c.name}.json`)
  fs.writeFileSync(settingsFile, JSON.stringify(settingsFor(roles, c.env)))
  const permission = c.tools ? ['--permission-mode', c.mode, '--allowedTools', c.tools] : ['--permission-mode', c.mode]
  const started = Date.now()
  const res = spawnSync(
    'claude',
    ['-p', c.prompt, '--model', 'haiku', ...permission, '--setting-sources', 'project', '--settings', settingsFile,
      '--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--max-turns', '8'],
    { cwd: path.join(dir, 'work'), encoding: 'utf8', env: { ...process.env, PROBE_LOG: log }, timeout: 300000, maxBuffer: 64 * 1024 * 1024 }
  )
  const stdout = String(res.stdout ?? '')
  fs.writeFileSync(path.join(dir, `stream-${c.name}.jsonl`), stdout)

  let claudeSessionId = null
  const all = []
  for (const line of stdout.split('\n')) {
    let o
    try { o = JSON.parse(line) } catch { continue }
    if (o.type === 'system' && o.subtype === 'init' && !claudeSessionId) claudeSessionId = o.session_id ?? null
    const content = o.message?.content
    if (o.type !== 'user' || !Array.isArray(content)) continue
    for (const b of content) {
      if (b.type !== 'tool_result') continue
      const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
      all.push({ sub: !!o.parent_tool_use_id, text })
    }
  }
  const toolResults = all
    .filter(r => /SLOWDONE|REWRITTEN|PROBE_DENY|timeout|background/i.test(r.text))
    .map(r => ({ sub: r.sub, text: r.text.replace(/\s+/g, ' ').slice(0, 300) }))

  let hookLog = []
  if (fs.existsSync(log)) {
    for (const l of fs.readFileSync(log, 'utf8').split('\n')) {
      if (!l.trim()) continue
      try { hookLog.push(JSON.parse(l)) } catch {}
    }
  }

  const some = re => all.some(r => re.test(r.text))
  let pass = null
  if (c.expect === 'completes') pass = some(/SLOWDONE/) && !some(/moved to the background/)
  else if (c.expect === 'backgrounded') {
    pass = some(/3s timeout and was moved to the background/)
    if (c.prompt === SUB) pass = pass && hookLog.some(h => h.agent_id != null)
  } else if (c.expect === 'denied') pass = some(/PROBE_DENY/) && !some(/SLOWDONE/)

  const out = {
    name: c.name, expect: c.expect, roles, env: c.env, mode: c.mode, sub: c.prompt === SUB,
    durationS: Math.round((Date.now() - started) / 1000), exit: res.status, claudeSessionId,
    toolResults, hookLog, pass,
  }
  if (res.error) out.error = res.error.message
  if (hookLog.length) out.sessionIdMatches = hookLog.every(h => h.session_id === claudeSessionId)
  if (/^r[34]/.test(c.name)) {
    const post = hookLog.find(h => h.event === 'PostToolUse')
    out.winner = !post ? 'unknown'
      : String(post.cmdHead ?? '').startsWith('echo REWRITTEN') ? 'rewrite'
      : post.timeout === 3000 ? 'timeout' : 'unknown'
  }
  return out
}

const line = r =>
  `${r.name} expect=${r.expect} pass=${r.pass} ${r.durationS}s exit=${r.exit}` +
  (r.winner ? ` winner=${r.winner}` : '') +
  (r.sessionIdMatches === false ? ' SESSION-ID-MISMATCH' : '')

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
      if (r.pass === false || r.sessionIdMatches === false) { console.log(line(r)); bad = true }
    }
    return bad ? 1 : 0
  }

  const wanted = args.length ? args : names
  const unknown = wanted.filter(n => !names.includes(n))
  if (unknown.length) { console.error('unknown cell: ' + unknown.join(', ')); return 2 }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-bash-timeout-'))
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
  fs.writeFileSync(EVIDENCE, JSON.stringify({ probe: 'tierminator-bash-timeout', date: new Date().toISOString(), claudeVersion, cells }, null, 2) + '\n')
  return 0
}

process.exitCode = main()
