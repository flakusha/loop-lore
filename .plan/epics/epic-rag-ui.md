<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG & Document UI

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** rag, documents, search, ui, frontend

## Summary

Complete RAG (Retrieval-Augmented Generation) interface including document upload, search interface with citations, and source management.

## Core Features

### Document Upload

- Drag-and-drop upload
- File type selection
- Upload progress
- Document preview
- Metadata editing

### Search Interface

- Search input with autocomplete
- Search results display
- Source citations
- Relevance scoring
- Search history

### Source Management

- Source list
- Source details
- Source deletion
- Source tagging

## UI Components

### Document Upload Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Documents: The Forgotten Realms               [+ Upload]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Upload Zone ────────────────────────────────────────────┐│
│ │                                                         ││
│ │         📄 Drag & drop files here                       ││
│ │         or click to browse                              ││
│ │                                                         ││
│ │         Supported: PDF, DOCX, TXT, MD, HTML             ││
│ │         Max size: 50MB                                  ││
│ │                                                         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Document List ──────────────────────────────────────────┐│
│ │ 📄 lore-history.pdf      Uploaded: 2 hours ago  [View]  ││
│ │ 📄 world-map.md          Uploaded: 1 day ago    [View]  ││
│ │ 📄 character-guide.docx  Uploaded: 3 days ago   [View]  ││
│ │ 📄 quest-templates.txt   Uploaded: 1 week ago   [View]  ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Document Details ───────────────────────────────────────┐│
│ │ 📄 lore-history.pdf                                      ││
│ │ ─────────────────────────────────────────────────────── ││
│ │                                                          ││
│ │ Type: PDF                                                ││
│ │ Size: 2.5 MB                                             ││
│ │ Pages: 45                                                ││
│ │ Uploaded: 2 hours ago                                    ││
│ │                                                          ││
│ │ Tags:                                                    ││
│ │ [lore] [history] [world]                                 ││
│ │                                                          ││
│ │ Content Preview:                                         ││
│ │ "The ancient kingdom of Aetheria was founded..."         ││
│ │                                                          ││
│ │ [Download] [Edit Tags] [Delete]                          ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Search Interface Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Search Documents                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Search Input ───────────────────────────────────────────┐│
│ │ 🔍 Search documents...                        [Search]   ││
│ │                                                         ││
│ │ Recent:                                                 ││
│ │   - "ancient kingdom history"                           ││
│ │   - "character abilities"                               ││
│ │   - "quest templates"                                   ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Search Results ─────────────────────────────────────────┐│
│ │ Found 12 results for "ancient kingdom"                  ││
│ │                                                         ││
│ │ ┌─ Result 1 ──────────────────────────────────────────┐ ││
│ │ │ Score: 95% | Source: lore-history.pdf (Page 12)     │ ││
│ │ │                                                      │ ││
│ │ │ "The **ancient kingdom** of Aetheria was founded    │ ││
│ │ │ in the year 1234 by King Theron the Great..."       │ ││
│ │ │                                                      │ ││
│ │ │ [View Source] [Copy] [Insert into Chat]             │ ││
│ │ └──────────────────────────────────────────────────────┘ ││
│ │                                                         ││
│ │ ┌─ Result 2 ──────────────────────────────────────────┐ ││
│ │ │ Score: 82% | Source: world-map.md (Section 3)       │ ││
│ │ │                                                      │ ││
│ │ │ "The **ancient kingdom** stretched across the       │ ││
│ │ │ northern continent, bordering the Darkwood..."      │ ││
│ │ │                                                      │ ││
│ │ │ [View Source] [Copy] [Insert into Chat]             │ ││
│ │ └──────────────────────────────────────────────────────┘ ││
│ │                                                         ││
│ │ ┌─ Result 3 ──────────────────────────────────────────┐ ││
│ │ │ Score: 78% | Source: character-guide.docx (Page 5)  │ ││
│ │ │                                                      │ ││
│ │ │ "Characters from the **ancient kingdom** often      │ ││
│ │ │ possess knowledge of forgotten magic..."            │ ││
│ │ │                                                      │ ││
│ │ │ [View Source] [Copy] [Insert into Chat]             │ ││
│ │ └──────────────────────────────────────────────────────┘ ││
│ │                                                         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Search Filters ─────────────────────────────────────────┐│
│ │ Source: [All ▼]  Type: [All ▼]  Date: [All ▼]          ││
│ │ Min Score: [50%]  Max Results: [20]                      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Citation Display

```
┌─ Citation ─────────────────────────────────────────────────────┐
│                                                               │
│ Source: lore-history.pdf (Page 12)                            │
│ Relevance: 95%                                                │
│                                                               │
│ "The ancient kingdom of Aetheria was founded in the           │
│ year 1234 by King Theron the Great. It spanned across         │
│ the northern continent, with its capital at Crystalpeak..."   │
│                                                               │
│ [View Full Page] [Copy Citation] [Insert into Chat]           │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Integration Points

### Backend Dependencies

| Backend System | What It Provides            | How Used            |
| -------------- | --------------------------- | ------------------- |
| RAG System     | Document processing, search | Upload, search      |
| Vector Store   | Embeddings, similarity      | Search results      |
| Document Store | Document CRUD               | Document management |

### Shared Components

| Component    | Used By            | Notes                     |
| ------------ | ------------------ | ------------------------- |
| Upload zone  | RAG, Assets, Chat  | Reusable upload interface |
| Search input | RAG, World, NPC    | Reusable search interface |
| Result card  | RAG, Search, World | Reusable result display   |

## Acceptance Criteria

- [ ] Drag-and-drop document upload
- [ ] File type selection
- [ ] Upload progress display
- [ ] Document preview
- [ ] Metadata editing
- [ ] Search input with autocomplete
- [ ] Search results display
- [ ] Source citations
- [ ] Relevance scoring
- [ ] Search history
- [ ] Source list
- [ ] Source details
- [ ] Source deletion
- [ ] Source tagging
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] Screen reader support

## Implementation Phases

### Phase 1: Document Upload

- Upload zone
- File type selection
- Upload progress
- Document list

### Phase 2: Document Management

- Document details
- Metadata editing
- Source tagging

### Phase 3: Search

- Search input
- Search results
- Citations

### Phase 4: Polish

- Mobile responsive
- Keyboard accessible
- Screen reader support

## Tasks

| Task                         | Priority | Status         |
| ---------------------------- | -------- | -------------- |
| TASK-rag-document-upload.md  | P0       | ⬜ Not Started |
| TASK-rag-document-list.md    | P0       | ⬜ Not Started |
| TASK-rag-search-interface.md | P0       | ⬜ Not Started |
| TASK-rag-citation-display.md | P0       | ⬜ Not Started |
| TASK-rag-alpine.md           | P0       | ⬜ Not Started |

## Files to Create

- `src/frontend/rag/document-upload.ts` — Document upload
- `src/frontend/rag/document-list.ts` — Document list
- `src/frontend/rag/search-interface.ts` — Search interface
- `src/frontend/rag/citation-display.ts` — Citation display
- `src/frontend/alpine/rag.ts` — Alpine.js RAG logic

## Related Epics

- **Epic RAG & Document Processing** — Backend RAG system
- **Epic Knowledge System** — Backend knowledge system
