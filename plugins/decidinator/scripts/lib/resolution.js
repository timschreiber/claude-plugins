// Mode resolution for a question whose oracle ladder has ended (resolved or final-unresolved). WP-07
// replaces this stub: it writes the decision log and, in sidecar mode, the sidecar. For now it is pure
// and returns the state unchanged. ctx is {outcome, mode, cfg, input}.
'use strict'

function onFinal(s, id, ctx) {
  return s
}

module.exports = { onFinal }
