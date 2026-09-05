<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: location connections validation accepts junk and persists it

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

src/routes/worlds/locations.ts:69-112 validateConnections silently drops non-string entries, but handlers persist the RAW body.connections (159-164, 247-251) -> stored JSON can hold 123/{} where consumer code expects location ids. Fix: typed Elysia body schema + fail on invalid entries.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
