<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Memory, DB and config residual defects from the cat-jam sweep

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Seven verified findings that share no single root cause but are all small and all in the same review pass.

- src/memory/extraction-store.ts:97 — every extracted memory is written with privacy 'shared' regardless of chat context, so a secret or private chat's memories can be provisioned more broadly than the conversation warrants. Derive privacy from the chat.
- src/memory/extraction.ts:93-100 — the extraction regex is greedy over the whole LLM response; and extraction-store.ts:61 does not cap sourceChatIds, though sourceMessageIds is sliced to MAX_CHAIN_IDS=500 at :60.
- src/assets/controller.ts:494-526 — handleUpload validates per-file size only (validateFileSize at :524). There is no per-user or disk quota, so repeated authenticated uploads can fill storage.
- src/turning/turn-manager/state.ts:129 — the CAS result is coerced with an inline cast to { numAffectedRows }. This is the one place that decides whether every turn persist succeeds; a driver that exposes numModifiedRows instead would read as 0 affected rows and cause a spurious retry or a skipped write. Use a documented accessor that checks both shapes.
- src/db/migrate.ts:98-144 — assertMigrationsNotStale only detects deleted applied migrations. A modified or renumbered migration, or a new column added to a schema file with no migration, is caught only by the schema-sync test, which does not run in every gate.
- src/chat/service/seen.ts:104 — an opaque (oc as any) that is likely an optional-chaining candidate.
- src/config/load/parse.ts:38-51 — setByPath does not reject `__proto__` or constructor segments. Safe today because paths derive from the trusted environmentMap, but any future caller passing user-controlled paths would enable prototype pollution. Add the guard now, while the caller set is known.

Source: .tmp/cat-jam/review-memory-assets-rag.md P1 finding 2 and P2 findings; .tmp/cat-jam/review-generation-rpg-db.md P1-3, P2-5, P2-6; .tmp/cat-jam/review-quality.md P2 and P3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
