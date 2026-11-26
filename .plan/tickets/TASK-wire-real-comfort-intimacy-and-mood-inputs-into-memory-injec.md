<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Wire real comfort, intimacy, and mood inputs into memory injection

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:** InjectionContext fields that drive the secret/trauma/mood gates run on neutral literals: averageIntimacy 50, moodModifier 0, DEFAULT_COMFORT (sharingWillingness 0.7, secretSharingProbability 0.3, traumaResistance 0.5). The gates execute but their inputs are constants, reducing secret sharing to a coin flip. **Context:** Research .tmp/research/memory-management-injection-shipped-2026-11-24.md gap 3. Evidence: src/assistant/prompt/sections/memories.ts:197-202, src/memory/injection/types.ts:58-64, decide.ts:77-97. **Acceptance Criteria:** intimacy derived from relationship/travel state, mood from owner mood, comfort from character traits; external-backend results must NOT be routed through these gates until inputs are real (rank by scope/privacy/semantic floor instead). **Caveats:** authorization (viewer-dependent inputs must not leak across owners); stale relationship state; observability (log resolved inputs at debug).
