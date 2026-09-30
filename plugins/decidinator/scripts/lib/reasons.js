// Deny reasons for the gate, the dispatch check, the guard and the oracle shell allowlist, and the nudge's block reason. Every text the model sees from those hooks is
// here, and tests/decidinator/fixtures/snapshots/deny-reasons.json pins each one: change a text and
// its snapshot together. `d` is a due dispatch {id, rung, agent, prompt}.
'use strict'

const CONTEXT_PLACEHOLDER = '<what you were doing and why this question came up>'

const idList = ids => ids.join(', ')
const hasHave = ids => (ids.length === 1 ? 'has' : 'have')
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim()

function agentCall(d) {
  return [
    `Call the Agent tool with exactly these parameters. In the prompt, replace ${CONTEXT_PLACEHOLDER} on the Context line with the surrounding context: the task, the files involved, and the constraints you know.`,
    `subagent_type: ${d.agent}`,
    `description: Decidinator ${d.id} rung ${d.rung}`,
    'prompt:',
    d.prompt
  ].join('\n')
}

const AFTER_DISPATCH =
  'The Agent call returns at once and the oracle researches in the background; its report arrives when it finishes. Do not call AskUserQuestion for these questions again until the report has come in.'

const waitingText = heldIds =>
  heldIds.length === 1
    ? `Question ${heldIds[0]} is waiting for oracle research.`
    : `Questions ${idList(heldIds)} are waiting for oracle research.`

function held(d, heldIds) {
  return [
    `decidinator: not shown to the user yet. ${waitingText(heldIds)} Questions are researched one at a time, in order; ${d.id} is next.`,
    agentCall(d),
    AFTER_DISPATCH
  ].join('\n\n')
}

const REDISPATCH = 'If its report has already arrived, or the research failed, dispatch it again:'
const running = d => `The oracle for ${d.id} (rung ${d.rung}) is researching in the background.`

function heldWaiting(d, heldIds) {
  return [
    `decidinator: not shown to the user yet. ${waitingText(heldIds)} ${running(d)} End your turn now and wait: its report arrives on its own when it finishes. Do not call AskUserQuestion for these questions until it has come in.`,
    REDISPATCH,
    agentCall(d)
  ].join('\n\n')
}

function guardDue(d) {
  return [
    `decidinator: tool call not run. ${d.id} is waiting for oracle research at rung ${d.rung}, and other tools are held until you dispatch it.`,
    agentCall(d),
    AFTER_DISPATCH
  ].join('\n\n')
}

function guardWaiting(d) {
  return [
    `decidinator: tool call not run. ${running(d)} End your turn now and wait: its report arrives on its own when it finishes, and then you continue.`,
    REDISPATCH,
    agentCall(d)
  ].join('\n\n')
}

const guardSteppedAside = (id, rung, max) =>
  `decidinator: the guard stepped aside for ${id} (rung ${rung}) after ${max} blocked tool calls in a row, so tools run again. ${id} still waits for oracle research.`

// open: [{id, question}] still final-unresolved; settledIds: the rest.
function narrow(settledIds, open) {
  const list = open.map(q => `${q.id} "${oneLine(q.question)}"`).join('; ')
  return `decidinator: not shown to the user: ${idList(settledIds)} already ${hasHave(settledIds)} an answer, in the oracle's report. Call AskUserQuestion again with only the questions still open, using the options the oracle researched: ${list}.`
}

function settled(ids) {
  return `decidinator: not shown to the user: ${idList(ids)} already ${hasHave(ids)} an answer. Continue with it; the oracle's report has it. Do not ask again.`
}

function sidecar(ids, sidecarPath) {
  return `decidinator: sidecar mode, so questions are not put to the user in this session. Continue on the answer in the oracle's report for ${idList(ids)}: an unresolved question uses the oracle's provisional answer and waits in ${sidecarPath} for stakeholders.`
}

const wrongAgent = (got, d) =>
  `it starts ${got ? `"${got}"` : 'no subagent_type'}, but ${d.id} is waiting for ${d.agent}`
const missingId = d => `its prompt does not contain ${d.id}`

function refused(problem, d) {
  return [
    `decidinator: Agent call refused: ${problem}. Oracle research for ${d.id} comes first.`,
    agentCall(d),
    AFTER_DISPATCH
  ].join('\n\n')
}

const ORACLE_SHELL_RULE =
  'Oracles may run one gh search, gh repo view or read-only gh api (GET) command per call, with no pipes, redirects, chaining or variables; filter output with --jq. Read project files with Read, Glob and Grep, and use WebFetch or WebSearch for the web.'

const oracleShell = problem => `decidinator: command not run: ${problem}. ${ORACLE_SHELL_RULE}`

const ORACLE_MONITOR =
  'decidinator: Monitor not run: oracles may not start background commands. Run one gh search, gh repo view or read-only gh api (GET) command through Bash instead.'

const NUDGE =
  'decidinator: your last message ends with a question in plain text. If it is for the user, ask it through the AskUserQuestion tool instead, with options, so Decidinator can research and record it. If it is not for the user, end your turn again.'

module.exports = { CONTEXT_PLACEHOLDER, oneLine, agentCall, AFTER_DISPATCH, REDISPATCH, held, heldWaiting, guardDue, guardWaiting, guardSteppedAside, narrow, settled, sidecar, wrongAgent, missingId, refused, ORACLE_SHELL_RULE, oracleShell, ORACLE_MONITOR, NUDGE }
