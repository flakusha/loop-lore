<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Runtime Abstraction Layer

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-api-library-distribution.md

## Summary

Create runtime abstraction layer to enable Bun, Deno, and Node.js support.

## Tasks

- [ ] Create `src/runtime/adapter.ts` interface
- [ ] Implement `BunAdapter` (current runtime)
- [ ] Implement `DenoAdapter` (Deno SQLite + Web APIs)
- [ ] Implement `NodeAdapter` (better-sqlite3)
- [ ] Add runtime detection (`src/runtime/detect.ts`)
- [ ] Replace `bun:sqlite` imports with adapter
- [ ] Replace `process.versions.bun` checks
- [ ] Add tests for each adapter

## Interface

```typescript
export interface RuntimeAdapter {
  name: "bun" | "deno" | "node";
  sqlite: SqliteAdapter;
  crypto: CryptoAdapter;
  filesystem: FilesystemAdapter;
}

export interface SqliteAdapter {
  open(path: string,): Database;
  // ... other methods
}
```

## Files

- `src/runtime/adapter.ts` — interface definition
- `src/runtime/bun.ts` — Bun implementation
- `src/runtime/deno.ts` — Deno implementation
- `src/runtime/node.ts` — Node.js implementation
- `src/runtime/detect.ts` — runtime detection
