<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP profile-aware model selection

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-external-harness-acp

**Summary:**

**Summary:**

Add `harness.acp.profiles[]` config (name, spawn command/args, tiers
good/fast → concrete model id + capability flags, optional limits
{rpm, tokensPerDay}, health thresholds). Profiles are enumerated from static
config and validated by a one-shot probe against the ACP `session/new`
configOptions model list. A harness-agnostic core — `HarnessAcpAdapter`
contract (enumerate-models / set-model / prompt / usage-reports),
ProfileRegistry, ProfileSelector, UsageLedger, per-profile breaker — picks
(profile, tier, model) per call by ordered rules: capability match → limit
budget (ledger from recorded runs + optional `_omp/usage` quota reports) →
health/circuit breaker → cost; failures rotate to the next candidate. Run
records gain profile/tier/acp_session_id fields. Scope: core + omp reference
adapter; other harnesses → TASK-acp-profile-harness-adapters.

**Context:**

oh-my-pi profiles isolate config/auth per `--profile`
(docs/config-usage.md:76-88) but advertise neither model roles nor quotas
over ACP; only the flat model list (acp-agent.ts:2143-2183) and, for OAuth
providers, `_omp/usage` UsageReports (packages/ai/src/usage.ts:139-170) are
client-visible. Tier and limit knowledge therefore must live loop-lore-side,
grounded by the probe. The core consumes only the HarnessAcpAdapter
interface so opencode/codex/claude-code adapters can slot in without
touching registry/selector/ledger code.

**Acceptance Criteria:**

- [x] Config section validates (schema meta + JSON-schema gate); unknown
      tier keys, non-`provider/id` models, duplicate names rejected

- [x] Startup/lazy probe validates each profile's tier models against the
      advertised list; drift degrades the tier with a warning, never throws

- [x] Selector honors ordered rules and rotates on failure; unit-tested with
      in-memory fakes and the fake ACP fixture

- [x] Per-profile ledger (instance-owned, injected clock) enforces
      rpm/tokensPerDay when configured; `_omp/usage` exhausted/resetsAt
      respected when reports exist

- [x] `omp.ts` adapter spawns the profile's command argv and switches model
      via session/set_config_option before the first prompt

- [x] `.harness/executions.jsonl` records carry profile/tier/acp_session_id;
      serialize/deserialize roundtrip tested

- [x] Fake-fixture integration test covers capability filter, limit wall,
      breaker skip, rotation, telemetry (one subprocess per test,
      afterEach hard-kill; no env-gated e2e)

- [x] `bun test src/integrations/harness/ src/harness/ src/config/` green;
      `bun run check --diff-base dev` green apart from pre-existing dev drift

**Caveats:**

- TOCTOU: probe results are memoized per registry instance; a harness whose
  model list changes after the probe stays stale until process restart.

- Parallelism: breaker/ledger are instance-owned (never module singletons);
  selector callers own their instances.

- Partial failure: rotation records breaker failures per candidate; a turn
  that exhausts all candidates throws HarnessAcpError kind `prompt`.

- Rollback: the feature is opt-in (`harness.acp.enabled: false` default);
  removing config restores prior behavior.

- Observability: probe drift and spawn failures log via the structured
  logger (child `harness-acp`); runs land in the exec log with profile/tier.
