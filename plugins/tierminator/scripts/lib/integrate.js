// Integration of a closed parallel wave (spec: Integration; Conflicts; Plan-level verify): the done slots'
// commits are cherry-picked onto the run branch in the main tree in id order, a conflicting pick is aborted
// and its task set aside, the plan's verify runs after the picks, and the slots of the picked tasks are
// removed. Nothing here throws: a failure comes back as a problem or a failure string.
'use strict'

const { spawnSync } = require('child_process')
const git = require('./git.js')
const w = require('./wave-run.js')
const r = require('./run.js')

const VERIFY_TAIL = 4000
// Just under the 3600 s hook timeout, so a verify that hangs ends here, with its output, not silently there.
const VERIFY_TIMEOUT_MS = 3300000

// Runs the plan's verify command through the platform shell in cwd. Returns {ok, status, tail}: status is
// null when the command did not finish (a timeout), and tail is the last VERIFY_TAIL characters of its output.
function runVerify(cwd, command, { timeoutMs = VERIFY_TIMEOUT_MS } = {}) {
  try {
    const r = spawnSync(command, {
      cwd,
      shell: true,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    })
    let output = `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`.trim()
    if (r.error) output += `${output ? '\n' : ''}[verify did not finish: ${r.error.message ?? r.error}]`
    return { ok: !r.error && r.status === 0, status: r.error ? null : r.status, tail: output.slice(-VERIFY_TAIL) }
  } catch (e) {
    return { ok: false, status: null, tail: `[verify did not finish: ${e?.message ?? e}]` }
  }
}

// Removes one slot's worktree, then its branch (if it still exists). null, or a failure string.
function removeSlot(cwd, worktree, branch) {
  try {
    const w = git.worktreeRemove(cwd, worktree)
    if (!w.ok) return w.failure
    if (git.branchesMatching(cwd, branch).includes(branch)) {
      const b = git.branchDelete(cwd, branch)
      if (!b.ok) return b.failure
    }
    return null
  } catch (e) {
    return String(e?.message ?? e)
  }
}

// Removes the slot worktree and branch of each task id in ids that this run left, and nothing else.
function sweepSlots(cwd, runId, ids) {
  const out = { removed: [], failures: [] }
  try {
    const worktrees = git.worktreesMatching(cwd, `tierminator-${runId}-`)
    const branches = git.branchesMatching(cwd, `tierminator/${runId}/`)
    for (const id of ids) {
      const wt = worktrees.find(w => w.path.endsWith(`-${id}`))
      const branch = `tierminator/${runId}/${id}`
      if (!wt && !branches.some(b => b.endsWith(`/${id}`))) continue
      const worktree = wt ? wt.path : require('./wave-run.js').slotPlacement(runId, git.repoRoot(cwd), id).worktree
      const failure = removeSlot(cwd, worktree, branch)
      if (failure) out.failures.push(`${id}: ${failure}`)
      else out.removed.push(id)
    }
  } catch (e) {
    out.failures.push(String(e?.message ?? e))
  }
  return out
}

// Picks the done slots of the closed wave in state onto the main tree's branch, then verifies and cleans up.
// Returns {problem, picked, setAside, conflicts, verify, cleanFailures}; problem is a "MAIN TREE: ..." text
// when the main tree could not be picked into, and the run must halt.
function integrateWave(state, cwd) {
  const result = { problem: null, picked: [], setAside: [], conflicts: {}, verify: null, cleanFailures: [] }
  try {
    const wave = state.wave
    const halting = !!wave.halting
    const head = git.head(cwd)
    if (head !== wave.base) {
      result.problem = `MAIN TREE: the run branch is on ${String(head).slice(0, 7)} but the wave base is ${String(wave.base).slice(0, 7)}`
      return result
    }
    if (!git.isClean(cwd)) {
      result.problem = 'MAIN TREE: the main working tree has uncommitted changes'
      return result
    }

    for (const id of wave.size) {
      const slot = wave.slots[id]
      if (slot?.status !== 'done') continue
      const sha = git.git(cwd, ['rev-parse', '--verify', '-q', `refs/heads/${slot.branch}`]).stdout
      if (!sha) {
        result.setAside.push(id)
        result.conflicts[id] = []
        continue
      }
      const before = git.head(cwd)
      const res = git.cherryPick(cwd, sha)
      if (res.ok) {
        result.picked.push(id)
      } else {
        if (git.pickInProgress(cwd)) {
          const abort = git.cherryPickAbort(cwd)
          if (!abort.ok) {
            result.problem = `MAIN TREE: ${abort.failure}`
            return result
          }
        }
        result.setAside.push(id)
        result.conflicts[id] = res.conflicts
      }
      if (!res.ok && (git.head(cwd) !== before || !git.isClean(cwd))) {
        result.problem = 'MAIN TREE: a failed pick left the main tree changed'
        return result
      }
    }

    if (result.picked.length && !halting && wave.size.length > 1 && typeof state.verify === 'string' && state.verify) {
      const v = runVerify(cwd, state.verify)
      result.verify = { command: state.verify, ok: v.ok, status: v.status, tail: v.tail }
      if (!v.ok) return result
    }

    for (const id of result.picked) {
      const slot = wave.slots[id]
      const failure = removeSlot(cwd, slot.worktree, slot.branch)
      if (failure) result.cleanFailures.push(`${id}: ${failure}`)
    }
  } catch (e) {
    result.problem = `MAIN TREE: integration failed: ${String(e?.message ?? e)}`
  }
  return result
}

