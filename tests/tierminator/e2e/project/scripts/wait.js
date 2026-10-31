'use strict'
// Sleeps for the number of seconds in argv[2] (default 1), then exits 0.
const seconds = Number(process.argv[2] ?? 1)
setTimeout(() => process.exit(0), Math.max(0, seconds) * 1000)
