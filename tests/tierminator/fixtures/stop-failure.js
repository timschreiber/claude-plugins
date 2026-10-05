// WP-01's StopFailure payloads and transcript error lines (docs/grindinator/grindinator-verification.md, V1 and
// V3), from a mock 429 (OAuth and API-key logins) and a mock 400. Paths are trimmed: each test sets
// session_id, cwd and transcript_path.
'use strict'

const DOT = '·'
const MESSAGES = {
  oauth: `You've hit your session limit ${DOT} resets 1:51am (America/New_York)`,
  apikey: `API Error: Request rejected (429) ${DOT} This request would exceed your account rate limit. Please try again later.`,
  error: 'API Error: 400 probe: invalid request',
}
const ERRORS = { oauth: 'rate_limit', apikey: 'rate_limit', error: 'unknown' }
const RESET_OAUTH = 1791179511

const PAYLOADS = Object.fromEntries(
  Object.keys(MESSAGES).map(kind => [kind, {
    session_id: '232d6957-45aa-465f-968e-824a5ff69f1c',
    transcript_path: '',
    cwd: '/repo',
    prompt_id: '75f46ad6-f8be-42e9-a5a0-96416effcbec',
    effort: { level: 'low' },
    hook_event_name: 'StopFailure',
    error: ERRORS[kind],
    last_assistant_message: MESSAGES[kind],
  }])
)

// The error message line Claude Code writes to the transcript; quotaLimits appears on the OAuth login only.
const errorLine = kind => ({
  type: 'assistant',
  isSidechain: false,
  message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text: MESSAGES[kind] }] },
  ...(kind === 'oauth'
    ? { quotaLimits: { status: 'rejected', resetsAt: RESET_OAUTH, unifiedRateLimitFallbackAvailable: false, rateLimitType: 'five_hour', isUsingOverage: false } }
    : {}),
  ...(kind === 'apikey' ? { apiErrorIsTransient: false } : {}),
  error: ERRORS[kind],
  isApiErrorMessage: true,
  apiErrorStatus: kind === 'error' ? 400 : 429,
})

const USER_LINE = { type: 'user', isSidechain: false, message: { role: 'user', content: 'Reply with OK.' } }

// A transcript as JSONL: a user line, then the error line.
const transcript = kind => [USER_LINE, errorLine(kind)].map(l => JSON.stringify(l)).join('\n') + '\n'

module.exports = { PAYLOADS, MESSAGES, RESET_OAUTH, errorLine, transcript }
