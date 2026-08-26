<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-rag-email-source: RAG email source (IMAP)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Small
**Type:** TASK
**Tags:** rag, email, imap
**Epic:** epic-rag-document-processing.md
**Parent:** TASK-rag-context-enrichment (umbrella)

## Summary

IMAP email ingestion as a RAG context source: folder selection, attachment extraction, content search.

## Tasks

- [ ] Implement email provider (`src/rag/sources/email/imap.ts`)
  - IMAP connection for email retrieval
  - Configurable folder/label selection
  - Attachment extraction (PDF, DOCX)
  - Search across email content
- [ ] Add email ingestion options:

```typescript
export interface EmailIngestOptions {
  folders: string[]; // INBOX, Support, etc.
  since?: Date; // Only recent emails
  maxAge?: number; // Days to look back
  includeAttachments: boolean;
  excludePatterns?: string[]; // Regex patterns to skip
}
```

- [ ] Create email API (`/api/rag/sources/email`):

```typescript
POST / api / rag / sources / email / connect; // Configure IMAP
GET / api / rag / sources / email / status; // Connection status
POST / api / rag / sources / email / sync; // Trigger sync
GET / api / rag / sources / email / search; // Search emails
```

## Dependencies

- Depends on: TASK-rag-context-schema; pattern follows TASK-rag-feed-sources (reference implementation).
- Parent hub: `TASK-rag-context-enrichment.md`
- Siblings: registers into TASK-rag-unified-enrichment.
