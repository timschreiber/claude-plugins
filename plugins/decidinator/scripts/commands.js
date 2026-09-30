// UserPromptSubmit hook: handles /decidinator:arm [ask|sidecar], /decidinator:disarm and
// /decidinator:status (which also reports the open sidecar and unconfirmed decision-log counts), and the
// sidecar commands /decidinator:review, confirm, export and import. Commands work whether or not the session is armed, so this uses run()
// rather than runArmed(); review, confirm and import answer "not armed" instead, because the hooks that
// record their answers are silent in an unarmed session. Configuration problems are reported in the
// reply, never a reason to refuse. Every write to the log and sidecar is made here or in the hooks,
// never by the model.
'use strict'

const path = require('path')
const { readInput, emitText, run } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const msg = require('./lib/messages.js')
const resolution = require('./lib/resolution.js')
const decisionLog = require('./lib/decision-log.js')
const sidecar = require('./lib/sidecar.js')
const md = require('./lib/mdfile.js')
const io = require('./lib/fileio.js')
const Q = require('./lib/questions.js')
const walks = require('./lib/walks.js')
const exporter = require('./lib/export.js')
const importer = require('./lib/importer.js')
const record = require('./lib/record.js')
const { questionHash } = require('./lib/normalize.js')

const COMMAND = /^\s*\/decidinator:(arm|disarm|status|review|confirm|export|import)(?![\w-])([\s\S]*)$/

function arm(input, arg) {
  const id = input.session_id
  const existing = state.readArming(id)
  if (arg !== '' && !state.MODES.includes(arg.toLowerCase())) return msg.badMode(arg)
  const { config: cfg, warnings } = config.forInput(input)
  const mode = arg ? arg.toLowerCase() : existing ? existing.mode : cfg.mode
  if (existing) {
    if (mode === existing.mode) return msg.already(mode) + msg.warnSuffix(warnings)
    if (!state.setMode(id, mode)) return msg.MODE_FAILED
    return msg.switched(existing.mode, mode) + msg.warnSuffix(warnings)
  }
  if (!state.arm(id, mode, 'command')) return msg.FLAG_FAILED
  state.prune(state.PRUNE_DAYS)
  return msg.armed(mode) + msg.warnSuffix(warnings)
}

function disarm(input) {
  const id = input.session_id
  const wasArmed = !!state.readArming(id)
  state.disarm(id)
  return wasArmed ? msg.DISARMED : msg.NOT_ARMED
}

function status(input) {
  const a = state.readArming(input.session_id)
  const { config: cfg, warnings } = config.forInput(input)
  const c = resolution.counts(config.projectDir(input), cfg)
  return (a ? msg.statusArmed(a) : msg.STATUS_UNARMED) + msg.statusCounts(c, cfg) + msg.warnSuffix(warnings)
}

