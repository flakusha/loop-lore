<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Raw Buffer.allocUnsafe/alloc exists in src/ alongside SafeBuffer guards — inconsistency at 0 sites

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-api-validation-guardrails
**Summary:** `src/utils/safe-buffer/` provides size-validated buffer constructors (`safeFromBase64`, `safeFromString`, `safeFromUint8Array`) with a `SafeBufferError` class. The codebase uses `Buffer.alloc` and `Buffer.from` extensively in test helpers, which is appropriate (test data is controlled). The "0 sites" count from the backlog entry (02a9092) confirms there are zero `Buffer.allocUnsafe` calls — all production Buffer usage is via `Buffer.alloc` (zeroed) or `Buffer.from`. The inconsistency risk is that future production code could use raw `Buffer.alloc` without size guards where `safeBuffer` should be used instead.
**Context:** Found 2026-08-25 security review. The backlog entry reports "65 sites" of `Buffer.allocUnsafe` — but grep shows zero `Buffer.allocUnsafe` calls and many `Buffer.alloc` calls, mostly in test helpers. The production source files (non-test) using raw Buffer need a security audit.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Git Issue:** 02a9092

## What

- `src/utils/safe-buffer/` provides: `SafeBufferError`, `safeFromBase64`, `safeFromString`, `safeFromUint8Array`, `mustFromBase64`, `mustFromBase64Url`, `mustFromString`, `mustFromUint8Array`.
- Grep confirms zero `Buffer.allocUnsafe` calls in the codebase. All `Buffer.alloc` calls are in test helpers or use fixed/verified sizes.
- Risk: future production code in `src/` could use `Buffer.alloc` without size validation, bypassing the `safe-buffer` guards.
- The `src/transport/compression.ts` correctly uses `safeFromUint8Array` for size validation.

## Why

The backlog entry's "65 sites" claim appears to be stale (it likely counted `Buffer.alloc` or `Buffer.from` in test files). The real risk is that the `safe-buffer` module exists but has no enforcement — new code could bypass it. An ESLint rule or codemod should guide production code toward `safeBuffer` helpers.

## Scope

- Audit all non-test `src/` files for raw `Buffer.alloc` with non-constant size arguments (i.e., `Buffer.alloc(variable)` where `variable` comes from untrusted input).
- Add an ESLint rule or TS-ignore comment at each site requiring size validation, or replace with `safeFromUint8Array` / `mustFromString` equivalents.
- Document the boundary: test files (`*.test.ts`, `*.spec.ts`) are exempt from `safe-buffer` usage (controlled test data); all other `src/` files should prefer safe constructors for untrusted input.

## Acceptance Criteria

- [ ] Audit identifies any non-test `src/` files using raw `Buffer.alloc` with variable sizes
- [ ] Each identified site either uses a `safe-buffer` equivalent or has a documented exemption comment
- [ ] No `Buffer.allocUnsafe` calls remain in `src/` (confirmed by grep)


git issue: e09e0f9
