<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fix SSRF risk in import route

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Medium
**Effort:** Small
**Epic:** epic-logic-reconciliation

## Summary

`src/routes/import.ts` fetches arbitrary URLs from user input without validation. An attacker can use this to scan internal networks or access cloud metadata endpoints.

## Current Code

```ts
const url = body.url as string | undefined;
if (!url) { return jsonError(...); }
const response = await fetch(url);  // No validation!
```

## Fix

Add URL validation:

1. Only allow `http:` and `https:` schemes
2. Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, localhost, ::1)
3. Block cloud metadata endpoints (169.254.169.254)
4. Add timeout (5s)

## Acceptance Criteria

- [ ] URL scheme validated (http/https only)
- [ ] Private IPs blocked
- [ ] Cloud metadata endpoints blocked
- [ ] Timeout enforced
- [ ] Tests pass: `bun test src/routes/`
