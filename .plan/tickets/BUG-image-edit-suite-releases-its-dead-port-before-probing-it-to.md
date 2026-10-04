<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Image-edit suite releases its dead port before probing it (TOCTOU)

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:** image edit suite releases its dead port before probing it to
**Context:** Context: 44ddb9b6f.
**Acceptance Criteria:** probe-connect refusal assertion before/instead of releasing, re-pick the port on failure.

## Summary

Context: 44ddb9b6f. Severity: nit. src/image-edit/routes.coverage.test.ts:112 stops the dead server with dead.stop(true) before the suite probes the port — any concurrent binder can reclaim the kernel-assigned ephemeral port and resurrect the false-healthy failure mode the commit eliminates. Fix: probe-connect refusal assertion before/instead of releasing, re-pick the port on failure.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
