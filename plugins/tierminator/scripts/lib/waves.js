// Waves of a graph plan: pure functions over the normalized tasks (lib/tasks.js), no I/O, nothing throws. A task's
// wave is 1 when it has no unfinished dependency, else 1 + the largest wave among its unfinished dependencies, so
// every task of a wave is independent of the others. Waves and the ids in a wave are in id order. A done task is left
// out and counts as satisfied.
'use strict'

const DEFAULT_MAX_PARALLEL = 5

// The dependencies of tasks[i]: its `after`, or, for a task that was not normalized, the previous task.
const depsOf = (tasks, i) => (Array.isArray(tasks[i].after) ? tasks[i].after : i === 0 ? [] : [tasks[i - 1].id])

// Map of task id -> wave number for the tasks not in doneIds. One pass in task order is enough: a dependency is
// always an earlier task, and one that is done, unknown or not seen yet counts as satisfied.
function levels(tasks, doneIds = []) {
  const done = new Set(doneIds)
  const level = new Map()
  tasks.forEach((task, i) => {
    if (done.has(task.id)) return
    const deepest = depsOf(tasks, i).reduce((m, d) => Math.max(m, done.has(d) ? 0 : (level.get(d) ?? 0)), 0)
    level.set(task.id, deepest + 1)
  })
  return level
}

// The wave of one task, or null when the task is done or unknown.
const waveOf = (tasks, id, doneIds = []) => levels(tasks, doneIds).get(id) ?? null

// The waves of the tasks not done: arrays of ids in id order, wave 1 first.
function waves(tasks, doneIds = []) {
  const out = []
  for (const [id, n] of levels(tasks, doneIds)) (out[n - 1] ??= []).push(id)
  return out
}

// The queued ids that may start now: `queued` holds the ids of the wave not started yet, in id order. Returns those
// not in flight, at most as many as there are free slots under the cap (none when cap is not an integer).
function startable(queued, inFlight, cap) {
  const room = Math.max(0, (Number.isInteger(cap) ? cap : 0) - inFlight.length)
  return queued.filter(id => !inFlight.includes(id)).slice(0, room)
}

// TIERMINATOR_MAX_PARALLEL when it is a positive integer, else 5.
function maxParallel(env = process.env) {
  const text = String(env?.TIERMINATOR_MAX_PARALLEL ?? '').trim()
  return /^[1-9][0-9]*$/.test(text) ? Number(text) : DEFAULT_MAX_PARALLEL
}

module.exports = { DEFAULT_MAX_PARALLEL, waveOf, waves, startable, maxParallel }
