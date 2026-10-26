<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: sanitizeHtml is not idempotent — tag-removal reassembly can assemble fresh script markup (mXSS class)

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: html-sanitize-core sanitizeHtml is NOT idempotent; single-pass output can contain freshly assembled `<script>` markup — classic mutation-XSS reassembly class.
COUNTEREXAMPLES (all probe-verified on current dev):

- sanitizeHtml("<scr`<style>`ipt>alert(1)") === "`<script>`alert(1)" — DANGEROUS_TAGS `<style>` removal joins "<scr" + "ipt>"
- sanitizeHtml("<scr`<script>`x</script>ipt>alert(1)") === "`<script>`alert(1)" — stripScriptTags span removal joins the fragments
- Second pass removes what the first assembled: sanitizeHtml("`<script>`alert(1)") === ""
- Three-level chain: "<scr<me`<style>`ta>ipt>" -> pass1 "<scr`<meta>`ipt>" (the `<style>` removal join CREATES a `<meta>` tag) -> pass2 "`<script>`" — so no finite-pass safety claim holds universally.
ROOT CAUSE (assembly sites):

- src/regex/html-sanitize-core.ts:198 — replaceAll(DANGEROUS_TAGS, "") does a single pass over the original text; the replacement concatenates pre/post-match text (pattern defined :182-183).
- src/regex/html-sanitize-core.ts:70-77 — stripScriptTags span removal (parts.push(html.slice(i, start)) at :70, i = closeEnd at :77, parts.join("") at :80).
MITIGATION CONTEXT: DOMPurify at the browser sink is the documented primary guard (module header); seeded fuzz does not sample these structured shapes (0/5000 runs), so the suite's random invariants alone will not catch regressions here.
FIX DIRECTION: fixpoint/re-scan loop in sanitizeHtml (re-run removals until output stabilizes, with an iteration cap and a "grew or unstable => reject/strip" fallback), or replace regex-span removal with a single-pass parser-based tokenizer that never re-scans joined text. Note: sanitizeHtml output must never grow the input — that invariant HOLDS today and is pinned.
TEST NOTE: KNOWN RESIDUAL pins for the counterexamples above already exist in src/regex/html-sanitize.property.test.ts (branch fix-saferegexp-property-suites, commit 6113026a1) — they flip deliberately when this is fixed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue e88cce6 (registry tip: 9298f25e6 Konstantin Fedotov Close issue)
