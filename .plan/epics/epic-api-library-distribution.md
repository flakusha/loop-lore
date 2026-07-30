# EPIC: API/Library Distribution Mode

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** api, library, npm, deno, runtime, headless, distribution

## Summary

Enable loop-lore as a consumable API and embeddable library for external projects. Provide npm packages, OpenAPI spec, and runtime-agnostic server that can be imported as a library or run standalone.

## Motivation

External developers want to:

- Embed loop-lore's RPG chat engine in their apps
- Use loop-lore as a backend service for custom frontends
- Import character/world management as a library
- Deploy on non-Bun runtimes (Deno, Node.js, Cloudflare Workers)

## Scope

### Phase 1: API-First Foundation

- OpenAPI spec generation from Elysia routes
- Headless mode (no frontend serving)
- API versioning strategy
- CORS and auth middleware for external consumption

### Phase 2: Library Package

- `@loop-lore/server` — importable Elysia app
- `@loop-lore/client` — framework-agnostic API client
- `@loop-lore/api-types` — OpenAPI-generated TypeScript types
- Runtime abstraction layer (Bun/Deno/Node)

### Phase 3: Distribution

- npm package publishing pipeline
- Deno compatible import maps
- Docker image for standalone deployment
- Cloudflare Workers adapter

## Architecture

### Package Structure

```
packages/
├── api-types/          # @loop-lore/api-types (generated)
├── client/             # @loop-lore/client (fetch-based)
├── server/             # @loop-lore/server (importable Elysia)
├── react/              # @loop-lore/react (hooks)
├── svelte/             # @loop-lore/svelte (stores)
└── deno/               # @loop-lore/deno (Deno adapter)
```

### Runtime Abstraction

```typescript
// src/runtime/adapter.ts
export interface RuntimeAdapter {
  sqlite: SqliteAdapter;
  crypto: CryptoAdapter;
  filesystem: FilesystemAdapter;
  process: ProcessAdapter;
}

// Implementations
export class BunAdapter implements RuntimeAdapter { ... }
export class DenoAdapter implements RuntimeAdapter { ... }
export class NodeAdapter implements RuntimeAdapter { ... }
```

### API Versioning

```
/api/v1/chats          # Stable API
/api/v1/characters     # Stable API
/api/v2/chats          # Breaking changes (future)
```

### Library Usage Pattern

```typescript
// External project imports loop-lore as library
import { createLoopLore, } from "@loop-lore/server";

const app = createLoopLore({
  database: "./data/loop-lore.db",
  encryption: { key: process.env.ENCRYPTION_KEY, },
  headless: true, // No frontend serving
},);

// Mount on existing Express/Fastify/Hono app
app.mount("/api", "/loop-lore",);

// Or run standalone
app.listen(3000,);
```

## Tasks

### Phase 1: API-First Foundation

- [ ] Generate OpenAPI spec from Elysia routes (`/api/openapi.json`)
- [ ] Add headless mode config (skip frontend middleware)
- [ ] Implement API versioning (`/api/v1/`, `/api/v2/`)
- [ ] Add CORS middleware for external origins
- [ ] Add API key authentication middleware
- [ ] Document API endpoints in `docs/api/`

### Phase 2: Library Package

- [ ] Create `packages/server/` with importable Elysia app
- [ ] Create `packages/client/` with fetch-based API client
- [ ] Create `packages/api-types/` with OpenAPI codegen
- [ ] Implement runtime abstraction layer (`src/runtime/`)
- [ ] Add Bun runtime adapter
- [ ] Add Deno runtime adapter (Phase 3 of Deno epic)
- [ ] Add Node.js runtime adapter (via Node SQLite)

### Phase 3: Distribution

- [ ] Set up npm workspace (`packages/`)
- [ ] Configure build pipeline (tsup/rollup per package)
- [ ] Add `deno.json` with import maps
- [ ] Create Docker image for standalone deployment
- [ ] Add Cloudflare Workers adapter
- [ ] Document installation and usage per runtime

## Files

- `packages/server/` — importable server package
- `packages/client/` — API client package
- `packages/api-types/` — generated TypeScript types
- `src/runtime/` — runtime abstraction layer
- `src/routes/openapi.ts` — OpenAPI spec generation
- `docs/api/` — API documentation

## Dependencies

- Depends on: `epic-deno-support.md` (runtime abstraction)
- Depends on: `epic-headless-alternative-frontends.md` (SDK strategy)
- Enables: External integrations, plugin ecosystem

## Success Criteria

- [ ] External project can `npm install @loop-lore/server` and import app
- [ ] External project can use `@loop-lore/client` to call API
- [ ] OpenAPI spec available at `/api/openapi.json`
- [ ] Headless mode serves API only (no frontend)
- [ ] All tests pass with `bun test`
- [ ] Deno import works with `import { ... } from "@loop-lore/server"`
