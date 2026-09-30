// Turns the Decidinator WP-01 probe evidence into per-item verification results.
//
//   node probes/decidinator/analyze.js
//
// Discovers every cell from probes/evidence/decidinator-probe-<cell>-hooks.jsonl, loads its
// -agents.json, -run.json and -transcript.jsonl (when present), and writes
// probes/evidence/decidinator-verification-results.json.
'use strict'

const fs = require('fs')
const path = require('path')

const EVIDENCE = path.join(__dirname, '..', 'evidence')
const TOKEN = 'DECIDINATOR-PROBE-DENY-7F3K'

function cut(s, n) {
  s = String(s)
  return s.length > n ? s.slice(0, n) + '…(' + s.length + ')' : s
}

function readJsonLines(file) {
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // skip unparseable lines
    }
  }
  return out
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function keyUnion(inputs) {
  const set = new Set()
  for (const i of inputs) for (const k of Object.keys(i || {})) set.add(k)
  return [...set].sort()
}

function cutValues(obj, n) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === 'string') out[k] = cut(v, n)
    else {
      const s = JSON.stringify(v)
      out[k] = s !== undefined && s.length > n ? cut(s, n) : v
    }
  }
  return out
}

function loadCells() {
  const cells = []
  const re = /^decidinator-probe-(.+)-hooks\.jsonl$/
  for (const f of fs.readdirSync(EVIDENCE).sort()) {
    const m = re.exec(f)
    if (!m) continue
    const name = m[1]
    const prefix = path.join(EVIDENCE, 'decidinator-probe-' + name)
    const run = readJson(prefix + '-run.json', {})
    const tf = prefix + '-transcript.jsonl'
    cells.push({
      name,
      hooks: readJsonLines(path.join(EVIDENCE, f)),
      agents: readJson(prefix + '-agents.json', []),
      run,
      interactive: run.interactive === true,
      transcript: fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8') : '',
    })
  }
  return cells
}

function endsWith(agent, suffix) {
  return typeof agent.agent_type === 'string' && agent.agent_type.endsWith(suffix)
}

function item1(cells) {
  const out = {}
  for (const c of cells) {
    const researcher = c.agents.find(a => endsWith(a, ':researcher'))
    if (!researcher) continue
    const calls = []
    for (const rec of c.hooks) {
      const input = rec.input || {}
      if (rec.event !== 'PreToolUse' || !input.agent_id) continue
      const tool = input.tool_name
      if (!(tool === 'WebFetch' || tool === 'WebSearch' || tool === 'Bash' || String(tool).startsWith('mcp__'))) continue
      const ti = input.tool_input || {}
      const call = { tool_name: tool, target: ti.url || ti.query || ti.command }
      const id = input.tool_use_id
      const post = c.hooks.some(r => r.event === 'PostToolUse' && r.input && r.input.tool_use_id === id)
      const fail = c.hooks.find(r => r.event === 'PostToolUseFailure' && r.input && r.input.tool_use_id === id)
      if (post) call.outcome = 'post'
      else if (fail) {
        call.outcome = 'failure'
        call.error = cut(JSON.stringify(fail.input.error ?? fail.input.tool_response ?? null), 300)
      } else call.outcome = 'none'
      calls.push(call)
    }
    out[c.name] = { report: researcher.last_assistant_message ?? null, calls }
  }
  return out
}

function item2(cells) {
  const stops = []
  for (const c of cells) for (const r of c.hooks) if (r.event === 'SubagentStop') stops.push(r.input || {})
  const researcher = stops.find(i => typeof i.agent_type === 'string' && i.agent_type.endsWith(':researcher'))
  let sample = null
  if (researcher) {
    sample = { ...researcher }
    if (typeof sample.last_assistant_message === 'string') sample.last_assistant_message = cut(sample.last_assistant_message, 300)
  }
  return {
    subagentStopKeys: keyUnion(stops),
    withoutAgentType: stops.filter(i => !i.agent_type).length,
    withoutLastMessage: stops.filter(i => !i.last_assistant_message).length,
    sample,
  }
}

function item3(cells) {
  const main = []
  const sub = []
  for (const c of cells) {
    for (const r of c.hooks) {
      if (r.event !== 'PreToolUse') continue
      const input = r.input || {}
      ;(input.agent_id ? sub : main).push(input)
    }
  }
  let subagentSample = null
  if (sub.length) {
    subagentSample = { ...sub[0], tool_input: cutValues(sub[0].tool_input, 200) }
  }
  return {
    counts: { main: main.length, subagent: sub.length },
    keysMain: keyUnion(main),
    keysSubagent: keyUnion(sub),
    subagentSample,
  }
}

function distinctSorted(values) {
  return [...new Set(values)].sort()
}

