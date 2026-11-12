<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 4: Mobile-ready web without a native package

**Status:** In Progress
**Priority:** medium
**Effort:** Medium

**Summary:**

Rationale: No embedded-backend app: Bun ships no iOS/Android target, so ship a thin client over /api/v1+SSE. The layout tier already ships (767/768/479px + 44px targets); remaining work is the PWA shell/outbox ticket plus replacing the hardcoded 1024-token memory cap with a context-share budget wired to per-world token_budget.

Feeds: mobile-packaged-feasibility-2026-11-03 (SKIP packaged app; ADOPT shipped CSS tiers; FOLLOW-UP PWA ticket TASK-pwa-cached-shell-plus-send-queue + getMaxMemoryRatio gap §4)

AC4 Offline web: manifest + service-worker shell installs; queued sends survive offline->online and deliver in order; <800px tiers and 44px coarse-pointer targets verified on a phone viewport.

AC5 Memory budget: hardcoded 1024-token cap replaced by a context-share ratio honoring per-world token_budget; prompt assembly stays within budget on a measured long-context fixture.

Related: .tmp/research/release-1.0.0-roadmap.md
Scope note: serves Required mobile/PWA + solo-run items (thin client over /api/v1+SSE).

**Caveats:** TOCTOU: outbox drain is FIFO with idempotency keys; concurrent drain single-flighted. Security: Bearer auth on every write; PWA shell caches no secrets. Authorization: outbox replays as the originating user. Parallelism: service-worker tests are isolated; no shared fixtures. Partial failure: failed send stays queued with backoff, never dropped. Rollback: PWA shell is additive; removal restores online-only. Observability: outbox depth + drain failures surfaced in UI.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Implementation note (2026-11-12, worktree theme4-pwa-caps):**

Landed — AC5 config slice: the hardcoded 1024-token caps are now the new
`prompt` config section, `prompt.loreTokenBudget` and
`prompt.memoryTokenBudget` (default 1024, clamped 128–8192; load-time
`validate()` rejects out-of-bounds, `PromptSection` clamps defensively and
section builders clamp again at consumption). Threaded via `AssembleContext.config`
into `loreSection` (`src/assistant/prompt/sections/lore.ts`) and `memorySection`
(`src/assistant/prompt/sections/memories.ts`); `MAX_LORE_TOKENS` stays exported
as the unconfigured default. Tests: `packages/core/src/config/sections/prompt.test.ts`
(defaults, clamping, env-map/json-schema/validate wiring) + config-honored
fixtures in `lore.test.ts` / `memories.test.ts`.

Still open (not started, do not half-build):
- AC4 offline send outbox — the dedicated slice ticket
  `TASK-pwa-cached-shell-plus-send-queue-offline-survival-slice.md` now has
  slice 1 (cached shell) LANDED in this worktree (see its implementation
  note); slices 2–3 (outbox + drain) remain open, so the queued-send AC is
  unmet.
- AC5 full form: per-world `token_budget` context-share ratio (this slice
  ships the global clamped config knob only).
- AC4 phone-viewport verification (<800px tiers, 44px coarse-pointer targets).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
