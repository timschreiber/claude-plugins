// Model prices for tierminator's spend estimates, in USD per million tokens, per category. Each category
// has its own price because the multipliers differ by model (cache reads on Opus 5.5 are 0.05x its input
// price, not the usual 0.1x). From Anthropic's pricing page; see probes/evidence/planandtier-pricing.json.
// To update: change the table and AS_OF together, and add the new page to the evidence file.
'use strict'

const AS_OF = '2026-09-28'
const SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing'

const row = (input, cacheWrite5m, cacheWrite1h, cacheRead, output) => ({ input, cacheWrite5m, cacheWrite1h, cacheRead, output })
const PRICES = {
  'claude-fable-5-1': row(10, 12.5, 20, 0.25, 50),
  'claude-fable-5': row(10, 12.5, 20, 1, 50),
  'claude-opus-5-5': row(4, 5, 8, 0.2, 20),
  'claude-opus-5': row(5, 6.25, 10, 0.5, 25),
  'claude-opus-4-8': row(5, 6.25, 10, 0.5, 25),
  'claude-opus-4-7': row(5, 6.25, 10, 0.5, 25),
  'claude-opus-4-6': row(5, 6.25, 10, 0.5, 25),
  'claude-opus-4-5': row(5, 6.25, 10, 0.5, 25),
  'claude-sonnet-5-5': row(2, 2.5, 4, 0.2, 10),
  'claude-sonnet-5': row(2, 2.5, 4, 0.2, 10),
  'claude-sonnet-4-6': row(3, 3.75, 6, 0.3, 15),
  'claude-sonnet-4-5': row(3, 3.75, 6, 0.3, 15),
  'claude-haiku-4-5': row(1, 1.25, 2, 0.1, 5),
}
// US-only inference (inference_geo "us") costs 1.1x in every category.
const GEO_US = 1.1

// The price row for a model id: the longest table key the id starts with, where the next character is
// not a digit (so "claude-opus-5-5" never matches "claude-opus-5", and a dated id like
// "claude-haiku-4-5-20251001" matches "claude-haiku-4-5"). null when there is none.
function priceFor(model) {
  const id = String(model ?? '')
  const key = Object.keys(PRICES)
    .filter(k => id.startsWith(k) && !/\d/.test(id.charAt(k.length)))
    .sort((a, b) => b.length - a.length)[0]
  return key ? PRICES[key] : null
}

// USD for `tokens` ({input, output, cacheWrite5m, cacheWrite1h, cacheRead}) on `model`, or null when the
// model has no price.
function costOf(model, tokens, geo = null) {
  const p = priceFor(model)
  if (!p) return null
  const t = tokens ?? {}
  const usd =
    ((t.input ?? 0) * p.input +
      (t.output ?? 0) * p.output +
      (t.cacheWrite5m ?? 0) * p.cacheWrite5m +
      (t.cacheWrite1h ?? 0) * p.cacheWrite1h +
      (t.cacheRead ?? 0) * p.cacheRead) /
    1e6
  return geo === 'us' ? usd * GEO_US : usd
}

module.exports = { AS_OF, SOURCE, PRICES, priceFor, costOf }