function item4(cells) {
  const byCell = {}
  for (const c of cells) {
    const byEvent = {}
    for (const r of c.hooks) (byEvent[r.event] = byEvent[r.event] || []).push(r.input || {})
    const keysByEvent = {}
    for (const ev of Object.keys(byEvent).sort()) keysByEvent[ev] = keyUnion(byEvent[ev])
    byCell[c.name] = {
      interactive: c.interactive,
      env: c.hooks.length ? c.hooks[0].env ?? null : null,
      keysByEvent,
    }
  }

  const headless = cells.filter(c => !c.interactive)
  const interactive = cells.filter(c => c.interactive)
  if (!headless.length || !interactive.length) return { byCell, differences: null }

  const envValues = (group, name) =>
    distinctSorted(
      group.flatMap(c => c.hooks.map(r => (r.env && name in r.env ? String(r.env[name]) : '<absent>'))),
    )
  const names = new Set()
  for (const c of cells) for (const r of c.hooks) for (const n of Object.keys(r.env || {})) names.add(n)
  const env = []
  for (const name of [...names].sort()) {
    const h = envValues(headless, name)
    const i = envValues(interactive, name)
    if (JSON.stringify(h) !== JSON.stringify(i)) env.push({ name, headless: h, interactive: i })
  }

  const eventsOf = group => new Set(group.flatMap(c => c.hooks.map(r => r.event)))
  const events = new Set([...eventsOf(headless), ...eventsOf(interactive)])
  const unionFor = (c, ev) => new Set(keyUnion(c.hooks.filter(r => r.event === ev).map(r => r.input)))
  const has = (c, ev) => c.hooks.some(r => r.event === ev)
  const everyIn = (group, ev) => {
    const sets = group.filter(c => has(c, ev)).map(c => unionFor(c, ev))
    if (!sets.length) return new Set()
    return new Set([...sets[0]].filter(k => sets.every(s => s.has(k))))
  }
  const anyIn = (group, ev) => new Set(group.filter(c => has(c, ev)).flatMap(c => [...unionFor(c, ev)]))
  const keys = {}
  for (const ev of [...events].sort()) {
    const hAll = everyIn(headless, ev)
    const iAll = everyIn(interactive, ev)
    const hAny = anyIn(headless, ev)
    const iAny = anyIn(interactive, ev)
    const headlessOnly = [...hAll].filter(k => !iAny.has(k)).sort()
    const interactiveOnly = [...iAll].filter(k => !hAny.has(k)).sort()
    if (headlessOnly.length || interactiveOnly.length) keys[ev] = { headlessOnly, interactiveOnly }
  }
  return { byCell, differences: { env, keys } }
}

function item5(cells) {
  const out = {}
  for (const c of cells) {
    if (!c.name.includes('deny')) continue
    const mainCalls = c.hooks
      .filter(r => r.event === 'PreToolUse' && r.input && !r.input.agent_id)
      .map(r => r.input.tool_name)
      .filter(t => t === 'Read' || t === 'AskUserQuestion')
    const stops = c.hooks.filter(r => r.event === 'Stop')
    const last = stops.length ? stops[stops.length - 1].input || {} : {}
    const finalMessage = typeof last.last_assistant_message === 'string' ? last.last_assistant_message : ''
    out[c.name] = {
      mainCalls,
      tokenInTranscript: c.transcript.includes(TOKEN),
      tokenInFinalMessage: finalMessage.includes(TOKEN),
      finalMessage: cut(finalMessage, 1000),
    }
  }
  return out
}

function item6(cells) {
  const out = {}
  for (const c of cells) {
    const a = c.agents.find(x => endsWith(x, ':model-probe') || endsWith(x, ':model-probe-sonnet'))
    if (!a) continue
    const post = c.hooks.find(
      r => r.event === 'PostToolUse' && r.input && r.input.tool_name === 'Agent' && r.input.tool_response,
    )
    const mainModels = []
    for (const line of c.transcript.split('\n')) {
      if (!line.trim()) continue
      try {
        const m = JSON.parse(line).message
        if (m && m.model && !mainModels.includes(m.model)) mainModels.push(m.model)
      } catch {
        // skip unparseable lines
      }
    }
    out[c.name] = {
      agent_type: a.agent_type,
      effort: a.effort ?? null,
      models: a.models || [],
      report: a.last_assistant_message ?? null,
      resolvedModel: post ? post.input.tool_response.resolvedModel ?? null : null,
      mainModels,
      finalMessage: c.run && typeof c.run.result === 'string' ? c.run.result : null,
    }
  }
  return out
}

function main() {
  const cells = loadCells()
  const results = {
    generated: new Date().toISOString(),
    claudeCodeVersion: cells.length ? cells[0].run.claudeCodeVersion ?? null : null,
    cells: cells.map(c => ({ name: c.name, interactive: c.interactive, records: c.hooks.length })),
    item1: item1(cells),
    item2: item2(cells),
    item3: item3(cells),
    item4: item4(cells),
    item5: item5(cells),
    item6: item6(cells),
  }
  fs.writeFileSync(path.join(EVIDENCE, 'decidinator-verification-results.json'), JSON.stringify(results, null, 2) + '\n')

  console.log(`cells: ${results.cells.length} (${results.cells.filter(c => c.interactive).length} interactive)`)
  const i1 = Object.entries(results.item1)
  console.log(`item1: ${i1.length} cells with a researcher, ${i1.reduce((n, [, v]) => n + v.calls.length, 0)} calls`)
  console.log(
    `item2: ${results.item2.subagentStopKeys.length} keys, ${results.item2.withoutAgentType} without agent_type, ${results.item2.withoutLastMessage} without last message`,
  )
  console.log(`item3: ${results.item3.counts.main} main, ${results.item3.counts.subagent} subagent PreToolUse records`)
  console.log(
    `item4: ${Object.keys(results.item4.byCell).length} cells, differences ${results.item4.differences ? 'computed' : 'null'}`,
  )
  console.log(`item5: ${Object.keys(results.item5).length} deny cells`)
  console.log(`item6: ${Object.keys(results.item6).length} model cells`)
}

main()
