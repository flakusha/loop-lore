<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Correct dead file references and store shape drift in the instance switcher spec

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Correct `docs/spec/federation-instance-switcher.md` — it points at two files that do not exist and describes an Alpine store shape the registry does not support.

**Context:**

The spec names `src/views/partials/top-bar.html` (`:180`) as the picker's mount point and `src/frontend/alpine/command-palette.ts` (`:182`) as the handler for the `g i` shortcut. Neither file exists — verified: both `test -e` checks fail. An implementer following the spec literally has nowhere to put the code.

The real integration points are specific. The persistent sidebar (`src/views/layout.html:65-238`) survives htmx navigation because only `#app-root` swaps (`:295-304`). The notification bell (`:252-292`) is the working precedent for a global, always-mounted dropdown — its own comment says it "survives per-view htmx header swaps". The `#header-slot` at `:249` is explicitly a **bad** host: it is oob-swapped per page, and `tests/e2e/flows/browser/navigation.browser.ts:143-144` asserts it appears exactly once.

Separately, the spec's `federationStoreFactory` shape does not fit the store registry, which maps name to initial value (`src/frontend/stores/index.ts:19-33`, `const stores: Record<string, Record<string, unknown>>`) — not a factory. And the build compiles per-entry IIFE bundles (`scripts/build-frontend.mjs:22-62`), so a new module must join an existing entry rather than become a new bundle.

**Direction:**

1. Replace the top-bar reference with the sidebar (`:65-238`) and/or the bell pattern (`:252-292`). State explicitly that `#header-slot` (`:249`) is unsuitable, citing `navigation.browser.ts:143-144` as the reason.
2. Remove or re-target the command-palette reference. If the `g i` shortcut is still wanted, name the mechanism that actually exists.
3. Rewrite the Alpine store section to match the registry contract — name → initial value object — and drop `federationStoreFactory`. Keep the docblock's own "To add a new store" steps (`stores/index.ts:10-13`) consistent.
4. State that a new frontend module is added to an existing `bun build` entry (`scripts/build-frontend.mjs:22-62`), not as a new bundle.
5. Do not re-scope the switcher itself; this ticket corrects documentation only.

**Acceptance Criteria:**

- [ ] Every `src/` path named in the spec exists — verifiable by extracting each path and running `test -e` on it
- [ ] `federationStoreFactory` no longer appears anywhere in the spec
- [ ] The store section describes the registry's actual name → initial-value contract
- [ ] The spec names `#header-slot` as an unsuitable host and cites `tests/e2e/flows/browser/navigation.browser.ts:143-144`
- [ ] The spec states that a new module joins an existing `bun build` entry rather than creating a bundle
- [ ] No change to `TASK-federation-instance-switcher-in-frontend-travel-between-inst.md` scope or acceptance criteria
- [ ] `bun run check` green

**Dependencies:**

- None — documentation-only, no code dependency

**Out of Scope:**

- Implementing the switcher itself (`TASK-federation-instance-switcher-in-frontend-travel-between-inst.md`)
- Backend actor-mapping, instance switching, or handle resolution (`epic-instance-federation.md`)
- Adding the missing top-bar partial or command palette, if either is wanted as its own artifact
