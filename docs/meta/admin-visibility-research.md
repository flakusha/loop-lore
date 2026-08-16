<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Admin & User Visibility — Research Report

> **Date:** 2026-07-27
> **Purpose:** Identify gaps in admin/user visibility features and propose new epics/tasks
> **Status:** Draft — awaiting review

---

## 1. Existing Infrastructure

### Admin Dashboard (11 tabs)

| Tab       | Backend                         | Frontend                | Status                                    |
| --------- | ------------------------------- | ----------------------- | ----------------------------------------- |
| Overview  | `admin.ts` stats endpoint       | `admin.html` stat cards | ✅ Basic — counts only                    |
| Users     | `admin.ts` user CRUD            | `admin-users.ts`        | ✅ Complete                               |
| Worlds    | `admin.ts` world CRUD           | `admin-worlds.ts`       | ✅ Complete                               |
| Chats     | `admin.ts` chat CRUD            | `admin-chats.ts`        | ✅ Complete                               |
| Audit     | `admin.ts` audit log            | `admin-audit.ts`        | ✅ Complete — pagination, search, filters |
| Models    | `admin.ts` provider/model mgmt  | `admin-models.ts`       | ✅ Complete — rescan, role assignment     |
| Templates | `admin-templates.ts`            | `admin-templates.ts`    | ✅ Complete — CRUD                        |
| Plugins   | `admin.ts` plugin list          | —                       | ⚠️ Basic — no enable/disable UI            |
| System    | `admin.ts` config CRUD          | `admin-system.ts`       | ✅ Complete — config, NSFW, analytics     |
| Analytics | `analytics.ts` + `telemetry.ts` | `admin-system.ts`       | ⚠️ Partial — no charts, no per-user        |
| Health    | `health.ts`                     | `admin-system.ts`       | ✅ Basic — provider status                |

### Analytics & Telemetry

| Endpoint                                | Description                                             | Gap                                   |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| `GET /api/analytics/chat/:chatId`       | Per-chat stats (generations, tokens, latency, cost)     | No time-series, no breakdown by model |
| `GET /api/analytics/overview`           | Aggregate stats (total messages, tokens, latency, cost) | No per-user breakdown, no trends      |
| `GET /api/telemetry/analytics/summary`  | Total events, distinct sessions/users                   | No event type breakdown               |
| `GET /api/telemetry/analytics/models`   | Event counts by type (started/completed/failed)         | No latency distribution               |
| `GET /api/telemetry/analytics/errors`   | Recent error events (limit 50)                          | No error rate, no trends, no alerts   |
| `GET /api/telemetry/analytics/daily`    | Daily event counts + active users                       | No charts, no export                  |
| `DELETE /api/telemetry/analytics/purge` | Purge old events                                        | No retention policy automation        |

### Model Comparison Leaderboard

| Endpoint                                     | Description                                        | Gap                                  |
| -------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `POST /api/analytics/comparisons`            | Submit comparison (better/worse/same + confidence) | No user-level aggregation            |
| `GET /api/analytics/comparisons`             | List recent comparisons                            | No time filter, no model filter      |
| `GET /api/analytics/comparisons/leaderboard` | Aggregate stats by model                           | No per-user preferences, no trending |

### Moderation Primitives

| Component                   | Location                                  | Status                                                                            |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| `createModerationAction`    | `src/chat/moderation.ts`                  | ✅ Exists — flag/hide/ban actions                                                 |
| `checkModerationPermission` | `src/chat/moderation.ts`                  | ✅ Exists — role-based checks                                                     |
| `isBlocked` / `isBanned`    | `src/chat/moderation.ts`                  | ✅ Exists — user status checks                                                    |
| `getShadowState`            | `src/chat/moderation.ts`                  | ✅ Exists — shadow ban detection                                                  |
| `ModerationHook`            | `src/generation/hooks/moderation-hook.ts` | ⚠️ Keyword-based only — no LLM analysis                                            |
| `NsfwHook`                  | `src/generation/hooks/nsfw-hook.ts`       | ⚠️ Keyword-based only — no image analysis                                          |
| `MessageVisibility`         | `src/db/enums-core.ts`                    | ✅ 5 states (visible, hidden_by_user, hidden_by_moderator, auto_hidden, redacted) |
| `AdminCharacterOverrides`   | `src/routes/admin-character-overrides.ts` | ✅ Visibility, license, bans, restrictions                                        |

