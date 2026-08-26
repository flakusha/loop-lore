<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-e2e-state-contracts: Browser e2e Alpine state contracts, encryption flow, access + search correctness

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, playwright, alpine
**Epic:** epic-testing-qa
**Parent:** TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION (umbrella)

## Summary

Assert component-local Alpine state contracts in the browser harness, cover the chat compression-encryption-decryption flow end to end, and pin access-correctness and search/filtering behavior at the UI layer.

## Context

Component-local Alpine state is never read by the current suites — only `Alpine.store('ui'/'sidebar')` globals; `chatState()` etc. unasserted. API-level e2e coverage exists for encryption, access isolation and search; **browser/UI-level coverage is ZERO** for all of them.

## Tasks

### P3 — Alpine state contracts

- [ ] **`chatState()` default-shape contract** (from `src/frontend/alpine/chat.ts` return object).
- [ ] **`ui` store default-shape contract** (from `src/frontend/stores/ui-store.ts`). _(TASK-chat-state-contract)_

### Topic 1 — Chat compression-encryption-decryption-decompression flow

Source surfaces: `src/frontend/browser.ts` (compress→encrypt pipeline), `alpine/chat-keys.ts` (`loadChatKey` → `window.__chatKey`), `alpine/chat-messages.ts` (`sendMessage` wraps via `browserCompressThenEncrypt`), `htmx-encrypt.ts` (`hx-ext="encrypt"`, `data-encrypt` attr auto-decrypt after swap), `routes/message-encryption.ts`, `routes/messages.ts` server-side `decryptThenDecompress`. Gate: encryption is **automatic when key present** (no user toggle); key fetched on `selectChat`.

- [ ] `encryption-flow.browser.ts`: open seeded chat → assert `window.__chatKey` set (Alpine `chat-keys` state) → send message → assert rendered message **decrypts to plaintext after htmx swap** (no `[Encrypted — unable to decrypt]`) → fetch message via API → assert stored content is a non-plaintext encrypted payload (`{enc, nonce, algo, comp, keyId}` shape).
- [ ] Wrong-key path: assert server falls back to `[Encrypted — unable to decrypt]` placeholder.

### Topic 9 — Access correctness

Source surfaces: `chat/service.ts` `checkChatAccess` (owner|admin|solo|participant), `routes/worlds.ts` `requireWorldAccess` (owner|admin|public|member) + `requireWorldOwner`, `actor-auth.ts` `checkActorOwnership`.

- [ ] Non-owner world detail → empty-state/404 (not data); admin sees all worlds.
- [ ] Non-participant chat → cannot open/send (UI surfaces 401 gracefully, no data leak).
- [ ] Solo/demo mode vs authed: view renders with/without user data.

### Access-Correctness Findings (from access-correctness.browser.ts, 2026-08-07)

- **LOW (latent):** `checkChatAccess` (`src/chat/service.ts:67`) grants a **solo role read access to ANY chat by ID** via the `userRole === 'solo'` admin-equivalent short-circuit. Endpoints using it (GET /api/chats/:id, reactions, pins, notes, messages, encryption-key) would return a foreign chat's data to a solo user calling directly by ID. Not reachable through the current UI: the chat list is `created_by = userId`-scoped and the chat app redirects on a foreign `?chatid=` before fetching. Consider narrowing solo's chat read to owned/participant chats.
- **INFO (asymmetric):** solo is treated as admin at the **chat** layer and at **world mutation** (`requireWorldOwner`) but as a **normal user** at the **world read** layer (`requireWorldAccess` checks `admin` only). World read denial is correctly enforced (verified); the asymmetry is inconsistent but not a leak.

### Topic 11 — Search / filtering

Source surfaces: search endpoints (`chat-search.ts` `/api/chats/search`, `message-search.ts` FTS5 `/api/messages/search`, `/dynamic/characters|worlds|chats|gallery/search`; no dedicated API e2e file); `components/filter-bar.html` (search input, `list-search`), `chat-list.html` (`#chat-search`), `components/chat/message-search-bar.html` (`message-search-input`).

- [ ] `search-flow.browser.ts`: gallery filter-bar filters grid; chat-list search narrows list; message search returns matching messages (FTS5). Assert swapped DOM contains only matches.

## Files

- `tests/e2e/flows/browser/encryption-flow.browser.ts`, `access-correctness.browser.ts`, `search-flow.browser.ts`
- `tests/e2e/helpers/htmx-alpine.ts` — Alpine state helpers from TASK-e2e-playwright-harness

## Dependencies

- Parent hub: `TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION.md`
- **TASK-e2e-playwright-harness must land first** (`getAlpineData`/`waitForAlpineState` helpers are prerequisites for the state-contract cases).
- Siblings: TASK-e2e-view-expansion (gallery grid fixtures shared with search cases).

## Acceptance Criteria

- [ ] `chatState()` + `ui` store contract tests green
- [ ] `encryption-flow.browser.ts` — key set, encrypted send, client decrypt after swap, wrong-key placeholder
- [ ] Access-correctness browser checks — non-owner world/chat denial surfaces without data leak
- [ ] `search-flow.browser.ts` — gallery/chats/message search filters swapped DOM
