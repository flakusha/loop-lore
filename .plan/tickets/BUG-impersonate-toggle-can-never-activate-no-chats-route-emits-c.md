<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Impersonate toggle can never activate — no chats route emits character_id

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: The composer impersonate toggle never activates: currentCharacter stays null, toggleImpersonate warns 'No chat or character selected', and the .impersonation-banner stays hidden in every chat.

ROOT CAUSE: currentCharacter is only set by loadCharacterInfo (src/frontend/alpine/chat-utils/gallery.ts:211), which reads chat.character_id off GET /api/v1/chats/:id — but no chats route handler emits that field (grep-verified over src/routes).

EVIDENCE: Probed live in direct and group chats: currentCharacter stays null. Failing-run tail:
TimeoutError: waiting for locator('.impersonation-banner') to be visible
  34 x locator resolved to hidden <div class="impersonation-banner" x-show="impersonationActive && !isGenerating">
(fail) Composer interactions (B7) > impersonate toggle activates the banner and sending surfaces the server outcome as a toast

FIX DIRECTION: Emit character_id on the chats detail response so loadCharacterInfo can resolve the current character.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
