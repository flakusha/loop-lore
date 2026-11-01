<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Logging: censor exact-match rules + error-stack path leak

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-logging

## Summary

src/logger/censors.ts:13-19 default rules email/ssn/phone are exact-match so userEmail/phoneNumber/cookie/set-cookie/jwt/bearer leak; src/logger/logger.ts:113 and limits.ts:73-77 error.stack never censored, exposing absolute paths and usernames in stderr/JSONL/bug reports. Fix: wildcard key rules plus cookie/jwt/bearer coverage; redact/absolutize paths in stack before emit. Tracked in .plan/backlog-archive.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
