// Probe C of docs/tierminator/tierminator-parallel-findings.md: option C, "tierminator makes the worktrees and
// the workers are not isolated" (the spec's M2 for every task), tested with realistic work.
//
//   node probes/tierminator-parallel/c-runner.js [--runs N] [cell ...]   headless; no cell = all
//   node probes/tierminator-parallel/c-runner.js --list
//
// Each cell builds a throwaway Node repo (three small modules with tests) on branch `work`, and a tasks file
// outside the repo. The main session (claude -p --model sonnet --permission-mode bypassPermissions) makes three
// Agent calls in one message, one per task, to a copy of a real tierminator tier agent (haiku-high or
// sonnet-medium) that has the Parallel section a work package would add (a `Worktree:` line, a `cd` prefix on
// every Bash command, absolute paths, Glob and Grep with a path, no PowerShell). The Agent calls carry no
// isolation. Then the runner checks the Git state and the hook log.
//
// Cells:
//   c-haiku, c-sonnet              the runner makes the three worktrees; no guard hook (natural compliance).
//   c-haiku-guard, c-sonnet-guard  a PreToolUse hook on the Agent call makes the worktrees (concurrently, one
//                                  hook process per call) and a guard hook denies tool calls that would reach
//                                  the main tree.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const evidenceDir = process.env.PROBE_EVIDENCE_DIR || path.join(__dirname, '..', 'evidence')
const AGENT_PREFIX = 'tierminator-parallel-probe:'
const REAL_AGENTS = path.join(__dirname, '..', '..', 'plugins', 'tierminator', 'agents')

const CELLS = {
  'c-haiku': { agent: 'haiku-high', guard: false, mkwt: false },
  'c-sonnet': { agent: 'sonnet-medium', guard: false, mkwt: false },
  'c-haiku-guard': { agent: 'haiku-high', guard: true, mkwt: true },
  'c-sonnet-guard': { agent: 'sonnet-medium', guard: true, mkwt: true },
  // The worker gets no Parallel section, so it does not know what the Worktree: line means: a worker that
  // ignores the rules. These cells show what that does without a guard and whether the guard rescues it.
  // The default permission mode instead of bypassPermissions. A hook answers every permission request with
  // "allow" and logs it, so the run goes on and the evidence lists each call that would have asked a person.
  'c-haiku-default': { agent: 'haiku-high', guard: false, mkwt: false, perm: 'default' },
  // acceptEdits mode, nobody answers (a request that no rule allows is denied) and the repo's local settings carry
  // the allow rules a user would add: which of the worker's calls still cannot be allowed?
  'c-haiku-rules': { agent: 'haiku-high', guard: false, mkwt: false, perm: 'acceptEdits', allowRules: ['Bash(cd:*)', 'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git status:*)', 'Bash(git rev-parse:*)', 'Bash(node --test:*)'] },
  // Auto mode, no allow rules, nobody answering: does option C get through, and does anything ask?
  'c-haiku-auto': { agent: 'haiku-high', guard: false, mkwt: false, perm: 'auto' },
  // Option C with git run as `git -C "<worktree>" ...` (never after cd &&) and a user rule Bash(git -C:*).
  'c-haiku-gitc-rules': { agent: 'haiku-high', guard: false, mkwt: false, perm: 'acceptEdits', gitC: true, allowRules: ['Bash(cd:*)', 'Bash(git -C:*)', 'Bash(node --test:*)'] },
  // M1 for comparison: the same allow rules, but Claude Code makes the worktrees (isolation "worktree", base
  // from worktree.baseRef in the local settings) and the worker has no Worktree line and no cd prefix.
  'c-haiku-m1-rules': { agent: 'haiku-high', guard: false, mkwt: false, perm: 'acceptEdits', rules: false, isolation: true, baseRef: true, allowRules: ['Bash(cd:*)', 'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git status:*)', 'Bash(git rev-parse:*)', 'Bash(node --test:*)'] },
  'c-sonnet-guard-default': { agent: 'sonnet-medium', guard: true, mkwt: true, perm: 'default' },
  'c-haiku-norules': { agent: 'haiku-high', guard: false, mkwt: false, rules: false },
  'c-haiku-norules-guard': { agent: 'haiku-high', guard: true, mkwt: false, rules: false },
}

