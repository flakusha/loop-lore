<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: llama-swap rotation and exclusion policy

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-llm-request-scheduler.md`
**Summary:** Stops treating llama-swap as an opaque OpenAI-compatible base URL. Reads the model set from the same config file the process is already spawned with, and applies a rotation + exclusion policy so the scheduler knows which model a request will actually land on and what it costs to get there.
**Context:** `startLlamaSwap` (`src/services/server-external-manager/start-llama.ts:167-203`) already reads the config file — it pulls `startPort` out of it to pass `--listen`. The rest of the file, which names the models llama-swap can route to, is ignored. `probes.ts:73` only checks liveness via `/v1/models`.
**Acceptance Criteria:** See ## Acceptance Criteria (Part 2) below.
**Blocked on:** the user has a prepared llama-swap config but reports it is "not yet final". This ticket's first deliverable is therefore the *interface contract* below, written before the parser — so the eventual config lands against a written requirement rather than being reverse-engineered from a file that is still moving.

## Part 1 — Configuration contract (write this first)

Document, in a spec under `docs/spec/`, the minimum loop-lore needs from a llama-swap config file:

1. **Model set** — the list of model ids the proxy can route to, and the id under which each is exposed to OpenAI-compatible clients.
2. **Per-model properties** sufficient to schedule against it: approximate loaded footprint, and any switch/group/exclusion grouping llama-swap itself understands.
3. **Reload semantics** — whether editing the file requires a llama-swap restart, and whether loop-lore should watch for changes.

Ship the contract before the parser. If the sample config changes shape afterwards, only the parser changes.

## Part 2 — Implementation

- [ ] A parser reads the llama-swap config at the configured `configPath` (defaulting to the auto-start path already in `LlamaSwapAutoStartConfig.configPath`, `src/config/schema/auto-start.ts:169-174`) and yields the model set from Part 1.
- [ ] Parse failure is **non-fatal**: log a warning naming the path and the parse error, and fall back to today's behavior (opaque single endpoint). A malformed user config must not prevent startup — the same posture `resolveLlamaSwapPort` already takes at `start-llama.ts:219-223`.
- [ ] **Rotation policy:** a request that would force a model swap is gated on whether the swap is worth its latency for that request's class. Background work (`aux`, `embedding`, `rerank`) prefers the already-resident model over triggering a load; `interactive-turn` may rotate when the resident model cannot serve the request. The resident model is tracked from dispatch outcomes, not assumed.
- [ ] **Exclusion policy:** models in `SchedulerConfig.llamaSwap.exclusionModels` are not selected for scheduled traffic (e.g. a model kept warm for interactive chat only, or a draft quantisation under evaluation). loop-lore layers this list on top of the user's config; it does not rewrite, reorder, or "fix" the user's file.
- [ ] When every candidate model is excluded or the resident model cannot serve the request, the request falls through to the **normal provider failover** (`buildFailoverList`, `src/generation/providers/registry.ts:173`) rather than failing outright.
- [ ] Config is read once at startup and cached. A periodic reload is explicitly **out of scope**; if the user edits the file mid-session, a restart picks it up. Add the watcher only if that is a real complaint.
- [ ] Tests cover: valid config parses to the expected model set; malformed/missing config degrades to opaque mode without throwing; an excluded model is never selected; a background-class request does not trigger a rotation when a resident model can serve it; all-models-excluded falls through to failover.
- [ ] `bun run check` green.

## Notes

**This is a read, not a manage.** loop-lore does not own the llama-swap config format and does not write to the user's file. The parsing surface is deliberately narrow — model set and whatever grouping the config already expresses. A second opinion on the model is a llama-swap concern, not a loop-lore one.

**Parse defensively, fail open.** `start-llama.ts:219-223` already establishes the precedent for this module: read the config, and on failure log and default. A scheduler whose config parsing can crash the app is worse than a scheduler that does not know the model set.

**Rotation is a latency problem, not a correctness problem.** llama-swap can serve any request by swapping if it must. The policy here exists because swapping for a 64-token classification costs seconds of load time that the user can see. Restricting rotation is an optimization; the failover path is the correctness guarantee.

## Related Files

- `src/services/server-external-manager/start-llama.ts:167-203` — spawn; `:205-223` — existing config read + fail-open precedent
- `src/services/server-external-manager/probes.ts:73` — liveness-only probing today
- `src/config/schema/auto-start.ts:169-174` — `LlamaSwapAutoStartConfig.configPath`
- `src/config/schema/generation.ts` — `SchedulerConfig.llamaSwap` (from `FEAT-llm-scheduler-config-surface`)
- `src/generation/providers/registry.ts:173` — failover list the fallthrough target
- `.plan/epics/epic-llm-request-scheduler.md` — parent epic


git issue: 2eaea4f
