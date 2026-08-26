<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Shared Client SDK

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** sdk, api-types, client, design-tokens, monorepo, typescript
**Parent Epic:** Headless Mode & Alternative Frontends (epic-headless-alternative-frontends.md)

## Summary

The framework-agnostic layer every frontend SDK builds on: generated API types (`@loop-lore/api-types`), a shared API client with retry/auth/error handling (`@loop-lore/client`), shared CSS design tokens, the `packages/` monorepo workspace, and type tests guarding the whole surface.

## Scope

- `@loop-lore/api-types` — generated from the OpenAPI spec
- `@loop-lore/client` — framework-agnostic API client (retry, auth, structured errors)
- Shared CSS design tokens package
- Monorepo workspace (`packages/`)
- TypeScript type tests for all SDKs

## Design

### Generated Types: `@loop-lore/api-types`

Generated from the OpenAPI spec (`epic-api-first-foundation.md`). Consumed by all
frontend SDKs — no manual maintenance.

```typescript
// Generated from OpenAPI — no manual maintenance
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  avatar_url?: string;
  personality?: string;
  world_id: string;
}
```

### Shared Client: `@loop-lore/client`

Framework-agnostic API client with built-in retry, auth, and error handling.

```typescript
import { LoopLoreClient, } from "@loop-lore/client";

const client = new LoopLoreClient({
  baseURL: "https://api.loop-lore.app",
  apiKey: process.env.LOOP_LORE_API_KEY,
},);

const messages = await client.chat.listMessages({ chatId: "abc123", },);
```

All framework packages (see `epic-framework-sdks.md`) consume this client under the
hood; real-time transports (see `epic-realtime-transports.md`) plug into the same
client instance.

### Layering Contract

| Layer            | Shared                                              | Framework-Specific               |
| ---------------- | --------------------------------------------------- | -------------------------------- |
| API types        | OpenAPI + TypeScript types (`@loop-lore/api-types`) | N/A                              |
| State management | API client (`@loop-lore/client`)                    | React hooks, Svelte stores, etc. |
| UI components    | Design tokens, CSS variables                        | React/Preact/Svelte components   |
| Build config     | Vite config, tsconfig                               | Framework-specific Vite plugins  |

## Tasks

- [ ] Create `@loop-lore/api-types` package
- [ ] Create `@loop-lore/client` package (shared API client)
- [ ] Add shared CSS design tokens package
- [ ] Add TypeScript type tests for all SDKs
- [ ] Set up monorepo workspace (`packages/`)

## Dependencies

- **Parent hub:** Headless Mode & Alternative Frontends (`epic-headless-alternative-frontends.md`)
- **Requires:** `epic-api-first-foundation.md` — `@loop-lore/api-types` is generated
  from `/api/openapi.json`; the client targets the versioned, CORS-enabled API.
- **Blocks:** `epic-framework-sdks.md` and `epic-fresh-alternative-frontend.md`
  (npm/yarn bridge consumes these packages).

## Related Epics

- `epic-api-library-distribution.md` — packaging/distribution of these libraries
- `epic-shared-schemas.md` — schema conventions mirrored in generated types

