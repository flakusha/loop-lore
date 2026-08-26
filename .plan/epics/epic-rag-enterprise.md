<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG Enterprise Features

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** rag, enterprise, access-control, audit, compliance, multi-tenancy, lifecycle, analytics
**Parent Epic:** RAG & Document Processing (epic-rag-document-processing.md)

## Summary

Business-ready layer for the RAG pipeline: per-document and per-user access control with RBAC, audit trails for all document access/queries/generation, compliance features (retention policies, GDPR right to deletion, data classification), multi-tenancy with tenant isolation, document lifecycle management, analytics and reporting, and the business dashboard UI. Permissions persist in the `rag_access` table.

## Scope

- Access control (`src/rag/access.ts`): per-document permissions, per-user access levels, RBAC
- Audit trails (`src/rag/audit.ts`): document access, query, and generation logging with sources
- Compliance (`src/rag/compliance.ts`): retention policies, right to deletion (GDPR), data classification labels
- Multi-tenancy (`src/rag/tenancy.ts`): tenant isolation, optional cross-tenant search, tenant-specific embedding models
- Document lifecycle (`src/rag/lifecycle.ts`): version control, deprecation/archival, automatic re-indexing
- Analytics (`src/rag/analytics.ts`): document usage stats, query analytics, popular documents dashboard
- Business dashboard UI (`src/frontend/alpine/rag-dashboard.ts`)
- `rag_access` table

## Design

### Database Schema

#### rag_access

```sql
CREATE TABLE rag_access (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  role TEXT NOT NULL, -- viewer, editor, admin
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  granted_by TEXT REFERENCES users(id)
);
```

### Security Model

| Feature             | Implementation                        |
| ------------------- | ------------------------------------- |
| Access Control      | RBAC with per-document permissions    |
| Audit Trails        | All queries and access logged         |
| Data Retention      | Configurable retention policies       |
| GDPR Compliance     | Right to deletion, data export        |
| Multi-tenancy       | Tenant isolation, cross-tenant search |

## Tasks

### Business Features

- [ ] Implement access control (`src/rag/access.ts`)
  - [ ] Per-document permissions
  - [ ] Per-user access levels
  - [ ] Role-based access control (RBAC)
- [ ] Add audit trails (`src/rag/audit.ts`)
  - [ ] Document access logging
  - [ ] Query logging
  - [ ] Generation logging with sources
- [ ] Implement compliance features (`src/rag/compliance.ts`)
  - [ ] Data retention policies
  - [ ] Right to deletion (GDPR)
  - [ ] Data classification labels
- [ ] Add multi-tenancy (`src/rag/tenancy.ts`)
  - [ ] Tenant isolation
  - [ ] Cross-tenant search (optional)
  - [ ] Tenant-specific embedding models
- [ ] Create document lifecycle management (`src/rag/lifecycle.ts`)
  - [ ] Version control
  - [ ] Deprecation and archival
  - [ ] Automatic re-indexing
- [ ] Add analytics and reporting (`src/rag/analytics.ts`)
  - [ ] Document usage statistics
  - [ ] Query analytics
  - [ ] Popular documents dashboard
- [ ] Create business dashboard UI (`src/frontend/alpine/rag-dashboard.ts`)

## Dependencies

- **Parent hub:** epic-rag-document-processing.md (shared pipeline interface, cross-cutting concerns)
- **Sequencing:** Independent follow-on to the core pipeline; layers onto epic-rag-ingestion.md (documents table) and epic-rag-retrieval.md (query logging) once those exist.
- External: depends on epic-encryption-foundation.md (document encryption at rest); aligns with epic-auth-access.md (users, roles)

## Related Epics

- **epic-encryption-foundation.md** — document encryption at rest
- **epic-auth-access.md** — user/role foundation for RBAC and tenancy
- **epic-rag-ui.md** — hosts the frontend surfaces this epic's dashboard complements
