<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Hosted video and audio API benchmark tier

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-video-generation
**Tags:** video, deferred
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Evaluate Sora/Runway/Pika (video) and Suno/Udio (audio) as quality benchmarks only, never default generation paths.

**Context:**
Deferred from the 2026-11-19 MiniMax H3 video workflow research (`.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §8.2, §11.9). Metered, non-self-hostable, vendor-locked, and quality comparisons would be costly to automate. Kling (BYOK, consent-gated) and Veo-via-Gemini (later tier) are already scoped in `epic-video-generation.md`; this ticket covers only the remaining hosted APIs. Revisit if local models provably miss an approved quality bar and the operator authorizes spend.

**Acceptance Criteria:**

- [ ] Revisit trigger recorded: local quality gap measured against an approved rubric, plus explicit spend authorization.
- [ ] Benchmark plan names the exact models, cost ceiling, prompt set and scoring method before any API call.
- [ ] No default-path wiring: any tier landed from this ticket stays behind BYOK consent and is license-fenced.

**Related:**

- `.tmp/research/minimax-h3-video-workflow-2026-11-18.md` §8.2
- `epic-video-generation.md` Phase C (Kling/Veo already in scope)
- `epic-byok-api-keys.md`
