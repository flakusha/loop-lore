<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Expose new honkbox capability keys

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-platform-integrations

**Summary:**
Honkbox now emits three capability surfaces loop-lore cannot see: `features.decisions` (false until its endpoint lands), `features.audio_cpp = {built, stt_families, tts_families}` derived from cargo features, and a nested `modality: {input, output}` on each `/v1/models` entry. `src/integrations/honkbox/capabilities.ts` currently knows only the older boolean keys and ignores unknown fields safely. Without support here, loop-lore cannot gate audio.cpp-backed work or route on model I/O types even though the server advertises them honestly.

**Scope:**

- Extend `HONKBOX_FEATURE_KEYS` / `HonkboxFeatureFlags` in `src/integrations/honkbox/capabilities.ts` with the new keys; keep `decisions` false-until-landed semantics and represent `audio_cpp` as a descriptor, not a bare boolean.
- Parse and type the nested `modality` field wherever loop-lore consumes honkbox model entries. Keep the legacy flat `modalities` vocabulary untouched (`vision` is not a content kind).
- Missing or malformed new fields degrade to false/empty; never infer a compiled family or a modality that the document does not name. Keep the existing defensive-parser posture and api_version check.
- Tests pin feature-on/feature-off snapshots from honkbox's constants, one entry per model kind, and the gate returning false when a key is absent.

**Out of scope:** no new provider family, no route probing, no honkbox changes, no audio engine work in loop-lore.

**Acceptance Criteria:**

- [ ] New honkbox capability keys parse from a real `/capabilities` document without warning on unknown future keys.
- [ ] `audio_cpp` families come only from the server document; absent/malformed families stay empty.
- [ ] Nested model `modality` is available to model consumers; flat `modalities` is unchanged.
- [ ] Targeted honkbox integration tests pass.

**Context:**

Filed from the honkbox 2026-11-20 wave-C closeout after `FEAT-capabilities-api`,
`TASK-audiocpp-capabilities` and the model-modality advertisement landed. Git
issue `b424d3c`. The server document is authoritative; do not hard-code the
new flags in loop-lore from a remembered snapshot. Existing
`TASK-consume-honkbox-capabilities-contract.md` covers the base probe and cache
and stays open for this extension.
