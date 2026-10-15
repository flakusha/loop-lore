<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Cross-family VRAM advisory lease

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-local-process-swarm

**Summary:**

Arbitrate GPU memory between model servers and creative tools with an advisory lease over llama-swap /metrics.

**Context:**

Verified 2026-10-15: llama-swap owns `ttl` idle eviction, `/running`, `/api/models/unload[/:id]`, `/health`, `/metrics`, per-model logs, profiles and the swap matrix for the **OpenAI-compatible model family only**, and proxies ComfyUI via `/comfyui/`. Blender Cycles / Krita / LibreOffice / GIMP / Inkscape are outside its reach entirely.

`src/services/server-external-manager/` has `--metrics-scrape-interval=10s`, which is **observation-only** — it reads and logs, it does not arbitrate.

So there is a real hole: nothing prevents a model server and a CUDA-heavy creative tool from competing for the same fixed VRAM pool.

Deliberately lazy shape — `ponytail:` **a single global advisory lock**. VRAM is one fixed resource, so a global lease plus llama-swap `/metrics` as the reading is the smallest correct thing. Per-model / per-device leases are the upgrade path if contention actually shows up. A full scheduler is explicitly rejected.

Companion to `TASK-external-process-survivability-pause-and-restart-on-crash` (same module).

**Acceptance Criteria:**

- [ ] **Behaviour:** the manager refuses to start a creative tool while a model server holds GPU memory above a configured floor; the refusal names the holder and the observed figure.
- [ ] **Behaviour:** the lease is advisory — when a model server releases memory (llama-swap `ttl` eviction, manual unload), a queued creative tool proceeds without a restart.
- [ ] **Tests:** acquire/release ordering; lease contention between two creative tools; lease released when the holder dies.
- [ ] **Edge cases:** `/metrics` unreachable or non-2xx (must not wedge the manager); metrics parse failure; no model server running at all; a tool that does not use the GPU (must not be blocked).
- [ ] **Concurrency / TOCTOU:** read-then-reserve is a single atomic step — two simultaneous acquisitions cannot both be granted the same memory; a stale lease from a crashed holder expires by TTL rather than leaking forever.
- [ ] **Security:** the `/metrics` scrape target is validated against the configured allowlist — a config value must not become an SSRF to an arbitrary host.
- [ ] **Regressions:** existing manager start / stop / gaps tests unchanged.
- [ ] **Repo gates:** `bun run check` green; the `ponytail:` ceiling documented in the module docstring.
