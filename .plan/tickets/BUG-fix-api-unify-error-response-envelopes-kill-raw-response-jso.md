<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(api): unify error/response envelopes, kill raw Response.json errors

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-error-envelope

**Summary:**

Sources: stream-b #8 (envelope inconsistencies, broad); stream-c #8 (500/PARSE_ERROR specifics). Where: src/routes/http-utils/errors.ts:jsonError (STATUS_TO_CODE :17-28); src/routes/http-utils/responses.ts:jsonResponse (:30-38); src/validation/middleware.ts:onValidationError; src/routes/auth/responses.ts:errorJson (:63-87). Gap: envelope shape varies by call site: object responses merge meta but arrays/primitives skip it; raw Response.json({error}) sites omit code/meta; STATUS_TO_CODE leaves 410/502/504 codeless (code: undefined); route trade/index.ts:122-128 has a local VALIDATION onError branch returning 400 {error} with no code/meta. Folded in from C#8: the 500 branch returns bare {error, code} with no meta; the PARSE branch emits PARSE_ERROR, absent from ErrorCode and from the auth-side STATUS_TO_CODE duplicate. Acceptance: all JSON errors route through http-utils; no raw Response.json({error...}) error sites remain in routes. Checklist: meta.api_version present on the 500 branch; ParseError added to ErrorCode (+ both status maps); missing 410/502/504 code entries added; HttpStatus.Accepted added (replacing the 202 cast); trade/index.ts local VALIDATION branch through http-utils; auth STATUS_TO_CODE filled for 500/501/502/503/504. A test pins the uniform {error, code, meta} shape across 4xx/5xx branches including 500. Priority: medium - client robustness; breaks parsing exactly on error paths, no security impact. Verified 2026-10-11: middleware VALIDATION branch already correct; real gap is trade/index.ts local onError.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 39603d6 (registry tip: e06736d60 Konstantin Fedotov Close issue)
