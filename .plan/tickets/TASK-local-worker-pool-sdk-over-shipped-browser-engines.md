<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: local worker-pool SDK over shipped browser engines

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-byok-local-models
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

BYOK worker-pool proposal B1. Pool over the 2 shipped workers (acquire/release, at most 1 generate per worker, queue, id-routed progress via isEngineResponse, terminate on switch preserved); split-chunk assembly (orderSplitFiles + per-part sha256Hex, memory-cap abort); FakeWorker twin tests. Client-side pool; security-relevant paths are manifest fetch + model download, both enforcing server auth (session/token validity, expiry, scope) + per-model entitlement server-side; client-side availability never gates access (default-deny at fetch); CDN worker code pinned hash re-checked (existing pin).

Owner: epic-byok-local-models.md (Not Started). Verified shipped in src/frontend/alpine/ (not src/inference/, epic file list stale): local-engine.ts family-switch drop :87-95, terminate :227-230; protocol pins WLLAMA_CDN :21, WASM_URL :24, worker URLs :27/:30, isEngineResponse guard :68; workers local-engine.worker.ts + wllama-engine.worker.ts; catalog split convention model-catalog.ts:9-13; storage model-storage.ts/model-storage-idb.ts; downloader + sha256Hex; local-inference.ts opt-in; tunnel-connector.ts; credentialless COEP valid. Absent: no pool (1 worker/family), no split assembler beyond naming, no src/inference/, no manifest route confirmed.

Refs: wllama https://github.com/ngxson/wllama (already pinned dep; pool on top only with measured contention) + README-dev; y-webrtc https://github.com/yjs/y-webrtc NOT used here (that is the B2 spike).

Acceptance: concurrent generates serialize; switch drops old worker (terminate preserved); >2GB model assembles + sha256Hex verifies; memory-cap abort path; FakeWorker twin per test (local-engine.test.ts:22-46 pattern), unique model ids, terminate in afterEach, no shared Worker global, interleave test deterministic (promise gates, no sleeps); blocking: pool must preserve terminate-on-switch + isEngineResponse guard; concurrent postMessage id-routing is the race surface.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
