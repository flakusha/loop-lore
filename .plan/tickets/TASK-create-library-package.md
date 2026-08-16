<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Create Library Package

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-api-library-distribution.md

## Summary

Create `@loop-lore/server` package that can be imported as a library in external projects.

## Tasks

- [ ] Create `packages/server/` directory structure
- [ ] Export `createLoopLore()` factory function
- [ ] Export Elysia app instance
- [ ] Add TypeScript types for all public APIs
- [ ] Configure build pipeline (tsup)
- [ ] Add package.json with exports field
- [ ] Write README with usage examples

## Usage Pattern

```typescript
// External project
import { createLoopLore, } from "@loop-lore/server";

const app = createLoopLore({
  database: "./data/loop-lore.db",
  encryption: { key: process.env.ENCRYPTION_KEY, },
  headless: true,
},);

// Mount on existing server
app.mount("/api", "/loop-lore",);

// Or run standalone
app.listen(3000,);
```

## Files

- `packages/server/package.json`
- `packages/server/src/index.ts` — exports
- `packages/server/src/factory.ts` — createLoopLore()
- `packages/server/tsup.config.ts` — build config
- `packages/server/README.md` — usage docs
