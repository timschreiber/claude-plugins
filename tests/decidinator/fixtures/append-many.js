// Test helper: node append-many.js <log|sidecar> <file> <count>. Appends <count> minimal entries and
// exits 1 on the first failure. Run in parallel by the concurrency tests.
'use strict'

const path = require('path')

const lib = path.join(__dirname, '..', '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const [kind, file, count] = process.argv.slice(2)
const mod = require(path.join(lib, kind === 'sidecar' ? 'sidecar.js' : 'decision-log.js'))

for (let i = 0; i < Number(count); i++) {
  const question = `q${process.pid}-${i}`
  const entry = kind === 'sidecar'
    ? { topic: 't', question }
    : { title: 't', question, answer: 'a', provenance: 'user' }
  const r = mod.append(file, entry)
  if (!r.ok) {
    console.error(r.error)
    process.exit(1)
  }
}
