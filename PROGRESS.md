# Progress — video-queue-tickets worktree

## 2026-11-09 — B1 composition wired + committed

- Commit `aa6578897` feat(generation): wire pre-dispatch unload hook into video dispatch.
- Fix: `src/generation/video-gen-route.ts` imports `releaseModelsForRender` (`src/llm/llama-swap-release.ts`) and registers it via `setVideoPreDispatchHook` at module load (box key intentionally unused); new `src/generation/video-dispatch-hook-composition.test.ts` proves the registered hook hits llama-swap `GET /running` and dispatch still runs.
- Gates: eslint clean (2 files); `bun test --isolate` 65 pass / 0 fail across 7 files; `tsc --noEmit` clean (TSC_EXIT=0); markdownlint 0 issues on gate ticket.
- Tickets: gate precise-sequence box ticked with evidence -> Status Done (14/14); unload stays Done; 5 nits open (N1 parallel allSettled, N2 timeout doc, N3 1000-vs-500 brief, N4 phantom needsVideoGate, N5 hitForbidden trailing slash).
- Sibling lanes untouched: `video-dispatch-gate-bounds.test.ts` restored byte-identical (my first draft touched it; reverted, composition lives in its own file). Dev checkout stray import reverted.

## 2026-11-09 — N1–N5 audit-nit close-out (queue-closeout lane, uncommitted)

- N1: `src/llm/llama-swap-release.ts:79-92` releases the eviction set via `Promise.allSettled` (was sequential `for` loop); header + `llm-serving.md` say "parallel"; throw lands in the settled record only.
- N2: `docs/spec/integrations/video-generation.md` + `runVideoRender` docstring reworded — ceiling applies at admission, submit-based `deadline` runs from submit (covers wait plus render).
- N3: verified no mismatch to fix — `VIDEO_JOB_STORE_MAX = 500` in code, docs, ticket AC/tests, store docstring; the `1000` figure lived only in the gate-impl lane's stale `.tmp/intercom/PROGRESS.md` entry.
- N4: gate ticket external-bypass AC no longer names phantom `needsVideoGate` — now "empty `videoGateKeys` → direct `run()`" matching `video-dispatch-gate.ts:141-145`.
- N5: `hitForbidden` + per-model POST assertion normalize trailing slashes / compare `pathname` only (`src/llm/llama-swap-release.test.ts:61-72,96`); never-call assertions unchanged.
- Gates: `bun test --isolate` 65 pass / 0 fail (7 files); `bun run typecheck` clean; eslint clean (3 src + 2 docs); markdownlint 0 issues (2 tickets + 2 docs); `bun run plan:map` regenerated code-map (4852 src paths).
- Tickets stay Done: gate 14/14, unload 14/14; nit notes recorded in both tickets' close-out/implementation-notes sections.