const PARALLEL = `## Parallel

When your message has a \`Parallel: yes\` line, you work in a Git worktree that was made for you, not in the directory your shell starts in. The \`Worktree:\` line gives its absolute path in drive-letter form (\`C:/...\`); WT is that path. The \`Tasks file:\` path is outside the worktree: read it with the Read tool, as given.

- Your shell forgets any \`cd\` as soon as a command ends. Start every Bash command with \`cd "<WT>" && \` followed by the command. Use the Bash tool for every command, never PowerShell.
- Every Write, Edit and Read call takes an absolute path that starts with WT (the tasks file is the one exception). Every Glob and Grep call passes \`path\` set to WT; without it they search the main tree.
- Never build a path from \`pwd\` output: it prints \`/tmp/...\` forms that the file tools resolve to the wrong place.
- The branch checked out in WT is already yours: commit there, and never switch branches or leave WT.

`

const FILES = {
  'package.json': '{\n  "name": "c-fixture",\n  "version": "1.0.0",\n  "private": true,\n  "scripts": { "test": "node --test" }\n}\n',
  'CLAUDE.md': '# Fixture\n\nRun the tests with `node --test`. Source files are CommonJS.\n',
  'src/math.js': "'use strict'\n\nfunction add(a, b) {\n  return a + b\n}\n\nmodule.exports = { add }\n",
  'src/strings.js': "'use strict'\n\nfunction capitalize(text) {\n  return text.charAt(0).toUpperCase() + text.slice(1)\n}\n\nmodule.exports = { capitalize }\n",
  'src/list.js': "'use strict'\n\nfunction uniq(items) {\n  return [...new Set(items)]\n}\n\nmodule.exports = { uniq }\n",
  'test/math.test.js': "'use strict'\nconst test = require('node:test')\nconst assert = require('node:assert')\nconst { add } = require('../src/math')\n\ntest('add adds', () => {\n  assert.strictEqual(add(1, 2), 3)\n})\n",
  'test/strings.test.js': "'use strict'\nconst test = require('node:test')\nconst assert = require('node:assert')\nconst { capitalize } = require('../src/strings')\n\ntest('capitalize capitalizes', () => {\n  assert.strictEqual(capitalize('abc'), 'Abc')\n})\n",
  'test/list.test.js': "'use strict'\nconst test = require('node:test')\nconst assert = require('node:assert')\nconst { uniq } = require('../src/list')\n\ntest('uniq removes duplicates', () => {\n  assert.deepStrictEqual(uniq([1, 1, 2]), [1, 2])\n})\n",
}

const TASKS = [
  {
    id: 'T01',
    title: 'Add clamp to src/math.js',
    file: 'src/math.js',
    testFile: 'test/math.test.js',
    fn: 'clamp',
    prompt:
      'Add a function `clamp(n, min, max)` to src/math.js. It returns n limited to the range min..max: min when n < min, max when n > max, otherwise n. Export it the same way the existing functions are exported; use the Grep tool to see how existing functions in src are exported before you write yours. Add tests for it to test/math.test.js: below the range, inside it and above it. Verify: run `node --test` in the repository root and every test passes.',
  },
  {
    id: 'T02',
    title: 'Add slugify to src/strings.js',
    file: 'src/strings.js',
    testFile: 'test/strings.test.js',
    fn: 'slugify',
    prompt:
      'Add a function `slugify(text)` to src/strings.js. It lowercases the text, replaces every run of characters that are not ASCII letters (a-z) or ASCII digits (0-9) with a single "-", and removes any "-" at the start or end. Non-ASCII characters are treated like punctuation, so "Café au lait" becomes "caf-au-lait". Export it the same way the existing functions are exported; use the Grep tool to see how existing functions in src are exported before you write yours. Add tests for it to test/strings.test.js: spaces and punctuation, leading and trailing separators, and an already clean word. Verify: run `node --test` in the repository root and every test passes.',
  },
  {
    id: 'T03',
    title: 'Add chunk to src/list.js',
    file: 'src/list.js',
    testFile: 'test/list.test.js',
    fn: 'chunk',
    prompt:
      'Add a function `chunk(items, size)` to src/list.js. It splits an array into arrays of at most `size` items, in order, and throws a RangeError when size is less than 1. Export it the same way the existing functions are exported; use the Glob tool to list the files under src and the Grep tool to see how existing functions are exported before you write yours. Add tests for it to test/list.test.js: an even split, a short last chunk, an empty array and a size below 1. Verify: run `node --test` in the repository root and every test passes.',
  },
]