// The closed state after integration, and what Claude is told next. Pure. `state` is the closed state (wave.phase
// 'integrating'; phase 'running', or 'halted' when the wave was halting); `result` is integrateWave's result.
function applyIntegration(state, result, { head, root, cap } = {}) {
  const done = state.done.filter(d => !result.setAside.includes(d.id))
  const wave = { ...state.wave, phase: 'integrated', setAside: result.setAside, picked: result.picked }
  const base = { ...state, done, wave }
  const picked = result.picked.length ? result.picked.join(', ') : 'none'
  const ids = result.setAside.join(', ')
  const conflictLine = result.setAside.length
    ? `${ids} conflicted when picked, so ${result.setAside.length > 1 ? 'they were' : 'it was'} left out of the picks and will run again serially on the new HEAD`
    : ''
  const cleanLine = result.cleanFailures?.length ? `Cleanup left: ${result.cleanFailures.join('; ')}.` : ''
  const { branch, planFile: file } = state
  const n = state.wave.n
  const join = parts => parts.filter(Boolean).join(' ')

  if (state.phase === 'halted') {
    return {
      state: base,
      tail: join([
        result.problem ? `Integrating the passers stopped: ${result.problem}.` : '',
        conflictLine ? `${conflictLine}.` : '',
        cleanLine,
      ]),
    }
  }
  if (result.problem) {
    return {
      state: { ...base, phase: 'halted', halt: { task: null, tried: [], reason: result.problem } },
      tail:
        `tierminator: wave ${n} stopped: ${result.problem}. Picked onto ${branch} before it stopped: ${picked}. ` +
        'Slot worktrees and branches are left in place. Tell the user what stopped the run; to resume they type ' +
        `/tierminator:execute "${file}". Do not dispatch more tasks.`,
    }
  }
  if (result.verify && !result.verify.ok) {
    const v = result.verify
    const reason = `the plan verify failed: ${v.command} (${v.status == null ? 'did not finish' : `exit ${v.status}`})`
    return {
      state: { ...base, phase: 'halted', halt: { task: null, tried: [], reason } },
      tail:
        `tierminator: wave ${n} stopped: the plan verify failed after the picks: ${v.command} ended with ` +
        `${v.status == null ? 'no exit status' : `exit status ${v.status}`}. Output (last part): ${v.tail}. ` +
        `The run branch ${branch} holds the picks (${picked}); nothing was reset, and the slot worktrees and ` +
        'branches are left in place. Tell the user which verify failed and what it printed; to resume they type ' +
        `/tierminator:execute "${file}" (verify runs again after the next parallel wave, not on resume). ` +
        'Do not fix it or dispatch more tasks.',
    }
  }
  const step = w.nextWave({ ...base, phase: 'running' }, head, root, cap)
  const next = step.kind === 'serial' ? r.dispatchText(step.state) : step.kind === 'wave' ? w.startText(step.state) : r.completeText(step.state)
  return {
    state: step.state,
    tail: join([
      `Integration: picked ${picked} onto ${branch}.`,
      result.verify ? `The plan verify passed (${result.verify.command}).` : '',
      conflictLine ? `${conflictLine}.` : '',
      cleanLine,
      next,
    ]),
  }
}

module.exports = { VERIFY_TAIL, VERIFY_TIMEOUT_MS, runVerify, integrateWave, applyIntegration, removeSlot, sweepSlots }
