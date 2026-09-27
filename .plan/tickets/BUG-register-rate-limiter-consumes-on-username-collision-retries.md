<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: register rate limiter consumes on username-collision retries

**Status:** Not Started
**Priority:** low
**Effort:** Medium

## Context

Caught during post-merge audit of commit ba2871422 (register path). Per-IP rate-limit tokens were being consumed by the route handler before the username-collision check, exposing a denial-of-service via username guessing.

## Summary

src/routes/auth/shared.ts registerLimiter.consume(ip) runs at register.ts line 37 before the insertUnique uniqueness check. A user fat-fingering a username burns 1 of 3 tokens on the resulting 409; an attacker brute-forcing the password gate with a claimed username burns the victim's per-IP budget. Move consume() after the gate returns a valid form AND a successful insert (or refund the token on 409 from insertUnique). Caught from post-merge audit of ba2871422.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
