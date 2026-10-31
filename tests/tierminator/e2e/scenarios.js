'use strict'

// The eight scenarios of Tierminator's parallel end-to-end runbook, and the plan text each one runs.
// A scenario is { title, runs, fixBetween, interactive, permissionMode, block(marker) }; block returns
// the tiered-tasks block (tasks, and for scenario 5 a plan verify).

function check(name) {
  return `node -e "if (require('./src/${name}.js') !== '${name}') process.exit(1)"`
}

function simpleLines(name) {
  return [
    `Create src/${name}.js in the repository root with exactly these two lines:`,
    "'use strict'",
    `module.exports = '${name}'`,
    `Files to change: src/${name}.js`,
  ]
}

function simple(id, name, { wait = 0, after, model = 'haiku', effort = 'high' } = {}) {
  const run = wait > 0 ? `node scripts/wait.js ${wait} && ${check(name)}` : check(name)
  const prompt = [...simpleLines(name), `Verify: run \`${run}\`, which must exit 0.`].join('\n')
  const task = { id, title: `Add src/${name}.js`, model, effort }
  if (after) task.after = after
  task.prompt = prompt
  return task
}

// A task whose Verify command runs a gate script first and is run once only.
function gated(id, name, script, marker, { after, model = 'sonnet', effort = 'medium' } = {}) {
  const prompt = [
    ...simpleLines(name),
    `Verify: run \`node scripts/${script} "${marker}" && ${check(name)}\`, which must exit 0. ` +
      'Run the Verify command exactly once. If it exits non-zero, do not run it again, ' +
      'do not edit anything under scripts/, do not commit, and report STATUS: FAILED with its output in the NOTE line.',
  ].join('\n')
  const task = { id, title: `Add src/${name}.js`, model, effort }
  if (after) task.after = after
  task.prompt = prompt
  return task
}

function registering(id, name, { after } = {}) {
  const prompt = [
    ...simpleLines(name).slice(0, 3),
    'In src/registry.js replace the line // REGISTER-HERE with these two lines, in this order:',
    `exports.${name} = require('./${name}.js')`,
    '// REGISTER-HERE',
    `Files to change: src/${name}.js, src/registry.js`,
    `Verify: run \`node -e "if (require('./src/registry.js').${name} !== '${name}') process.exit(1)"\`, which must exit 0.`,
  ].join('\n')
  const task = { id, title: `Add src/${name}.js`, model: 'sonnet', effort: 'medium' }
  if (after) task.after = after
  task.prompt = prompt
  return task
}

const SCENARIOS = {
  1: {
    title: 'three independent tasks',
    runs: 1,
    fixBetween: false,
    interactive: false,
    permissionMode: 'bypassPermissions',
    block: () => ({
      tasks: [
        simple('T01', 'alpha', { wait: 45 }),
        simple('T02', 'beta', { wait: 45, after: [] }),
        simple('T03', 'gamma', { wait: 45, after: [] }),
      ],
    }),
  },
  2: {
    title: 'a forced conflict',
    runs: 1,
    fixBetween: false,
    interactive: false,
    permissionMode: 'bypassPermissions',
    block: () => ({
      tasks: [registering('T01', 'alpha'), registering('T02', 'beta', { after: [] })],
    }),
  },
  3: {
    title: 'a failed task retries in place',
    runs: 1,
    fixBetween: false,
    interactive: false,
    permissionMode: 'bypassPermissions',
    block: marker => ({
      tasks: [
        gated('T01', 'alpha', 'flaky.js', marker),
        simple('T02', 'beta', { wait: 90, after: [] }),
        simple('T03', 'gamma', { wait: 90, after: [] }),
      ],
    }),
  },
  4: {
    title: 'an exhausted task halts the wave',
    runs: 2,
    fixBetween: true,
    interactive: false,
    permissionMode: 'bypassPermissions',
    block: marker => ({
      tasks: [
        simple('T01', 'alpha'),
        gated('T02', 'delta', 'gate.js', marker, { after: [], model: 'opus', effort: 'high' }),
        simple('T03', 'beta', { wait: 60, after: [] }),
        simple('T04', 'gamma', { after: ['T01', 'T02', 'T03'] }),
      ],
    }),
  },
  5: {
    title: 'a failed plan verify halts the run',
    runs: 2,
    fixBetween: true,
    interactive: false,
    permissionMode: 'bypassPermissions',
    block: marker => ({
      tasks: [
        simple('T01', 'alpha'),
        simple('T02', 'beta', { after: [] }),
        simple('T03', 'gamma', { after: ['T01', 'T02'] }),
      ],
      verify: `node scripts/gate.js "${marker}"`,
    }),
  },
  6: {
    title: 'a serial plan',
    runs: 1,
    fixBetween: false,
    interactive: false,
    permissionMode: 'bypassPermissions',
    block: () => ({
      tasks: [simple('T01', 'alpha'), simple('T02', 'beta'), simple('T03', 'gamma')],
    }),
  },
  7: {
    title: 'approval of each worker commit',
    runs: 1,
    fixBetween: false,
    interactive: true,
    permissionMode: 'default',
    block: () => ({
      tasks: [simple('T01', 'alpha'), simple('T02', 'beta', { after: [] }), simple('T03', 'gamma', { after: [] })],
    }),
  },
  8: {
    title: 'the same plan headless with auto',
    runs: 1,
    fixBetween: false,
    interactive: false,
    permissionMode: 'auto',
    block: () => ({
      tasks: [simple('T01', 'alpha'), simple('T02', 'beta', { after: [] }), simple('T03', 'gamma', { after: [] })],
    }),
  },
}

function buildPlan(n, { marker } = {}) {
  const scenario = SCENARIOS[n]
  if (!scenario) throw new Error(`no scenario ${n}: expected 1 to 8`)
  return [
    `# Scenario ${n}: ${scenario.title}`,
    '',
    'Generated by tests/tierminator/e2e/scenarios.js.',
    '',
    '## Tasks',
    '',
    '```json tiered-tasks',
    JSON.stringify(scenario.block(marker), null, 2),
    '```',
    '',
  ].join('\n')
}

module.exports = { SCENARIOS, buildPlan }
