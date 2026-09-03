# Handoff: feat-stop-and-respond-interrupt (#30)

**Ticket**: `.plan/tickets/TASK-stop-and-respond-interrupt-semantics.md` (Status: ⬜ Not Started → [OK] Done when complete)
**Worktree**: `tree/feat-stop-and-respond-interrupt` (branch `feat-stop-and-respond-interrupt`)
**Base**: dev `17d261e3` (post 3-batch merge + story-types cleanup)

## Scope (read ticket for full)

Always-available Stop during streaming:
- **Abort wired through generation streaming path** (the never-wired BUG)
- **Truncate-to-last-rendered-chunk** semantics; user input free immediately
- **Queued TTS/image jobs cancelled** cleanly
- **Usage/billing hooks respect delivery** (no charge for undelivered output)
- **Tests**: mid-stream stop + no-bill assertion

## Pre-existing foundation (already on dev)

TASK-generation-error-handling-gaps committed (`41a321c3`):
- Detector runs on non-stream + stream paths
- `throwIfAborted()` mid-stream makes abort effective
- `.catch` on `extractAndStoreMemories` / `record()` void calls
- Empty response.content rejected
- Tool output sanitized before re-injection
- 13 new tests passing in `call-llm.test.ts`, `tool-execution.test.ts`, `llm.test.ts`

`da05302e` (cancel-through-streaming): SSE tracker-signal link, `cancel-vs-failover` semantics.

## Suggested implementation order

1. **`src/generation/auto-gen/call-llm.ts`** — wire AbortSignal through to the LLMProvider + persist `lastRenderedChunkIndex` on abort
2. **`src/generation/generate-route/stream-to-client.ts`** — when client disconnects, call `abort()` on the generation chain; truncate response to last SSE event client actually received
3. **`src/generation/cancellation-manager.ts`** — fan-out cancel to TTS / image-queue side-effect jobs (need to find existing hooks)
4. **`src/billing/`** (or wherever usage hooks live) — guard with `deliveryConfirmedAt` flag; only emit on actual SSE delivery
5. **Tests**: `src/generation/generate-route/__tests__/abort.test.ts` — mock SSE sink, disconnect mid-stream, assert (a) truncation at last delivered chunk, (b) no billing event

## Reference paths (read these first)

- `src/generation/cancellation-actions/` — index + streaming.ts already exports `processStreamingChunk`
- `src/generation/cancellation-tracker.ts` — generation attempt state
- `src/generation/auto-gen/call-llm.ts` — the entry point needing abort wiring
- `src/generation/generate-route/handler.ts` — manual-route handler (now wires `groupParticipantIds` from `4b1924cc`)

## Constraints

- **NEVER run `bun run check`** — system OOM (per memory)
- **NEVER bypass GPG signing** — agents stop on pinentry timeout
- Finalize via `bun run scripts/worktree/ finalize feat-stop-and-respond-interrupt --force` (skipping `bun run check` is required)
- Source-of-truth ordering: AGENTS.md > src/ > docs/spec/

## Deliverable

When done:
- All 5 acceptance bullets in ticket checked
- Ticket marked `[OK] Done`
- `bun test src/generation/` green (don't run full suite)
- Finalize worktree → merges to dev

Start with reading `src/generation/cancellation-actions/` and `src/generation/cancellation-tracker.ts` to understand existing abort plumbing before adding new code.
