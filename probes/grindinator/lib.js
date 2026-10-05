// Shared helpers for the Grindinator WP-01 probe. See probes/grindinator/README.md.
//
//   node probes/grindinator/lib.js --self-test
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..', '..')
const EVIDENCE = path.join(ROOT, 'probes', 'evidence')
const PLUGINS = {
  tierminator: path.join(ROOT, 'plugins', 'tierminator'),
  decidinator: path.join(ROOT, 'plugins', 'decidinator'),
  probe: path.join(__dirname, 'probe-plugin'),
  stopFailure: path.join(__dirname, 'stopfailure-plugin'),
}

const STRIP = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_ENV_FILE',
  'CLAUDE_CODE_SSE_PORT',
  'DECIDINATOR_MODE',
  'DECIDINATOR_CONTEXT',
  'DECIDINATOR_DEBUG',
  'TIERMINATOR_RESULT_FILE',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_MAX_RETRIES',
  'CLAUDE_CODE_RETRY_WATCHDOG',
]

function cellEnv(extra) {
  const env = { ...process.env }
  const stripped = []
  for (const name of STRIP) {
    if (name in env) {
      stripped.push(name)
      delete env[name]
    }
  }
  Object.assign(env, extra || {})
  return { env, stripped }
}

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' })

function mustGit(cwd, args) {
  const r = git(cwd, args)
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} exited ${r.status}: ${(r.stderr || '').trim()}`)
  return r
}

function makeRepo(dir, files) {
  fs.mkdirSync(dir, { recursive: true })
  for (const [rel, content] of Object.entries(files || {})) {
    const file = path.join(dir, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  mustGit(dir, ['init', '-q'])
  mustGit(dir, ['config', 'user.name', 'Grindinator Probe'])
  mustGit(dir, ['config', 'user.email', 'probe@example.invalid'])
  mustGit(dir, ['config', 'core.autocrlf', 'false'])
  mustGit(dir, ['add', '-A'])
  mustGit(dir, ['commit', '-q', '-m', 'fixture'])
}

function writeSettings(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'settings.json')
  const settings = { enabledPlugins: { 'tierminator@timschreiber': false, 'decidinator@timschreiber': false } }
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n')
  return file
}

function runClaude({ cwd, args, env, timeoutMs }) {
  return new Promise(resolve => {
    const started = Date.now()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let done = false
    let timer = null
    let child
    const finish = result => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr, durationMs: Date.now() - started, ...result })
    }
    try {
      child = spawn('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    } catch (e) {
      finish({ exitCode: null, signal: null, timedOut: false, spawnError: e.message })
      return
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', d => {
      stdout += d
    })
    child.stderr.on('data', d => {
      stderr += d
    })
    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true
        try {
          child.kill()
        } catch {
          // already gone
        }
      }, timeoutMs)
    }
    child.on('error', e => finish({ exitCode: null, signal: null, timedOut, spawnError: e.message }))
    child.on('close', (code, signal) => finish({ exitCode: code, signal: signal ?? null, timedOut, spawnError: null }))
  })
}

function parseStream(text) {
  const out = []
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // skip unparseable lines
    }
  }
  return out
}

function readJsonLines(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  return parseStream(text)
}

function streamSummary(events) {
  const key = e => (e.subtype ? `${e.type}/${e.subtype}` : String(e.type))
  const typeCounts = {}
  const sessionIdIn = []
  const apiRetries = []
  let init = null
  let result = null
  for (const e of events) {
    const k = key(e)
    typeCounts[k] = (typeCounts[k] || 0) + 1
    if (e.session_id && !sessionIdIn.includes(k)) sessionIdIn.push(k)
    if (k === 'system/api_retry') apiRetries.push(e)
    if (k === 'system/init' && !init) init = { ...e, tools: Array.isArray(e.tools) ? e.tools.length : e.tools }
    if (e.type === 'result') result = e
  }
  return { typeCounts, init, result, sessionIdIn, apiRetries, plugins: init ? (init.plugins ?? null) : null }
}

function hookRecords(outDir) {
  let records = []
  let names = []
  try {
    names = fs.readdirSync(outDir).filter(f => f.endsWith('.jsonl')).sort()
  } catch {
    return []
  }
  for (const f of names) records = records.concat(readJsonLines(path.join(outDir, f)))
  return records
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = String(a.r.at ?? '')
      const y = String(b.r.at ?? '')
      return x < y ? -1 : x > y ? 1 : a.i - b.i
    })
    .map(o => o.r)
}

function agentRows(records) {
  const rows = []
  for (const rec of records) {
    if (rec.event !== 'SubagentStop') continue
    const input = rec.input || {}
    const models = []
    const tp = input.agent_transcript_path
    if (tp && fs.existsSync(tp)) {
      for (const line of readJsonLines(tp)) {
        const m = line && line.message && line.message.model
        if (m && !models.includes(m)) models.push(m)
      }
    }
    const agentId = input.agent_id ?? null
    let resolvedModel = null
    for (const r of records) {
      const i = r.input || {}
      if (r.event === 'PostToolUse' && i.tool_name === 'Agent' && i.tool_response && agentId !== null && i.tool_response.agentId === agentId) {
        resolvedModel = i.tool_response.model ?? null
        break
      }
    }
    rows.push({
      agent_id: agentId,
      agent_type: input.agent_type ?? null,
      effort: input.effort ?? null,
      models,
      resolvedModel,
      last_assistant_message: input.last_assistant_message ?? null,
    })
  }
  return rows
}

function gitInfo(repo) {
  const probe = git(repo, ['rev-parse', '--is-inside-work-tree'])
  if (probe.error || probe.status !== 0 || probe.stdout.trim() !== 'true') return null
  const head = git(repo, ['rev-parse', 'HEAD'])
  const status = git(repo, ['status', '--porcelain'])
  const log = git(repo, ['log', '--format=%H%x1f%s%x1f%B%x1e'])
  const commits = []
  if (log.status === 0) {
    for (const entry of log.stdout.split('\x1e')) {
      const trimmed = entry.trim()
      if (!trimmed) continue
      const [sha, subject = '', body = ''] = trimmed.split('\x1f')
      const show = git(repo, ['show', '--name-only', '--format=', sha])
      commits.push({
        sha,
        subject,
        task: /^Tierminator-Task: (T\d+)\s*$/m.exec(body)?.[1] ?? null,
        files: show.status === 0 ? show.stdout.split('\n').map(s => s.trim()).filter(Boolean) : [],
      })
    }
  }
  return { head: head.status === 0 ? head.stdout.trim() : null, status: status.stdout, commits }
}

function writeEvidence(cell, suffix, content) {
  fs.mkdirSync(EVIDENCE, { recursive: true })
  const file = path.join(EVIDENCE, `grindinator-${cell}-${suffix}`)
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n')
  return file
}

function claudeVersion() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' })
  return !r.error && r.status === 0 && typeof r.stdout === 'string' ? r.stdout.trim() : null
}

function findText(haystacks, needles) {
  const out = {}
  for (const [name, text] of Object.entries(haystacks || {})) {
    const lower = String(text ?? '').toLowerCase()
    const hit = needles.filter(n => lower.includes(String(n).toLowerCase()))
    if (hit.length) out[name] = hit
  }
  return out
}

module.exports = {
  ROOT,
  EVIDENCE,
  PLUGINS,
  STRIP,
  cellEnv,
  makeRepo,
  writeSettings,
  runClaude,
  readJsonLines,
  parseStream,
  streamSummary,
  hookRecords,
  agentRows,
  gitInfo,
  writeEvidence,
  claudeVersion,
  findText,
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grindinator-lib-'))
  const failures = []
  const check = (name, ok) => {
    if (!ok) failures.push(name)
  }
  try {
    const repo = path.join(dir, 'repo')
    makeRepo(repo, { 'a.txt': 'a\n' })
    const info = gitInfo(repo)
    check('gitInfo not null', info !== null)
    check('gitInfo one commit', info !== null && info.commits.length === 1)
    check('gitInfo empty status', info !== null && info.status === '')
    const events = parseStream(
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1', tools: ['a', 'b'] }) +
        '\n' +
        JSON.stringify({ type: 'result', subtype: 'success' }) +
        '\n',
    )
    const s = streamSummary(events)
    check('init.tools is 2', s.init !== null && s.init.tools === 2)
    check('result.subtype is success', s.result !== null && s.result.subtype === 'success')
    check('sessionIdIn is [system/init]', JSON.stringify(s.sessionIdIn) === JSON.stringify(['system/init']))
  } catch (e) {
    failures.push(`threw: ${e.message}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  if (failures.length) {
    console.error(`self-test failed: ${failures.join('; ')}`)
    process.exit(1)
  }
  console.log('self-test ok')
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) selfTest()
  else {
    console.error('usage: node probes/grindinator/lib.js --self-test')
    process.exit(64)
  }
}
