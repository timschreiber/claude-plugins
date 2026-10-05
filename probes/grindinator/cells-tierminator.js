// The Tierminator cells (V5, V7, V8) for the Grindinator WP-01 probe. See probes/grindinator/README.md, 'Cells'.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const lib = require('./lib')
const { BASIC } = require('./cells-api.js')

const BYPASS = ['--permission-mode', 'bypassPermissions']
const PLAN_PROMPT =
  '/tierminator:plan Read notes.txt, then add a file summary.txt whose only line is the first line of notes.txt.'
const TRACKED = { ...BASIC, 'docs/decisions.md': '<!-- decidinator-log v1 -->\n' }
const PLAN_DIRTY = { PROBE_DIRTY_FILE: 'docs/decisions.md', PROBE_DIRTY_ON: 'PreToolUse' }

const q = p => `"${p}"`

function cell({ items, files, prompt, effort, perm, env, extra, dirtyFile }) {
  return {
    items,
    setup(base) {
      const cwd = path.join(base, 'repo')
      lib.makeRepo(cwd, files || BASIC)
      if (extra) extra(cwd)
      const planPath = path.join(base, 'plan.md')
      fs.copyFileSync(path.join(__dirname, 'fixtures', 'plan.md'), planPath)
      const P = planPath.replace(/\\/g, '/')
      return {
        cwd,
        prompt: typeof prompt === 'function' ? prompt(P) : prompt,
        flags: ['--model', 'sonnet', '--effort', effort || 'low', ...perm],
        plugins: ['tierminator', 'probe'],
        env: env || {},
        mock: null,
        timeoutMs: 540000,
      }
    },
    analyze: ctx => analyze(ctx, { plan: prompt === PLAN_PROMPT, dirtyFile }),
  }
}

function exists(cwd, file) {
  return spawnSync('git', ['cat-file', '-e', `HEAD:${file}`], { cwd }).status === 0
}

function analyze(ctx, { plan, dirtyFile }) {
  const git = ctx.git || { status: '', commits: [] }
  const out = {
    commits: git.commits,
    committedTasks: git.commits.map(c => c.task).filter(t => t).reverse(),
    files: {},
    clean: !git.status,
    tasksFile: fs.existsSync(path.join(ctx.base, 'plan.tasks.json')),
    telemetryFile: fs.existsSync(path.join(ctx.base, 'plan.telemetry.jsonl')),
    activated: String(ctx.run.stdout).includes('tierminator: running the plan'),
    refusals: lib.findText(
      { stdout: ctx.run.stdout, resultText: (ctx.summary.result && ctx.summary.result.result) || '' },
      ['uncommitted changes', 'plan mode', 'no commits', 'Tell the user'],
    ),
    workerDispatches: ctx.records
      .filter(r => r.event === 'PreToolUse' && r.input && !r.input.agent_id && r.input.tool_name === 'Agent')
      .map(r => (r.input.tool_input || {}).subagent_type),
    unattendedPlanFile: null,
  }
  for (const f of ['hello.txt', 'world.txt', 'summary.txt']) out.files[f] = exists(ctx.cwd, f)
  if (plan) {
    const sid = ctx.summary.init?.session_id ?? ctx.summary.result?.session_id
    if (sid) {
      const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'plans')
      const tail = `-${String(sid).slice(0, 8)}.md`
      try {
        const hit = fs.readdirSync(dir).find(n => n.startsWith('tierminator-unattended-') && n.endsWith(tail))
        if (hit) out.unattendedPlanFile = path.join(dir, hit)
      } catch {
        // no plans directory
      }
    }
  }
  if (dirtyFile) {
    const file = path.join(ctx.cwd, dirtyFile)
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', dirtyFile], { cwd: ctx.cwd }).status === 0
    let text = ''
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      // missing
    }
    out.dirtyWrite = ctx.records.filter(r => r.event === 'DirtyWrite')
    out.dirtyFile = {
      exists: fs.existsSync(file),
      tracked,
      committedIn: git.commits.filter(c => c.files.includes(dirtyFile)).map(c => c.subject),
      hasProbeWrite: text.includes('probe write'),
    }
  }
  return out
}

const accept = ['--permission-mode', 'acceptEdits']

const cells = {
  'execute-bypass': cell({ items: ['V5', 'V8'], prompt: P => `/tierminator:execute ${q(P)}`, perm: BYPASS }),
  'execute-from': cell({ items: ['V5'], prompt: P => `/tierminator:execute ${q(P)} --from T02`, perm: BYPASS }),
  'execute-number': cell({ items: ['V5'], prompt: '/tierminator:execute 1', perm: BYPASS }),
  'execute-dirty': cell({
    items: ['V5'],
    prompt: P => `/tierminator:execute ${q(P)}`,
    perm: BYPASS,
    extra: cwd => fs.writeFileSync(path.join(cwd, 'scratch.txt'), 'scratch'),
  }),
  'execute-plan-mode': cell({
    items: ['V5'],
    prompt: P => `/tierminator:execute ${q(P)}`,
    perm: ['--permission-mode', 'plan'],
  }),
  'execute-accept-edits': cell({ items: ['V8'], prompt: P => `/tierminator:execute ${q(P)}`, perm: accept }),
  'execute-allow-rules': cell({
    items: ['V8'],
    prompt: P => `/tierminator:execute ${q(P)}`,
    perm: [...accept, '--allowedTools', 'Bash(git:*)', 'Bash(node:*)', 'PowerShell(git:*)', 'PowerShell(node:*)'],
  }),
  'v7-plan-new': cell({
    items: ['V7'],
    prompt: PLAN_PROMPT,
    effort: 'medium',
    perm: BYPASS,
    env: PLAN_DIRTY,
    dirtyFile: 'docs/decisions.md',
  }),
  'v7-plan-tracked': cell({
    items: ['V7'],
    files: TRACKED,
    prompt: PLAN_PROMPT,
    effort: 'medium',
    perm: BYPASS,
    env: PLAN_DIRTY,
    dirtyFile: 'docs/decisions.md',
  }),
  'v7-run': cell({
    items: ['V7'],
    files: TRACKED,
    prompt: P => `/tierminator:execute ${q(P)}`,
    perm: BYPASS,
    env: { PROBE_DIRTY_FILE: 'docs/decisions.md', PROBE_DIRTY_ON: 'SubagentStart' },
    dirtyFile: 'docs/decisions.md',
  }),
  'v7-excluded': cell({
    items: ['V7'],
    prompt: PLAN_PROMPT,
    effort: 'medium',
    perm: BYPASS,
    env: { PROBE_DIRTY_FILE: '.grindinator/decisions/decisions.md', PROBE_DIRTY_ON: 'PreToolUse' },
    dirtyFile: '.grindinator/decisions/decisions.md',
    extra: cwd => {
      const info = path.join(cwd, '.git', 'info')
      fs.mkdirSync(info, { recursive: true })
      fs.appendFileSync(path.join(info, 'exclude'), '.grindinator/\n')
    },
  }),
}

module.exports = cells
