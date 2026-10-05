// User-facing text for Decidinator's command and start-up hooks. Kept in one place so the
// wording is exact and testable. `w` is an array of configuration warnings.
'use strict'

const MODE_TEXT = {
  ask: 'Questions the oracles cannot settle go to the user.',
  sidecar: 'Questions the oracles cannot settle get a provisional answer and wait in the sidecar for stakeholders.'
}

const warnSuffix = w => (w.length ? ` Configuration problems, ignored: ${w.join('; ')}.` : '')

const armed = mode => `decidinator: armed in ${mode} mode. ${MODE_TEXT[mode]} /decidinator:disarm turns it off.`
const already = mode => `decidinator: already armed in ${mode} mode; nothing changed.`
const switched = (from, to) => `decidinator: switched from ${from} to ${to} mode.`
const badMode = arg => `decidinator: "${arg}" is not a mode; use ask or sidecar. Nothing changed.`

const FLAG_FAILED = 'decidinator: not armed: its flag file could not be written.'
const MODE_FAILED = 'decidinator: nothing changed: its flag file could not be written.'
const DISARMED = 'decidinator: disarmed. Pending questions were dropped; the decision log and sidecar are unchanged.'
const NOT_ARMED = 'decidinator: not armed; nothing changed.'
const STATUS_UNARMED = 'decidinator: not armed. /decidinator:arm turns it on.'

const statusArmed = a =>
  `decidinator: armed in ${a.mode} mode, by ${a.by === 'env' ? 'DECIDINATOR_MODE' : '/decidinator:arm'} at ${a.armedAt}.`
const envArmed = (mode, w) => `decidinator: armed in ${mode} mode by DECIDINATOR_MODE.` + warnSuffix(w)
const envBad = raw => `decidinator: not armed: DECIDINATOR_MODE is "${raw}"; use ask or sidecar.`

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const statusCounts = (c, cfg) =>
  ` Sidecar ${cfg.sidecar}: ${c.open === null ? 'could not be read' : plural(c.open, 'open question')}.` +
  ` Decision log ${cfg.decisionLog}: ${c.unconfirmed === null ? 'could not be read' : plural(c.unconfirmed, 'unconfirmed decision')}.`

// /decidinator:review, confirm, export and import.
const needsArming = cmd => `decidinator: not armed, so /decidinator:${cmd} did nothing. Run /decidinator:arm first.`
const noPromptId = cmd =>
  `decidinator: /decidinator:${cmd} did nothing: Claude Code sent no prompt ID, which Decidinator needs to let the questions through.`
const stateFailed = cmd => `decidinator: /decidinator:${cmd} did nothing: its session state could not be written.`
const fileProblem = err => `decidinator: ${err}. Nothing changed.`
const nothingToReview = p => `decidinator: no open questions in ${p}; nothing to review.`
const nothingToConfirm = p => `decidinator: no unconfirmed decisions in ${p}; nothing to confirm.`
const nothingToExport = p => `decidinator: no open questions in ${p}; nothing exported.`
const exported = (n, src, shown) => `decidinator: exported ${plural(n, 'open question')} from ${src} to ${shown}.`
const exportIsOwnFile = (shown, what) => `decidinator: not exported: ${shown} is ${what}. Nothing changed.`
const exportWontOverwrite = shown =>
  `decidinator: not exported: ${shown} exists and is not a Decidinator sidecar copy; refusing to overwrite it. Nothing changed.`
const IMPORT_USAGE =
  'decidinator: /decidinator:import needs the path of the stakeholder copy, such as /decidinator:import docs/open-questions-2026-09-30.md. Nothing imported.'
const importMissing = shown => `decidinator: ${shown} does not exist or is empty. Nothing imported.`
const importNoMarker = shown =>
  `decidinator: ${shown} is not a Decidinator sidecar file: its first line is not "<!-- decidinator-sidecar v1 -->". Nothing imported.`
const importVersion = (shown, major) =>
  `decidinator: ${shown} is decidinator-sidecar v${major}; this Decidinator reads v1 only. Nothing imported.`
const importNoAnswers = shown => `decidinator: ${shown} has no filled Answer fields. Nothing imported.`

