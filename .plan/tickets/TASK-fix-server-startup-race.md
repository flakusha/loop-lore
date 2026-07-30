# TASK: Fix server startup migration race

**Status:** ✅ Done (closed via git issue)
**Priority:** Medium
**Effort:** Small
**Epic:** epic-logic-reconciliation

## Summary

`src/server.ts` calls `serve()` before `runMigrations()`, meaning the server accepts HTTP connections before the database schema is ready.

## Current Code (lines ~195-210)

```ts
const app = createApp({ database, config, handleNonApiRequest, },);
const handleRequest = createRequestHandler(app, config, logger,);

// ── Start HTTP server ──
serve({ port: config.server.port, fetch: handleRequest, },);
serverLogger.info(`HTTP → http://localhost:${config.server.port}`,);

// ... TLS setup ...

// ── Run migrations before serving ──
await runMigrations(database,); // TOO LATE — server already accepting requests
await seedDefaultActors(database, config,);
```

## Fix

Move `runMigrations()` and `seedDefaultActors()` BEFORE `serve()`:

```ts
// ── Run migrations before serving ──
await runMigrations(database,);
await seedDefaultActors(database, config,);

// ── Start HTTP server ──
serve({ port: config.server.port, fetch: handleRequest, },);
```

## Acceptance Criteria

- [ ] Migrations complete before server starts accepting requests
- [ ] Server logs confirm migration completion before serving
- [ ] Tests pass: `bun test src/`
