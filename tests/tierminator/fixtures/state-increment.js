'use strict'

// A child process for the state lock tests: increments n in one session's state `count` times, through
// state.update ('update') or a plain read then write ('naive', the lost-update control), starting at `startAt`
// (ms since the epoch) so that every child begins together. Prints {"ok": <increments saved>}.
const state = require('../../../plugins/tierminator/scripts/lib/state.js')

const [mode, sessionId, count, startAt] = process.argv.slice(2)
while (Date.now() < Number(startAt)) {}
let ok = 0
for (let i = 0; i < Number(count); i++) {
  if (mode === 'naive') {
    if (state.write(sessionId, { n: (state.read(sessionId)?.n ?? 0) + 1 })) ok++
  } else if (state.update(sessionId, s => ({ n: (s?.n ?? 0) + 1 }), { waitMs: 60000 }).ok) ok++
}
process.stdout.write(JSON.stringify({ ok }))
