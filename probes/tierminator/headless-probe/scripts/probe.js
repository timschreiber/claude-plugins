'use strict'
const fs = require('fs')
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'))
  if (process.env.PROBE_LOG) {
    fs.appendFileSync(
      process.env.PROBE_LOG,
      JSON.stringify({
        event: input.hook_event_name,
        prompt: input.prompt,
        permission_mode: input.permission_mode,
        entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT ?? null,
        time: new Date().toISOString(),
      }) + '\n',
    )
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'probe note: token PROBE-7731',
      },
    }),
  )
} catch {
  // never throw
}
process.exit(0)
