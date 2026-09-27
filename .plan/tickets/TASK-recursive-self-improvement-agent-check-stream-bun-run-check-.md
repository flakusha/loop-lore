<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent Check Stream — `bun run check` over SSE

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** agent, check, sse, streaming, gates
**Epic:** epic-recursive-self-improvement

Run `bun run check` (or `--gates <csv>`) against an agent's worktree; stream progress over SSE so the agent sees gate-by-gate output without polling.

## Core Features

- `POST /api/v1/agent/check` body `{ worktreeId, gates?: string }` returns SSE stream
- Stream events: `{ gate: 'lint', status: 'running' | 'pass' | 'fail', progress: 0-100, output?: string }`
- Reuse `scripts/check-parallel.mjs` runner; pipe its stdout to SSE
- Final event: `{ status: 'pass' | 'fail', summary: { gates: number, passed: number, failed: number, durationMs: number } }`

## Acceptance Criteria

- [ ] SSE stream emits at least one event per gate
- [ ] Final summary matches the actual `bun run check` exit code
- [ ] `--gates` filter respected (verified against `scripts/check-parallel.mjs --gates <csv>`)
- [ ] Stream times out at 10 min default; configurable
- [ ] Unit + integration tests

## Files

- `src/agent/api/check.ts` — new
- `src/agent/api/check.test.ts` — new

## Notes / Verification

- Existing `.tmp/check-report.json` from `bun run check` is the source of truth; the SSE events should match its schema.
- Reuse Elysia's `sse()` helper or `src/generation/generate-route/sse-utils.ts` patterns.

