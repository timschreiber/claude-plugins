// Debug logging for Grindinator: only when GRINDINATOR_DEBUG is 1, to a file in the temp directory,
// never to stdout, and never throwing.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const logFile = () => path.join(os.tmpdir(), 'grindinator-debug.log')

function debug(message) {
  if (process.env.GRINDINATOR_DEBUG !== '1') return
  try {
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${message}\n`)
  } catch {}
}

module.exports = { debug, logFile }
