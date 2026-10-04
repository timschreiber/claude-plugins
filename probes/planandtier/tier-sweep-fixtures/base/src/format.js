'use strict'

// Cents as dollars: 1999 is "$19.99", -5 is "-$0.05".
function formatPrice(cents) {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

module.exports = { formatPrice }
