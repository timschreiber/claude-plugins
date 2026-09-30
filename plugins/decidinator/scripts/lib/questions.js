// Question state logic for the gate and the dispatch check. Pure: no file access, and no function
// mutates its input. The session state shape is {v, order, questions, passThrough, handbacks, guard}; a question's
// status is pending (ladder running), final-unresolved or resolved, and any other status counts as
// settled. Which question is due is derived from the state, never stored: the first ID in `order`
// that is pending, at its own rung. A question is in flight when a dispatch is recorded at its due rung.
'use strict'

const { questionHash } = require('./normalize.js')
const reasons = require('./reasons.js')

const { oneLine } = reasons
const STATUS = { PENDING: 'pending', RESOLVED: 'resolved', FINAL_UNRESOLVED: 'final-unresolved' }
const PASS_THROUGH_BY = ['review', 'confirm']

const emptyState = () => ({ v: 1, order: [], questions: {}, passThrough: null })

// The calls of an AskUserQuestion tool_input, or null when its shape is not usable.
function fromCall(toolInput) {
  const qs = toolInput?.questions
  if (!Array.isArray(qs) || qs.length === 0) return null
  const out = []
  const seen = new Set()
  for (const item of qs) {
    if (item === null || typeof item !== 'object' || typeof item.question !== 'string' || item.question.trim() === '') {
      return null
    }
    const hash = questionHash(item.question)
    if (seen.has(hash)) continue
    seen.add(hash)
    const options = (Array.isArray(item.options) ? item.options : [])
      .filter(o => o !== null && typeof o === 'object' && typeof o.label === 'string')
      .map(o => ({ label: oneLine(o.label), description: typeof o.description === 'string' ? oneLine(o.description) : '' }))
    out.push({
      question: item.question,
      header: typeof item.header === 'string' ? item.header : '',
      options,
      multiSelect: !!item.multiSelect,
      hash
    })
  }
  return out
}

function findByHash(s, hash) {
  for (let i = s.order.length - 1; i >= 0; i--) {
    const q = s.questions[s.order[i]]
    if (q && q.hash === hash) return q
  }
  return null
}

function classify(s, calls) {
  return calls.map(call => {
    const q = findByHash(s, call.hash)
    let kind = 'new'
    if (q) kind = q.status === STATUS.PENDING ? 'pending' : q.status === STATUS.FINAL_UNRESOLVED ? 'open' : 'settled'
    return { call, q, kind }
  })
}

function addQuestions(s, calls, ids, now) {
  const next = { ...s, order: [...s.order], questions: { ...s.questions } }
  calls.forEach((c, i) => {
    const id = ids[i]
    next.order.push(id)
    next.questions[id] = {
      id,
      question: c.question,
      header: c.header,
      options: c.options.map(o => ({ ...o })),
      multiSelect: c.multiSelect,
      hash: c.hash,
      status: STATUS.PENDING,
      rung: 1,
      verdicts: [],
      dispatches: [],
      createdAt: now
    }
  })
  return next
}

function due(s, rungs) {
  for (const id of s.order) {
    const q = s.questions[id]
    if (!q || q.status !== STATUS.PENDING) continue
    const rung = Math.min(Math.max(Number.isInteger(q.rung) ? q.rung : 1, 1), rungs.length)
    return { id, rung, agent: rungs[rung - 1], q }
  }
  return null
}

function dispatchPrompt(q, rung, cfg) {
  const lines = [
    `Decidinator question ${q.id}`,
    `Rung: ${rung}`,
    `Decision log: ${cfg.decisionLog}`,
    `Sidecar: ${cfg.sidecar}`,
    `Question: ${oneLine(q.question)}`
  ]
  if (!q.options || q.options.length === 0) {
    lines.push('Options: none')
  } else {
    lines.push('Options:')
    for (const o of q.options) {
      const label = oneLine(o.label)
      const description = oneLine(o.description)
      lines.push(description ? `- ${label}: ${description}` : `- ${label}`)
    }
  }
  lines.push(`Context: ${reasons.CONTEXT_PLACEHOLDER}`)
  const earlier = (q.verdicts ?? []).filter(v => v.rung < rung).sort((a, b) => a.rung - b.rung)
  if (earlier.length > 0) lines.push(`Earlier verdicts: ${JSON.stringify(earlier.map(v => v.verdict))}`)
  return lines.join('\n')
}

function dueDispatch(s, cfg) {
  const d = due(s, cfg.rungs)
  return d ? { id: d.id, rung: d.rung, agent: d.agent, prompt: dispatchPrompt(d.q, d.rung, cfg) } : null
}