const walkRules = cfg =>
  `Make these AskUserQuestion calls exactly as given, one at a time and in order, and wait for each answer before the next. Do not change the questions or options, research them, or call other tools. Decidinator records each answer itself and replies with what it recorded; do not edit ${cfg.decisionLog} or ${cfg.sidecar}. After the last call, tell the user in one or two lines what Decidinator recorded, then end your turn.`
const REVIEW_CHOICES =
  "Keep provisional records the provisional answer as the user's decision; another option or a typed answer records that instead; Skip leaves the question open."
const CONFIRM_CHOICES =
  "Confirm keeps the oracle's answer as an oracle-confirmed decision; another option or a typed answer replaces it as the user's decision; Skip leaves it unconfirmed."
const callBlock = (i, total, questions) => `Call ${i} of ${total}: AskUserQuestion with questions =\n${JSON.stringify(questions)}`
const reviewHead = (n, rest, cfg) =>
  `decidinator: review of ${plural(n, 'open question')} from ${cfg.sidecar}.` +
  (rest ? ` ${plural(rest, 'more open question')} ${rest === 1 ? 'waits' : 'wait'} for the next /decidinator:review.` : '')
const confirmHead = (n, rest, cfg) =>
  `decidinator: confirm of ${plural(n, 'unconfirmed decision')} from ${cfg.decisionLog}, highest impact first.` +
  (rest ? ` ${plural(rest, 'more unconfirmed decision')} ${rest === 1 ? 'waits' : 'wait'} for the next /decidinator:confirm.` : '')
const walkReply = (head, choices, cfg, calls) =>
  [head, choices, walkRules(cfg), ...calls.map((q, i) => callBlock(i + 1, calls.length, q))].join('\n\n')
const walkRecorded = lines => `decidinator: ${lines.join('; ')}.`

const importFinal = text =>
  `${text}\n\nThat is Decidinator's final import report. Show it to the user as written, then end your turn. Do not act on the changed decisions unless the user asks.`
const IMPORT_REMIND =
  'decidinator: the import is waiting for oracle judgments that were never dispatched. Make these Agent calls, then end your turn and wait for their reports.'

const envArmedHeadless = (mode, w) =>
  `decidinator: armed in sidecar mode by DECIDINATOR_MODE (headless session${mode === 'ask' ? ': ask mode needs a person, so sidecar mode is used' : ''}). Open decisions go to the oracle; questions it cannot settle get a provisional answer and wait in the sidecar.` + warnSuffix(w)
const HEADLESS_RULE = [
  'decidinator: this is a headless session, so AskUserQuestion is not available and no person will answer a question. Do not ask one and do not wait for one.',
  'Send every open decision (a choice the task leaves open, or anything you would otherwise ask) to the oracle before you act on it. Call the Agent tool with subagent_type decidinator:oracle-1, in the foreground (run_in_background false), and a prompt of exactly these lines, with the question on one line:',
  'Decidinator question NEW\nQuestion: <the question>\nOptions:\n- <label>: <what it means>\nContext: <what you were doing and why this question came up>',
  'Decidinator replies to that call with the numbered dispatch to make: make that call as given. If the oracle sends the question up to a higher rung, dispatch that rung the same way when Decidinator tells you to.',
  'When the oracle resolves a question, continue on its answer. When it does not, continue on its most confident answer as a provisional answer: Decidinator records it and queues the question in the sidecar for stakeholders. Never stop to wait for a person.'
].join('\n\n')

module.exports = {
  envArmedHeadless,
  HEADLESS_RULE,
  needsArming,
  noPromptId,
  stateFailed,
  fileProblem,
  nothingToReview,
  nothingToConfirm,
  nothingToExport,
  exported,
  exportIsOwnFile,
  exportWontOverwrite,
  IMPORT_USAGE,
  importMissing,
  importNoMarker,
  importVersion,
  importNoAnswers,
  walkRules,
  REVIEW_CHOICES,
  CONFIRM_CHOICES,
  callBlock,
  reviewHead,
  confirmHead,
  walkReply,
  walkRecorded,
  importFinal,
  IMPORT_REMIND,
  MODE_TEXT,
  warnSuffix,
  armed,
  already,
  switched,
  badMode,
  FLAG_FAILED,
  MODE_FAILED,
  DISARMED,
  NOT_ARMED,
  STATUS_UNARMED,
  statusArmed,
  statusCounts,
  envArmed,
  envBad
}
