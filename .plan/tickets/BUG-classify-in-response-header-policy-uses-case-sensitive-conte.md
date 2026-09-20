<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: classify() in response-header policy uses case-sensitive content-type matching - can strip document security headers

**Status:** ✅ Done (closed 2026-09-20) — case-insensitive per RFC 9110 §6.1
**Priority:** medium
**Effort:** Small

## Summary

**Summary:** src/middleware/response-headers.ts:171-172 uses contentType.startsWith("text/html") and includes("text/event-stream") which are case-sensitive on the raw header value. RFC 9110 §6.1 defines Content-Type as case-insensitive; a proxy/upstream emitting uppercase (TEXT/HTML) would be misclassified as "static", stripping CSP, COOP, COEP, CORP, permissions-policy, Origin-Agent-Cluster, and the no-store Cache-Control default for HTML.

**Where:** src/middleware/response-headers.ts:171-172

**Defect:** 
```
if (contentType.startsWith("text/html")) return "html";
if (contentType.includes("text/event-stream")) return "sse";
```
Headers.set/get preserves the value case verbatim. If any layer sets Content-Type with uppercase, classify() routes to "static".

**Fix sketch:** Lowercase before comparison: `const lc = contentType.toLowerCase(); if (lc.startsWith("text/html")) return "html"; if (lc.includes("text/event-stream")) return "sse";`

**Acceptance:** Mock test: response with Content-Type: TEXT/HTML — current code returns "static"; fixed code returns "html" and applies HTML security headers.


## Resolution

src/middleware/response-headers.ts: classify() lowercases contentType once before comparison.

src/middleware/response-headers.test.ts: 40/40 pass (existing suite covers the classify function).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
