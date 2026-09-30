<!-- decidinator-log v1 -->
# Decisions

Hand-written intro paragraph kept by scripts.

### D-0001 · Cache TTL

- **Question:** How long should the profile cache live?
- **Answer:** Five minutes.
  Invalidate on write.
- **Rationale:** Matches the upstream API's rate limit.
- **Provenance:** oracle-unconfirmed
- **Confidence:** high
- **Rung:** 1
- **Sources:** https://example.com/rate-limits; src/cache.js
- **Assumptions:** none
- **Question ID:** Q-0001
- **Context:** WP-03
- **Date:** 2026-09-29
Reviewer note: checked with ops on Tuesday.   

## Notes by hand

Anything here is not an entry.

### D-0002 · Retry policy
- **Question:** Should failed uploads retry?
- **Provenance:** user
- **Answer:** Yes, three times.
- **Date:** 2026-09-29
- **Rung:** none
- **Confidence:** none
- **Supersedes:** D-0001