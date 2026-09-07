<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: sprite center/face anchor setup and detection for generated and uploaded images

**Status:** ⬜ Not Started
**Priority:** medium
**Epic:** Avatar Alpha Channel + VN Layering; Asset Transform Metadata
**Effort:** Medium

## Summary

Anchor calibration so sprites compose correctly regardless of framing: per-asset anchor metadata (feet/belly + face/center point) as asset transform context (epic-asset-transform-metadata). Manual: editor UI to place face/center marker on generated or uploaded images. Auto: optional face detection (server-side or client-side heuristic) to prefill the anchor; manual override wins. VN compositor scales/positions sprite so anchor sits at slot baseline. Acceptance: anchor stored per asset, editor roundtrip, detection prefill e2e, compositing respects anchor unit tests.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
