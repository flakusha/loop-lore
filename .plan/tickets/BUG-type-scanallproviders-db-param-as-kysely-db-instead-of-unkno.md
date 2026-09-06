<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Type scanAllProviders db param as Kysely<DB> instead of unknown

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

src/admin/provider-health.ts:54 declares scanAllProviders(db?: unknown) and casts with 'db as never' into upsertModelCapabilities. Caller chain loses type safety: adminRoutes (database: Db) -> providersRoutes (database?: unknown) -> scanAllProviders (unknown). A wrong argument type passes typecheck and fails only at runtime. Fix: type param as Kysely<DB> | undefined, propagate proper typing through routes/admin/providers.ts opts. Verify: bun run check clean, bun test src/admin/provider-health.test.ts and src/routes/admin/providers.test.ts pass.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
