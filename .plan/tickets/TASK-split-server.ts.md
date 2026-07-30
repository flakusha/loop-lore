# TASK: Split `src/server.ts` (640L)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-code-quality

## Summary

Split `src/server.ts` into focused modules. Current file mixes bootstrap, HTTP serving, static file serving, docs, TLS, and plugin loading.

## Target Structure

```
src/server/
  bootstrap.ts    # dependency wiring, plugin loading, provider setup
  http.ts         # Bun.serve + static + docs serving
  tls.ts          # TLS certificate loading and configuration
  index.ts        # barrel: compose and start server
```

## Acceptance Criteria

- [ ] Each file < 200 lines
- [ ] `bun run typecheck` passes after split
- [ ] All existing server tests pass
- [ ] No behavior change (pure refactor)

## Files

- `src/server.ts` → split into `src/server/`
