// A local stand-in for the Anthropic API, for the Grindinator probes.
//
//   node probes/grindinator/mock-api.js --self-test
//
// startMock({ mode, logFile, resetEpoch }) resolves to { url, close }. Modes: limit (429), error (400),
// pass (forward to api.anthropic.com). Every request appends one JSON line to logFile. Request header
// values are never logged. See probes/grindinator/README.md, section 'mock-api.js'.
'use strict'

const http = require('http')
const https = require('https')
const fs = require('fs')
const os = require('os')
const path = require('path')

function authKindOf(headers) {
  if (headers['authorization'] !== undefined) return 'bearer'
  if (headers['x-api-key'] !== undefined) return 'x-api-key'
  return 'none'
}

function parseBody(body) {
  try {
    const parsed = JSON.parse(body.toString('utf8'))
    if (parsed && typeof parsed === 'object') {
      return {
        model: parsed.model === undefined ? null : parsed.model,
        stream: parsed.stream === undefined ? null : parsed.stream
      }
    }
  } catch (e) { /* not JSON */ }
  return { model: null, stream: null }
}

function errorBody(type, message, n) {
  return JSON.stringify({ type: 'error', error: { type, message }, request_id: 'req_probe_' + n })
}

function startMock({ mode, logFile, resetEpoch }) {
  let n = 0

  function log(line) {
    fs.appendFileSync(logFile, JSON.stringify(line) + '\n')
  }

  function answer(res, status, headers, body) {
    res.writeHead(status, headers)
    res.end(body)
  }

  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('error', () => { try { res.destroy() } catch (e) { /* ignore */ } })
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      n += 1
      const myN = n
      const { model, stream } = parseBody(body)
      const line = {
        at: new Date().toISOString(),
        n: myN,
        method: req.method,
        url: req.url,
        headerNames: Object.keys(req.headers).map((h) => h.toLowerCase()).sort(),
        authKind: authKindOf(req.headers),
        model,
        stream,
        bodyBytes: body.length
      }

      if (mode === 'pass') {
        const headers = Object.assign({}, req.headers, { host: 'api.anthropic.com' })
        const upstream = https.request(
          { hostname: 'api.anthropic.com', port: 443, method: req.method, path: req.url, headers },
          (up) => {
            const rateHeaders = {}
            for (const [name, value] of Object.entries(up.headers)) {
              if (name.startsWith('anthropic-ratelimit') || name === 'retry-after' || name === 'x-should-retry') {
                rateHeaders[name] = value
              }
            }
            line.status = up.statusCode
            line.responseHeaderNames = Object.keys(up.headers).map((h) => h.toLowerCase()).sort()
            line.rateHeaders = rateHeaders
            log(line)
            res.writeHead(up.statusCode, up.rawHeaders)
            up.pipe(res)
          }
        )
        upstream.on('error', (err) => {
          line.upstreamError = err.message
          log(line)
          if (!res.headersSent) {
            answer(res, 502, { 'content-type': 'application/json' },
              JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'probe: upstream error: ' + err.message }, request_id: 'req_probe_' + myN }))
          } else {
            res.destroy()
          }
        })
        upstream.write(body)
        upstream.end()
        return
      }

      log(line)
      const isMessages = typeof req.url === 'string' && req.url.startsWith('/v1/messages')
      if (!isMessages) {
        answer(res, 404, { 'content-type': 'application/json' },
          errorBody('not_found_error', 'probe: not found', myN))
      } else if (mode === 'limit') {
        const now = Math.floor(Date.now() / 1000)
        const retryAfter = Math.max(1, resetEpoch - now)
        answer(res, 429, {
          'content-type': 'application/json',
          'retry-after': String(retryAfter),
          'x-should-retry': 'false',
          'request-id': 'req_probe_' + myN,
          'anthropic-ratelimit-unified-status': 'rejected',
          'anthropic-ratelimit-unified-reset': String(resetEpoch),
          'anthropic-ratelimit-unified-representative-claim': 'five_hour',
          'anthropic-ratelimit-unified-5h-status': 'rejected',
          'anthropic-ratelimit-unified-5h-reset': String(resetEpoch),
          'anthropic-ratelimit-unified-5h-utilization': '1.0'
        }, errorBody('rate_limit_error', 'This request would exceed your account rate limit. Please try again later.', myN))
      } else {
        answer(res, 400, {
          'content-type': 'application/json',
          'x-should-retry': 'false'
        }, errorBody('invalid_request_error', 'probe: invalid request', myN))
      }
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      resolve({
        url: 'http://127.0.0.1:' + port,
        close() {
          return new Promise((done) => {
            server.close(() => done())
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
          })
        }
      })
    })
  })
}

module.exports = { startMock }

function post(url, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url + urlPath, { method: 'POST', headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

async function selfTest() {
  const logFile = path.join(os.tmpdir(), 'grindinator-mock-selftest-' + process.pid + '.jsonl')
  try { fs.rmSync(logFile, { force: true }) } catch (e) { /* ignore */ }
  const failures = []
  const check = (ok, what) => { if (!ok) failures.push(what) }
  const resetEpoch = Math.floor(Date.now() / 1000) + 7200
  const payload = '{}'
  const headers = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(payload)),
    authorization: 'Bearer probe-secret-123'
  }

  const limit = await startMock({ mode: 'limit', logFile, resetEpoch })
  try {
    const r = await post(limit.url, '/v1/messages', headers, payload)
    check(r.status === 429, 'limit mode status is 429, got ' + r.status)
    check(r.headers['anthropic-ratelimit-unified-reset'] === String(resetEpoch),
      'anthropic-ratelimit-unified-reset equals resetEpoch, got ' + r.headers['anthropic-ratelimit-unified-reset'])
    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
    check(lines.length === 1, 'limit mode wrote one log line, got ' + lines.length)
    let entry = {}
    try { entry = JSON.parse(lines[0]) } catch (e) { check(false, 'log line is JSON') }
    check(entry.authKind === 'bearer', 'log authKind is bearer, got ' + entry.authKind)
    check(entry.n === 1, 'log n is 1, got ' + entry.n)
    check(!fs.readFileSync(logFile, 'utf8').includes('probe-secret-123'), 'log file does not contain the secret')
  } finally {
    await limit.close()
  }

  const err = await startMock({ mode: 'error', logFile, resetEpoch })
  try {
    const r = await post(err.url, '/v1/messages', headers, payload)
    check(r.status === 400, 'error mode status is 400, got ' + r.status)
  } finally {
    await err.close()
  }

  try { fs.rmSync(logFile, { force: true }) } catch (e) { /* ignore */ }
  if (failures.length) {
    console.log('self-test FAILED: ' + failures.join('; '))
    process.exit(1)
  }
  console.log('self-test ok')
  process.exit(0)
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest().catch((e) => {
      console.log('self-test FAILED: ' + (e && e.message ? e.message : e))
      process.exit(1)
    })
  } else {
    console.log('usage: node probes/grindinator/mock-api.js --self-test')
    process.exit(1)
  }
}
