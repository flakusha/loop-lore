<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Locale JSON is embedded in a script tag without HTML escaping

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

getRawTranslations is serialised with jsonStringifyOr and interpolated raw into a script element. jsonStringifyOr delegates to JSON.stringify (src/utils/safe-json.ts:93), which does not escape <, > or &, so a translation containing a closing script tag terminates the inline JSON block and everything after it becomes markup.

Evidence read on dev:

- src/routes/views/layout.ts:82-84 — const jsonData = jsonStringifyOr(rawTranslations, {},); then the inline script element.
- src/utils/safe-json.ts:93 — return { ok: true, value: JSON.stringify(toStringify, null, space,) };

The catalogue is server-controlled today, so this is a latent vector rather than an active one: it becomes an HTML-injection path the moment a translation carries user-derived text.

Fix: escape < as \u003c (and > and &) for the script-context serialiser, as the cat-jam review's F1 notes.

Related, lower severity: src/views/layout.html interpolates the CSP nonce with a raw {{cspNonce}}. It is server-generated (layout.ts:69), so this is a keep-it-that-way assertion rather than a defect.

Source: .tmp/cat-jam/review-frontend.md F1 and F3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
