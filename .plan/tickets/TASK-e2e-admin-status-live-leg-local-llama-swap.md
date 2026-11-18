<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: e2e admin-status live leg against local llama-swap

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Related:** tests/e2e/flows/local-llama-swap.test.ts, .plan/tickets/TASK-llama-cpp-decision-model-client-for-aux-classification.md
**Caveats:** TOCTOU — model pool state can change between the status read and the assertion under concurrent runs (ruled out: the leg runs serially behind E2E_LOCAL_LIVE with its own proxy); partial failure — a dead-port override assertion only proves the HTTP wiring, not probe accuracy (ruled out: config/probe halves already have unit coverage); stale state — none (no schema); observability — none (test-only); security/authorization — none (loopback fixture, no secrets).

**Summary:**

Thin leftover from the local-llama-swap e2e buildout (10/10 live green 2026-11-18): boot a real app server with a temp DB, GET the admin status endpoint against the live proxy, assert configured:true/running:true for a loaded model, then flip the DB override to a dead port and assert unreachable. Only the HTTP wiring is uncovered — the config-merge and probe halves already have unit tests — so this was deliberately deferred.

**Context:**

The local-llama-swap suite (tests/e2e/flows/local-llama-swap.test.ts + tests/e2e/fixtures/comfy-sdxl-basic.json) covers resolve/presence/completion/vision/decision/sdcpp/embed/app-seam-release/comfyui legs live. The admin-status seam was reviewed instead of built: it needs a DB-backed app server + model load for HTTP-wiring coverage only. Build it when the admin surface changes or the wiring is suspected — not before.

**Acceptance Criteria:**

- [ ] Live leg boots app server with temp DB against the local proxy
- [ ] Asserts configured/running for a loaded model, unreachable for a dead-port override
- [ ] Green live (E2E_LOCAL_LIVE=1) without breaking the existing 10/10


git issue: 18e7433
