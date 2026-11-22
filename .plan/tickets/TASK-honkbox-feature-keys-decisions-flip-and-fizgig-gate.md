<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Honkbox feature keys decisions flip and fizgig gate

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** honkbox
**Epic:** epic-platform-integrations
**Caveats:** both items are decision-gated — (a) waits on the honkbox owner flipping `features.decisions` once its decisions endpoint lands, (b) waits on the operator scoping what fizgig work honkbox will own; do not implement until the respective decision lands. Note (kept here, not a separate ticket): honkbox audio voices — honkbox ships `/v1/audio/voices` + STT/TTS and loop-lore consumes `capabilities.audio_cpp` but has no voices-listing consumption; the honkbox-side item is only the decision on which voices/families to advertise. Unknown keys parse safely today, so the missing fizgig key is inert, not a fault.

**Summary:**

Two tracked missing items, one ticket:

(a) honkbox-owner flip of `features.decisions`: the flag stays false on the honkbox wire until its decisions endpoint lands. loop-lore already parses the key and gates false today (`src/integrations/honkbox/capabilities.ts`). When honkbox ships the endpoint, its owner flips the flag; loop-lore's gate should then answer true with no loop-lore change beyond a fixture.

(b) loop-lore-side `fizgig` key: honkbox advertises `fizgig` on the wire (`crates/api-types/src/lib.rs:213-259`) but `HONKBOX_FEATURE_KEYS` in `src/integrations/honkbox/capabilities.ts` lacks it — unknown-key-safe today, but ungated for consumers. Add the key to `HONKBOX_FEATURE_KEYS`/`isHonkboxFeatureEnabled` once the operator scopes what fizgig work honkbox will own.

**Acceptance:**

- decisions flips on the live wire and the loop-lore gate answers true from a fixture.
- fizgig key parses and gates with a fixture (present/absent).

**Context:**

Evidence (verified 2026-11-22): `fizgig` advertised on the honkbox wire at
`crates/api-types/src/lib.rs:213-259`; `features.decisions` false until the
decisions endpoint lands (honkbox-owner flip). loop-lore side:
`src/integrations/honkbox/capabilities.ts` `HONKBOX_FEATURE_KEYS` lacks
`fizgig`; unknown keys are ignored safely. Related:
FEAT-expose-new-honkbox-capability-keys.md (earlier keys extension, same
pattern) and TASK-consume-honkbox-capabilities-contract.md (base probe +
cache).

git issue: e39340b

**Acceptance Criteria:**

- [ ] `features.decisions` answers true on the live wire once flipped; fixture pins present/absent.
- [ ] `fizgig` key added to `HONKBOX_FEATURE_KEYS`/`isHonkboxFeatureEnabled`; fixture pins present/absent gating.
- [ ] Targeted honkbox capability tests pass; no src/ change beyond the key + fixtures.
