'use strict'
// Fails the first time it runs and passes after. argv[2] is a marker file outside the repository.
const fs = require('fs')
const path = require('path')
const marker = process.argv[2]
if (!marker) {
  console.error('usage: node scripts/flaky.js <marker file>')
  process.exit(2)
}
if (fs.existsSync(marker)) process.exit(0)
fs.mkdirSync(path.dirname(marker), { recursive: true })
fs.writeFileSync(marker, 'seen\n')
console.error('FLAKY: the first run fails on purpose')
process.exit(1)
