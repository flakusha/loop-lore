<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Scheduler config surface (`[generation.scheduler]`)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `.plan/epics/epic-llm-request-scheduler.md`
**Summary:** Adds a `[generation.scheduler]` config block carrying per-provider slot caps, priority bands, windowed budgets, and the llama-swap config path — the knobs every other ticket in the epic reads. Without it, the scheduler's constants are hardcoded and the "calibration knob" is missing.
**Context:** `GenerationConfig` (`src/config/schema/generation.ts:88-123`) has no scheduling block today. The only existing concurrency knob is `transport.limits.maxConcurrentStreams`, which is HTTP/2 stream framing, not request admission — do not extend it for this.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] A `SchedulerConfig` interface is added under `src/config/schema/generation.ts` (or a sibling schema file if that keeps both under the size gate) with:
  - `enabled: boolean` — default **true** but a full bypass to today's arrival-order behavior when false
  - `defaultMaxConcurrent: number` — fallback slot cap for unlisted providers
  - `providerMaxConcurrent: Record<string, number>` — per-provider overrides, keyed by provider instance name from `ProviderInstanceConfig.name` (`src/config/schema/providers.ts:22`)
  - `classPriority: Record<RequestClass, number>` — per-class priority band, so the mapping is tunable rather than compiled in
  - `budgets` — per-provider windowed token/request budgets (per-minute, per-day) for external APIs
  - `llamaSwap?: { configPath: string; exclusionModels: string[]; allowRotationForClasses: RequestClass[] }`
- [ ] Config loads from the existing TOML loader with env-var mapping, following the same pattern as the existing `[generation.autoStart.llamaSwap]` block (`src/config/schema/auto-start.ts:169-174`). Defaults apply when the block is absent — an existing config file with no `[generation.scheduler]` must load unchanged.
- [ ] Values are validated at load: non-positive or non-integer slot caps are rejected with a clear error naming the offending key; unknown provider names in `providerMaxConcurrent` are accepted but warned (providers are registered at startup, possibly after config load, so a hard failure would be a false positive).
- [ ] `llamaSwap.configPath` defaults to the already-configured auto-start path when auto-start is enabled, rather than requiring the same path twice.
- [ ] Loading is covered by tests in `src/config/load.test.ts` following the existing auto-start test pattern: absent block, partial block, invalid value, env override.
- [ ] Admin/runtime adjustment of the live knobs is explicitly **out of scope for this ticket** — the system_config KV + admin surface is owned by `epic-generation-flow-control.md` (`TASK-admin-generation-controls`). This ticket is file/env config only. Do not build a second admin path.
- [ ] `bun run check` green.

## Notes

**Config, not constants.** The epic's local-resource section explicitly argues that the concurrent-slot count *is* the calibration knob in place of a live VRAM probe. A knob that cannot be turned is not a knob — hence this ticket exists independently of the admission logic that consumes it.

**Do not extend `transport.limits.maxConcurrentStreams`.** It bounds HTTP/2 concurrent streams on a single transport connection (framing), not provider admission. Overloading it would make "how many streams may I frame" and "how many LLM requests may I have running" the same number by accident, and they are not the same quantity.

**Unknown provider names warn, not fail.** `initializeProviders` (`src/generation/providers/registry.ts`) runs at startup and providers can also be registered at runtime, so a config naming a provider that is not yet registered is normal ordering, not user error. Hard-failing here would make valid configs unloadable.

## Related Files

- `src/config/schema/generation.ts:88-123` — `GenerationConfig` to extend
- `src/config/schema/auto-start.ts:169-174` — the llama-swap config pattern to follow
- `src/config/schema/providers.ts:19-40` — `ProviderInstanceConfig`, the identity used for per-provider keys
- `src/config/load.test.ts` — test patterns (`:355-365`, `:436-447`)
- `.plan/epics/epic-llm-request-scheduler.md` — parent epic


git issue: 5247560
