// Stop hook for /decidinator:import. Once every answer that needed an oracle judgment has one, blocks the
// stop once and hands the model the final import report to show the user. If the model stopped before
// dispatching the judgments, blocks once with the dispatches to make. Silent when there is no import
// job, when it was delivered, and while judgments are still running.
'use strict'

const { runArmed, emit } = require('./lib/hook.js')
const config = require('./lib/config.js')
const state = require('./lib/state.js')
const msg = require('./lib/messages.js')
const importer = require('./lib/importer.js')

runArmed(async input => {
  const sid = input.session_id
  const s = state.read(sid)
  const job = s?.importJob
  if (!job || job.delivered) return
  const step = importer.stopStep(job)
  if (step === 'deliver') {
    if (state.update(sid, cur => cur && importer.setDelivered(cur))) {
      emit({ decision: 'block', reason: msg.importFinal(importer.report(job)) })
    }
    return
  }
  if (step === 'remind' && input.stop_hook_active !== true) {
    const cfg = config.forInput(input).config
    const unsent = importer.waitingItems(s).filter(i => !i.dispatched)
    if (state.update(sid, cur => cur && importer.setReminded(cur))) {
      emit({ decision: 'block', reason: `${msg.IMPORT_REMIND}\n\n${importer.judgmentInstructions(unsent, cfg)}` })
    }
  }
})
