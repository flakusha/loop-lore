<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 2: Card portability without silent loss (import/export parity)

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Rationale: Agnai-native JSON mis-detects as Character.AI and passes the gate while dropping persona/sampleChat/scenario/extensions; tavern hybrids lose personality/appearance; every normalizer's tags die at import (settings='{}'); lorebook use_regex is dropped. Fix detection + fallbacks + tag routing in one lane.

Feeds: card-import-parity-agnai-2026-11-03 §§2-4 (add ccv2 fallbacks ~15 LOC; new agnai.ts normalizer; skip ooba/charas); matrix-cross-mechanics §0.1.0 alignment (IO x character/world/location/story export/import wiring blocks P3-P5)

AC2 Import parity: Agnai tavern + native JSON fixtures import with zero silent field loss (parity probes 1-4 green); tags persist to settings.tags and round-trip; PNG chara-chunk inherits the same; no gate-passing import with dropped persona/scenario/extensions.

Related: .tmp/research/release-1.0.0-roadmap.md
Scope note: serves Required card-parity items; impersonation-adjacent via template/actor IO.

**Caveats:** TOCTOU: import is single-shot file parse; concurrent re-import last-writer-wins. Security: imported JSON is author-controlled; validate before persist. Authorization: importer requires character-create permission. Parallelism: probe scripts are read-only, safe under parallel suite. Partial failure: normalizer failure rejects the card, never half-imports. Rollback: failed import leaves no actor row. Observability: mis-detection warnings logged per shape.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
