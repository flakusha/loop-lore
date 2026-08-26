<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-recon-security-fixes: Backend reconciliation — Phase 2 security fixes

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** TASK
**Tags:** backend, security
**Epic:** epic-logic-reconciliation
**Parent:** TASK-reconciliation-plan (umbrella)

## Summary

Close the four security holes found in the reconciliation audit: missing character-route ownership checks, reaction DELETE access check, SSRF in the import route, and the server startup race.

## Context

| Issue                                          | File(s)                                                                                                                                                                          | Severity |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| No ownership check on character CRUD           | `character-mood.ts`, `character-relationships.ts`, `character-traits.ts`, `character-licensing.ts`, `character-availability.ts`, `character-emotions.ts`, `character-avatars.ts` | High     |
| No message access check on reaction DELETE     | `message-reactions.ts`                                                                                                                                                           | Medium   |
| SSRF risk: arbitrary URL fetch                 | `import.ts` (import from URL)                                                                                                                                                    | Medium   |
| Manual cookie parsing bypasses auth middleware | `export.ts`                                                                                                                                                                      | Low      |
| Server starts before migrations complete       | `server.ts`                                                                                                                                                                      | Medium   |

## Tasks

### 2.1 Add ownership checks to character routes

- **Problem:** Any authenticated user can read/modify any character's mood, relationships, traits, licensing, availability, emotions, avatars.
- **Fix:** Add ownership check in each route handler — verify `actor.owner_id === userId` or `userRole === "admin"`.
- **Files:** `character-mood.ts`, `character-relationships.ts`, `character-traits.ts`, `character-licensing.ts`, `character-availability.ts`, `character-emotions.ts`, `character-avatars.ts`

### 2.2 Fix message-reactions DELETE access check

- **Problem:** DELETE `/api/messages/:id/reactions` doesn't verify message access.
- **Fix:** Add access check before deletion.

### 2.3 Fix SSRF in import route

- **Problem:** `import.ts` fetches arbitrary URLs from user input.
- **Fix:** Validate URL scheme (http/https only), block private IPs, add timeout.

### 2.4 Fix server startup race

- **Problem:** `server.ts` calls `serve()` before `runMigrations()`.
- **Fix:** Move `runMigrations()` before `serve()`.

Note: the low-severity manual cookie parsing in `export.ts` is tracked here for visibility; fix opportunistically with 2.2's access-check work.

## Dependencies

- Parent hub: `TASK-reconciliation-plan.md`
- Siblings: TASK-recon-critical-fixes, TASK-recon-test-coverage (route tests for these files land there), TASK-recon-dedup.

## Acceptance Criteria

- [ ] Non-owner requests to all 7 character subresource route files denied (403/404)
- [ ] Reaction DELETE requires message access
- [ ] Import URL validation blocks non-http(s) and private IPs
- [ ] Migrations complete before `serve()`; regression test covers ordering
