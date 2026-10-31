'use strict'
// Exits 1 until the marker file in argv[2] exists, then 0. The e2e runner creates the marker as the user's fix.
const fs = require('fs')
const marker = process.argv[2]
if (marker && fs.existsSync(marker)) process.exit(0)
console.error(`GATE CLOSED: ${marker ?? '(no marker given)'} does not exist`)
process.exit(1)
