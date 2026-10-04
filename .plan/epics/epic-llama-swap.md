<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: llama-swap Hub (lifecycle, config, rotation/exclusion, bench)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Type:** Coordination Hub Epic
**Tags:** llama-swap, lifecycle, config, rotation, scheduler, bench
**Overview:** (see sections below)

## Summary

Coordination hub for everything loop-lore does with the llama-swap proxy:
process lifecycle (spawn/health/stop), config contract + sample config,
scheduler rotation/exclusion policy, and opt-in benches/fixtures that measure
it. This epic owns no implementation — work lives in the three member epics
below; it exists so the four scope axes stay mutually consistent (one config
path, one rotation policy, one lifecycle owner, one bench posture).

## Scope

- **Lifecycle:** `startLlamaSwap` spawn + liveness + stop
  (`src/services/server-external-manager/start-llama.ts:167-223`,
  `probes.ts`), folded into the swarm supervisor (`src/swarm/`); no second
  supervisor
- **Config:** single `configPath` source
  (`src/config/schema/auto-start.ts:169-174`, scheduler `llamaSwap` block
  per `FEAT-llm-scheduler-config-surface`); sample config
  `configs/config.llama-swap.example.yaml` reviewed against the Part-1
  contract; loop-lore reads, never rewrites the user file
- **Rotation/exclusion:** model-set parser (fail-open) + rotation gating by
  request class + `exclusionModels` layering + failover fallthrough
  (`src/generation/providers/registry.ts:173` `buildFailoverList`)
- **Bench:** opt-in `tests/benchmarks/` LLM bench (p50/p95/p99, rotation cost)
  - load-soak bench + real-server e2e fixture; all default-off, graceful skip
  when binaries/models missing

Out of scope: managing llama-swap's own config format, periodic config
reload (restart picks it up), per-request VRAM probing, DB-backed queue
persistence (see member epic Non-Goals).

## Member epics

| Axis | Member epic | Owns |
|---|---|---|
| Rotation/exclusion + config + bench | `epic-llm-request-scheduler.md` | FEAT rotation/exclusion policy, scheduler config surface, observability, both bench tickets, sample-config finalization |
| Lifecycle | `epic-local-process-swarm.md` | `TASK-swarm-supervisor` folds llama.cpp/sd.cpp/llama-swap into `src/swarm/` (process-group kill, allocPolicy, probes reuse) |
| Real-server fidelity | `epic-e2e-integration-testing.md` (Pillar 3) | `TASK-real-llm-sd-e2e-fixture-llama-cpp-llama-swap-sd-server` — tier-gated fixture proving aux + story LLM coexisting behind llama-swap |

Also related: `epic-comfyui-plugin.md` (`comfyui_auto` passthrough — Done) for
the `/comfyui` compatibility endpoint recipe.

## Related tickets

- `FEAT-llama-swap-rotation-exclusion-policy.md` (policy + contract; Blocked on sample config)
- `TASK-llama-swap-sample-config-finalization-unblocks-rotation-poli.md` (unblocks policy Part 2)
- `TASK-llama-swap-native-support-cpu-resident-classifier-model-reci.md` (CPU-resident classifier recipe)
- `TASK-llama-swap-recipe-embed-rerank-guard-helpers-comfyui-auto.md` (helper set + comfyui_auto; Done)
- `TASK-llama-swap-comfyui-endpoint-support-comfyui-auto-workarounds.md` (/comfyui passthrough; Done)
- `FEAT-llm-scheduler-config-surface.md` (scheduler `llamaSwap` knobs)
- `TASK-llm-scheduler-observability.md` (rotate events, read-only status)
- `TASK-llm-generation-bench-via-local-llama-swap-opt-in.md` (standalone latency first)
- `TASK-scheduler-load-soak-bench-queued-llm-traffic.md` (mock first, llama-swap variant after)
- `TASK-real-llm-sd-e2e-fixture-llama-cpp-llama-swap-sd-server.md` (Pillar 3 real-server leg)
- `TASK-swarm-supervisor.md` (lifecycle fold-in)

## Acceptance Criteria

- [ ] One documented `configPath` default chain (auto-start → scheduler) with no duplicate path knobs; sample config validates against the Part-1 contract
- [ ] Rotation/exclusion parser live: valid config yields model set, malformed config degrades to opaque mode without throwing, excluded models never selected, background classes avoid rotation
- [ ] Lifecycle owned once: llama-swap spawns under the supervisor with process-group kill (no orphans) and liveness probes; no competing supervisor
- [ ] Benches + fixture all opt-in and CI-safe (default-off, graceful skip); standalone LLM latency lands before queue-wait attribution
- [ ] No scope bleed: proxy config never rewritten by loop-lore; no per-request VRAM probe; no second admin control surface (read-only status only)
