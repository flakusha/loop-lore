<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: breach notification runbook (detect-assess-contain-notify, no new runtime)

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-security-sandboxing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Compliance breach proposal 4, smallest. Docs + scripts checklist (detect, assess, contain, notify templates) on log_entries + rotation audit; no new monitoring (defer to Phase 5). Runbook actions (holds/revocation/notifications) each require admin auth at execution; dry-run mode default-denies side effects. Adjacent verified: rotateKeyOnLeave forward secrecy, crypto.key-rotation-check cron (jobs.ts:71-83), rotation audit history, memory.purge soft-only + opt-in hard delete.

Owner: epic-security-sandboxing.md (Not Started; breach absent entirely, no runbook/72h path/retention docs).

Refs: EDPB breach https://www.edpb.europa.eu/sme-data-protection-guide/data-breaches_en + guidelines https://www.edpb.europa.eu/system/files/2022-10/edpb_guidelines_202209_personal_data_breach_notification_targetedupdate_en.pdf (adapt 72h/notify runbook at self-host scale).

Acceptance: canned SMK-leak tabletop completes with audit trail; zero new runtime deps; tabletop only, no prod mutation, canned-compromise fixture isolated.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
