# TASK: Split `src/routes/messages.ts` (1013L)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-code-quality

## Summary

Split monolithic `src/routes/messages.ts` into domain-focused modules under `src/routes/messages/`. Current file mixes CRUD, streaming, attachments, and archiving in one file.

## Target Structure

```
src/routes/messages/
  index.ts          # barrel: Elysia route registration
  crud.ts           # create, read, update, delete messages
  stream.ts         # SSE streaming endpoints
  attachments.ts    # file upload, storage, retrieval
  archiving.ts      # archive, restore, purge
```

## Acceptance Criteria

- [ ] Each file < 200 lines
- [ ] `bun run typecheck` passes after split
- [ ] All existing message tests pass
- [ ] No behavior change (pure refactor)

## Files

- `src/routes/messages.ts` → split into `src/routes/messages/`
