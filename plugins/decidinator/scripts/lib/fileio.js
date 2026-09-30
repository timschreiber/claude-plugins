// File access for Decidinator's log and sidecar: writes go to a temp file and are renamed into
// place, and every read-modify-write runs under a lock file, because hooks can run close together.
// Nothing here throws to callers of update(); it returns {ok, ...} with an error naming the file.
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { debug } = require('./debug.js')

// Mutable so tests can lower them.
const limits = { timeoutMs: 10000, staleMs: 30000, retryMs: 20 }

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function withLock(file, fn) {
  const lock = `${file}.lock`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const started = Date.now()
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx')
      try {
        fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}`)
      } finally {
        fs.closeSync(fd)
      }
      break
    } catch (e) {
      if (e.code !== 'EEXIST') {
        return { ok: false, error: `${file}: could not create the lock file (${e.code})` }
      }
      let stale = false
      try {
        stale = Date.now() - fs.statSync(lock).mtimeMs > limits.staleMs
      } catch {}
      if (stale) {
        fs.rmSync(lock, { force: true })
        continue
      }
      if (Date.now() - started > limits.timeoutMs) {
        return { ok: false, error: `${file}: timed out waiting for the lock file ${lock}` }
      }
      sleep(limits.retryMs + Math.floor(Math.random() * limits.retryMs))
    }
  }
  try {
    return fn()
  } finally {
    try {
      fs.rmSync(lock, { force: true })
    } catch {}
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return ''
    throw e
  }
}

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tmp, text)
    for (let attempt = 1; ; attempt++) {
      try {
        fs.renameSync(tmp, file)
        return
      } catch (e) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || attempt >= 10) throw e
        sleep(limits.retryMs)
      }
    }
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {}
    throw e
  }
}

// mutate(text) returns {ok:true, text, ...extra} or {ok:false, error}. The file is rewritten only
// when the text changed. The returned object is mutate's, without its text.
function update(file, mutate) {
  try {
    return withLock(file, () => {
      const text = readText(file)
      const r = mutate(text)
      if (r.ok && r.text !== text) {
        writeAtomic(file, r.text)
        debug(`fileio: wrote ${file}`)
      }
      delete r.text
      return r
    })
  } catch (e) {
    return { ok: false, error: `${file}: ${e.message}` }
  }
}

module.exports = { limits, sleep, withLock, readText, writeAtomic, update }
