<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Implementation Guide

**Status:** ⬜ Not Started
**Priority:** Medium

## Summary

Implementation epic for Implementation Guide. See `docs/spec/implementation.md` for specification.

## Scope

_TBD — expand with implementation tasks derived from the spec._

## Related Epics

- `docs/spec/implementation.md`

## Tickets

_TBD — create implementation tickets._

---

## Merged from `.plan/epics/epic-implementation.md`

# Implementation Approaches & Edge Cases

## 7. Combined Filter System

### Approach: Filter Composition

```typescript
// src/search/filter-composer.ts
export interface Filter {
  field: string;
  operator: "eq" | "ne" | "gt" | "lt" | "contains" | "in";
  value: unknown;
}

export function buildFilterQuery(
  baseQuery: SelectQueryBuilder<any, any>,
  filters: Filter[],
): SelectQueryBuilder<any, any> {
  let query = baseQuery;

  for (const filter of filters) {
    switch (filter.operator) {
      case "eq":
        query = query.where(filter.field, "=", filter.value,);
        break;
      case "in":
        query = query.where(filter.field, "in", filter.value as string[],);
        break;
      case "contains":
        query = query.where(filter.field, "like", `%${filter.value}%`,);
        break;
    }
  }

  return query;
}

// Usage: ?tags=character&tags=landscape&type=image
// Converts to: WHERE tags IN ('character', 'landscape') AND type = 'image'
```

### Edge Cases

- Empty filter value → skip filter
- Unknown field → log warning, ignore
- SQL injection in filter → parameterized queries
- Too many filters (100+) → rate limit
- NULL values in filter → explicit NULL check

## 8. Integrity Verification

### Approach: File Hash Comparison

```typescript
// src/integrity/checker.ts
import { createHash, } from "crypto";
import { readFileSync, } from "fs";

export interface IntegrityReport {
  verified: boolean;
  modifiedFiles: string[];
  missingFiles: string[];
}

export async function checkIntegrity(expectedHashes: Record<string, string>,): Promise<IntegrityReport> {
  const modified: string[] = [];
  const missing: string[] = [];

  for (const [file, expectedHash,] of Object.entries(expectedHashes,)) {
    try {
      const content = readFileSync(file,);
      const actualHash = createHash("sha256",).update(content,).digest("hex",);

      if (actualHash !== expectedHash) {
        modified.push(file,);
      }
    } catch {
      missing.push(file,);
    }
  }

  return {
    verified: modified.length === 0 && missing.length === 0,
    modifiedFiles: modified,
    missingFiles: missing,
  };
}
```

### Edge Cases

- Missing integrity.json → return "unknown" status
- File unreadable → log warning, skip
- Hash algorithm mismatch → fallback to sha256
- Very large files → stream hash calculation
- Race condition during check → lock file

## 9. World Rules for Commands

### Approach: Rule-Based Command Control

```typescript
// src/db/schema-core.ts
export interface WorldRules {
  allowed_commands: string[]; // ["dice", "stats", "improve"]
  blacklisted_commands: string[]; // ["damage", "heal"]
  command_costs: Record<string, number>; // {"image": 10, "quest": 5}
}

// src/assistant/command-guard.ts
export async function checkCommandPermission(
  command: string,
  worldId: string,
  userId: string,
): Promise<boolean> {
  const world = await db.selectFrom("worlds",).select("rules",).where("id", "=", worldId,).executeTakeFirst();

  if (!world?.rules) { return true; // No rules = all allowed
   }

  const rules = JSON.parse(world.rules || "{}",) as WorldRules;

  // Check blacklist first
  if (rules.blacklisted_commands?.includes(command,)) {
    return false;
  }

  // Check whitelist if exists
  if (rules.allowed_commands?.length > 0) {
    return rules.allowed_commands.includes(command,);
  }

  return true;
}
```

### Edge Cases

- Invalid JSON in rules → log error, allow all
- Circular dependencies (commands calling commands) → max depth 3
- Cost insufficient → deduct from actor gold
- GM override → skip permission check for GM role
- World deleted → use default rules

## 10. Notification SSE Endpoint

### Approach: Server-Sent Events

