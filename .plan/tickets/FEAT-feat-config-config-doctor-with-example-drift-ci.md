<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: feat(config): config doctor with example-drift CI

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Derived-feature proposal F10 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-config-file-separation.md` (Done) + T19 (7 missing example sections) + T21 (env.example.yaml secret/probe/idempotency keys) + T27 (session-vs-JWT TTL coherence warning).

Derivation: T19/T21 make the examples complete; T27 establishes the pattern of boot-time coherence warnings between related knobs. `config:doctor` generalizes that pattern (every documented key resolves, no unknown keys, related knobs agree) and the drift test (every `Config` key appears in examples) makes it CI-enforced — documentation becomes a tested contract.

Draft epic sketch / acceptance:

- `bun run config:doctor` checks: all `Config` keys present in examples, all env names in `ENV_MAP` resolve, related-knob coherence (TTL pair plus future pairs).
- Drift test fails CI when a new config section ships without example + env-example coverage.
- Secret-marked keys warn (never print values) when set via unexpected spellings (generalizes T20's mystery-boot-error).
- Docs-vs-plan audit epic (`epic-docs-vs-plan-gap-audit-2026-09-19.md`, Done) cites the doctor as the standing guard against recurrence.
- Hot-apply (`initConfigHotApply`) re-runs the coherence subset on change, not just at boot.

Priority: low — pure DX/docs value, no runtime behavior; cheapest proposal here and prevents the next T20-class incident.

Blocked-by: T19/T21/T27.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). Low-priority single F10.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
