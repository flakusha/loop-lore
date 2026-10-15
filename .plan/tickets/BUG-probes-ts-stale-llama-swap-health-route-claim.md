<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: probes.ts stale llama-swap health route claim

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-local-process-swarm

**Summary:**

probes.ts:77-85 claims no guaranteed /health route for llama-swap; the README documents /health returning OK. Stale comment forces a heavier probe than needed.

**Context:**

Verified 2026-10-15 by source read: `src/services/server-external-manager/probes.ts:77-85` states *"No guaranteed /health route"* for llama-swap. The llama-swap README explicitly documents `/health` returning "OK".

The defect is a stale comment plus a heavier probe than the protocol requires — no behavioural break today, but the comment actively discourages the correct probe and will propagate into any new adapter.

Independent of any epic; found during the 2026-10-15 creative-tool research reconciliation.

**Acceptance Criteria:**

- [ ] **Behaviour:** the llama-swap probe uses `/health` and accepts the documented response; the stale comment is removed or corrected with a citation to the README.
- [ ] **Tests:** a stub `/health` returning "OK" is recognised as alive; a stub returning 500 is not.
- [ ] **Edge cases:** `/health` present but returning a redirect; response body not exactly "OK"; `/health` absent (older llama-swap build) — the probe must **fail closed**, not assume alive.
- [ ] **Security:** a redirect target must not be followed to an arbitrary host.
- [ ] **Concurrency / TOCTOU:** *Not applicable* — this ticket changes a comment plus which route is probed; there is no read-modify-write or check-then-act path in scope. The route correction does, however, change what "alive" means, so the companion ticket `BUG-probes-ts-liveness-accepts-any-http-response-including-404-a` must land with it or the two will disagree.
- [ ] **Regressions:** the other probe families (llama-cpp, sd-cpp) and their tests unchanged.
- [ ] **Repo gates:** `bun run check` green.
