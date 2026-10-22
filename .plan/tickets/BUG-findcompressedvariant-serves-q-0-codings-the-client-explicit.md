<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: findCompressedVariant serves q=0 codings the client explicitly refused - regression introduced by the q-strip fix

**Status:** Done
**Priority:** low
**Effort:** Medium
**Caveats:** security — a coding the client refused with q=0 is no longer served; the response falls back to the next acceptable coding, or to no compressed variant at all

**Summary:**

Location: src/server/static-mime.ts:56-58.

Evidence: the RFC 9110 q-param strip introduced by the R3-N1 fix (for the old findCompressedVariant keeps-q-suffix bug, see git issue 996cae7-era fix tracked as FIXED in .tmp/glm-review/prior-findings-status-1015.md R3-N1) splits each coding on ; and keeps token[0] unconditionally - so a q=0 param is stripped along with the rest. Accept-Encoding: br;q=0, gzip still matches br and the client is served a coding it explicitly refused (q=0 means not acceptable).

Verification: CODE-READ - the split-and-keep-token[0] logic at static-mime.ts:56-58; the q=0 pass-through follows directly from the strip implementation re-read this session.

Impact: protocol-correctness regression: clients that explicitly disable a coding (common for br in some tooling) get it anyway.

Fix: after splitting on ;, check whether the params contain q=0 (or q-value 0) and skip that coding; pin with an Accept-Encoding: br;q=0, gzip test case.

Source: .tmp/glm-review/mechanical-sweep-1015.md section 8b, first row (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
