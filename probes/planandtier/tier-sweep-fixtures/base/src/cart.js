'use strict'

// A cart line is { name, priceCents, qty }.

// One line's total, in cents.
function getItemTotal(line) {
  return line.priceCents * line.qty
}

// The whole cart's total, in cents.
function cartTotal(lines) {
  return lines.reduce((sum, line) => sum + getItemTotal(line), 0)
}

module.exports = { getItemTotal, cartTotal }
