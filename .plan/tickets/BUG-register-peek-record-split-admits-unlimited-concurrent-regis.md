<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Register peek/record split admits unlimited concurrent registrations per IP

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:** register peek record split admits unlimited concurrent regis
**Context:** Context: fba9dbcd8 (09-27).
**Acceptance Criteria:** record at the gate; refund() on the 400/422/409 skip paths and on transactional rollback, matching the two-step contract the limiter exports.

## Summary

Context: fba9dbcd8 (09-27). Severity: blocking. checkRegisterGate peeks (no reservation, register.ts:42) and record() runs only after commit (register.ts:176) — N concurrent POSTs from one IP all peek an empty bucket and all proceed; REGISTER_MAX_ATTEMPTS=3/hour no longer bounds in-flight work (regression vs consume()). Repro: fire 50 parallel register POSTs from one IP — all pass the gate. Fix: record at the gate; refund() on the 400/422/409 skip paths and on transactional rollback, matching the two-step contract the limiter exports.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
