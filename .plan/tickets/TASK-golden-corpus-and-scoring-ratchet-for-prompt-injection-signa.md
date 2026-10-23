<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Golden corpus and scoring ratchet for prompt-injection signal detector

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-security-sandboxing

**Summary:**

detectInjectionSignals (src/validation/prompt-injection.ts) has only three inline test strings. Add a labeled corpus covering benign, suspicious, and adversarial texts (zero-width chars, homoglyphs, Cyrillic lookalikes, delimiter smuggling, role hijack, exfiltration) with expected scores, plus a malformed-JSON corpus for parseInjectionVerdict (trailing prose, fenced JSON, partial JSON). Ratchet so step-1 threshold changes cannot silently shift verdicts.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
