<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: classify Phase 0 spike: privacy-tier prepared-I/O end-to-end

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Phase 0 spike (source doc section 12: one template end-to-end, 1 week). Replace ad-hoc prompt+regex-parse with prepared I/O (typed input schema + typed output schema + deterministic processor: validate, coerce, canonicalize, fallback), proven on a single privacy.tier template. Additive only, no caller migration.

Owner: epic-aux-enrichment-pipeline.md (In Progress). Loop-lore has src/aux-pipeline/runner.ts (callAux, 2000ms timeout / temp 0 / 100 tokens defaults), template-registry.ts (ClassificationTaskDef, AUX_CLASSIFICATION_TASKS compile-error-if-new-task), vocab/template layers, and callers already on callAux (transition/split/title/gm-tool/rag/carriage classifiers). Missing: no src/classify/ module, no PreparedTemplate registry, no Classifier.classify interface, no processor (parse/validate/coerce/canonicalize/fallback + retry-with-feedback), no exact-match cache, no metrics, no privacy.tier template.

Internet: ADOPT provider JSON-schema-strict as primary backend + TypeBox schemas (Elysia, zero new deps) + Instructor-style retry-with-error-feedback (max 2) + exact-match cache key + temperature 0 + fallback-to-strictest tier 0 + audit line without raw content. ADAPT one local NLI backend (Xenova nli-deberta-v3-small via transformers.js, else GLiClass sidecar) behind the same Classifier interface as the offline tier. DEFER Outlines/Guidance FSM sidecar, BAML codegen, LMQL runtime, semantic cache (exact-match v1 only), DSPy optimizers, SetFit-as-primary, rationale in hot-path schema.

Scope (additive, ~3 files): src/classify/types.ts (PreparedTemplate, Classifier, ClassifyResult) + src/classify/templates/privacy-tier.ts (TypeBox input/output) + src/classify/processor.ts (parse, validate, coerce, canonicalize, fallback, max 2 retries with error feedback) + provider-schema backend + exact-match cache + one privacy.tier test.

Refs: .tmp/meta-research/zero-shot-classification-prepared-io.md; https://github.com/dottxt-ai/outlines; https://github.com/567-labs/instructor; https://pypi.org/project/gliclass/0.1.10/; https://huggingface.co/Xenova/nli-deberta-v3-small

Acceptance: classify privacy.tier returns tier 0-3 + confidence typed at compile time AND runtime-validated; malformed model output triggers 2 retries then tier 0 degraded fallback; same input twice gives cached:true second time; unknown label synonym maps via allowlist else fallback; audit line per call without raw content; bun test src/classify green; no changes to callAux callers; stale epic table row 35 status refreshed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
