<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Backend auto-provisioner (managed binary acquisition + backend lifecycle)

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-first-run-auto-setup
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Universal backend registry + provisioner: detect -> fetch -> verify -> seed -> probe -> spawn for llama-server, sd-server, comfyui, vllm. lolo backends preflight|install|list CLI, [generation.backends] config, boot preflight report. Companion drafts: .tmp/research/EPIC-backend-auto-provisioner-DRAFT.md, .tmp/research/TASKS-backend-auto-provisioner-DRAFT.md. Links to epic-first-run-auto-setup (lands with first-boot). Core pipeline required; ComfyUI advise/vLLM recipe/CLI polish lower priority.

**Context:**

A fresh clone boots to a working server, but image generation and local LLM serving depend on external binaries (`llama-server`, `sd-server`, optionally `llama-swap`, ComfyUI, vLLM) that `bun install` never provisions. Detection is PATH-only (`findBinary`) and boot only warns-and-skips, so on a clean machine there is no image gen and no local LLM until an operator installs binaries manually.

This ticket introduces one universal backend registry plus a provisioner pipeline: detect -> fetch -> verify -> seed -> probe -> spawn. The registry (`src/services/backends/`, one file per backend plus a thin index per the 250-line strict gate) describes each backend's binaries, install root (`~/.local/bin`), default port, health probe, release source (repo + tag + asset candidates + archive + extract + sha/checksums asset), install hint, model requirement, and legacy flag. `BackendId = sqlite | llama-server | sd-server | llama-swap(legacy) | comfyui | vllm`; `ProvisionMode = none | self | advise`.

The pipeline detects via `Bun.which` plus the install root, fetches from the GitHub releases API with os/arch asset ordering, verifies (digest -> pinned sha256 -> checksums manifest -> refuse on mismatch), seeds (extract, chmod 755, atomic rename), probes through the registry health table, and lets the existing start modules keep argv ownership. Plus a `lolo backends preflight|install|list` CLI, a `[generation.backends]` config section with generated schema, and a boot preflight report that reports FOUND/MISSING per backend and warns with a hint on MISSING without ever failing boot.

Constraints:
- Bounded fetch: 512 MiB default per backend, member caps of 4096 members / 512 MiB each, zip-slip rejected, streaming, partials deleted, over-cap aborts with `asset-too-large`.
- `sha256` pin map keyed by platform, at most one entry per platform.
- Preflight `status` is an open set (`builtin|found|missing|unavailable|disabled`); consumers treat unknown values as degraded.
- Additive-fields-only growth of the preflight JSON (no numeric schemaVersion).
- ComfyUI is detect-and-advise only (clone the `local` fork plus `update_local.py`); no uv/venv/spawn from loop-lore.
- vLLM is an advise recipe (docker/podman); no supervisor code.
- Router-first replacement of llama-swap is a sibling concern; this ticket owns provisioning and detection only.

Alternatives considered: runtime plugin discovery, semver negotiation, and a registry migration framework are frozen out as speculative; a disk-persisted preflight cache is rejected (log + in-memory + admin route only); model bundling or auto-pull is an anti-candidate given the BYO-provider architecture.

Priority: G1 lands with first-boot. Required scope is the core pipeline (registry, detect/preflight, fetch/verify/seed, boot preflight report, config schema). Lower priority, shipping after core: ComfyUI advise-only, the vLLM advise recipe, and `lolo backends` CLI polish.

**Related:** epic-first-run-auto-setup.md, epic-comfyui-lifecycle.md, epic-llama-swap.md, epic-local-process-swarm.md, epic-cross-platform-portability.md

**Acceptance Criteria:**

- [ ] Backend registry exists with one file per backend and a thin index; each entry carries binaries, install root, default port, health probe, release source, install hint, model requirement, legacy flag
- [ ] `detect()` resolves a backend via `Bun.which` and the install root; `preflight()` returns FOUND/MISSING with an open-set status and a human-readable table plus JSON
- [ ] Fetch/verify/seed installs a release asset into the install root with a verified digest and an atomic rename; a digest mismatch refuses the install
- [ ] Probe lookup is table-driven from the registry health entries (no if-chain)
- [ ] Boot prints FOUND/MISSING per backend, warns and hints on MISSING, and never fails boot
- [ ] `[generation.backends]` config section exists with a generated schema (generator input fixed, never hand-edited)
- [ ] `lolo backends preflight|install|list` exists with a `--json` envelope and a `--strict` non-zero exit on MISSING
- [ ] ComfyUI and vLLM remain advise-only; loop-lore never spawns either
- [ ] `GET /api/v1/setup/state` gains `backend.<id>` reachability checks
- [ ] Unit tests cover registry shape, detect, digest-mismatch refusal, atomic seed rename, and the probe table
- [ ] `bun run plan:validate` is green
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
