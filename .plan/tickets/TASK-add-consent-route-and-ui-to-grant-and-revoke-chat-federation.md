<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add consent route and UI to grant and revoke chat federation consent

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Add an authenticated route and per-chat control that grant and revoke chat federation consent.

**Context:**

`grantChatFederationConsent` (`src/federation/clearance.ts:114`) and `revokeChatFederationConsent` (`:130`) are called only from `clearance.test.ts` — no route, no UI. The column they maintain, `chats.federation_consented_at`, was added by migration `037_chat_federation_consent.ts:18-20` and is declared nullable at `src/db/schema-core.ts:686`, so it stays `NULL` forever in production. `authorizeChatExport` throws `ChatClearanceError("no-consent")` while it is `NULL` (`clearance.ts:97-99`), which means no chat content can cross instances no matter how much sender plumbing exists.

The migration's own docblock states the invariant this must preserve: mesh membership must never imply clearance to replicate a chat's content (`037_chat_federation_consent.ts:8-11`). The gate is default-deny by design and must stay that way — consent is explicit opt-in, never inferred from chat creation or peer membership. Whoever may grant it depends on decision **D4** (review §5).

**Direction:**

1. **(assumption D4: chat owner only may grant or revoke.)** Add `POST /api/chats/:id/federation-consent` and `DELETE` on the same path — two explicit verbs rather than an action parameter. Reuse the existing chat ownership/authz helper so a non-owner is rejected before the handler body runs.
2. Handlers call `grantChatFederationConsent` / `revokeChatFederationConsent` and return the resulting consent state so the UI can render without a second fetch.
3. Add a toggle to the chat settings surface (`src/views/chat.html` and the Alpine component that owns chat settings), reflecting current state and only enabled for the owner.
4. Do **not** grant consent on chat creation under any circumstance — the column must remain `NULL` by default.
5. Tests: owner grant → `authorizeChatExport` no longer throws `no-consent`; revoke → it throws again; non-owner gets 403 on both verbs; a freshly created chat has `NULL`.

**Acceptance Criteria:**

- [ ] A chat created after this change has `federation_consented_at = NULL` unless explicitly granted
- [ ] The chat owner can grant and revoke consent from the chat settings UI, and the control reflects true state after a page reload
- [ ] `authorizeChatExport` flips from `no-consent` to success on grant, and back on revoke
- [ ] A non-owner participant receives 403 on both the grant and revoke verbs
- [ ] Repeated grants are idempotent — the timestamp refreshes and no error is raised
- [ ] Existing `src/federation/clearance.test.ts` coverage stays green and is not weakened
- [ ] `bun run check` green

**Dependencies:**

- `TASK-wire-the-chat-write-path-to-fanoutcontent-as-the-production-.md` — the sender trigger is inert without a way to open the gate
- `BUG-consent-toctou-revoking-a-chat-consent-during-a-fan-out-roun.md` — the already-open consent race; this ticket must not regress it
- `TASK-federation-content-clearance-gate-per-chat-consent-before-me.md` (Done) — built the gate this exposes

**Out of Scope:**

- Per-peer consent granularity (see decision D2 — this ticket assumes all-trusted-peers)
- Character-level federation consent (`src/characters/services/federation-consent.ts`) — a separate, unrelated gate