### User Self-Service

| Endpoint                   | Description            | Gap                       |
| -------------------------- | ---------------------- | ------------------------- |
| `GET /api/users/me`        | Current user profile   | No activity summary       |
| `PUT /api/users/me`        | Update profile         | —                         |
| `GET /api/settings`        | User settings          | No usage stats            |
| `GET /api/settings/export` | Bulk export (ZIP)      | No GDPR-style data export |
| `GET /api/chats/activity`  | Per-chat unseen counts | No activity timeline      |

---

## 2. Gap Analysis

### A. Admin Dashboard Gaps

| Gap                                                                                   | Impact                                              | Effort | Priority |
| ------------------------------------------------------------------------------------- | --------------------------------------------------- | ------ | -------- |
| **No per-user cost/token breakdown** — can see aggregate but not per-user consumption | High — can't identify heavy users or allocate costs | Med    | P1       |
| **No user activity timeline** — can see `last_seen_at` but no activity history        | Med — can't investigate user behavior               | Low    | P2       |
| **No real-time dashboard** — all polling, no live updates on overview                 | Med — admin must refresh to see changes             | Med    | P2       |
| **No system health dashboard with charts** — just raw numbers                         | Med — no trend visualization                        | Med    | P2       |
| **No error rate tracking/alerting** — errors exist but no trend analysis              | High — can't detect error spikes                    | Med    | P1       |
| **No storage usage tracking** — can count assets but not disk usage                   | Low — can check manually                            | Low    | P3       |
| **No plugin enable/disable UI** — plugin list exists but no management                | Med — must edit config directly                     | Low    | P2       |

### B. Moderation Gaps

| Gap                                                                                | Impact                                        | Effort | Priority |
| ---------------------------------------------------------------------------------- | --------------------------------------------- | ------ | -------- |
| **No moderator role** — only admin/user/viewer/solo exist                          | High — can't delegate moderation              | Low    | P1       |
| **No moderation review queue UI** — actions exist but no queue                     | High — flagged content has no workflow        | Med    | P1       |
| **No moderation event log** — actions tracked in audit but not as dedicated events | Med — can't filter moderation-specific events | Low    | P2       |
| **No automated moderation rules** — keyword hooks exist but no configurable rules  | Med — must modify code to add rules           | Med    | P2       |
| **No user-level moderation (mute, timeout, warn)** — only ban/block                | Med — no graduated response                   | Low    | P2       |
| **No content report system** — no way for users to report content                  | High — users can't flag problematic content   | Med    | P1       |
| **No moderation dashboard** — no dedicated view for moderators                     | Med — moderators must use admin dashboard     | Med    | P2       |

### C. Leaderboard/Gamification Gaps

| Gap                                                                                    | Impact                                    | Effort | Priority |
| -------------------------------------------------------------------------------------- | ----------------------------------------- | ------ | -------- |
| **No user leaderboards** — model comparison leaderboard exists but no user-facing ones | Med — no engagement driver                | Med    | P2       |
| **No achievement display in admin** — achievements service exists but no admin view    | Low — achievements are RPG-specific       | Low    | P3       |
| **No user XP/level tracking** — RPG services exist but no user-level gamification      | Med — no progression system               | High   | P2       |
| **No activity streaks/engagement metrics** — can't track user engagement patterns      | Med — can't identify power users or churn | Med    | P2       |

### D. Error/Health Monitoring Gaps

| Gap                                                                                | Impact                               | Effort | Priority |
| ---------------------------------------------------------------------------------- | ------------------------------------ | ------ | -------- |
| **No error rate dashboard** — errors exist in telemetry but no trend visualization | High — can't detect error spikes     | Med    | P1       |
| **No alert thresholds** — no way to set alerts for error rates                     | High — reactive instead of proactive | Med    | P1       |
| **No request latency tracking** — analytics has avg latency but no distribution    | Med — can't identify slow endpoints  | Low    | P2       |
| **No database performance monitoring** — no query latency tracking                 | Med — can't detect slow queries      | Med    | P2       |
| **No memory/CPU usage tracking** — no resource monitoring                          | Low — can check manually             | Low    | P3       |

