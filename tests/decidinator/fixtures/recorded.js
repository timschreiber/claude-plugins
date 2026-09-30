// Test helper: the hook records captured in probes/evidence/.
'use strict'

const fs = require('fs')
const path = require('path')

const evidence = path.join(__dirname, '..', '..', '..', 'probes', 'evidence')

function load(name) {
  return fs
    .readFileSync(path.join(evidence, name), 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line))
}

// A deep copy of the `input` of the first record of `name` for which predicate(record) is true.
function input(name, predicate) {
  const record = load(name).find(predicate)
  if (!record) throw new Error(`no matching record in ${name}`)
  return JSON.parse(JSON.stringify(record.input))
}

module.exports = { load, input }
