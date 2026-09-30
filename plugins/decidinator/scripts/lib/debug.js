// Debug logging for Decidinator's hooks: only when DECIDINATOR_DEBUG is 1, to a file in the temp
// directory, never to stdout, and never throwing.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const logFile = () => path.join(os.tmpdir(), 'decidinator-debug.log')

function debug(message) {
  if (process.env.DECIDINATOR_DEBUG !== '1') return
  try {
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${message}\n`)
  } catch {}
}

module.exports = { debug, logFile }
