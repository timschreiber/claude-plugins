// tierminator-agent-prompt, part 2: how much hook text reaches the model intact? A full-task dispatch puts every
// task prompt of a wave (each up to 5,000 characters) in hook output, so this measures whether long additionalContext
// (UserPromptSubmit, the H1 path) and a long PreToolUse deny reason (the H4 refusal path) arrive whole, or are cut or
// moved to a file.
//
//   node probes/tierminator-agent-prompt/context-size.js           run every cell
//   node probes/tierminator-agent-prompt/context-size.js --hook    (internal) the hook; argv[3] = kind, argv[4] = size
//
// Evidence: probes/evidence/tierminator-agent-context-size-results.json.
'use strict'
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const EVIDENCE = path.join(__dirname, '..', 'evidence', 'tierminator-agent-context-size-results.json')
const SELF = __filename.replace(/\\/g, '/')

// Filler of `size` characters with numbered lines, a START word first and an END word last.
const body = size => {
  const lines = ['START_WORD: MARMALADE']
  let n = 0
  while (lines.join('\n').length < size - 40) lines.push(`filler line ${++n} ` + 'x'.repeat(60))
  lines.push('END_WORD: TANGERINE')
  return lines.join('\n')
}

if (process.argv[2] === '--hook') {
  const kind = process.argv[3]
  const size = Number(process.argv[4])
  let raw = ''
  process.stdin.on('data', c => (raw += c))
  process.stdin.on('end', () => {
    let i
    try { i = JSON.parse(raw) } catch { return }
    if (kind === 'context' && i.hook_event_name === 'UserPromptSubmit') {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: body(size) } }))
    }
    if (kind === 'deny' && i.hook_event_name === 'PreToolUse' && String(i.tool_input?.command ?? '').includes('PROBE_DENY_ME')) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: body(size) } }))
    }
  })
  return
}

const ASK_CONTEXT = 'A hook added text to this message. Reply with exactly two words: the START_WORD value, then the END_WORD value. Do not use any tool unless you cannot see both.'
const ASK_DENY = 'Run the Bash command "echo PROBE_DENY_ME" once. A hook will refuse it with a reason. Then reply with exactly two words: the START_WORD value from that reason, then its END_WORD value. Do not run anything else unless you cannot see both.'

const CELLS = []
for (const size of [9000, 20000, 40000]) {
  CELLS.push({ name: `ctx-${size}`, kind: 'context', size, prompt: ASK_CONTEXT })
  CELLS.push({ name: `deny-${size}`, kind: 'deny', size, prompt: ASK_DENY })
}

const runCell = (c, dir) => {
  const hook = { type: 'command', command: `node "${SELF}" --hook ${c.kind} ${c.size}` }
  const settings = c.kind === 'context'
    ? { hooks: { UserPromptSubmit: [{ hooks: [hook] }] } }
    : { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [hook] }] } }
  const file = path.join(dir, `settings-${c.name}.json`)
  fs.writeFileSync(file, JSON.stringify(settings))
  const res = spawnSync('claude', ['-p', c.prompt, '--model', 'haiku', '--permission-mode', 'bypassPermissions',
    '--setting-sources', 'project', '--settings', file, '--no-session-persistence', '--output-format', 'stream-json',
    '--verbose', '--max-turns', '6'], { cwd: path.join(dir, 'work'), encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 })
  let finalText = null
  const tools = []
  const results = []
  for (const l of String(res.stdout ?? '').split('\n')) {
    let o
    try { o = JSON.parse(l) } catch { continue }
    if (o.type === 'result') finalText = String(o.result ?? '').slice(0, 300)
    for (const b of Array.isArray(o.message?.content) ? o.message.content : []) {
      if (b.type === 'tool_use') tools.push({ name: b.name, input: JSON.stringify(b.input).slice(0, 200) })
      if (b.type === 'tool_result') {
        const t = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
        results.push({ length: t.length, head: t.slice(0, 200), hasEnd: t.includes('TANGERINE') })
      }
    }
  }
  const sawBoth = /MARMALADE/.test(finalText ?? '') && /TANGERINE/.test(finalText ?? '')
  const extraTools = tools.filter(t => !(c.kind === 'deny' && t.name === 'Bash' && t.input.includes('PROBE_DENY_ME')))
  return { name: c.name, kind: c.kind, size: c.size, exit: res.status, finalText, tools, results, sawBoth, intactWithoutTools: sawBoth && extraTools.length === 0 }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-context-size-'))
const cells = []
try {
  fs.mkdirSync(path.join(dir, 'work'))
  for (const c of CELLS) {
    const r = runCell(c, dir)
    cells.push(r)
    console.log(`${r.name} sawBoth=${r.sawBoth} intactWithoutTools=${r.intactWithoutTools} tools=${r.tools.map(t => t.name).join(',')} final=${JSON.stringify(r.finalText)}`)
  }
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}
const claudeVersion = String(spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout ?? '').trim()
fs.writeFileSync(EVIDENCE, JSON.stringify({ probe: 'tierminator-agent-context-size', date: new Date().toISOString(), claudeVersion, cells }, null, 2) + '\n')