```typescript
// src/routes/notifications-stream.ts
export function notificationStream(ctx: any,) {
  const userId = ctx.user.id;

  return new Response(
    new ReadableStream({
      async start(controller,) {
        const encoder = new TextEncoder();

        // Send existing unread
        const unread = await db
          .selectFrom("notifications",)
          .selectAll()
          .where("user_id", "=", userId,)
          .where("read", "=", 0,)
          .execute();

        for (const n of unread) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(n,)}\n\n`,),);
        }

        // Poll for new notifications
        const interval = setInterval(async () => {
          const latest = await db
            .selectFrom("notifications",)
            .selectAll()
            .where("user_id", "=", userId,)
            .where("created_at", ">", lastCheck,)
            .execute();

          for (const n of latest) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(n,)}\n\n`,),);
          }
        }, 30000,); // 30s fallback

        ctx.req.signal.addEventListener("close", () => {
          clearInterval(interval,);
          controller.close();
        },);
      },
    },),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
}
```

### Edge Cases

- Client disconnects → cleanup interval
- DB connection lost → reconnect with backoff
- Too many notifications → buffer limit 100
- Heartbeat timeout → send comment line
- CORS preflight → handle OPTIONS request

## 11. Archive Cascade with Assets

### Approach: Transactional Cascade

```typescript
// src/archival/cascade.ts
export async function archiveChatWithAssets(chatId: string, userId: string,): Promise<void> {
  await db.transaction().execute(async (trx,) => {
    // Archive chat
    await trx
      .updateTable("chats",)
      .set({ archived_at: new Date().toISOString(), },)
      .where("id", "=", chatId,)
      .execute();

    // Archive messages and link assets
    const messages = await trx.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,).execute();

    for (const msg of messages) {
      await trx
        .updateTable("messages",)
        .set({ archived_at: new Date().toISOString(), },)
        .where("id", "=", msg.id,)
        .execute();

      // Link attached assets
      const attachments = JSON.parse(msg.attachments || "[]",);
      for (const assetId of attachments) {
        await trx
          .insertInto("archived_asset_links",)
          .values({
            chat_id: chatId,
            asset_id: assetId,
            archived_at: new Date().toISOString(),
          },)
          .execute();

        // Soft-delete asset
        await trx
          .updateTable("assets",)
          .set({ archived_at: new Date().toISOString(), },)
          .where("id", "=", assetId,)
          .execute();
      }
    }
  },);
}
```

### Edge Cases

- Asset already archived → skip
- DB lock timeout → retry 3 times
- Partial failure → rollback entire transaction
- Large attachment count → batch inserts
- Asset shared between chats → only archive this link

---

## Merged from `.plan/epics/epic-implementation.md`

# Implementation Samples

## 1. Notification Noise Filtering

### Sample: Notification Service

```typescript
// src/notifications/service.ts
import { db, } from "../db";

export interface NotificationEvent {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  noiseLevel: "critical" | "high" | "medium" | "low";
  data?: unknown;
}

export async function createNotification(event: NotificationEvent,): Promise<void> {
  // Check user's noise threshold
  const userPrefs = await db
    .selectFrom("user_notification_prefs",)
    .selectAll()
    .where("user_id", "=", event.userId,)
    .executeTakeFirst();

  const threshold = userPrefs?.noise_threshold ?? "medium";
  const noiseLevels = { critical: 0, high: 1, medium: 2, low: 3, };

  if (noiseLevels[event.noiseLevel] <= noiseLevels[threshold as keyof typeof noiseLevels]) {
    await db
      .insertInto("notifications",)
      .values({
        id: crypto.randomUUID(),
        user_id: event.userId,
        type: event.type,
        title: event.title,
        body: event.body,
        link: event.link,
        noise_level: event.noiseLevel,
        data: event.data ? JSON.stringify(event.data,) : null,
      },)
      .execute();
  }
}
```

### Edge Cases

- User deleted mid-notification → skip insert
- Invalid noise level enum → log warning, use "medium"
- DB full → queue in memory, retry with backoff
- Concurrent notifications → batch insert

## 2. Model Comparison Reactions

### Sample: Comparison Table + API

```typescript
// src/db/schema-core.ts
export interface ModelComparisons {
  id: Generated<string>;
  message_id: string;
  user_id: string;
  reference_model: string;
  preference: "better" | "worse" | "same";
  confidence: number; // 0-1
  created_at: Generated<string>;
}

// src/routes/reactions.ts
export async function postComparison(
  ctx: RequestContext,
  messageId: string,
  body: { reference_model: string; preference: string; confidence?: number },
): Promise<Response> {
  const userId = ctx.user.id;

  // Validate message exists and user has access
  const message = await db.selectFrom("messages",).selectAll().where("id", "=", messageId,).executeTakeFirst();

  if (!message) { return error(404, "Message not found",); }

  // Insert comparison
  await db
    .insertInto("model_comparisons",)
    .values({
      id: crypto.randomUUID(),
      message_id: messageId,
      user_id: userId,
      reference_model: body.reference_model,
      preference: body.preference as "better" | "worse" | "same",
      confidence: body.confidence ?? 1.0,
    },)
    .execute();

  return success(201, { id: crypto.randomUUID(), },);
}
```

### Edge Cases

- Same user compares same message twice → update existing
- Invalid confidence (>1 or <0) → clamp to 0-1
- Message deleted → cascade delete comparison
- Model name injection → validate against known models list

## 3. Dice Engine

### Sample: Dice Parser

```typescript
// src/rpg/dice.ts
export interface DiceRoll {
  total: number;
  rolls: number[];
  modifier: number;
  notation: string;
}

export function rollDice(notation: string, seed?: number,): DiceRoll {
  const match = notation.match(/^(\d*)d(\d+)([+-]\d+)?$/,);
  if (!match) { throw new Error(`Invalid dice notation: ${notation}`,); }

  const count = parseInt(match[1] || "1",);
  const sides = parseInt(match[2],);
  const modifier = parseInt(match[3] || "0",);

  if (count > 100 || sides > 1000) {
    throw new Error("Dice notation exceeds limits",);
  }

  const rng = seed !== undefined ? seededRandom(seed,) : Math.random;
  const rolls = Array.from({ length: count, }, () => Math.floor(rng() * sides,) + 1,);

  return {
    total: rolls.reduce((a, b,) => a + b, 0,) + modifier,
    rolls,
    modifier,
    notation,
  };
}

function seededRandom(seed: number,) {
  return () => {
    // Simple seeded PRNG for deterministic rolls
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}
```

### Edge Cases

- Invalid notation → throw descriptive error
- Very large dice (100d1000) → rate limit or reject
- Negative sides → reject
- Seed collision → warn in logs
- Floating point precision → use integers

## 4. Archival Workflow

### Sample: Archive/Purge Service

```typescript
// src/archival/service.ts
export async function archiveChat(chatId: string, userId: string,): Promise<void> {
  const chat = await db.selectFrom("chats",).selectAll().where("id", "=", chatId,).executeTakeFirst();

  if (!chat || chat.created_by !== userId) {
    throw new Error("Not authorized",);
  }

  // Soft delete - set archived_at
  await db
    .updateTable("chats",)
    .set({ archived_at: new Date().toISOString(), },)
    .where("id", "=", chatId,)
    .execute();

  // Archive all messages
  await db
    .updateTable("messages",)
    .set({ archived_at: new Date().toISOString(), },)
    .where("chat_id", "=", chatId,)
    .execute();
}

export async function purgeExpiredArchives(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90,); // Configurable

  // Get chats to purge
  const expiredChats = await db
    .selectFrom("chats",)
    .select("id",)
    .where("archived_at", "!=", null,)
    .where("archived_at", "<", cutoff.toISOString(),)
    .execute();

  // Cascade delete
  for (const chat of expiredChats) {
    await db.deleteFrom("messages",).where("chat_id", "=", chat.id,).execute();
    await db.deleteFrom("chats",).where("id", "=", chat.id,).execute();
  }

  return expiredChats.length;
}
```

### Edge Cases

- Chat already archived → idempotent
- Messages in multiple chats → only archive from this chat
- User leaves during archival → still complete
- Purge during active session → reject
- DB constraint violation → rollback transaction

## 5. Assistant Commands

### Sample: Command Parser

```typescript
// src/assistant/command-parser.ts
export interface ParsedCommand {
  command: string;
  args: string[];
  raw: string;
}

export function parseCommand(input: string,): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/",)) { return null; }

  const parts = trimmed.slice(1,).split(/\s+/,);
  return {
    command: parts[0].toLowerCase(),
    args: parts.slice(1,),
    raw: trimmed,
  };
}

// src/assistant/commands/dice.ts
import { parseCommand, } from "../command-parser";

export async function handleDiceCommand(
  rawInput: string,
  context: { chatId: string; actorId: string },
): Promise<string> {
  const parsed = parseCommand(rawInput,);
  if (!parsed) { return "Invalid command"; }

  const notation = parsed.args[0];
  if (!notation) { return "Usage: /dice <notation> (e.g., /dice 2d6+3)"; }

  try {
    const result = rollDice(notation,);
    return `🎲 ${notation} = ${result.rolls.join(", ",)}${
      result.modifier ? ` + ${result.modifier}` : ""
    } = **${result.total}**`;
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : "Invalid notation"}`;
  }
}
```

### Edge Cases

- Unknown command → suggest similar
- Command in wrong chat type → reject
- Permission check fails → 403 response
- LLM returns invalid JSON for intent → fallback to text
- Command recursion (command calls command) → depth limit

## 6. Signed URLs for Assets

### Sample: Signed URL Generator

```typescript
// src/assets/signed-url.ts
export interface SignedURL {
  url: string;
  expiresAt: string;
  token: string;
}

export async function createSignedURL(assetId: string, userId: string,): Promise<SignedURL> {
  const asset = await db.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirst();

  if (!asset) { throw new Error("Asset not found",); }

  // Check access
  const chatId = asset.chat_id;
  if (chatId) {
    const participant = await db
      .selectFrom("chat_participants",)
      .selectAll()
      .where("chat_id", "=", chatId,)
      .where("user_id", "=", userId,)
      .executeTakeFirst();

    if (!participant) { throw new Error("Not authorized",); }
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000,).toISOString(); // 1 hour

  // Store token
  await db
    .insertInto("asset_tokens",)
    .values({
      id: token,
      asset_id: assetId,
      user_id: userId,
      expires_at: expiresAt,
    },)
    .execute();

  return {
    url: `/api/assets/${assetId}/download?token=${token}`,
    expiresAt,
    token,
  };
}
```

### Edge Cases

- Token expired → 401, generate new
- Asset deleted → 404
- Multiple downloads → same token reusable
- Token leaked → revoke all user tokens
- Large file streaming → range requests
