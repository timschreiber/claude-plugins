'use strict'

const { getItemTotal, cartTotal } = require('./cart.js')

// One row per line ("<name> x<qty>: $<line total>"), then "Total: $<cart total>".
function report(lines) {
  const rows = lines.map(line => `${line.name} x${line.qty}: $${(getItemTotal(line) / 100).toFixed(2)}`)
  rows.push(`Total: $${(cartTotal(lines) / 100).toFixed(2)}`)
  return rows.join('\n')
}

module.exports = { report }
