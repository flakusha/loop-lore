<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Engram memory adapter as first external backend

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:** Build the EngramBackend adapter behind the MemoryBackend seam: POST /api/remember on write, GET /api/search plus /api/search/explain on read, /api/context token counts as budget input, behind one config URL plus token, disabled by default. **Context:** Research rev1 section 2 and rev2 section 5. Engram explain endpoint returns returned plus rejected candidates, scores, confidence decisions, budget exclusion; final_ids is rank order. **Scope:** One HTTP adapter file, config entries, stub-server tests on port 0 with owned DB per-test isolation. Out of scope: fan-out writer, fusion reader, second external. **Acceptance:** Adapter stores via remember and searches via search/explain; disabled flag equals zero code path; stub tests pass; native-only suite green. **Caveats:** Partial failure: adapter-local only, no fan-out yet. Rollback: remove adapter file, flag stays off. Stale state: none persisted locally. Observability: adapter errors logged, never thrown to caller. Authorization: token from env, never committed.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
