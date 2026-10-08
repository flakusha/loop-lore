<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Seed corpora — 10k+ seeds per fuzzing target

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** Fuzzing Infrastructure

**Summary:**

Collect or generate ≥10,000 seed inputs per target (auth, asset, chat, llm, admin, IPC). Sources include: valid traffic captures, existing unit test seeds, OpenAPI spec-derived examples, known-bad inputs from CVE databases and bug reports. Seeds must exercise the reject path, not just valid input — `scripts/generate-schema-fuzz.ts` already covers valid-input generation for 394 schemas; corpora here focus on malformed/malicious seeds that test boundary and violation cases. Store in `tests/fuzz/corpus/`.

**Context:**

Mutation engines without seed corpora are pure randomness and converge slowly. With rich seeds that already exercise reject-path boundary cases, the mutation engine can explore from a strong starting distribution rather than brute-forcing valid structure from noise. `scripts/generate-schema-fuzz.ts` generates validity-only seeds for 394 schemas; the corpora ticket complements that with malformed/malicious seeds (boundary violations, type mismatches, encoding edge cases) that schema-fuzz does not produce and the mutation engine can then mutate further.

Constraint: `tests/fuzz/corpus/` does not exist yet — it must be created and gitignored alongside the first corpus file. Corpus quality matters more than quantity: 10k valid-but-simple seeds are less useful than 1k seeds that already probe type boundaries, CVE-known bad patterns, and schema constraint violations. Sources must be verifiable (CVE records, bug reports with attached payloads, known project bugs).

Alternative: trust the mutation engine to generate all inputs from scratch. Rejected — without corpora, the mutation engine starts from uniform random bytes and requires vastly more iterations to reach interesting code paths. The investment in curated seeds pays for itself in iteration efficiency.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