### E. User Self-Service Gaps

| Gap                                                                         | Impact                           | Effort | Priority |
| --------------------------------------------------------------------------- | -------------------------------- | ------ | -------- |
| **No user activity dashboard** — users can't see their own usage stats      | Med — no self-service visibility | Low    | P2       |
| **No personal token/cost tracking** — users can't see their own consumption | Med — can't budget usage         | Low    | P2       |
| **No session management UI** — sessions exist but no user-facing management | Low — can delete account         | Low    | P3       |
| **No personal data export (GDPR)** — settings export exists but limited     | High — compliance requirement    | Med    | P1       |

---

## 3. Proposed New Epics

### Epic 54: Admin Analytics Dashboard

**Priority:** P1 — High
**Effort:** Med
**Status:** 📝 Draft

Comprehensive admin analytics with charts, per-user breakdowns, and trend visualization.

**Scope:**

- Per-user cost/token breakdown endpoint
- Error rate tracking with trend analysis
- Request latency distribution (p50, p95, p99)
- Storage usage tracking (assets, database, logs)
- Real-time dashboard updates (SSE or WebSocket)
- Chart.js or similar for visualization
- Date range filtering for all analytics
- Export analytics as CSV/JSON

**New Endpoints:**

- `GET /api/admin/analytics/users` — per-user consumption breakdown
- `GET /api/admin/analytics/errors/trend` — error rate over time
- `GET /api/admin/analytics/latency/distribution` — latency percentiles
- `GET /api/admin/analytics/storage` — disk usage by category
- `GET /api/admin/analytics/export` — export analytics data

**New DB Tables:**

- `analytics_daily_metrics` — pre-aggregated daily stats (users, messages, tokens, cost, errors)
- `analytics_user_metrics` — per-user daily aggregates

**Files:**

- `src/routes/admin-analytics.ts` — new analytics endpoints
- `src/admin/analytics-aggregator.ts` — daily metric aggregation job
- `src/frontend/alpine/admin-analytics.ts` — chart components
- `docs/spec/admin-analytics.md` — spec

---

### Epic 55: Moderation System

**Priority:** P1 — High
**Effort:** Med–High
**Status:** 📝 Draft

Full moderation system with roles, review queue, automated rules, and user reporting.

**Scope:**

- Moderator role (admin-lite: can moderate but not manage system)
- Moderation review queue with approve/reject/escalate workflow
- Content report system (users can flag messages)
- Automated moderation rules (configurable keyword/pattern rules)
- User-level moderation (mute, timeout, warn)
- Moderation event log (dedicated, filterable)
- Moderation dashboard (dedicated tab in admin)

**New Enums:**

- `ModerationRole`: moderator, admin (extends UserRole)
- `ModerationAction`: warn, mute, timeout, hide, ban, escalate
- `ModerationStatus`: pending, reviewed, approved, rejected, escalated
- `ReportReason`: spam, harassment, hate_speech, nsfw, other

**New DB Tables:**

- `moderation_queue` — flagged content awaiting review
- `moderation_rules` — configurable auto-moderation rules
- `user_moderation_actions` — warn/mute/timeout history
- `content_reports` — user-submitted reports

**New Endpoints:**

- `GET /api/admin/moderation/queue` — list pending items
- `POST /api/admin/moderation/queue/:id/review` — approve/reject/escalate
- `GET /api/admin/moderation/rules` — list auto-moderation rules
- `POST /api/admin/moderation/rules` — create rule
- `PUT /api/admin/moderation/rules/:id` — update rule
- `DELETE /api/admin/moderation/rules/:id` — delete rule
- `POST /api/moderation/report` — user content report
- `GET /api/admin/moderation/reports` — list reports
- `POST /api/admin/users/:id/moderate` — warn/mute/timeout user

**Files:**

