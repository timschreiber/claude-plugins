// Test fixture: a hook built on runArmed that echoes the session and mode, or throws with argv 'throw'.
'use strict'

const path = require('path')
const { runArmed, emitText } = require(path.join(__dirname, '..', '..', '..', 'plugins', 'decidinator', 'scripts', 'lib', 'hook.js'))

runArmed(async (input, arming) => {
  if (process.argv[2] === 'throw') throw new Error('armed-echo failure')
  emitText(`ran ${input.session_id} ${arming.mode}`)
})
