<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 THEME 2: Card portability without silent loss (import/export parity)

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

Rationale: Agnai-native JSON mis-detects as Character.AI and passes the gate while dropping persona/sampleChat/scenario/extensions; tavern hybrids lose personality/appearance; every normalizer's tags die at import (settings='{}'); lorebook use_regex is dropped. Fix detection + faithful mapping + tag routing in one lane.

Feeds: card-import-parity-agnai-2026-11-03 §§2-4 (add ccv2 fallbacks ~15 LOC; new agnai.ts normalizer; skip ooba/charas); matrix-cross-mechanics §0.1.0 alignment (IO x character/world/location/story export/import wiring blocks P3-P5)

AC2 Import parity: Agnai tavern + native JSON fixtures import with zero silent field loss (parity probes 1-4 green); tags persist to settings.tags and round-trip; PNG chara-chunk inherits the same; no gate-passing import with dropped persona/scenario/extensions.

Related: .tmp/research/release-1.0.0-roadmap.md
Scope note: serves Required card-parity items; impersonation-adjacent via template/actor IO.

**Caveats:** TOCTOU: import is single-shot file parse; concurrent re-import last-writer-wins. Security: imported JSON is author-controlled; validate before persist. Authorization: importer requires character-create permission. Parallelism: probe scripts are read-only, safe under parallel suite. Partial failure: normalizer failure rejects the card, never half-imports. Rollback: failed import leaves no actor row. Observability: mis-detection warnings logged per shape.

**Context:**

The import path accepted cards it silently mangled: the Agnai-native JSON was
detected as Character.AI (no `spec` wrapper, so it fell through to the CAI
branch) and lost the persona bag, `sampleChat`, `scenario` and `extensions`;
Tavern hybrids lost their appearance (parked in `extensions.agnai`); every
normalizer's `tags` died at import (`settings='{}'`); the lorebook's
`use_regex` was dropped.

Shape detection comes first (a card must be classified before it can be
mapped): `isAgnaiNative` keys on the persona bag plus the camelCase native
fields, so a Character.AI card (`definition`/`greeting`) and a plain card are
still detected as before. The new `agnai` normalizer maps the native fields
onto the canonical card and keeps the persona bag + `depth_prompt` in
`extensions`.

The import gate (`validateCharacter`) demanded a personality, an appearance and
a wardrobe - fields that are loop-lore's own authoring spec, and that a
foreign card rarely carries. The gate now demands only what every card format
carries (a name and a description); the import maps the card faithfully, so a
field the card does not have stays empty instead of being filled with a copy
of the description. The copy printed the same prose three times (card view,
adapter payload, group participant) and leaked a field the card never had into
the export. The gap is reported per import as a warning, so the authoring gap
stays visible without being invented. The character header still skips a
personality/appearance that is only a copy of the description.

Card payload with no column of its own (tags, the card `extensions` blob)
rides along in `actors.settings` - the same place `POST /api/actors` already
stores tags - through `src/characters/card-settings.ts`, and the exporters read
it back. The lorebook rows now carry `key_type`, `key_groups` and
`scan_depth`, so the activation mode survives the round trip.

Alternatives considered: filling the missing fields with a copy of the
description (rejected - it duplicates the prose on every surface and puts a
field the card never had into the export); an LLM assist step to extract a
personality from the description (deferred - there is no signal until a card
genuinely lacks one); a side table for the card payload (rejected - `settings`
already carries tags).

Implementation is complete on the `feat-character-import-parity` branch and
awaits the operator's landing.

Verified 2026-11-12 on dev @ 9202c0842: both legs are LANDED — import parity (`844da9a84` agnai normalizer + `isAgnaiNative` detection, `ed5b76190` faithful mapping, `5bf389d76` persona-name fix, `0655a15bb` payload-shape gate) and export/tag-routing parity (`card-settings.ts` tags/extensions round-trip through `actors.settings`, export canonical rebuild reads `cardTags`/`cardExtensions`, lorebook `key_type`/`key_groups`/`scan_depth` round-trip). Suites green: agnai + card-settings + card-parity + export.coverage (28 tests, 2026-11-12; parity probes green).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
