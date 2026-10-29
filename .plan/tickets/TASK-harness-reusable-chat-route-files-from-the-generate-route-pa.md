<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness: reusable chat-route files from the generate-route pattern

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-6 slice (T15): reusable harness chat-route files generated from the generate-route pattern.

**Ground state:** Exec log is write/query only: `src/harness/exec-log.ts` (append JSONL), `query.ts` (tail ≤4MB, offset-index/SQLite-mirror noted as future behind same 3 exports), `types-wire.ts` (snake_case wire `task`/`task_type`), `types.ts` (`HarnessRunRecord`). No route files: `.tmp/harness-routes/` empty in worktree; no `harness-routes/` dir in checkout. Generate-route is the pattern source: `handleGenerate` (`src/generation/generate-route/handler.ts:62-185`) with `harnessContext({taskType, task: "generate-route", turnId: attemptId})` (`:184`); split modules (`build-prompt.ts`, `resolve-options.ts`, `stream-to-client.ts`, `non-stream.ts`, `persist.ts`, `cancel-stream.ts`, `chat-peer-offload.ts`, `tool-execution.ts`); SSE utils (`sse-utils.ts:16-19` `sseData`, `renderToolCallBlock`); stream buffer (`stream-buffer.ts`); generation stream route (`generation-routes/stream.ts`). TUI already consumes harness REST (`GET /api/v1/harness/runs`, `…/runs/:runId` per `api-contract.test.ts:301-376`) via `src/tui/harness/api.ts` + overlay `src/tui/harness/`. Route-file convention in-repo: `xRoutes(opts, prefix = "/api")` returning `new Elysia({name})` with hand-concatenated `` `${prefix}/…` `` paths (e.g. `moderation.ts:87-89`, `annotations.ts:47-48`); exactly one instance-prefix use (`src/routes/vn-generate/index.ts:27`); `admin-comfyui-workflows/` splits create/list/update/remove/flags per file aggregated by `index.ts:38-49`.

**Adopt/adapt/defer:** ADOPT Elysia plugin factory (https://elysiajs.com/essential/plugin; https://github.com/elysiajs/skills/blob/main/elysia/references/composition.md): factory returning fresh instance, `name`+`seed` identity (config in `seed`, not closure), instance `prefix`, `.group(prefix, opts, cb)` for prefix + shared guards, `.use()` composition. Fit: put `prefix` in instance + `seed` so two mounts do not dedupe; drop `${prefix}` concatenation per file. ADAPT Express `Router` mini-app (https://expressjs.com/en/guide/routing.html#expressrouter): relative paths inside the file, single mount, `mergeParams` only when parent params needed. Fit: same ownership split — per-file relative paths + one `new Elysia({prefix})` mount; `admin-comfyui-workflows/` per-file split is the in-repo seed.

**Acceptance criteria:**

- [ ] New `src/routes/harness-chat/` (or `src/harness/routes/`) exporting per-file route factories with **relative paths only** (no `prefix` param, one `new Elysia({prefix})` mount) for: run-list, run-detail, stats, and a `POST …/runs/:runId/retry` replaying the stored `task`/`task_type`/`model`/`tools` shape.
- [ ] Wire shape reuses `types-wire.ts` (no second schema).
- [ ] TUI harness overlay + web consume the same files (contract test extended from `api-contract.test.ts:301-376`).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
