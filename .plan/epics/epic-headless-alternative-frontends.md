<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Headless Mode & Alternative Frontends

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic

## Summary

Headless mode, alternative frontend solutions, OpenAPI spec, WebSocket/WebTransport support. Enable non-browser clients and alternative UIs.

## Scope

- Headless API mode (no frontend serving)
- OpenAPI spec generation
- WebSocket/WebTransport support
- Alternative frontend framework support
- API-first architecture

## Tasks

- [ ] OpenAPI spec generation from Elysia routes
- [ ] Headless mode configuration
- [ ] WebSocket endpoint support
- [ ] WebTransport endpoint support
- [ ] API versioning strategy
- [ ] Alternative frontend documentation

## Fresh.js Implementation (Deno-native)

Fresh.js is the first concrete alternative frontend — Deno-native, islands
architecture, zero client JS by default. Serves as proof-of-concept for
the API-first architecture.

### Architecture

- **Islands**: Server-rendered HTML, islands upgrade to interactive
  Fresh components consume `/api/*` endpoints
- **No build step**: Deploy via `deno deploy` or static export
- **TailwindCSS**: Style islands with utility classes
- **HTMX passthrough**: Islands can delegate to backend SSE/WS

### Implementation Tasks

- [ ] Generate OpenAPI spec from Elysia (`src/routes/swagger.ts`)
- [ ] Create Fresh.js starter repo (`loop-lore-fresh-starter/`)
- [ ] Implement Fresh handlers for core endpoints (chat, characters, worlds)
- [ ] Add Fresh islands: message-list, chat-input, character-card
- [ ] Configure TailwindCSS for Fresh (`tailwind.config.js`)
- [ ] Add npm/yarn bridge for shared component library
- [ ] Document framework-agnostic API contract

### Deployment Targets

- **Deno Deploy**: `deployctl deploy --watch`
- **Docker**: Fresh static export + reverse proxy
- **Static**: Fresh preact-only export for CDN hosting

## SDK / Client Library Strategy

### Shared vs. Framework-Specific

| Layer            | Shared                                              | Framework-Specific               |
| ---------------- | --------------------------------------------------- | -------------------------------- |
| API types        | OpenAPI + TypeScript types (`@loop-lore/api-types`) | N/A                              |
| State management | API client (`@loop-lore/client`)                    | React hooks, Svelte stores, etc. |
| UI components    | Design tokens, CSS variables                        | React/Preact/Svelte components   |
| Build config     | Vite config, tsconfig                               | Framework-specific Vite plugins  |

### Shared Package: `@loop-lore/api-types`

Generated from OpenAPI spec. Consumed by all frontend SDKs.

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

### Shared Package: `@loop-lore/client`

Framework-agnostic API client with built-in retry, auth, and error handling.

```typescript
import { LoopLoreClient, } from "@loop-lore/client";

const client = new LoopLoreClient({
  baseURL: "https://api.loop-lore.app",
  apiKey: process.env.LOOP_LORE_API_KEY,
},);

const messages = await client.chat.listMessages({ chatId: "abc123", },);
```

### Framework-Specific SDK Matrix

| Framework | Package             | State Management             | Build Target       |
| --------- | ------------------- | ---------------------------- | ------------------ |
| React     | `@loop-lore/react`  | React Query + Context        | Vite + SWC         |
| Preact    | `@loop-lore/preact` | Preact signals + context     | Vite + SWC         |
| Svelte    | `@loop-lore/svelte` | Svelte stores                | Vite + Svelte      |
| Next.js   | `@loop-lore/next`   | React Query + Next.js client | Next.js app router |
| Nuxt      | `@loop-lore/nuxt`   | Vue composables              | Nuxt module        |
| Vue       | `@loop-lore/vue`    | Vue composables + Pinia      | Vite + Vue         |

### React Implementation

```typescript
// @loop-lore/react
import { useCharacter, useChat, useWorld, } from "@loop-lore/react";

function ChatPage() {
  const { messages, sendMessage, isLoading, } = useChat({ chatId: "abc123", },);
  const { character, } = useCharacter({ characterId: "char1", },);

  return (
    <div>
      <CharacterCard character={character} />
      <MessageList messages={messages} />
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
```

