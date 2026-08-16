<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add tests for untested routes (13 files)

**Status:** ✅ Done (closed via git issue)
**Priority:** Medium
**Effort:** Large
**Epic:** epic-logic-reconciliation

## Summary

13 route files have no tests. These cover character systems, chat features, and admin functionality.

## Routes to Test

| Route File                     | Endpoints                    | Key Test Areas                        |
| ------------------------------ | ---------------------------- | ------------------------------------- |
| `message-reactions.ts`         | GET/POST/DELETE reactions    | Toggle, max reactions, access control |
| `chat-context.ts`              | GET context, POST regenerate | Token counting, regeneration          |
| `export.ts`                    | POST /api/export             | ZIP generation, character/chat export |
| `import.ts`                    | POST /api/actors/import      | Character card parsing, validation    |
| `i18n.ts`                      | GET locales, PATCH locale    | Locale listing, user locale update    |
| `character-availability.ts`    | GET/POST/DELETE              | Upsert, delete, validation            |
| `character-avatars.ts`         | 8 endpoints                  | CRUD, selection, config               |
| `character-emotions.ts`        | GET/POST/DELETE              | CRUD, emotion definitions             |
| `character-io.ts`              | GET/POST import/export       | Export filtering, import validation   |
| `character-licensing.ts`       | GET/POST/DELETE              | Upsert, boolean conversion            |
| `character-mood.ts`            | GET/POST/PUT/PATCH           | CRUD, events, delta                   |
| `character-relationships.ts`   | GET/POST/PUT/DELETE          | CRUD, events                          |
| `character-traits.ts`          | 14 endpoints                 | Permanent/world/location traits       |
| `admin-character-overrides.ts` | GET/POST/DELETE              | Admin access, overrides               |

## Acceptance Criteria

- [ ] Each route file has at least 1 test file
- [ ] Core endpoints covered (≥80% function coverage)
- [ ] All tests pass: `bun test src/routes/`
