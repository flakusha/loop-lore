# BUG: BUG: async store complete() drops response body larger than maxInlineBytes

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/async/apply.ts complete branch sets inline = body.length <= maxInlineBytes and stores response_body: inline ? body : null with NO spill. src/async/offload.ts skips rows whose response_body is null, so large responses are permanently lost (status complete but empty body). Fix: when body exceeds the threshold, offload to disk (gzip) and set offloadPath/offloadedAt, or inline up to the threshold and store the remainder offloaded.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