function decideGate(s, classified, mode, cfg) {
  const idOf = c => c.q.id
  const allIds = classified.map(idOf)
  const pending = classified.filter(c => c.kind === 'pending')
  if (pending.length > 0) return { deny: reasons.held(dueDispatch(s, cfg), pending.map(idOf)) }
  const open = classified.filter(c => c.kind === 'open')
  const settledIds = classified.filter(c => c.kind === 'settled').map(idOf)
  if (open.length === 0) return { deny: reasons.settled(allIds) }
  if (mode === 'sidecar') return { deny: reasons.sidecar(allIds, cfg.sidecar) }
  if (settledIds.length === 0) return { allow: true }
  return { deny: reasons.narrow(settledIds, open.map(c => ({ id: c.q.id, question: c.q.question }))) }
}

// null when the Agent call is the due dispatch, else the problem text.
function checkDispatch(d, toolInput) {
  if (toolInput?.subagent_type !== d.agent) return reasons.wrongAgent(toolInput?.subagent_type, d)
  const prompt = typeof toolInput?.prompt === 'string' ? toolInput.prompt : ''
  if (!new RegExp(`\\b${d.id}\\b`).test(prompt)) return reasons.missingId(d)
  return null
}

function recordDispatch(s, id, rung, toolUseId, now) {
  const q = s.questions[id]
  if (!q) return s
  const dispatches = [...(q.dispatches ?? []), { rung, at: now, toolUseId: toolUseId ?? null }]
  return { ...s, questions: { ...s.questions, [id]: { ...q, dispatches } } }
}

function inFlight(q, rung) {
  return !!q && (q.dispatches ?? []).some(x => x.rung === rung)
}

function guardKey(id, rung, running) {
  return `${id}@${rung}:${running ? 'running' : 'due'}`
}

function recordVerdict(s, id, entry) {
  const q = s.questions[id]
  if (!q) return s
  if ((q.verdicts ?? []).some(v => v.rung === entry.rung)) return s
  return { ...s, questions: { ...s.questions, [id]: { ...q, verdicts: [...(q.verdicts ?? []), entry] } } }
}

function applyLadder(s, id, outcome, now) {
  const q = s.questions[id]
  if (!q) return s
  let newQ
  if (outcome?.outcome === 'escalate') newQ = { ...q, rung: outcome.rung }
  else if (outcome?.outcome === 'resolved') newQ = { ...q, status: STATUS.RESOLVED, settledAt: now }
  else if (outcome?.outcome === 'final-unresolved') newQ = { ...q, status: STATUS.FINAL_UNRESOLVED, settledAt: now }
  else return s
  return { ...s, questions: { ...s.questions, [id]: newQ }, guard: null }
}

function setHandback(s, agentId, message) {
  if (typeof agentId !== 'string' || agentId === '' || typeof message !== 'string') return s
  return { ...s, handbacks: { ...(s.handbacks ?? {}), [agentId]: message } }
}

function dropHandback(s, agentId) {
  if (!s.handbacks || !Object.hasOwn(s.handbacks, agentId)) return s
  const { [agentId]: _dropped, ...rest } = s.handbacks
  return { ...s, handbacks: rest }
}

function guardStep(s, key, max) {
  const g = s.guard && s.guard.key === key ? s.guard : { key, blocks: 0, steppedAside: false }
  if (g.steppedAside) return { action: 'pass', state: null }
  if (g.blocks < max) {
    return { action: 'deny', blocks: g.blocks + 1, state: { ...s, guard: { key, blocks: g.blocks + 1, steppedAside: false } } }
  }
  return { action: 'step-aside', blocks: g.blocks, state: { ...s, guard: { key, blocks: g.blocks, steppedAside: true } } }
}

function setPassThrough(s, by, promptId) {
  if (!PASS_THROUGH_BY.includes(by)) return s
  return { ...s, passThrough: { by, promptId } }
}

function passThroughActive(s, promptId) {
  const p = s?.passThrough
  return !!p && typeof promptId === 'string' && promptId !== '' && p.promptId === promptId
}

module.exports = {
  STATUS,
  emptyState,
  fromCall,
  findByHash,
  classify,
  addQuestions,
  due,
  dispatchPrompt,
  dueDispatch,
  decideGate,
  checkDispatch,
  recordDispatch,
  inFlight,
  guardKey,
  recordVerdict,
  applyLadder,
  setHandback,
  dropHandback,
  guardStep,
  setPassThrough,
  passThroughActive
}
