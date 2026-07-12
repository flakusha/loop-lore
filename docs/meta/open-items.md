# Open Items (Technical Debt)

Tracked code quality concerns that need cleanup. Each item links to source
files and describes the refactoring needed.

---

## DUP.1 Config Defaults Duplicated

**Severity**: High
**Source**: `docs/spec/architecture.md`, `src/config/schema.ts`, `src/config/schema-class.ts`

`src/config/schema.ts` defines `const DEFAULTS: Config` (lines 583–703) with
every config default value. `src/config/schema-class.ts` defines identical
instance field defaults (lines 52–179). File comment says "Keep schema.ts
interfaces + DEFAULTS for backward compat" but the two sources of truth will
drift.

**Fix**: Delete `DEFAULTS` object from `schema.ts`; import defaults from
`configSchema.defaults` instead. Ensure all consumers use the class-based
source.

---

## DUP.2 Async Log Queue Duplicated (Browser vs Server)

**Severity**: Medium
**Source**: `src/frontend/alpine/queue.ts`, `src/logger/queue.ts`

Both implement `AsyncLogQueue` with identical algorithm, constants, field
layout, and methods (~90 lines duplicated). Only ~10 lines differ:
`logger/queue.ts` uses `timer.unref()`, `process.stderr.write()`,
`flushSync()`. Frontend port uses `console.error()` fallback.

**Fix**: Extract a runtime-agnostic base class (`AsyncLogQueueBase`) into a
shared location. Subclass with Node vs browser overrides for the 10 diverging
lines.

---

## DUP.3 Generation Post-Response Finalization

**Severity**: Medium
**Source**: `src/generation/generate-route.ts`

Streaming and non-streaming paths both construct identical `GenerationResult`
objects and run identical message-insert queries (~40 lines duplicated).
Streaming path uses `MessageStatus.Partial` + `continuation_index`;
non-streaming uses `MessageStatus.Confirmed`.

**Fix**: Extract `storeGenerationResult()` and `buildGenerationResult()`
helpers.

---

## DUP.4 Chat Route Guard/Ownership Boilerplate

**Severity**: High
**Source**: `src/routes/chats.ts`

13 route handlers repeat the same 7-line unauthorized guard (`if (!userId)
return jsonError(...)`) and same 7-line ownership check (`fetch chat by id,
check created_by, return 403/404`). ~180 lines of boilerplate total — highest
refactoring value.

**Fix**: Extract `requireUser(context): string | Response` and
`requireChatAccess(database, chatId, userId, userRole): Promise<Response | true>`.
Apply to all 13 handlers.

---

## DUP.5 Message Ownership Check Boilerplate

**Severity**: Medium
**Source**: `src/routes/messages.ts`

4 handlers (`handleGetMessage`, `handleListVariants`, `handleSelectVariant`,
`handleUpdateVisibility`) repeat the same ~18-line fetch-message-then-fetch-chat
ownership check pattern. ~72 lines total.

**Fix**: Extract `requireMessageAccess(database, messageId, userId, userRole)`
helper.

---

## DUP.6 World Location Ownership Check Boilerplate

**Severity**: Low
**Source**: `src/routes/worlds.ts`

5 location handlers repeat the same 8-line world-ownership fetch + check
pattern. ~40 lines total.

**Fix**: Extract `requireWorldAccess(database, worldId, userId, userRole)`.
Note world-level handlers (get/update/delete world) also repeat this pattern
(~3 additional instances).

---

## DUP.7 Logger Public Method Boilerplate (Acceptable)

**Severity**: Info
**Source**: `src/frontend/alpine/logger.ts`, `src/logger/logger.ts`

~60 lines of identical public method delegation (log, child, flush, 4x
level methods). Both implement the same `Logger` interface for different
runtimes (browser vs Node). Shared interface constrains drift.

**Status**: Accepted — not worth abstracting. Different runtime dependencies
make sharing impractical.

---

## DUP.8 Lore Entry CRUD Config Similarity (Acceptable)

**Severity**: Info
**Source**: `src/routes/actor-lore-entries.ts`, `src/routes/world-lore-entries.ts`

Both pass near-identical config objects to `createEntityRoutes()` factory.
Field mappings, defaults, sort order, and JSON field lists are identical
because actor and world lore entries share the same table schema.

**Status**: Accepted — factory pattern already eliminates handler duplication.
Configs necessarily similar due to shared schema; further abstraction adds
complexity without benefit.