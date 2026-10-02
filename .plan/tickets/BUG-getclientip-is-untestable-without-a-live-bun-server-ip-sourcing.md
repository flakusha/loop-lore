<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: getClientIp is untestable without a live Bun server — IP sourcing has no unit-level seam

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-api-rate-limiting
**Summary:** `getClientIp` in `src/routes/auth/shared.ts:136` is tested in `src/routes/auth/get-client-ip.test.ts` using `bun test`'s built-in HTTP server, but the test does not isolate the IP-sourcing logic from Elysia's `request` object construction. The function is only exercisable through live HTTP requests, blocking fast unit-level regressions.
**Context:** Found 2026-08-25 security review. The existing integration test uses `fetch` against a real `Elysia` instance. There is no pure-unit test that passes a `Request` object directly to `getClientIp`.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Git Issue:** 8d307ae

## What

- `src/routes/auth/shared.ts:136` (`getClientIp`) reads `X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP`, and `peerIp` (the underlying TCP peer address).
- `src/routes/auth/get-client-ip.test.ts` exercises the function through an Elysia HTTP server (`app.handle(new Request(...))`), meaning the `Request` object is constructed by the Elysia stack, not by the test.
- No pure unit test exists that calls `getClientIp(req, config, peerIp)` with a `Request` constructed directly by the test.
- The lack of a direct unit seam means: (a) tests are slower (HTTP overhead), (b) failure attribution is ambiguous (is the bug in `getClientIp` or in Elysia's `Request` construction?), (c) CI environment lacks a real TCP peer, so `peerIp` may be unavailable.

## Why

IP-sourcing is the foundation of auth rate-limiting. Without a direct unit seam, `getClientIp` can only be tested via integration requests, making the auth rate-limiting bucket key hard to validate in fast unit suites. Any future caller of `getClientIp` outside the Elysia route context (e.g., middleware, background jobs) would be untestable.

## Scope

- Add a pure-unit test file `src/routes/auth/get-client-ip.unit.test.ts` that constructs `Request` objects directly and calls `getClientIp` from `shared.ts` with explicit `peerIp` and `config` arguments.
- Cover: all three proxy headers, `trustProxy` on/off, missing headers, null/undefined `peerIp`, and the `unknown` fallback.
- Keep the existing integration test file for end-to-end route behavior.
- Out of scope: restructuring `getClientIp`'s internal implementation (tracked separately).

## Acceptance Criteria

- [ ] `src/routes/auth/get-client-ip.unit.test.ts` exists with direct `Request` construction covering all `getClientIp` code paths
- [ ] All unit test cases pass without a live Elysia server
- [ ] Integration test (`get-client-ip.test.ts`) and unit test are both green


git issue: 29eca13
