<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Property-test the status machines and composite validators

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-library-distribution

**Summary:**

docs/meta/auto-test-generation.md section 5 lists the surfaces worth property-testing next. Highest value here: the state machines have hand-written example-based tests only, and the composite validators combine several fields with untested cross-field interaction.

Targets:
- turnStatusMachine (src/db/enums-story/turns.ts), questStatusMachine and questProgressStatusMachine (src/db/enums-story/quests.ts), messageStatusMachine + messageVisibilityMachine (src/db/enums-core/messages.ts)
- messagesStatusVisibility (src/db/enums-core/messages.ts:90), questProgressValidator (src/db/enums-story/quests.ts:88)

Invariants worth asserting:
- canTransition(a, b) agrees with whether transition(a, b) throws, for every state pair
- isTerminal(s) holds exactly when s has no outgoing transitions
- every non-terminal state reaches a terminal state
- a composite validator returns no violation for a payload whose individual field schemas all pass
- a composite validator does return a violation whenever a required sub-field is dropped

Enumerate the state set from the machine definitions rather than hand-listing it, so the property covers states added later. schemaToArbitrary from src/test-utils/schema-arbitrary.ts is the input source where a schema exists.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
