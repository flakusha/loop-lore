<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Remove no-op oxlint (correctness) gate from runner registry

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small

## Summary

`scripts/check-parallel.mjs:255` registers `"lint - oxlint (correctness)": "bun run lint:oxlint:advisory"`. The `lint:oxlint:advisory` script (`package.json:41`) discards oxlint output (`> /dev/null 2>&1`) and unconditionally prints a static message. The runner records a green gate without ever checking findings — a passing `oxlint (correctness)` gate is proof of nothing.

## Why

tsc + eslint already cover real correctness. Oxlint reports style warnings that don't fail other gates. An unconditional no-op being labelled "correctness" misleads consumers of the check report into trusting a gate that does no work.

## Where

- scripts/check-parallel.mjs (line 253-255)
- package.json (lines 39-41)

## Acceptance Criteria

- [ ] `lint - oxlint (correctness)` is no longer in the runner registry.
- [ ] `bun run lint:oxlint` remains available for direct invocation.
- [ ] `bun run check` does not list or run the removed gate.
- [ ] No regression to existing `lint - eslint` gate.
