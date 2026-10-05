// Resolves the command that runs Claude. GRINDINATOR_CLAUDE_BIN replaces `claude` (tests point it
// at a stub). A value ending in .js, .cjs or .mjs is run with this Node, so a Node stub works on
// every platform. Later runner code spawns `command` with [...args, ...claudeArgs].
'use strict'

const path = require('path')

function claudeCommand(env = process.env) {
  const value = (env.GRINDINATOR_CLAUDE_BIN ?? '').trim()
  if (value === '') return { command: 'claude', args: [] }
  if (/\.(js|cjs|mjs)$/i.test(value)) return { command: process.execPath, args: [path.resolve(value)] }
  return { command: value, args: [] }
}

module.exports = { claudeCommand }
