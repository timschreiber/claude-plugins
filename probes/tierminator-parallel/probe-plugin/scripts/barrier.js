// Barrier for probe P4 of docs/tierminator/tierminator-parallel-findings.md: makes the probe workers finish
// close together. A cmd-worker runs it as its one command:
//   node barrier.js <dir> <id> <count> <staggerMs> <log>
// It writes <dir>/<id>.ready, waits (polling every 50 ms, at most 120 s) until <count> .ready files exist, waits
// <staggerMs> more, appends one {tag: "barrier"} line to <log>, prints "released <id> <ISO time>" and exits 0,
// or 3 when the 120 s ran out first.
'use strict'

const fs = require('fs')
const path = require('path')

const [dir, id, count, staggerMs, logFile] = process.argv.slice(2)
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const ready = () => fs.readdirSync(dir).filter(n => n.endsWith('.ready')).length

fs.mkdirSync(dir, { recursive: true })
const readyAt = new Date().toISOString()
fs.writeFileSync(path.join(dir, id + '.ready'), readyAt)
const deadline = Date.now() + 120000
while (ready() < Number(count) && Date.now() < deadline) sleep(50)
const timedOut = ready() < Number(count)
const releasedAt = new Date().toISOString()
sleep(Number(staggerMs) || 0)
const endedAt = new Date().toISOString()
fs.appendFileSync(logFile, JSON.stringify({ at: endedAt, tag: 'barrier', id, pid: process.pid, readyAt, releasedAt, endedAt, timedOut }) + '\n')
console.log('released ' + id + ' ' + endedAt)
process.exitCode = timedOut ? 3 : 0