- `src/routes/moderation.ts` — moderation endpoints
- `src/moderation/service.ts` — moderation business logic
- `src/moderation/rules-engine.ts` — auto-moderation rule evaluation
- `src/frontend/alpine/admin-moderation.ts` — moderation dashboard
- `docs/spec/moderation.md` — spec

---

### Epic 56: User Engagement & Leaderboards

**Priority:** P2 — Medium
**Effort:** Med
**Status:** 📝 Draft

User-facing leaderboards, activity streaks, and engagement metrics.

**Scope:**

- User leaderboards (messages sent, characters created, worlds explored)
- Activity streaks (daily/weekly engagement tracking)
- Achievement display in user profile
- User activity timeline (recent actions)
- Engagement metrics for admin (DAU/MAU, retention, churn)
- Personal usage dashboard (tokens used, cost, activity)

**New DB Tables:**

- `user_activity_log` — structured activity events per user
- `user_engagement_metrics` — daily aggregates (messages, tokens, cost)
- `user_streaks` — current/longest streak tracking

**New Endpoints:**

- `GET /api/leaderboards/:type` — user leaderboards (messages, characters, worlds)
- `GET /api/users/me/activity` — personal activity timeline
- `GET /api/users/me/engagement` — personal usage stats
- `GET /api/admin/engagement` — DAU/MAU, retention, churn metrics
- `GET /api/admin/leaderboards` — admin view of all leaderboards

**Files:**

- `src/routes/leaderboards.ts` — leaderboard endpoints
- `src/routes/user-engagement.ts` — user engagement endpoints
- `src/admin/engagement-aggregator.ts` — daily metric aggregation
- `src/frontend/alpine/user-dashboard.ts` — personal stats UI
- `src/frontend/alpine/admin-engagement.ts` — admin engagement view
- `docs/spec/leaderboards.md` — spec

---

### Epic 57: Error Monitoring & Alerting

**Priority:** P1 — High
**Effort:** Med
**Status:** 📝 Draft

Proactive error monitoring with thresholds, alerts, and trend analysis.

**Scope:**

- Error rate tracking with trend visualization
- Configurable alert thresholds (error rate, latency, disk usage)
- Alert notifications (in-app, email, webhook)
- Error grouping and deduplication
- Request latency tracking (p50, p95, p99)
- Database query performance monitoring
- System resource monitoring (memory, CPU, disk)

**New DB Tables:**

- `alert_rules` — configurable alert thresholds
- `alert_history` — triggered alerts log
- `error_groups` — deduplicated error patterns
- `request_metrics` — per-request latency tracking (sampling)

**New Endpoints:**

- `GET /api/admin/alerts/rules` — list alert rules
- `POST /api/admin/alerts/rules` — create alert rule
- `PUT /api/admin/alerts/rules/:id` — update rule
- `DELETE /api/admin/alerts/rules/:id` — delete rule
- `GET /api/admin/alerts/history` — triggered alerts
- `GET /api/admin/errors/groups` — error groups with counts
- `GET /api/admin/metrics/latency` — latency distribution
- `GET /api/admin/metrics/resources` — system resource usage

**Files:**

- `src/routes/alerts.ts` — alert management endpoints
- `src/monitoring/alert-engine.ts` — threshold evaluation
- `src/monitoring/error-tracker.ts` — error grouping/dedup
- `src/monitoring/metrics-collector.ts` — latency/resource collection
- `src/frontend/alpine/admin-alerts.ts` — alert management UI
- `src/frontend/alpine/admin-errors.ts` — error dashboard
- `docs/spec/error-monitoring.md` — spec

---

### Epic 58: GDPR & User Data Rights

**Priority:** P1 — High
**Effort:** Med
**Status:** 📝 Draft

Compliance-focused epic for data export, deletion, and privacy controls.

**Scope:**

- Full user data export (JSON/ZIP with all user data)
- Account deletion with data purge (soft delete → hard delete)
- Data retention policies (configurable per data type)
- Privacy settings per user (data sharing, analytics opt-out)
- Audit trail for data access (who accessed what, when)
- Data portability (export in standard formats)

**New DB Tables:**

