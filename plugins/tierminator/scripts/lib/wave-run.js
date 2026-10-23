// A parallel wave's decisions as pure functions over the run state: run.js's counterpart for slots. The
// hooks add the file and Git work around these. A serial wave keeps state.current and run.js; during a
// parallel wave state.current is null and the wave lives in state.wave.
//
// Wave state: state.wave = {n, size, base, cap, slots, queue, phase, halting, setAside}
//   n        the plan's wave number, as the approval table shows it
//   size     the wave's task ids, in task order
//   base     the wave base sha every worktree starts from
//   cap      how many tasks may be ready or running at once
//   slots    {id: slot}; slot = run.js's fresh() plus {worktree, branch, head, status, startedAt, pastAgents,
//            failure}; status queued | ready (may be dispatched now, counts against the cap) | running
//            (dispatched, inFlight true) | done | failed | skipped (never started: the wave halted first)
//   queue    the ids with status 'queued', in order
//   phase    working | integrating | verifying
//   halting  null | {task, tried, reason}
//   setAside []
'use strict'

const r = require('./run.js')
const { DEFAULT_MAX_PARALLEL, waveOf, startable: freeIds } = require('./waves.js')
const { toWorktreePath } = require('./git.js')

// The state with the slot `id` read as the current task, so run.js functions can be used on it.
const asCurrent = (state, id) => ({ ...state, current: state.wave.slots[id] })

// The state with slot `id` replaced.
const withSlot = (state, id, slot) => ({
  ...state,
  wave: { ...state.wave, slots: { ...state.wave.slots, [id]: slot } },
})

// Where a task's worktree and branch go; the worktree is null without a repo root.
function slotPlacement(runId, repoRoot, taskId) {
  return {
    worktree:
      typeof repoRoot === 'string' && repoRoot
        ? toWorktreePath(`${repoRoot}/.claude/worktrees/tierminator-${runId}-${taskId}`)
        : null,
    branch: `tierminator/${runId}/${taskId}`,
  }
}

// The state at the start of a parallel wave: the first `cap` tasks ready, the rest queued.
function startWave(state, taskIds, base, cap, repoRoot) {
  const ids = state.tasks.map(t => t.id).filter(id => taskIds.includes(id))
  const k = Number.isInteger(cap) && cap > 0 ? cap : DEFAULT_MAX_PARALLEL
  const slots = {}
  ids.forEach((id, i) => {
    const index = state.tasks.findIndex(t => t.id === id)
    slots[id] = {
      ...r.fresh(state.tasks[index], index),
      ...slotPlacement(state.runId, repoRoot, id),
      head: base,
      status: i < k ? 'ready' : 'queued',
      startedAt: null,
      pastAgents: [],
      failure: null,
    }
  })
  const wave = {
    n: waveOf(state.tasks, ids[0]) ?? 1,
    size: ids,
    base,
    cap: k,
    slots,
    queue: ids.filter(id => slots[id].status === 'queued'),
    phase: 'working',
    halting: null,
    setAside: [],
  }
  return { ...state, current: null, wave }
}

// The ids that may be dispatched now, in size order.
function startable(state) {
  if (!state || state.phase !== 'running' || state.wave?.phase !== 'working') return []
  const { wave } = state
  const ready = wave.size.filter(id => wave.slots[id].status === 'ready')
  const busy = wave.size.filter(id => ['ready', 'running'].includes(wave.slots[id].status))
  const free = wave.halting ? [] : freeIds(wave.queue, busy, wave.cap)
  return wave.size.filter(id => ready.includes(id) || free.includes(id))
}

// The state once task `id` is dispatched, or the same state when it may not start.
function dispatched(state, id, now = new Date().toISOString()) {
  if (!startable(state).includes(id)) return state
  const slot = { ...state.wave.slots[id], status: 'running', inFlight: true, report: null, startedAt: now }
  const next = withSlot(state, id, slot)
  return { ...next, wave: { ...next.wave, queue: next.wave.queue.filter(q => q !== id) } }
}

