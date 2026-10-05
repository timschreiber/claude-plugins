// Stand-in for a gate command in the Grindinator runner tests. Not a test file.
// Usage: node gate.js [failing package id ...]
// Environment:
//   GRINDINATOR_PACKAGE        the package id; 'none' when unset.
//   GRINDINATOR_GATE_SLEEP_MS  wait before setting the exit code. Default 0.
// Writes 'gate stdout <id> <cwd>' to stdout and 'gate stderr <id>' to stderr. The exit code is 1 when
// the id is among the arguments, else 0. Never calls process.exit, so output flushes.
'use strict'

const id = process.env.GRINDINATOR_PACKAGE || 'none'

process.stdout.write(`gate stdout ${id} ${process.cwd()}\n`)
process.stderr.write(`gate stderr ${id}\n`)
setTimeout(() => {
  process.exitCode = process.argv.slice(2).includes(id) ? 1 : 0
}, Number(process.env.GRINDINATOR_GATE_SLEEP_MS) || 0)
