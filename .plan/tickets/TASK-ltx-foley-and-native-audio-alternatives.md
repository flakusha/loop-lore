<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: LTX Foley and native audio alternatives

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-video-generation
**Tags:** audio, deferred
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Track LTX Foley V2A and other native-audio alternatives until validated on LTX 2.5 and cleared for the deployment territory.

**Context:**
Deferred from the 2026-11-19 MiniMax H3 video workflow research (research doc §4, §11.4-5). H3 native audio stays the default, with an opt-in external sound pass. LTX Foley V2A is validated on LTX-2.3 only (2.5 in development); HunyuanVideo-Foley ships the Tencent Hunyuan Community License excluding EU/UK/South Korea; MMAudio is MIT but stale. Testing multiple audio stacks is expensive and vendor/license locked. Revisit when a candidate is validated on the pinned engine and its license covers the deployment region.

**Acceptance Criteria:**

- [ ] Matrix of candidates with engine version, license/territory, VRAM and headless workflow evidence recorded.
- [ ] Trigger: a candidate passes a fixed audio-quality rubric (desync, artifacts, wrong language, unwanted non-diegetic music).
- [ ] No default-path switch until the license/territory check is signed off.

**Related:**

- `.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §4, §11.4-5
- `epic-ambient-music-sfx.md`
- `epic-video-generation.md`
