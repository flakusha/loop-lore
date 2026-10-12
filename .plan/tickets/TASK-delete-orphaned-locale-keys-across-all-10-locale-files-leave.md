<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Delete orphaned locale keys across all 10 locale files (leave harness.* untouched)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Remove locale keys with no t() call site, atomically across every locale file, without touching the harness namespace enforced by admin-harness-locale.test.ts. Research: .tmp/simplification/frontend.md.

**Context:**

Server-side i18n is genuinely well wired (`I18N_TEMPLATE_RE` resolves at render time, `applyI18n`
runs on every partial). The problem is orphan *content*, not a hand-rolled formatter: a large set of
keys exists in `src/public/locales/en.json` and its siblings with no `t("…")` call site anywhere.
Source: `.tmp/simplification/frontend.md` — finding "`delete:` 270 orphaned locale keys present in all
10 locale files" (representative line anchors 43, 299, 314, 651, 701, 948, 1371, 1497). Re-derive the
candidate list by flattening `en.json` and grepping each dotted key against templates and non-test
`src/`. Do not paste the audit's key count into the PR description — recompute it.

**Scope — dead key families** (delete the whole family in every locale file):

`common.*`, `tooltips.*`, `admin.*` (the admin view hardcodes English strings such as
`<option>All roles</option>` at `src/views/admin.html:191` instead of `{{{t("admin.allRoles")}}}`),
`placeholders.*`, `chats.*`, `help.*`, `chat.*`, `modals.*`.

**Evidence:**

- Every flattened `en.json` key was matched against every template and every non-test `.ts` in `src/`.
- Sample check: `grep -rn "searchUsers|noUsersFound|openSidebar|filterChats|pageOf|wizardConfirmFailed|mergePrompt" src/`
  → hits only inside `src/public/locales/*.json`, plus one unrelated `searchUsers()` JS method name in
  `src/frontend/alpine/admin-users.ts:125`. Zero `t("…")` call sites.
- Match on the **full dotted key**, not the leaf segment — several orphans share a leaf name with a
  live key.

**BLOCKING CONSTRAINT (found during verification — would have broken the build):**
`src/frontend/alpine/admin-harness-locale.test.ts` enforces bidirectional cross-locale parity for the
`harness.*` namespace — every `harness.*` key in `en.json` must exist in every other locale AND no
locale may invent one `en.json` lacks (test lines 47-59). Therefore:

- The deletion MUST be atomic across all 10 locale files. Deleting a key from one file only fails the
  test.
- The `harness.*` namespace must be left completely untouched — the same test asserts
  `harnessKeys.length > 30` (line 42).

**Caveats / constraints:**

- Locale JSON is user-visible content, not just code. Keep key *order* and file formatting consistent
  with the current files so the diff stays reviewable and `applyI18n` keeps resolving.
- Orphan `admin.*` keys are the symptom of hardcoded English strings in the admin templates, not
  only of dead keys. Do NOT "fix" that by wiring the strings up in this change — wiring is product
  work; this ticket only deletes what nothing reads.
- If a key turns out to be referenced from a non-`src/` surface (email templates, docs, deep links),
  keep it and say why in the PR.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