const fwd = p => path.resolve(p).replace(/\\/g, '/')

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${(r.stderr ?? '') + (r.error ? r.error.message : '')}`)
  return (r.stdout ?? '').trim()
}

function gitTry(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return { status: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

function makePlugin(base, agent, rules, gitC) {
  const dir = path.join(base, 'plugin')
  fs.cpSync(path.join(__dirname, 'probe-plugin'), dir, { recursive: true })
  let text = fs.readFileSync(path.join(REAL_AGENTS, agent + '.md'), 'utf8').replace(/\r\n/g, '\n')
  text = text.replace(/^name: .*$/m, 'name: c-' + agent)
  text = text.replace(/^description: .*$/m, 'description: Probe copy of the tierminator ' + agent + ' worker with a Parallel section for option C. Dispatched by the probe runner only.')
  if (!text.includes('\n## Commit')) throw new Error('no ## Commit heading in ' + agent)
  const section = gitC
    ? PARALLEL.replace(
        'Start every Bash command with `cd "<WT>" && ` followed by the command.',
        'Start every Bash command that is not a git command with `cd "<WT>" && ` followed by the command. For every git command use `git -C "<WT>" <subcommand>` and never put git after `cd ... &&`.'
      )
    : PARALLEL
  if (section === PARALLEL && gitC) throw new Error('gitC replacement did not apply')
  if (rules !== false) text = text.replace('\n## Commit', '\n' + section + '## Commit')
  fs.writeFileSync(path.join(dir, 'agents', 'c-' + agent + '.md'), text)
  return { dir, agentText: text }
}

function setupCell(name) {
  const cell = CELLS[name]
  const base = path.join(os.tmpdir(), 'tierminator-parallel-' + name)
  fs.rmSync(base, { recursive: true, force: true })
  fs.mkdirSync(base, { recursive: true })

  const repo = path.join(base, 'repo')
  fs.mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'work')
  git(repo, 'config', 'user.name', 'Probe')
  git(repo, 'config', 'user.email', 'probe@example.invalid')
  git(repo, 'config', 'core.autocrlf', 'false')
  for (const [rel, content] of Object.entries(FILES)) {
    const f = path.join(repo, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, content)
  }
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'fixture')
  const B = git(repo, 'rev-parse', 'HEAD')
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '.claude/worktrees/\n')
  if (cell.allowRules) {
    const tasksDir = '//' + fwd(base).replace(/^([A-Za-z]):/, (m, d) => d.toLowerCase())
    fs.mkdirSync(path.join(repo, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(repo, '.claude', 'settings.local.json'),
      JSON.stringify({ ...(cell.baseRef ? { worktree: { baseRef: 'head' } } : {}), permissions: { allow: [...cell.allowRules, 'Read(' + tasksDir + '/**)'], defaultMode: 'acceptEdits' } }, null, 2) + '\n'
    )
    fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '.claude/settings.local.json\n')
  }

  const root = fwd(repo) + '/.claude/worktrees/'
  const slots = TASKS.map(t => ({ ...t, worktree: root + t.id.toLowerCase(), branch: 'probe/' + t.id.toLowerCase() }))
  if (!cell.mkwt && !cell.isolation) for (const s of slots) git(repo, 'worktree', 'add', '-q', '-b', s.branch, s.worktree, B)

  const tasksFile = path.join(base, 'tasks.json')
  fs.writeFileSync(tasksFile, JSON.stringify({ tasks: TASKS.map(t => ({ id: t.id, title: t.title, prompt: t.prompt })) }, null, 2) + '\n')

  const { dir: pluginDir, agentText } = makePlugin(base, cell.agent, cell.rules, cell.gitC)
  const log = path.join(base, 'probe.log')
  const ctx = { cell: name, base, repo, B, root, slots, tasksFile: fwd(tasksFile), pluginDir, agentText, log, agent: 'c-' + cell.agent }
  fs.writeFileSync(path.join(base, 'ctx.json'), JSON.stringify(ctx, null, 2))
  return ctx
}

function slotBlock(ctx, s) {
  const iso = CELLS[ctx.cell].isolation
  return [
    'Parallel: yes',
    'Tasks file: ' + ctx.tasksFile,
    'Plan: c-probe-plan',
    'Task: ' + s.id,
    ...(iso ? [] : ['Worktree: ' + s.worktree]),
  ].join('\n')
}

function mainPrompt(ctx, interactive) {
  const parts = [
    'Call the Agent tool three times in one message, once for each block below. Use subagent_type "' + AGENT_PREFIX + ctx.agent + '", ' + (CELLS[ctx.cell].isolation ? 'isolation "worktree", ' : '') + (interactive ? '' : 'run_in_background false, ') + 'the description given for the block, and pass the text between the two lines of three dashes exactly as written, with nothing added or removed. Do not do any of the work yourself. If a call fails, reply with the error verbatim. When all three have finished' + (interactive ? ' (their reports arrive in the background: wait for all three before you reply)' : '') + ', reply with each agent\'s report verbatim, labeled with its task id.',
  ]
  for (const s of ctx.slots) parts.push('', 'Block ' + s.id + ' (description "task ' + s.id + '"):', '---', slotBlock(ctx, s), '---')
  return parts.join('\n')
}

function probeEnv(ctx) {
  const cell = CELLS[ctx.cell]
  const env = {}
  const drop = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA']
  for (const [k, v] of Object.entries(process.env)) {
    if (drop.includes(k) || k.startsWith('TIERMINATOR_') || k.startsWith('DECIDINATOR_')) continue
    env[k] = v
  }
  env.PROBE_LOG = ctx.log
  env.PROBE_MODE = 'observe'
  env.PROBE_BASE = ctx.B
  env.PROBE_WT_ROOT = ctx.root
  env.PROBE_GUARD = cell.guard ? '1' : '0'
  env.PROBE_MK_WT = cell.mkwt ? '1' : '0'
  if (cell.perm === 'default' && cell.permAllow !== false) env.PROBE_PERM_ALLOW = '1'
  return env
}

const parse = s => {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
const norm = p => String(p ?? '').replace(/\\/g, '/').toLowerCase()
const lines = s => s.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean)

function slotOfAgent(ctx, stop) {
  const file = stop.agent_transcript_path
  if (!file || !fs.existsSync(file)) return null
  for (const l of fs.readFileSync(file, 'utf8').split('\n').slice(0, 40)) {
    if (!l.trim()) continue
    const m = /Task:\s*(T\d+)/.exec(l)
    if (m && l.includes('Plan: c-probe-plan')) return m[1]
  }
  return null
}

function reportOf(text) {
  const r = {}
  for (const l of lines(text ?? '')) {
    const m = /^(STATUS|COMMIT|VERIFY|NOTE):\s*(.*)$/.exec(l)
    if (m) r[m[1]] = m[2]
  }
  return r
}

function analyze(ctx, entries) {
  const tagged = tag => entries.filter(e => e.tag === tag)
  const starts = tagged('sub-start').map(e => ({ at: e.at, ...parse(e.stdin) }))
  const stops = tagged('sub-stop').map(e => ({ at: e.at, ...parse(e.stdin) }))
  const tools = tagged('c-tool')

  const agents = {}
  for (const st of stops) {
    const slot = slotOfAgent(ctx, st)
    const start = starts.find(s => s.agent_id === st.agent_id)
    agents[st.agent_id] = {
      slot,
      startAt: start ? start.at : null,
      stopAt: st.at,
      cwdAtStop: st.cwd ?? null,
      report: reportOf(st.last_assistant_message),
    }
  }
  const startMs = Object.values(agents).map(a => Date.parse(a.startAt)).filter(Number.isFinite)
  const stopMs = Object.values(agents).map(a => Date.parse(a.stopAt)).filter(Number.isFinite)
  const overlap = {
    agents: Object.keys(agents).length,
    allOverlap: startMs.length === 3 && Math.max(...startMs) < Math.min(...stopMs),
    wallSeconds: startMs.length ? (Math.max(...stopMs) - Math.min(...startMs)) / 1000 : null,
    perAgentSeconds: Object.values(agents).map(a => (Date.parse(a.stopAt) - Date.parse(a.startAt)) / 1000),
  }

  const perSlot = {}
  for (const s of ctx.slots) {
    const a = Object.entries(agents).find(([, v]) => v.slot === s.id)
    const id = a ? a[0] : null
    const mine = tools.filter(t => t.agent_id === id)
    const wt = norm(s.worktree)
    const byTool = {}
    for (const t of mine) byTool[t.tool] = (byTool[t.tool] ?? 0) + 1
    const bash = mine.filter(t => t.tool === 'Bash')
    const cdTarget = c => {
      const m = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*&&/.exec(c ?? '')
      return m ? norm(m[1] ?? m[2] ?? m[3]) : null
    }
    const otherSlot = p => ctx.slots.some(o => o.id !== s.id && norm(p).startsWith(norm(o.worktree)))
    perSlot[s.id] = {
      agentId: id,
      toolCalls: mine.length,
      byTool,
      powershellCalls: byTool.PowerShell ?? 0,
      bashWithoutCdPrefix: bash.filter(t => !cdTarget(t.input.command)).length,
      bashWrongSlot: bash.filter(t => cdTarget(t.input.command) && otherSlot(cdTarget(t.input.command))).length,
      writeEditOutsideOwnWorktree: mine.filter(t => (t.tool === 'Write' || t.tool === 'Edit') && !norm(t.input.file_path).startsWith(wt)).length,
      globGrepWithoutOwnPath: mine.filter(t => (t.tool === 'Glob' || t.tool === 'Grep') && !(t.input.path && norm(t.input.path).startsWith(wt))).length,
      readOutsideOwnWorktree: mine.filter(t => t.tool === 'Read' && !norm(t.input.file_path).startsWith(wt)).map(t => t.input.file_path),
      denied: mine.filter(t => t.denied).length,
      noncompliant: mine.filter(t => t.compliant === false).length,
      report: a ? a[1].report : null,
    }
  }

  const mkwt = tagged('mkwt').map(e => ({ task: e.task, pid: e.pid, status: e.status, stderr: e.stderr, startedAt: e.startedAt, endedAt: e.endedAt }))
  const permissionRequests = tagged('perm-request').map(e => {
    const s = parse(e.stdin)
    const ti = s.tool_input ?? {}
    return {
      tool: s.tool_name,
      input: String(ti.command ?? ti.file_path ?? ti.path ?? '').slice(0, 200),
      suggestions: s.permission_suggestions ?? null,
      mode: s.permission_mode ?? null,
    }
  })
  const permissionByTool = {}
  for (const p of permissionRequests) permissionByTool[p.tool] = (permissionByTool[p.tool] ?? 0) + 1
  return { agents, overlap, perSlot, mkwt, mkwtSkipped: tagged('mkwt:skipped').length, permissionRequests, permissionByTool }
}

function gitChecks(ctx) {
  const main = {
    head: gitTry(ctx.repo, 'rev-parse', 'HEAD').out,
    headIsB: gitTry(ctx.repo, 'rev-parse', 'HEAD').out === ctx.B,
    branch: gitTry(ctx.repo, 'rev-parse', '--abbrev-ref', 'HEAD').out,
    status: lines(gitTry(ctx.repo, 'status', '--porcelain').out),
    fnsInMainTree: {},
  }
  const hasFn = (cwd, file, fn) => spawnSync('node', ['-e', `process.exit(typeof require('./${file}').${fn} === 'function' ? 0 : 1)`], { cwd }).status === 0
  for (const s of ctx.slots) main.fnsInMainTree[s.fn] = hasFn(ctx.repo, s.file, s.fn)
  const slots = {}
  for (const s of ctx.slots) {
    const wt = s.worktree
    const exists = !CELLS[ctx.cell].isolation && fs.existsSync(wt)
    if (!exists) {
      slots[s.id] = { exists: false }
      continue
    }
    const count = Number(gitTry(wt, 'rev-list', '--count', ctx.B + '..HEAD').out)
    const body = gitTry(wt, 'log', '-1', '--format=%B').out
    const files = lines(gitTry(wt, 'diff', '--name-only', ctx.B + '..HEAD').out).sort()
    const test = spawnSync('node', ['--test'], { cwd: wt, encoding: 'utf8' })
    const others = ctx.slots.filter(o => o.id !== s.id)
    slots[s.id] = {
      exists: true,
      branch: gitTry(wt, 'rev-parse', '--abbrev-ref', 'HEAD').out,
      commitsSinceBase: count,
      lastCommitTitle: lines(body)[0] ?? null,
      trailerTask: new RegExp('^Tierminator-Task:\\s*' + s.id + '\\s*$', 'm').test(body),
      trailerPlan: /^Tierminator-Plan:\s*\S+/m.test(body),
      filesChanged: files,
      onlyExpectedFiles: JSON.stringify(files) === JSON.stringify([s.file, s.testFile].sort()),
      status: lines(gitTry(wt, 'status', '--porcelain').out),
      testsPass: test.status === 0,
      fnExists: hasFn(wt, s.file, s.fn),
      leakedFnsFromOthers: others.filter(o => hasFn(wt, o.file, o.fn)).map(o => o.fn),
    }
  }
  return { main, slots }
}

function verdicts(ctx, g, a) {
  const out = {}
  out.mainUntouched = g.main.headIsB && g.main.status.length === 0 && !Object.values(g.main.fnsInMainTree).some(Boolean)
  for (const s of ctx.slots) {
    const x = g.slots[s.id]
    const p = a.perSlot[s.id]
    out[s.id] = {
      done: CELLS[ctx.cell].isolation ? Boolean(p.report && p.report.STATUS === 'DONE' && /^[0-9a-f]{40}$/.test(p.report.COMMIT ?? '')) : Boolean(x.exists && x.commitsSinceBase === 1 && x.trailerTask && x.trailerPlan && x.onlyExpectedFiles && x.status.length === 0 && x.testsPass && x.fnExists && x.leakedFnsFromOthers.length === 0 && x.branch === 'probe/' + s.id.toLowerCase()),
      reportedDone: p.report ? p.report.STATUS === 'DONE' : false,
      wouldHaveLeakedWithoutGuard: p.noncompliant,
    }
  }
  out.allDone = ctx.slots.every(s => out[s.id].done)
  out.leaksOrDenials = ctx.slots.reduce((n, s) => n + a.perSlot[s.id].noncompliant, 0)
  return out
}

let runSuffix = ''

function run(name) {
  const ctx = setupCell(name)
  const prompt = mainPrompt(ctx, false)
  const t0 = Date.now()
  const r = spawnSync(
    'claude',
    ['-p', prompt, '--plugin-dir', ctx.pluginDir, '--model', 'sonnet', '--permission-mode', CELLS[name].perm ?? 'bypassPermissions', '--output-format', 'stream-json', '--verbose'],
    { cwd: ctx.repo, env: probeEnv(ctx), encoding: 'utf8', timeout: 1500000, maxBuffer: 128 * 1024 * 1024 }
  )
  writeEvidence(ctx, 'headless', prompt, r, t0)
}

function writeEvidence(ctx, mode, prompt, r, t0) {
  const name = ctx.cell
  const events = r ? (r.stdout ?? '').split('\n').filter(Boolean).map(parse).filter(e => e && e.type) : []
  const final = events.filter(e => e.type === 'result').pop()
  const entries = fs.existsSync(ctx.log) ? fs.readFileSync(ctx.log, 'utf8').split('\n').filter(Boolean).map(parse) : []
  const a = analyze(ctx, entries)
  const g = gitChecks(ctx)
  const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
  fs.mkdirSync(evidenceDir, { recursive: true })
  const file = path.join(evidenceDir, `tierminator-parallel-${name}${mode === 'interactive' ? '-interactive' : ''}${runSuffix}.json`)
  const doc = {
    generated: new Date().toISOString(),
    claudeCodeVersion: version,
    cell: name,
    setup: { ...CELLS[name], base: ctx.B, slots: ctx.slots.map(s => ({ id: s.id, worktree: s.worktree, branch: s.branch })), tasks: TASKS.map(t => ({ id: t.id, title: t.title, prompt: t.prompt })) },
    agentFile: ctx.agentText,
    mode,
    prompt,
    exitCode: r ? r.status : null,
    elapsedSeconds: t0 ? (Date.now() - t0) / 1000 : null,
    costUsd: final ? final.total_cost_usd ?? null : null,
    result: final ? final.result ?? null : null,
    stderr: r ? ((r.stderr ?? '') + (r.error ? '\n[spawn error] ' + r.error.message : '')).slice(0, 4000) : '',
    verdicts: verdicts(ctx, g, a),
    analysis: a,
    git: g,
    hookLog: entries.map(e => (e.stdin && e.stdin.length > 4000 ? { ...e, stdin: e.stdin.slice(0, 4000) + '…' } : e)),
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
  console.log(`${name}: exit ${doc.exitCode}; allDone ${doc.verdicts.allDone}; noncompliant calls ${doc.verdicts.leaksOrDenials}; cost ${doc.costUsd}; wrote ${file}`)
}

function prepare(name) {
  const ctx = setupCell(name)
  const env = probeEnv(ctx)
  console.log('--- 1. In a NEW PowerShell window, run these lines one at a time ---')
  console.log('cd "' + ctx.repo + '"')
  for (const k of Object.keys(env).filter(k => k.startsWith('PROBE_'))) console.log('$env:' + k + "='" + env[k] + "'")
  console.log('claude --permission-mode default --plugin-dir "' + ctx.pluginDir + '"')
  console.log('')
  console.log('--- 2. When Claude has started, paste everything between the two lines of equals signs ---')
  console.log('==========')
  console.log(mainPrompt(ctx, true))
  console.log('==========')
  console.log('')
  console.log('--- 3. Answer every permission prompt that appears (approve once; do NOT pick "always allow"), and write down each prompt: which tool, and the text. ---')
  console.log('--- 4. When Claude has printed all three reports, type /exit ---')
  console.log('--- 5. Back here: node ' + __filename + ' --collect ' + name + ' ---')
}

function main(argv) {
  if (argv[0] === '--prepare' || argv[0] === '--collect') {
    const name = argv[1]
    if (argv.length !== 2 || !CELLS[name]) {
      process.stderr.write('usage: node c-runner.js --prepare|--collect <cell>\n')
      process.exit(2)
    }
    if (argv[0] === '--prepare') return prepare(name)
    const file = path.join(os.tmpdir(), 'tierminator-parallel-' + name, 'ctx.json')
    if (!fs.existsSync(file)) {
      process.stderr.write('no ctx.json at ' + file + '; run --prepare ' + name + ' first\n')
      process.exit(2)
    }
    const ctx = JSON.parse(fs.readFileSync(file, 'utf8'))
    return writeEvidence(ctx, 'interactive', mainPrompt(ctx, true), null, null)
  }
  let runs = 1
  const ri = argv.indexOf('--runs')
  if (ri !== -1) {
    runs = Number(argv[ri + 1])
    if (!Number.isInteger(runs) || runs < 1) process.exit(2)
    argv = [...argv.slice(0, ri), ...argv.slice(ri + 2)]
  }
  if (argv[0] === '--list') return console.log(Object.keys(CELLS).join('\n'))
  const names = argv.length ? argv : Object.keys(CELLS)
  for (const n of names) if (!CELLS[n]) {
    process.stderr.write('unknown cell ' + n + '\n')
    process.exit(2)
  }
  for (const n of names) {
    for (let k = 1; k <= runs; k++) {
      runSuffix = runs > 1 ? `-r${k}` : ''
      run(n)
    }
  }
}

if (require.main === module) main(process.argv.slice(2))
