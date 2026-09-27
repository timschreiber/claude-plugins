// Writes the plan shapes that dialog-shapes-run.md feeds to the plan approval dialog, to find
// what makes it withhold a plan as "too large to be shown in full".
//
//   node probes/planandtier/make-dialog-shapes.js
//
// Each shape varies one thing: total size, line length, or whether a long line is inside a
// code fence. S6 is S3 wrapped in SIDECAR markers, for the probe's PROBE_DIALOG=1 mode.
// Every shape carries the opt-out line, so an installed planandtier gate lets it through.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const dir = path.join(os.tmpdir(), 'planandtier-dialog-shapes')

function filler(n) {
  const unit = 'lorem ipsum dolor sit amet '
  return unit.repeat(Math.ceil(n / unit.length)).slice(0, n)
}

const lines = (count, width) => Array.from({ length: count }, () => filler(width)).join('\n')
const fenced = width => ['```json', filler(width), '```'].join('\n')

const bodies = {
  S1: lines(300, 70),
  S2: fenced(2900),
  S3: fenced(4500),
  S4: filler(4500),
  S5: lines(94, 150),
  S6: ['<!-- SIDECAR-TEST -->', '<!-- SIDECAR-START -->', fenced(4500), '<!-- SIDECAR-END -->'].join('\n'),
}

fs.mkdirSync(dir, { recursive: true })
for (const [name, body] of Object.entries(bodies)) {
  const text = `# Shape ${name}\n\nTiered execution: off\n\n${body}\n`
  const file = path.join(dir, `${name}.md`)
  fs.writeFileSync(file, text)
  const all = text.split('\n')
  const longest = Math.max(...all.map(l => l.length))
  console.log(`${name}  ${Buffer.byteLength(text)} bytes  ${all.length - 1} lines  longest ${longest}  ${file}`)
}
