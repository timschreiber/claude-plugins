// Test helper: node mint-many.js <projectDir> <n>. Mints one ID n times with the default log and
// sidecar paths and prints them as a JSON array. Run in parallel by the concurrency test.
'use strict'

const path = require('path')

const lib = path.join(__dirname, '..', '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const ids = require(path.join(lib, 'ids.js'))
const { DEFAULTS } = require(path.join(lib, 'config.js'))
const [projectDir, n] = process.argv.slice(2)

const out = []
for (let i = 0; i < Number(n); i++) {
  const r = ids.mint(1, { projectDir, decisionLog: DEFAULTS.decisionLog, sidecar: DEFAULTS.sidecar })
  if (!r) process.exit(1)
  out.push(...r)
}
console.log(JSON.stringify(out))
