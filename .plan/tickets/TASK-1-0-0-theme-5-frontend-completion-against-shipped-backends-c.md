<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 5: Frontend completion against shipped backends (contract-hardened)

**Status:** In Progress
**Priority:** medium
**Effort:** Medium

**Summary:**

Rationale: Cheapest user-visible wins are UI over already-wired backends (age-gate: UI and send-time enforcement shipped). The 23-epic frontend matrix is still Proposed/design-stage, and parked UI branches (battle, world-mgmt, a11y, nsfw, story-mode) risk colliding — sequence behind the finalize wave with the API-contract gate green.

Feeds: epic-priority-analysis §B1/C1 (age-gate); matrix-frontend-backend-integration (23 epics, contract gate); matrix-cross-mechanics §0.1.0 alignment (NSFW x chat, gallery x chat, assistant-tooling x wizards, memory+template x chat); next-epic-selection §2(d) collision warning; parked branches per receipt

AC6 Frontend completion: age-gate UI enforced against the shipped backend (minor flow blocked without birth_date/acceptance); API-contract gate green across the 23-epic frontend surface; no parked-branch file collisions at landing.

Related: .tmp/research/release-1.0.0-roadmap.md
Scope note: serves Required gallery/search/frontend-completion items (UI over shipped backends).

**Caveats:** TOCTOU: age-gate status checked at send time, not render time. Security: age-gate enforcement is server-side; UI is display only. Authorization: admin surfaces keep requirePermission gates. Parallelism: contract-gate tests scan static files, no shared state. Partial failure: failed landing rebases, never force-pushes. Rollback: UI-only slices revert without migration changes. Observability: contract-gate violations fail the check with file:line.

**Context:**

Implementation note (2026-11-12, agegate-sendtime worktree, dev @ feb3823b): server-side age-gate SEND-TIME enforcement is now present. `enforceAgeGate` (src/routes/messages/guards.ts) runs in the shared send-intake gate chain (src/routes/messages/send-intake.ts — covers POST /chats/:/messages solo sends AND the loop-lore-facade chat.send op), in the forward handler (src/routes/messages/forward.ts), and at chat creation (src/routes/chats/create.ts checkAgeGate). Residual gap closed: the scheduled-message dispatcher (src/chat/scheduled/dispatcher.ts dispatchDue) now runs `enforceAgeGate` per row — an unpassed author's due message is HELD (stays pending, retried next pass, same semantics as quiet hours) instead of landing as a user message. Proactive send-handler (src/routes/proactive-messaging/send-handler.ts) only triggers character auto-gen and inserts no user message — judged out of gate scope. Tests: src/chat/scheduled/scheduled.test.ts (age-gate hold/deliver/regain-pass) + src/routes/messages/age-gate-send.test.ts (20 pass / 0 fail).

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