- `data_retention_policies` — configurable retention per data type
- `data_access_log` — who accessed whose data
- `user_deletion_requests` — pending deletion queue

**New Endpoints:**

- `GET /api/users/me/export` — full user data export (JSON)
- `POST /api/users/me/export` — request export (async for large datasets)
- `DELETE /api/users/me` — request account deletion
- `GET /api/users/me/privacy` — get privacy settings
- `PUT /api/users/me/privacy` — update privacy settings
- `GET /api/admin/data-retention` — list retention policies
- `POST /api/admin/data-retention` — create/update policy
- `GET /api/admin/data-access-log` — audit data access

**Files:**

- `src/routes/user-data-rights.ts` — GDPR endpoints
- `src/admin/data-retention.ts` — retention policy enforcement
- `src/admin/data-export.ts` — export generation
- `src/frontend/alpine/user-privacy.ts` — privacy settings UI
- `docs/spec/gdpr-compliance.md` — spec

---

## 4. Proposed New Tasks

### Tasks for Epic 54 (Admin Analytics)

| Task                             | Effort | Description                                                        |
| -------------------------------- | ------ | ------------------------------------------------------------------ |
| Per-user cost breakdown endpoint | Low    | `GET /api/admin/analytics/users` with token/cost per user          |
| Error rate trend endpoint        | Low    | `GET /api/admin/analytics/errors/trend` with daily error counts    |
| Analytics daily aggregation job  | Med    | Cron job to aggregate daily metrics into `analytics_daily_metrics` |
| Admin analytics charts           | Med    | Chart.js components for error rates, latency, storage              |
| Analytics date range filtering   | Low    | Add `from`/`to` params to all analytics endpoints                  |
| Analytics CSV/JSON export        | Low    | `GET /api/admin/analytics/export` with format param                |

### Tasks for Epic 55 (Moderation)

| Task                         | Effort | Description                                        |
| ---------------------------- | ------ | -------------------------------------------------- |
| Add moderator role to enum   | Low    | Extend `UserRole` with `Moderator` value           |
| Moderation queue CRUD        | Med    | `moderation_queue` table + service + endpoints     |
| Content report endpoint      | Low    | `POST /api/moderation/report` for user submissions |
| Auto-moderation rules engine | Med    | Configurable keyword/pattern rules with actions    |
| User mute/timeout system     | Med    | Time-based mute with auto-expiry                   |
| Moderation dashboard tab     | Med    | New Alpine component for admin.html                |
| Moderation event log         | Low    | Dedicated filterable log for moderation actions    |

### Tasks for Epic 56 (Leaderboards)

| Task                           | Effort | Description                                                  |
| ------------------------------ | ------ | ------------------------------------------------------------ |
| User activity log table        | Low    | `user_activity_log` table with structured events             |
| Leaderboard endpoints          | Low    | `GET /api/leaderboards/:type` (messages, characters, worlds) |
| Activity streak tracking       | Med    | Daily streak detection and persistence                       |
| Personal usage dashboard       | Med    | User-facing stats page (tokens, cost, activity)              |
| DAU/MAU metrics                | Med    | Daily/monthly active user aggregation                        |
| Achievement display in profile | Low    | Show user achievements in profile view                       |

### Tasks for Epic 57 (Error Monitoring)

| Task                         | Effort | Description                                         |
| ---------------------------- | ------ | --------------------------------------------------- |
| Alert rules CRUD             | Low    | `alert_rules` table + endpoints                     |
| Error grouping service       | Med    | Deduplicate errors by pattern (message + stack)     |
| Alert notification dispatch  | Med    | In-app + webhook notification on threshold breach   |
| Latency metrics collection   | Med    | Per-request latency sampling middleware             |
| Resource monitoring endpoint | Low    | `GET /api/admin/metrics/resources` (mem, cpu, disk) |
| Error dashboard tab          | Med    | New Alpine component for admin.html                 |

### Tasks for Epic 58 (GDPR)

