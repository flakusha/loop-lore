<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-058: Transport doc — config + observability

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Markdown reference for transport-layer config schema, observability hooks, runtime tunables.
**Context:** SRE/operator runbook for connection-level diagnostics.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Effort**: Medium
**Labels**: transport, config, observability, docs
**Assignee**:
**Epic**: epic-transport-expansion
**Related**:

## Summary

Author `docs/transport/config-and-observability.md` (to be created) for SRE and operators covering transport-layer configuration knobs, metrics emitted, log fields, and the runbook for diagnosing connection-level issues.

## Context

Audience: SRE, on-call operators, and backend engineers tuning transport. Source anchors: `src/transport/upgrade.ts`, `src/transport/compression.ts`, and the analytics-observability epic. IN: config schema, env vars, metrics catalog, log fields, runbook scenarios. OUT: application-level observability (chat, character, RPG).

## Acceptance Criteria

- Document lists every transport config knob with default, valid range, and runtime effect
- Metrics emitted by the transport layer are catalogued with name, type, labels, and meaning
- Log fields and structured log shape are documented with sample output
- Runbook covers at least: elevated GOAWAY rate, stuck streams, compression misconfiguration, upgrade failures
- Document links to TASK-057 (HTTP/2 deep dive) and TASK-059 (external protocols)

## Related Files

- docs/transport/config-and-observability.md (to be created)
- src/transport/upgrade.ts
- src/transport/compression.ts
- .plan/epics/epic-analytics-observability.md

## Notes

- Coordinate with SRE to ensure runbook steps match actual on-call procedure
- Mirror any new config knobs added by TASK-057 or TASK-059

Git issue: `318c966`