// One leading and trailing quote pair is dropped, so a quoted path with spaces works.
function pathArg(raw) {
  const t = String(raw ?? '').trim()
  const m = /^(["'])([\s\S]*)\1$/.exec(t)
  return m ? m[2] : t
}

// {model} for a file that may be read and written (a missing file is an empty model), else {error}.
function readChecked(read, file, kind) {
  const r = read(file)
  if (!r.ok) return { error: r.error }
  const check = md.checkWritable(file, r.model.lines, kind)
  return check.ok ? { model: r.model } : { error: check.error }
}

function paths(input) {
  const { config: cfg } = config.forInput(input)
  const project = config.projectDir(input)
  return { cfg, project, logFile: path.resolve(project, cfg.decisionLog), sideFile: path.resolve(project, cfg.sidecar) }
}

// Shared by review and confirm: stores the walk and the pass-through, and returns the reply.
function startWalk(input, by) {
  if (!state.readArming(input.session_id)) return msg.needsArming(by)
  if (typeof input.prompt_id !== 'string' || input.prompt_id === '') return msg.noPromptId(by)
  const { cfg, logFile, sideFile } = paths(input)
  const side = readChecked(sidecar.read, sideFile, 'sidecar')
  if (side.error) return msg.fileProblem(side.error)
  const log = readChecked(decisionLog.read, logFile, 'log')
  if (log.error) return msg.fileProblem(log.error)

  const items = by === 'review' ? walks.reviewItems(side.model) : walks.confirmItems(log.model, side.model)
  if (items.length === 0) return by === 'review' ? msg.nothingToReview(cfg.sidecar) : msg.nothingToConfirm(cfg.decisionLog)
  const page = items.slice(0, walks.MAX_ITEMS)
  const rest = items.length - page.length
  const walk = walks.walkState(by, input.prompt_id, page, new Date().toISOString())
  const saved = state.update(input.session_id, cur => ({ ...Q.setPassThrough(cur ?? Q.emptyState(), by, input.prompt_id), walk }))
  if (!saved) return msg.stateFailed(by)
  return by === 'review'
    ? msg.walkReply(msg.reviewHead(page.length, rest, cfg), msg.REVIEW_CHOICES, cfg, walks.calls(page))
    : msg.walkReply(msg.confirmHead(page.length, rest, cfg), msg.CONFIRM_CHOICES, cfg, walks.calls(page))
}

const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b)

function exportCmd(input, arg) {
  const { cfg, project, logFile, sideFile } = paths(input)
  const side = readChecked(sidecar.read, sideFile, 'sidecar')
  if (side.error) return msg.fileProblem(side.error)
  const open = side.model.entries.map(e => e.question).filter(q => q.status === 'open')
  if (open.length === 0) return msg.nothingToExport(cfg.sidecar)

  const date = new Date().toISOString().slice(0, 10)
  const rel = pathArg(arg) || exporter.defaultPath(cfg.sidecar, date)
  const abs = path.resolve(project, rel)
  const shown = exporter.displayPath(project, abs)
  if (samePath(abs, sideFile)) return msg.exportIsOwnFile(shown, 'the sidecar')
  if (samePath(abs, logFile)) return msg.exportIsOwnFile(shown, 'the decision log')
  let existing
  try {
    existing = io.readText(abs)
  } catch (e) {
    return msg.fileProblem(`${shown}: ${e.message}`)
  }
  if (existing.trim() !== '' && md.readMarker(md.splitLines(existing))?.kind !== 'sidecar') return msg.exportWontOverwrite(shown)
  const r = io.update(abs, () => ({ ok: true, text: exporter.render(open, { source: cfg.sidecar, date }) }))
  if (!r.ok) return msg.fileProblem(r.error)
  return msg.exported(open.length, cfg.sidecar, shown)
}

function importCmd(input, arg) {
  if (!state.readArming(input.session_id)) return msg.needsArming('import')
  const rel = pathArg(arg)
  if (rel === '') return msg.IMPORT_USAGE
  const { cfg, project, logFile, sideFile } = paths(input)
  const abs = path.resolve(project, rel)
  const shown = exporter.displayPath(project, abs)
  let text
  try {
    text = io.readText(abs)
  } catch (e) {
    return msg.fileProblem(`${shown}: ${e.message}`)
  }
  if (text.trim() === '') return msg.importMissing(shown)
  const marker = md.readMarker(md.splitLines(text))
  if (!marker || marker.kind !== 'sidecar') return msg.importNoMarker(shown)
  if (marker.major !== 1) return msg.importVersion(shown, marker.major)
  const answered = sidecar.answers(sidecar.parse(text)).sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)))
  if (answered.length === 0) return msg.importNoAnswers(shown)

  const side = readChecked(sidecar.read, sideFile, 'sidecar')
  if (side.error) return msg.fileProblem(side.error)
  const log = readChecked(decisionLog.read, logFile, 'log')
  if (log.error) return msg.fileProblem(log.error)
  const repo = new Map(side.model.entries.map(e => [e.id, e.question]))

  const items = answered.map(a => {
    const repoQ = repo.get(a.id)
    const item = {
      id: a.id,
      decision: null,
      supersedes: null,
      dependsOn: repoQ?.dependsOn ?? [],
      question: repoQ?.question ?? '',
      provisionalAnswer: repoQ?.provisionalAnswer ?? '',
      answer: a.answer,
      cls: 'skipped',
      note: '',
      dispatched: false
    }
    if (!repoQ) return { ...item, note: `not in ${cfg.sidecar}.` }
    if (repoQ.status !== 'open') return { ...item, note: `already ${repoQ.status} in ${cfg.sidecar}.` }
    if (questionHash(repoQ.question) !== questionHash(a.question.question)) {
      return { ...item, note: `its question differs from the one in ${cfg.sidecar}.` }
    }
    const r = record.recordEntryAnswer({
      logFile,
      sideFile,
      entryId: a.id,
      provenance: 'stakeholder',
      answer: a.answer,
      rationale: `${repoQ.stakeholder || 'A stakeholder'} answered in ${shown}.`,
      status: 'imported'
    })
    if (!r.ok) return { ...item, cls: 'failed', note: `${r.error}.` }
    return { ...item, ...importer.classify(repoQ, a.answer), decision: r.id, supersedes: r.supersedes }
  })

  const job = { promptId: input.prompt_id ?? null, file: shown, createdAt: new Date().toISOString(), delivered: false, reminded: false, items }
  if (items.some(i => i.cls === 'waiting')) {
    const saved = state.update(input.session_id, cur => ({ ...(cur ?? Q.emptyState()), importJob: job }))
    if (!saved) {
      job.items = items.map(i =>
        i.cls === 'waiting'
          ? { ...i, cls: 'changed', note: 'not judged: the session state could not be written, so it counts as changed.' }
          : i
      )
    }
  } else {
    state.update(input.session_id, cur => (cur ? { ...cur, importJob: null } : null))
  }
  const waiting = job.items.filter(i => i.cls === 'waiting')
  return waiting.length > 0 ? `${importer.report(job)}\n\n${importer.judgmentInstructions(waiting, cfg)}` : importer.report(job)
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  const m = COMMAND.exec(String(input.prompt ?? ''))
  if (!m) return
  const arg = m[2].trim()
  const text =
    m[1] === 'arm' ? arm(input, arg)
    : m[1] === 'disarm' ? disarm(input)
    : m[1] === 'status' ? status(input)
    : m[1] === 'review' || m[1] === 'confirm' ? startWalk(input, m[1])
    : m[1] === 'export' ? exportCmd(input, arg)
    : importCmd(input, arg)
  if (text) emitText(text)
})