| Task                              | Effort | Description                                                            |
| --------------------------------- | ------ | ---------------------------------------------------------------------- |
| Full user data export             | Med    | JSON export of all user data (profile, settings, messages, characters) |
| Account deletion flow             | Med    | Soft delete → grace period → hard delete with data purge               |
| Data retention policy enforcement | Med    | Cron job to enforce retention policies                                 |
| Privacy settings UI               | Low    | User-facing privacy controls                                           |
| Data access audit log             | Low    | Track who accessed whose data                                          |

---

## 5. Priority Recommendations

### P1 — Immediate (Next Sprint)

1. **Epic 55: Moderation System** — High impact, blocks community features
   - Start with: moderator role, content reports, review queue
2. **Epic 54: Admin Analytics Dashboard** — High impact, enables data-driven decisions
   - Start with: per-user cost breakdown, error rate trends
3. **Epic 57: Error Monitoring & Alerting** — High impact, proactive issue detection
   - Start with: alert rules, error grouping
4. **Epic 58: GDPR & User Data Rights** — High impact, compliance requirement
   - Start with: full user data export, account deletion

### P2 — Next Cycle

1. **Epic 56: User Engagement & Leaderboards** — Medium impact, engagement driver
   - Start with: leaderboards, activity streaks, personal dashboard

### P3 — Deferred

- Achievement display in admin (covered by RPG achievements epic)
- Session management UI (low priority, users can delete account)
- Memory/CPU monitoring (can check manually)

---

## 6. Cross-References

### Existing Epics That Overlap

| Existing Epic                         | Overlap                    | Recommendation                                                     |
| ------------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| Epic 16 (Observability & CI)          | Telemetry, health checks   | Epic 54 extends with charts; Epic 57 adds alerting                 |
| Epic 36 (Chat Lifecycle & Moderation) | Moderation hooks           | Epic 55 provides the moderation system; Epic 36 provides the hooks |
| Epic 49 (Analytics & Observability)   | Analytics endpoints        | Epic 54 extends with per-user breakdowns and charts                |
| Epic 22 (RPG Mechanics)               | Achievements, leaderboards | Epic 56 adds user-facing leaderboards; achievements already in RPG |
| Epic 47 (Character Core)              | Character moderation       | Epic 55 adds moderation queue; Epic 47 has character overrides     |

### Existing Code That Supports New Epics

| Existing Code                             | Supports    | How                                     |
| ----------------------------------------- | ----------- | --------------------------------------- |
| `src/chat/moderation.ts`                  | Epic 55     | Moderation primitives ready to build on |
| `src/generation/hooks/moderation-hook.ts` | Epic 55     | Hook infrastructure for auto-moderation |
| `src/telemetry/service.ts`                | Epic 54, 57 | Event recording infrastructure          |
| `src/routes/analytics.ts`                 | Epic 54     | Analytics query patterns to extend      |
| `src/routes/model-comparisons.ts`         | Epic 56     | Leaderboard query patterns to reuse     |
| `src/admin/provider-health.ts`            | Epic 57     | Health monitoring patterns to extend    |
| `src/routes/frontend-logs.ts`             | Epic 57     | Log ingestion for error tracking        |

---

## 7. Implementation Notes

### Database Migration Strategy

All new tables should be added via Kysely migrations in `src/db/migrations/`. Follow existing patterns:

- Use `migration-helpers.ts` for common operations
- Add enums to appropriate `enums-*.ts` file
- Update `schema.ts` with new table types

### Frontend Pattern

New admin tabs should follow existing Alpine.js pattern:

- Create `src/frontend/alpine/admin-{feature}.ts`
- Add tab button and content to `src/views/admin.html`
- Register in `src/frontend/alpine/admin.ts` init

### API Pattern

New endpoints should follow existing Elysia pattern:

- Auth guard: `requireUserId(ctx)` or `hasAdminAccess(ctx.userRole)`
- Error handling: `jsonError({ message, status, code })`
- Response: `jsonResponse(data)`
- Pagination: `parsePagination(url.searchParams)`

### Testing Pattern

New features should include:

- Unit tests: `src/{feature}/*.test.ts`
- Route tests: `src/routes/{feature}.test.ts`
- E2E tests: `tests/e2e/{feature}.test.ts` (if UI affected)
