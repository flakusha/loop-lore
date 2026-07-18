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
        query = query.where(filter.field, "=", filter.value);
        break;
      case "in":
        query = query.where(filter.field, "in", filter.value as string[]);
        break;
      case "contains":
        query = query.where(filter.field, "like", `%${filter.value}%`);
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
import { createHash } from "crypto";
import { readFileSync } from "fs";

export interface IntegrityReport {
  verified: boolean;
  modifiedFiles: string[];
  missingFiles: string[];
}

export async function checkIntegrity(expectedHashes: Record<string, string>): Promise<IntegrityReport> {
  const modified: string[] = [];
  const missing: string[] = [];

  for (const [file, expectedHash] of Object.entries(expectedHashes)) {
    try {
      const content = readFileSync(file);
      const actualHash = createHash("sha256").update(content).digest("hex");

      if (actualHash !== expectedHash) {
        modified.push(file);
      }
    } catch {
      missing.push(file);
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
  const world = await db.selectFrom("worlds").select("rules").where("id", "=", worldId).executeTakeFirst();

  if (!world?.rules) return true; // No rules = all allowed

  const rules = JSON.parse(world.rules || "{}") as WorldRules;

  // Check blacklist first
  if (rules.blacklisted_commands?.includes(command)) {
    return false;
  }

  // Check whitelist if exists
  if (rules.allowed_commands?.length > 0) {
    return rules.allowed_commands.includes(command);
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
export function notificationStream(ctx: any) {
  const userId = ctx.user.id;

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Send existing unread
        const unread = await db
          .selectFrom("notifications")
          .selectAll()
          .where("user_id", "=", userId)
          .where("read", "=", 0)
          .execute();

        for (const n of unread) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(n)}\n\n`));
        }

        // Poll for new notifications
        const interval = setInterval(async () => {
          const latest = await db
            .selectFrom("notifications")
            .selectAll()
            .where("user_id", "=", userId)
            .where("created_at", ">", lastCheck)
            .execute();

          for (const n of latest) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(n)}\n\n`));
          }
        }, 30000); // 30s fallback

        ctx.req.signal.addEventListener("close", () => {
          clearInterval(interval);
          controller.close();
        });
      },
    }),
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
export async function archiveChatWithAssets(chatId: string, userId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // Archive chat
    await trx
      .updateTable("chats")
      .set({ archived_at: new Date().toISOString() })
      .where("id", "=", chatId)
      .execute();

    // Archive messages and link assets
    const messages = await trx.selectFrom("messages").select("id").where("chat_id", "=", chatId).execute();

    for (const msg of messages) {
      await trx
        .updateTable("messages")
        .set({ archived_at: new Date().toISOString() })
        .where("id", "=", msg.id)
        .execute();

      // Link attached assets
      const attachments = JSON.parse(msg.attachments || "[]");
      for (const assetId of attachments) {
        await trx
          .insertInto("archived_asset_links")
          .values({
            chat_id: chatId,
            asset_id: assetId,
            archived_at: new Date().toISOString(),
          })
          .execute();

        // Soft-delete asset
        await trx
          .updateTable("assets")
          .set({ archived_at: new Date().toISOString() })
          .where("id", "=", assetId)
          .execute();
      }
    }
  });
}
```

### Edge Cases

- Asset already archived → skip
- DB lock timeout → retry 3 times
- Partial failure → rollback entire transaction
- Large attachment count → batch inserts
- Asset shared between chats → only archive this link
