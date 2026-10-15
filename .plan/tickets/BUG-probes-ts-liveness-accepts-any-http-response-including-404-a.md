<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: probes.ts liveness accepts any HTTP response including 404 and 500

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

probes.ts:84,92 return result.ok || result.status !== undefined, so any HTTP response counts as alive, including 404/500 error pages from a dead server.

**Context:**

Verified 2026-10-15 by source read: `src/services/server-external-manager/probes.ts:84,92` return `result.ok || result.status !== undefined`.

`result.status !== undefined` is true for **every** HTTP response, including 404 and 500. So a server that is up but wrong, or an upstream proxy returning an error page, is reported **alive**. Combined with the observe-only 30s poll (which logs a warning and does nothing else), a genuinely dead external server can stay reported as healthy indefinitely, and the survivability work in `epic-local-process-swarm.md` would restart from a false premise.

Severity: high — this is the input to every other liveness decision in the manager.

**Acceptance Criteria:**

- [ ] **Behaviour:** liveness requires an actual 2xx (or the family's documented status set); a 404 or 500 response is reported **dead**.
- [ ] **Tests:** 200 alive; 204 alive where documented; 404 dead; 500 dead; connection refused dead; timeout dead.
- [ ] **Edge cases:** a 3xx that never resolves; a response with a body but no status; a proxy returning 502 while the origin is healthy (**document** the chosen behaviour — do not guess); a non-HTTP server answering with garbage.
- [ ] **Edge cases:** slow-body (headers arrive, body never does) must not hang the probe — it must time out, not block.
- [ ] **Security:** the probe URL is the configured endpoint only — a redirect must not be followed to an arbitrary host (SSRF via probe).
- [ ] **Concurrency / TOCTOU:** *Not applicable to the probe itself* — it is a single stateless HTTP request with no check-then-act window, and the fix does not introduce one. The adjacent race is observability, not correctness: the manager polls every 30s, so a crash between polls is invisible regardless of this fix. Do not claim the fix closes it.
- [ ] **Regressions:** existing `*-gaps.test.ts` and probe tests green.
- [ ] **Repo gates:** `bun run check` green.
