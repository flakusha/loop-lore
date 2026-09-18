<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Browser test fixture: no mock LLM provider + stale frontend build reuse

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

`tests/e2e/helpers/browser-server.ts:96-99` calls `initializeProviders(loadConfig())` — the `MockLLMProvider` used by `createTestServer` (`helpers/server.ts:362-373`, forces `defaultProvider=mock-provider`) is never registered for browser tests. Any browser flow triggering generation would hit real network/API keys. Latent today but a trap.

Also `browser-server.ts:60` `ensureFrontendBuild()` reuses stale `dist/public/app.js` whenever it exists — tests can pass against outdated frontend code. Add rebuild flag/hash check.

**Fix**:

- Register `MockLLMProvider` in browser fixture the same way `server.ts` does.
- In `ensureFrontendBuild()`, hash the source bundle and force rebuild when source hash differs from the served bundle, or accept `--no-reuse-frontend` flag for explicit opt-in.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
