<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: E2E Test Infrastructure Fixes

**Status:** ✅ Complete
**Priority:** High
**Effort:** Small
**Type:** Bugfix / Infrastructure
**Tags:** e2e, testing, routes, schemas, infrastructure

## Summary

Fixed all 122 e2e test failures (now 174 pass, 0 fail). Root causes: Elysia route parameter conflicts, validation schema mismatches with handlers/tests, stale seed data column references, and logger initialization order.

## Root Causes Fixed

### 1. Elysia Route Parameter Conflict (122 failures)

Elysia's router (memoirist) rejects routes with different param names at the same position. Three route files used `:chatId` while the rest of the codebase used `:id`:

| File                        | Old Route                                                    | Fixed Route                                          |
| --------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `src/routes/chat-search.ts` | `/api/chats/:chatId/join`, `/api/chats/:chatId/transfer`     | `/api/chats/:id/join`, `/api/chats/:id/transfer`     |
| `src/routes/vn-choices.ts`  | `/api/chats/:chatId/vn-choices/*`                            | `/api/chats/:id/vn-choices/*`                        |
| `src/routes/vn-generate.ts` | `/:chatId/vn/generate-story`, `/:chatId/vn/generate-choices` | `/:id/vn/generate-story`, `/:id/vn/generate-choices` |

### 2. Validation Schema Mismatches

| Schema                  | Issue                                                                                    | Fix                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `StoryItemInstanceBody` | Used `item_id`/`location_id` (snake_case) but handler destructured `itemId`/`locationId` | Changed to camelCase: `itemId`, `locationId`, `ownerActorId`      |
| `WorldStateCreateBody`  | Required `state_key`/`state_value` but handler uses `turnId`/`messageId`/`description`   | Replaced with `turnId`, `messageId`, `description` (all optional) |
| `ApiKeyCreateBody`      | Test sent `providerName`/`apiKey` but schema expects `name`/`api_key`                    | Updated test to use correct field names                           |

### 3. Stale Seed Data Columns

| Table       | Removed Column                   | Replacement               |
| ----------- | -------------------------------- | ------------------------- |
| `worlds`    | `creator_id`                     | `owner_id`                |
| `locations` | `type`, `config`                 | (removed — not in schema) |
| `items`     | `creator_id`, `stats`, `effects` | `properties`              |
| `actors`    | `data_version`                   | (removed — not in schema) |

### 4. Logger Initialization Order

`tests/e2e/response-headers.test.ts` called `loadConfig()` before `createLogger()`. Config loading depends on logger. Fixed by swapping initialization order.

## Files Modified

| File                                 | Change                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| `src/routes/chat-search.ts`          | `:chatId` → `:id` in join/transfer routes                         |
| `src/routes/vn-choices.ts`           | `:chatId` → `:id` in all VN choice routes                         |
| `src/routes/vn-generate.ts`          | `:chatId` → `:id` in VN generation routes                         |
| `src/validation/schemas.ts`          | Fixed `StoryItemInstanceBody`, `WorldStateCreateBody` field names |
| `tests/e2e/helpers/seed.ts`          | Fixed stale column references                                     |
| `tests/e2e/helpers/server.ts`        | Removed `data_version` from actor insert                          |
| `tests/e2e/flows/api-keys.test.ts`   | Aligned test field names with schema                              |
| `tests/e2e/response-headers.test.ts` | Fixed logger init order                                           |

## Verification

- ✅ E2E: 174 pass, 0 fail, 0 errors
- ✅ Unit: 2878 pass, 0 fail
- ✅ TypeScript: 0 errors
- ✅ dprint: clean on all modified files

## Impact

Unblocks all e2e testing. Previously, every e2e test file failed due to the route param conflict cascading through Elysia's router initialization.
