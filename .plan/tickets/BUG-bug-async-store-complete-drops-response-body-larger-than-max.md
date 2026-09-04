# BUG: BUG: async store complete() drops response body larger than maxInlineBytes

**Status:** ✅ Resolved (2026-09-04)
**Priority:** medium
**Effort:** Medium

## Summary

src/async/apply.ts complete branch sets inline = body.length <= maxInlineBytes and stores response_body: inline ? body : null with NO spill. src/async/offload.ts skips rows whose response_body is null, so large responses are permanently lost (status complete but empty body). Fix: when body exceeds the threshold, offload to disk (gzip) and set offloadPath/offloadedAt, or inline up to the threshold and store the remainder offloaded.

## Resolution

Fixed in dev by `7c76aed4` (fix(async): eagerly offload oversized response bodies instead of dropping them). Verified 2026-09-04:

- `src/async/apply.ts` — the complete branch now eagerly calls `spill(write.id, body)` when the body exceeds `maxInlineBytes`, setting `offload_path` + `offloaded_at` on the row instead of nulling `response_body` and losing it.
- `src/async/offload.ts` — `spill()` is exported and made self-sufficient (mkdir before write) so `apply()` can spill at completion time.
- `src/async/apply.test.ts` — regression test asserts the spilled body round-trips via `readOffloadedBody` (recoverable, not lost).

No further code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
