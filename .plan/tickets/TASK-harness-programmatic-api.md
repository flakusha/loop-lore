<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness programmatic API (omp RPC wrap)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Drive harness sessions through `omp --mode rpc/json` (`createAgentSession`, `waitForIdle`) instead of building a session API; adopt pi storage layout (threads → JSONL, history.db FTS, blobs) + `skill://` naming only if a local store is ever needed.
**Context:** No programmatic session surface exists in-repo; TUI is a thin HTTP client already. opencode `specs/tui-package.md` host/TUI split + grep gate is the reference pattern; `orchestrate`/`workflowz` prompts adapted as text, not code.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Documented wrap pattern: spawn/wait/resume via `omp --mode rpc/json` with an in-repo helper module (thin shell-out, no vendored session code).
- [ ] `@opencode-ai/plugin` hook shapes (`tool.execute.before/after`, `session.compacting`) adopted as names for any new loop-lore plugin hooks — no parallel hook taxonomy.
- [ ] `orchestrate`/`workflowz` fan-out prompt text (pool-first, judge, evidence-not-truth) landed as `configs/templates/workflows/` YAMLs reusing the entities.yaml schema.
- [ ] No new session-state tables; no vendored pi/opencode code (shapes only, license hygiene: SillyTavern AGPL shapes reimplemented, never copied).

## Related Files

- `configs/templates/workflows/` (new YAMLs), `src/config/templates-loader/` (untouched), `src/plugins/loader.ts`
- `.tmp/harness-research-pi-opencode.md` (reuse shortlist)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
