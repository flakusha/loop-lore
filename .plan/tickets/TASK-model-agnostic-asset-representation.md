<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Model agnostic asset representation

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** low
**Effort:** high
**Epic:** epic-multimodal-asset-reuse

## Summary

Source: second emergent sweep, Neta Studio World Expression Protocol (candidate #33, gap G45). P6+ deferred — create the abstraction record now, implement with provider work.

Define a world-level, provider-independent expression for user-created assets (art prompts, references, voice specs, character look) so assets survive model/provider generations: outputs are regenerable instances, not the source of truth. Re-anchoring workflow when a provider retires a model.

## Acceptance

- [ ] Spike doc: expression schema over existing assets + providers
- [ ] Provider mapping layer boundary defined
- [ ] Re-anchor/regenerate procedure documented
- [ ] New asset kinds store model-independent expression by default

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