### Preact Implementation

```typescript
// @loop-lore/preact
import { useChat, } from "@loop-lore/preact";

function ChatWidget() {
  const { messages, sendMessage, } = useChat({ chatId: "abc123", },);

  return (
    <div class="chat-widget">
      <MessageList messages={messages} />
      <ChatInput onSend={sendMessage} />
    </div>
  );
}
```

### Svelte Implementation

```typescript
// @loop-lore/svelte
<script>
  import { useChat } from "@loop-lore/svelte";

  const { messages, sendMessage } = useChat({ chatId: "abc123" });
</script>

<MessageList {messages} />
<ChatInput onSend={sendMessage} />
```

### Shared State Contracts

All SDKs consume the same OpenAPI-generated types and use the shared
`@loop-lore/client` under the hood. State management patterns:

| Concern        | Pattern                                          |
| -------------- | ------------------------------------------------ |
| Data fetching  | React Query / SWR (React), Svelte Query (Svelte) |
| Auth           | API key → JWT, stored in httpOnly cookies        |
| Real-time      | WebSocket / SSE for live updates                 |
| Caching        | In-memory + localStorage for offline             |
| Error handling | Structured error types from API                  |

### Build Pipeline Per Target

| Target  | Build Tool  | Output     | Deploy              |
| ------- | ----------- | ---------- | ------------------- |
| React   | Vite        | ESM bundle | Vercel, Netlify, S3 |
| Preact  | Vite        | ESM bundle | Vercel, Netlify, S3 |
| Svelte  | Vite        | ESM bundle | Vercel, Netlify, S3 |
| Next.js | Next.js CLI | SSR/ISR    | Vercel, Node server |
| Nuxt    | Nuxt CLI    | SSR/SSG    | Vercel, Node server |
| Fresh   | Fresh CLI   | SSR/SSG    | Deno Deploy         |

### Implementation Tasks

- [ ] Generate OpenAPI spec from Elysia routes
- [ ] Create `@loop-lore/api-types` package
- [ ] Create `@loop-lore/client` package (shared API client)
- [ ] Implement `@loop-lore/react` (React hooks + components)
- [ ] Implement `@loop-lore/preact` (Preact hooks + components)
- [ ] Implement `@loop-lore/svelte` (Svelte stores + components)
- [ ] Implement `@loop-lore/vue` (Vue composables + components)
- [ ] Implement `@loop-lore/next` (Next.js integration)
- [ ] Implement `@loop-lore/nuxt` (Nuxt module)
- [ ] Add shared CSS design tokens package
- [ ] Document SDK usage patterns
- [ ] Add TypeScript type tests for all SDKs
- [ ] Set up monorepo workspace (`packages/`)

## Tasks (API-First Foundation for SDKs)

- [ ] Generate OpenAPI spec from Elysia routes (`/api/openapi.json`)
- [ ] Add headless mode config (skip frontend middleware)
- [ ] Implement API versioning (`/api/v1/`, `/api/v2/`)
- [ ] Add CORS middleware for external origins
- [ ] Add API key authentication middleware
- [ ] Create `packages/server/` with importable Elysia app
- [ ] Document API endpoints in `docs/api/`

## Files

- `src/elysia-app.ts` — app configuration
- `src/routes/` — API routes
- `docs/spec/api-routes.md` — API documentation
- `docs/spec/architecture.md` — architecture spec
- `packages/api-types/` — shared TypeScript types
- `packages/client/` — shared API client
- `packages/react/` — React SDK
- `packages/preact/` — Preact SDK
- `packages/svelte/` — Svelte SDK
- `packages/vue/` — Vue SDK
- `packages/next/` — Next.js SDK
- `packages/nuxt/` — Nuxt module

## Linked Tasks

- TASK-headless-alternative-frontends.md

## Related Epics

- **epic-api-library-distribution.md** — SDK packages depend on API-first foundation and library distribution
