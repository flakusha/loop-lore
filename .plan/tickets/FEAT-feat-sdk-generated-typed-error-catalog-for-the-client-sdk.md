<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: feat(sdk): generated typed error catalog for the client SDK

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Derived-feature proposal F04 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-error-envelope.md` (Not Started) + `epic-openapi-reference.md` (Done) + `epic-shared-client-sdk.md` (Not Started) + `epic-framework-sdks.md` (Not Started) + T05 (envelope unification, `ErrorCode`, both status maps) + T25 (auth 429 JSON negotiation).

Derivation: T05 collapses every error path to one `{error, code, meta}` shape with a closed `ErrorCode` enum (including the folded-in ParseError and 410/502/504 entries); the OpenAPI reference already exists as the machine-readable contract. A generated error-type module is then a pure projection of two committed artifacts — no new design, just codegen from the unified envelope + spec.

Draft epic sketch / acceptance:

- Every `ErrorCode` + status entry in both maps generates a typed SDK error class with `code`, `status`, `retryable` (429/503/504) and `meta` shape.
- OpenAPI spec gains the envelope schema so any generator (not just the bundled SDK) emits the same types.
- Auth errors (including the T25 JSON-429) produce the same type, closing the htmx/JSON split at the type level.
- A test asserts the generated catalog covers every code the server can emit (diff against `ErrorCode`).
- Version-migration (F06) reuses the catalog to flag codes added/removed between versions.

Priority: high — converts an error-path robustness fix into the SDK's strongest feature: exhaustive, compiler-checked error handling.

Blocked-by: T05/T25.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). High-priority composition group F01-F05.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