const lineOf = (text, re) => {
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = re.exec(line)
    if (m) return m[1]
  }
  return null
}
const taskOfPrompt = text => lineOf(text, /^\s*Task:\s*(\S+)\s*$/)
const worktreeOfPrompt = text => lineOf(text, /^\s*Worktree:\s*(.*\S)\s*$/)

// The id of the slot a subagent belongs to, else null.
function slotOfAgent(state, agentId) {
  if (typeof agentId !== 'string' || !agentId) return null
  const slots = state?.wave?.slots ?? {}
  return Object.keys(slots).find(id => slots[id].agentId === agentId) ?? null
}

// Records the agent id of a running slot, once.
function recordAgent(state, id, agentId) {
  const slot = state?.wave?.slots?.[id]
  if (!slot || slot.status !== 'running') return state
  if (typeof agentId !== 'string' || !agentId) return state
  if (slot.agentId !== null || slot.pastAgents.includes(agentId)) return state
  return withSlot(state, id, { ...slot, agentId })
}

// The Agent call a slot expects: the serial prompt with Parallel and Worktree lines after the Task line.
function expectedCall(state, id) {
  const slot = state?.wave?.slots?.[id]
  if (!slot) return null
  const lines = r.expectedPrompt(asCurrent(state, id)).split('\n')
  const at = lines.findIndex(l => l.startsWith('Task: '))
  lines.splice(at + 1, 0, 'Parallel: yes', `Worktree: ${slot.worktree}`)
  const task = state.tasks[slot.index]
  return {
    subagent_type: r.agentName(slot.tier),
    description: `${id}: ${task.title}`,
    prompt: lines.join('\n'),
  }
}

// {id, problem}: problem is null when the Agent call is a dispatch the wave expects, else what is wrong.
function checkDispatch(state, toolInput) {
  const id = taskOfPrompt(toolInput?.prompt)
  const out = problem => ({ id, problem })
  if (!state || state.phase !== 'running' || !state.wave) return out('no parallel wave is running')
  const { wave } = state
  if (wave.phase !== 'working') return out(`wave ${wave.n} is closing; dispatch nothing`)
  if (toolInput && typeof toolInput === 'object' && Object.prototype.hasOwnProperty.call(toolInput, 'isolation')) {
    return out('the call carries isolation; tierminator makes the worktree itself, so leave isolation out')
  }
  if (!id) return out('the prompt has no Task: line')
  const slot = wave.slots[id]
  if (!slot) return out(`${id} is not in this wave (wave ${wave.n}: ${wave.size.join(', ')})`)
  if (slot.status === 'running') return out(`${id} is already running; wait for it to return`)
  if (slot.status === 'done' || slot.status === 'failed') return out(`${id} has already finished in this wave`)
  if (!startable(state).includes(id)) {
    if (wave.halting) return out(`the wave is halting (${wave.halting.task} failed), so ${id} does not start`)
    const busy = wave.size.filter(s => ['ready', 'running'].includes(wave.slots[s].status)).length
    return out(`${id} must wait: ${busy} tasks are running or due and the cap is ${wave.cap}`)
  }
  const want = expectedCall(state, id)
  if (toolInput.subagent_type !== want.subagent_type) {
    return out(`${id} runs on ${want.subagent_type}, not ${toolInput.subagent_type}`)
  }
  const got = worktreeOfPrompt(toolInput.prompt)
  if (got !== slot.worktree) return out(`the Worktree: line must be ${slot.worktree}, not ${got ?? 'missing'}`)
  if (r.normalize(toolInput.prompt) !== r.normalize(want.prompt)) return out('the prompt is not the expected one')
  return out(null)
}

module.exports = {
  asCurrent,
  withSlot,
  slotPlacement,
  startWave,
  startable,
  dispatched,
  taskOfPrompt,
  worktreeOfPrompt,
  slotOfAgent,
  recordAgent,
  expectedCall,
  checkDispatch,
}
