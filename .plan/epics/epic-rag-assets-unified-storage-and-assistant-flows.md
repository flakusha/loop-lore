<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RAG × Assets — Unified Storage, Decomposition & Assistant Flows

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Very High (decomposes into RAG-side and asset-side sub-batches; each ships standalone)
**Type:** Feature Epic (cross-cutting bridge)
**Tags:** rag, assets, extraction, decomposition, hybrid-search, assistant, admin, gallery, model-roles, standards
**Parents:** `epic-rag-document-processing.md` (RAG pipeline), `epic-asset-platform-capabilities.md` (asset substrate), `epic-assistant-gm-flows.md` (assistant surface)
**Bridges:** `epic-aux-enrichment-pipeline.md` (ModelRole wiring), `epic-frontend-gallery.md` + `epic-gallery-batch-operations.md` (gallery UI), `epic-byok-local-models.md` (admin-model surface)

## Summary

Wire the RAG pipeline to the asset platform so that every artifact loop-lore handles — uploaded files, generated images, scraped documents, chat attachments, worldbook entries — becomes a first-class, structured, cross-referenced, searchable **document-object** with human-readable and raw representations. Extend the model-role architecture with extraction/embedding/analysis roles configurable in the admin interface. Surface decomposition, linkage, and hybrid search through the gallery and the assistant chat flow. Replace the dead `ModelRole.Captioning`/`ModelRole.Moderation` placeholders with real per-asset analysis paths.

## Why this epic exists (the gap)

Reading the existing suite side-by-side exposes three orthogonal gaps that no single epic owns:

1. **Asset↔RAG gap.** `epic-asset-platform-capabilities.md` B4 mentions "Asset → RAG index" as a single bullet; `epic-rag-ingestion.md` only ingests user-uploaded files. There is no unified "every artifact is a document" contract — no `document_kind` enum covering asset/message/worldbook/character-card/scenario, no shared chunk strategy, no cross-reference between an RAG document and the asset row that produced it.
2. **Model-role gap.** `epic-aux-enrichment-pipeline.md` flags `ModelRole.Captioning` and `ModelRole.Moderation` as dead roles. There is **no** `Extraction` role, **no** `Embedding` role exposed via the admin model picker (it lives only in `epic-rag-vector-store.md` as code), and **no** way to assign a separate model to per-document decomposition vs. chat-time retrieval.
3. **Gallery/Assistant gap.** The gallery (`epic-frontend-gallery.md`) is a binary/media browser. The assistant (`epic-assistant-gm-flows.md`) generates entities but doesn't link, decompose, or cross-reference assets mid-chat. There is no surface for the human-readable decomposed representation, no hybrid (semantic + keyword + tag) search, no "show me the original + every chunk + every tag + every backlink" view.

This epic fills all three.

## Core Principles

| Principle | Implementation |
|---|---|
| **Document-as-object + document-as-record** | One shape for code (`DocumentObject`), one shape for persistence (`documents` table extended with `document_kind`, `source_asset_id`, `raw_repr`, `decomposed_repr`); both serialize from the same canonical schema. |
| **Standards-aware decomposition** | Pluggable decomposers; first-class support for common document standards (see "Standards" section) and a fall-back "free decomposition" path so proprietary formats are first-class. |
| **Model-role expansion (admin)** | New `ModelRole.{Extraction,Embedding,Analysis}` registered alongside the dead `Captioning`/`Moderation`; admin UI exposes them on the same model picker used for `default`/`aux`/`gm`/`actor`. |
| **Hybrid retrieval** | Vector similarity + keyword (BM25 or SQLite FTS5) + tag filter + reference-graph traversal; cross-encoder rerank pluggable. |
| **Assistant ↔ RAG ↔ Asset round-trip** | Assistant chat can `/decompose <asset>`, `/link <a> <b>`, `/search <query>`, `/preview <doc>` — each becomes an assistant tool with deterministic, replayable outputs. |
| **Gallery decomposition view** | Side-by-side panel: original (raw bytes), decomposed (tree), human-readable (rendered), and references (backlinks graph). |

## Standards Survey (what "unified specification" means here)

The user asked "any standards?". Survey of relevant document/spec standards for representing, structuring, and cross-referencing documents, ranked by what loop-lore actually needs (decomposition of a chat asset / lorebook / scenario):

| Standard | Scope | Fit | Use here |
|---|---|---|---|
| **JSON-LD** | Linked-data JSON, `@context` + `@id` + `@type`; W3C standard for graph-of-documents | High — natural cross-references via `@id`; every chunk/object gets a URI | **Adopt as canonical wire format** for cross-references between document objects, assets, and entities. |
| **OpenAPI 3.1** | REST API schema | High for RAG/asset API surface | Reuse existing `epic-openapi-reference.md` work; this epic extends it with `/api/documents/*` + `/api/assets/documents/*`. |
| **CommonMark + GFM** | Markdown spec | High for human-readable representation | Default renderer for `decomposed_repr.human`. |
| **Schema.org** | Schema.org types (Article, Book, ImageObject, etc.) | Medium | Tag vocabulary for `document_kind` mapping (e.g. `ImageObject` → `image`). |
| **FRBR** | Functional Requirements for Bibliographic Records (work/expression/manifestation/item) | Medium | Model for `document_version`/`revision` lineage; reuses `epic-content-versioning.md`. |
| **IIIF** (Presentation API) | International Image Interoperability Framework | High for asset decomposition | Adopt for image/PDF assets — manifest/canvas/annotation maps onto `decomposed_repr.struct` (regions, OCR overlay, references). |
| **Unstructured / DiSSCo** | Biodiversity/structured-data | Low — domain-specific | Skip. |
| **DocBook / TEI** | XML semantic markup | Medium for "long-form lore" docs | Optional `tei-xml` parser; not default. |
| **OpenDocument (ODT)** | Office docs | Medium | Already covered by `epic-rag-ingestion.md` DOCX; this epic unifies their `decomposed_repr`. |
| **Web Annotation (W3C)** | Annotation model | High | Adopt for cross-references between doc-objects (selector + body + target). |

**Decision: ship with JSON-LD as the canonical inter-doc reference graph + IIIF Presentation 2/3 for image/PDF asset manifests. Both are W3C standards and have small TypeScript type libraries.** All other formats are first-class ingesters but the canonical decomposed representation is JSON-LD.

## Document-as-Object (code shape)

```ts
// src/rag/document-object.ts
export type DocumentKind =
  | "file"           // uploaded file (PDF/DOCX/...)
  | "image"          // generated/uploaded image asset
  | "video"          // generated/uploaded video asset
  | "audio"          // generated/uploaded audio asset
  | "message"        // chat message with attachments
  | "character-card" // character definition
  | "worldbook"      // lorebook entry
  | "scenario"       // VN/scenario script
  | "url"            // scraped webpage
  | "text";          // free text / markdown

export interface DocumentObject {
  id: string;                       // ULID
  kind: DocumentKind;
  title: string;
  uri: string;                      // loop://doc/<id> JSON-LD @id
  createdAt: string;                // ISO 8601
  updatedAt: string;
  rawRepr: RawRepr;                 // bytes + MIME + hash
  humanRepr: string;                // CommonMark rendering
  structRepr: JsonLdDoc;            // JSON-LD graph
  references: DocReference[];       // JSON-LD @id of other docs
  tags: string[];
  sourceAssetId?: string;           // FK → assets.id (when kind in {image,video,audio,file})
  sourceMessageId?: string;
  tenantId?: string;
}

export interface RawRepr {
  bytesHash: string;                // BLAKE3 (reuses asset-platform B1)
  bytesSize: number;
  mimeType: string;
  // bytes live in the asset table; doc only stores hash + pointer
}

export interface JsonLdDoc {
  "@context": "https://loop-lore.dev/doc/v1";  // own JSON-LD context
  "@id": string;                                // loop://doc/<id>
  "@type": string;                              // Schema.org mapping (e.g. "ImageObject")
  // decomposer-specific fields (region boxes for images, headings for docs, ...)
  // all references go through `references` so the graph is queryable
}

export interface DocReference {
  refId: string;                   // loop://doc/<id> or loop://asset/<id>
  relation: "mentions" | "derives-from" | "annotates" | "embeds" | "tags";
  selector?: JsonLdSelector;       // IIIF region/point selector
  weight: number;                  // for hybrid ranking
}
```

## Document-as-Record (DB shape)

Extends the `documents` table from `epic-rag-ingestion.md` (additive migration — no breaking change to the RAG sub-epic):

```sql
ALTER TABLE documents ADD COLUMN
  document_kind TEXT NOT NULL DEFAULT 'file',
  source_asset_id TEXT REFERENCES assets(id),
  source_message_id TEXT REFERENCES messages(id),
  raw_bytes_hash TEXT,           -- joins to assets.blake3 (asset-platform B1)
  raw_bytes_size INTEGER,
  mime_type TEXT,
  struct_repr JSONB,             -- JSON-LD @graph
  human_repr TEXT,               -- CommonMark render
  references JSONB,              -- {refId, relation, selector?, weight}[]
  tags JSONB,                    -- string[] (reuses FTS5 tokenization)
  decomposition_model TEXT,      -- ModelRole.Extraction resolution at write-time
  decomposition_version INTEGER DEFAULT 1;

-- Tag-aware full-text search:
CREATE VIRTUAL TABLE documents_fts USING fts5(
  title, human_repr, tags,
  content='documents', content_rowid='id'
);

-- Reference-graph table for efficient backlinks/forward links:
CREATE TABLE document_references (
  src_doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  dst_doc_id TEXT NOT NULL,        -- may be loop://doc/<id> OR loop://asset/<id>
  dst_kind TEXT NOT NULL,          -- 'document' | 'asset' | 'message' | 'character'
  relation TEXT NOT NULL,
  selector JSONB,
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (src_doc_id, dst_doc_id, relation)
);
CREATE INDEX idx_dref_dst ON document_references(dst_doc_id, relation);
CREATE INDEX idx_dref_src ON document_references(src_doc_id);
```

This is the **document-as-record** shape: every artifact becomes a row in `documents`, regardless of whether the user uploaded a PDF, generated an image, or wrote a chat message. Asset-platform B1's BLAKE3 dedup is reused — same bytes, one document row, many `asset_links` rows pointing at it.

## Decomposers (extension points)

Each `DocumentKind` registers a decomposer that turns `raw_repr` into `struct_repr` (JSON-LD) + `human_repr` (CommonMark). Built-in:

| Kind | Decomposer | ModelRole | JSON-LD @type | Notes |
|---|---|---|---|---|
| `image` | IIIF manifest emitter (regions, EXIF, OCR text via image decomposer) | `ModelRole.Extraction` (caption/VLM) + `ModelRole.Embedding` for vectors | `ImageObject` + IIIF manifest | Reuses asset-platform B1 pHash + B4 captioning |
| `video` | Scene detector + keyframe + transcript | `ModelRole.Extraction` | `VideoObject` + IIIF canvas list | Reuses `src/audio-video-sound` |
| `audio` | Transcript + diarization | `ModelRole.Extraction` (Whisper-class) | `AudioObject` | Reuses `src/aux-pipeline` task shape |
| `file` (PDF/DOCX/...) | Existing parsers from `epic-rag-ingestion.md` + structured heading/footnote extraction | `ModelRole.Embedding` (re-rank), `ModelRole.Extraction` (semantic chunking) | `DigitalDocument` | Wraps ingestion output |
| `message` | Chat turn splitter + reference extractor | `ModelRole.Extraction` (existing `classifyIntent` migrated) | `Message` | Reuses `src/chat/transition-classifier.ts` |
| `character-card` | Field mapper -> JSON-LD (name, traits, lore, sample dialogue) | `ModelRole.Extraction` (relationships, traits) | `Person`/`Character` | Reuses `src/characters/` traits |
| `worldbook` | Entry splitter -> keyword triggers + content | `ModelRole.Extraction` (semantic tags) | `CreativeWork` | Reuses `src/actors.md` `actor_lore_entries` |
| `scenario` | Beat splitter -> choice cards + asset refs | `ModelRole.Extraction` (intent tagging) | `Scenario` | Reuses VN scene generator |
| `url` | Scraper + readability + JSON-LD extraction | `ModelRole.Extraction` (entity linking) | `WebPage` | Wraps `epic-rag-context-sources.md` web providers |

Every decomposer is a pure function `(rawRepr, opts) -> { structRepr, humanRepr, references }`. Pluggable; worldbuilders register custom decomposers via the plugin system (`epic-plugin-extension-points.md`).

## Model-Role Expansion (admin-side)

New roles registered in `VALID_ROLES`:

```ts
// src/config/roles.ts  (extends existing ModelRole enum)
export const ModelRole = {
  Default: "default",
  Aux: "aux",
  Gm: "gm",
  Actor: "actor",
  Moderation: "moderation",    // existing dead role - wire into NSFW pipeline
  Captioning: "captioning",    // existing dead role - wire into asset-platform B4
  Extraction: "extraction",    // NEW - doc decomposition
  Embedding: "embedding",      // NEW - embedding provider (separate from generation)
  Analysis: "analysis",        // NEW - chat-time reasoning over retrieved docs
} as const;
```

Admin model-picker (`src/frontend/admin/models.html` per existing epic-frontend-admin) gets:
- Existing roles: `default`, `aux`, `gm`, `actor`
- Newly exposed: `extraction`, `embedding`, `analysis`, `moderation`, `captioning`
- Each assignment: `(provider, modelId, per-call budget, BYO apiKey override, temperature/topP overrides)` — same shape as the existing admin model manager, just routed through `resolveModelRole` (the helper flagged in `epic-aux-enrichment-pipeline.md` row 2 for BYO-key + actor overrides).

Per-document kind overrides (new): the admin can pick "for `image` documents, use provider P1; for `file` documents, use provider P2" — a kind->role matrix. Falls back to the role default.

## Storage Layout (cross-reference + fast search + interconnection + tagging + in-document content structuring)

Three persistent indices plus one in-memory cache:

| Index | What | Why |
|---|---|---|
| **`documents` + `documents_fts`** | FTS5 over `title`/`human_repr`/`tags` | Keyword side of hybrid search; sub-milligram for thousands of docs. |
| **`chunks` + vector index** | Existing per `epic-rag-vector-store.md` | Vector side of hybrid search; reused unchanged. |
| **`document_references`** | Adjacency list of `(src, dst, relation, weight, selector)` | Backlinks/forward links/tag-graph traversal in O(degree). |
| **In-memory: tag co-occurrence matrix** | `tags x tags -> pmi` | Similarity-by-tag (Jaccard + PMI) for hybrid ranking when vectors are weak. |

Hybrid retrieval (`src/rag/hybrid.ts`) fuses:

```
score(d) = alpha * normalize(vector(d, q))         // semantic
         + beta  * normalize(fts(d, q))            // keyword
         + gamma * tag_overlap(q.tags, d.tags)     // tag
         + delta * 1/(1 + graph_distance(d, seed)) // graph (where seed = last referenced doc)
         + eps   * cross_encoder(d, q)             // rerank (optional, slow)
```

with `(alpha, beta, gamma, delta, eps)` config-driven (defaults `(0.5, 0.3, 0.1, 0.05, 0.05)`); rerank (`eps`) only when `topK <= 32`.

## Assistant Flow & Chat Integration

Extends `epic-assistant-gm-flows.md` with RAG/asset-aware tools (slash commands + chat-invokable actions):

| Command | Tool | Output |
|---|---|---|
| `/rag-search <query>` | `ragSearch(query, opts)` | List of `DocumentObject` summaries with relevance + tags |
| `/rag-decompose <asset\|doc-id> [kind]` | `decomposeDocument(target, kind?)` | Re-runs decomposer; returns `humanRepr` + `structRepr` summary; updates `documents.decomposition_version` |
| `/rag-link <a> <b> [relation]` | `linkDocuments(a, b, relation)` | Inserts `document_references`; both sides show backlink |
| `/rag-untag <doc> <tag>` / `/rag-tag <doc> <tag>` | `tagDocument(doc, tag, op)` | Updates `documents.tags` + FTS5 + tag co-occurrence |
| `/rag-preview <doc-id>` | `previewDocument(doc-id)` | Inline gallery panel: original + human + JSON-LD tree + backlinks |
| `/rag-ask <query>` | `answerWithRAG(query)` | LLM call (ModelRole.Analysis) over hybrid-retrieved context; streams answer + citations |
| `/asset-link <msg\|asset> <doc>` | `linkAssetToDocument(...)` | Sets `documents.source_asset_id`; appears in chat bubble tooltip |

All commands are **deterministic + replayable**: same inputs -> same outputs; an assistant invocation is logged with input args + resolved model + output hash for the audit trail `epic-rag-enterprise.md` will reuse.

The chat bubble tooltip for any attached asset gets a `🧠 Decomposed` chip with hover preview of `humanRepr` (CommonMark rendering) — the assistant doesn't have to be invoked; the chip is always there.

## Gallery Functionality (search, filtering, preview, hybrid review, pagination)

Extends `epic-frontend-gallery.md` and `epic-gallery-batch-operations.md`. Adds **four tabs** + **one unified search bar**:

| Tab | Renders | Backed by |
|---|---|---|
| **Media** | Existing asset grid (4:3 thumbs, type filter) | `epic-frontend-gallery.md` (unchanged) |
| **Documents** | Document cards: title, kind icon, tag chips, `human_repr` excerpt | `documents` table (new) |
| **Decomposed** | Cards for each decomposer output: regions/OCR/text chunks selectable | `chunks` + `document_references` |
| **References** | Backlink graph (node-link) for the current selection; click a node -> navigate | `document_references` adjacency |

**Search bar** (single, cross-tab): runs hybrid query (vector + FTS5 + tags + graph), facet filters by kind/tag/date, returns ranked cards across all tabs with provenance chips ("vector match", "tag:character", "backlink from <X>").

**Preview panel** (slides up on card click; same modal pattern as the existing preview modal): four-pane view — **Original** (raw bytes), **Human** (CommonMark render), **Struct** (collapsible JSON-LD tree), **References** (backlinks list + mini-graph). User can toggle panes; admin can re-run decomposition with a different model from this panel (writes a new `decomposition_version`, keeps history).

**Pagination**: cursor-based on FTS5/vector results, infinite scroll on the media grid (reuses existing gallery pagination TODO). `limit` defaults 50, capped 200; `cursor` opaque (base64 of `(lastScore, lastId)`); total count via `/api/documents/count?q=...`.

**Similarity panel**: "Similar to this" button under every card -> runs hybrid query with `seed = selectedDocId` and `delta` weight bumped; returns top-12 cross-kind candidates.

## Batches (each ships standalone; gates per batch)

### B-R1 — Document-Object Foundation

- `DocumentObject` + `RawRepr` + `JsonLdDoc` types in `src/rag/document-object.ts`
- Migration extending `documents` + `documents_fts` + `document_references`
- Repository layer (`src/db/repositories/documents.ts`) — Kysely types only
- Unit tests for round-trip raw<->struct<->human

### B-R2 — Decomposers (one batch per kind)

- B-R2a: `image` decomposer (IIIF manifest emitter + caption + pHash)
- B-R2b: `video` decomposer (scene detection + transcript)
- B-R2c: `audio` decomposer (transcript)
- B-R2d: `file` (PDF/DOCX/etc) decomposer (extends `epic-rag-ingestion.md`)
- B-R2e: `message` decomposer (chat turn splitter)
- B-R2f: `character-card` / `worldbook` / `scenario` / `url` decomposers

Each decomposer batch = standalone value; ship in priority order.

### B-R3 — ModelRole Expansion (admin)

- New `ModelRole.{Extraction,Embedding,Analysis}` + wire `Captioning`/`Moderation`
- Admin model-picker UI updates (existing `src/frontend/admin/models.html`)
- Per-kind model override matrix
- BYO apiKey routing through `resolveModelRole` (closes aux-enrichment row 2)

### B-R4 — Hybrid Retrieval & Index

- `src/rag/hybrid.ts` (alpha*beta*gamma*delta*eps fusion + cross-encoder rerank pluggable)
- Tag co-occurrence matrix builder (offline job)
- `POST /api/rag/hybrid-search` + `GET /api/documents/:id/references`
- Streamed citation responses
- Backlinks API: `GET /assets/:id/documents` + `GET /documents/:id/backlinks` (joins asset-platform B4)

### B-R5 — Assistant Chat Flow

- New assistant commands: `/rag-search`, `/rag-decompose`, `/rag-link`, `/rag-tag`, `/rag-ask`, `/rag-preview`, `/asset-link`
- Tool implementations under `src/assistant/commands/rag/`
- Chat bubble "🧠 Decomposed" chip + hover preview
- Replay log for audit (input, model, output hash)

### B-R6 — Gallery Decomposition UI

- Four-tab gallery (`Media` / `Documents` / `Decomposed` / `References`)
- Unified search bar + facet filters
- Four-pane preview (Original / Human / Struct / References)
- Cursor pagination on documents list
- Similarity panel
- Right-click context menu extension for batch ops on docs (links to `epic-gallery-batch-operations.md`)

### B-R7 — In-document content structuring & extraction tools

- Region/span selector (IIIF region + W3C Web Annotation selector)
- OCR overlay for images
- Inline text span tagging in `human_repr` preview
- "Extract as new document" — create a child `DocumentObject` from a selection (e.g. highlight a paragraph -> new doc)

## Files (new / extended)

```
src/rag/
├── document-object.ts            # NEW - DocumentObject types
├── hybrid.ts                      # NEW - hybrid retrieval
├── decomposition/
│   ├── index.ts                   # NEW - dispatcher
│   ├── image.ts                   # NEW
│   ├── video.ts                   # NEW
│   ├── audio.ts                   # NEW
│   ├── file.ts                    # NEW (extends ingestion)
│   ├── message.ts                 # NEW
│   ├── character-card.ts          # NEW
│   ├── worldbook.ts               # NEW
│   ├── scenario.ts                # NEW
│   └── url.ts                     # NEW
├── references.ts                  # NEW - backlinks/forward links
└── tag-matrix.ts                  # NEW - tag co-occurrence

src/db/
├── repositories/documents.ts      # NEW - Kysely-only
└── migrations/<ts>_rag_documents.ts  # NEW

src/admin/
└── model-roles.ts                 # EXTEND - new roles + per-kind matrix

src/frontend/admin/
└── models.html                    # EXTEND - extraction/embedding/analysis pickers

src/assistant/commands/
└── rag/                           # NEW
    ├── search.ts
    ├── decompose.ts
    ├── link.ts
    ├── tag.ts
    ├── ask.ts
    └── preview.ts

src/components/chat/
└── asset-bubble.html              # EXTEND - Decomposed chip

src/components/gallery/
├── tabs/documents.html            # NEW
├── tabs/decomposed.html           # NEW
├── tabs/references.html           # NEW
├── preview/decomposed-panel.html  # NEW - four-pane preview
└── search/hybrid-search-bar.html  # NEW

src/routes/
├── documents.ts                   # NEW - /api/documents/*
├── rag-hybrid.ts                  # NEW - /api/rag/hybrid-search
└── references.ts                  # NEW - backlinks API

docs/spec/
├── rag-document-object.md         # NEW - JSON-LD contract
└── rag-hybrid-ranking.md          # NEW - alpha*beta*gamma*delta*eps
```

## Acceptance Criteria (per batch; epic ships when all green)

### B-R1 (Foundation)

- [ ] `documents` table extends without breaking the existing RAG ingestion epic
- [ ] Round-trip raw <-> struct <-> human is byte-stable for a 1KB text fixture
- [ ] `documents_fts` FTS5 search returns correct ranking for a known query
- [ ] `document_references` adjacency inserts are atomic (single transaction)

### B-R2 (Decomposers)

- [ ] Image decomposer emits valid IIIF Presentation 2 manifest for a JPEG fixture
- [ ] Video decomposer produces >=1 transcript segment per detected scene
- [ ] Audio decomposer round-trips Whisper transcript + diarization
- [ ] File (PDF/DOCX/HTML) decomposers reuse existing ingestion parsers (no duplication)
- [ ] Message decomposer extracts at least one cross-reference per 50 messages
- [ ] Character-card / worldbook / scenario / URL decomposers produce JSON-LD with `@id` references

### B-R3 (Model Roles)

- [ ] `ModelRole.{Extraction,Embedding,Analysis}` resolve via `resolveModelRole`
- [ ] Per-kind model override matrix works (admin picks different model for `image` vs `file`)
- [ ] Dead `Captioning`/`Moderation` roles wired (captioner produces alt text in caption-route.ts; moderation consumes LLM output)
- [ ] BYO apiKey routing for aux path closes gap from aux-enrichment row 2

### B-R4 (Hybrid)

- [ ] Hybrid query returns consistent ordering across weight changes (monotonic)
- [ ] Cross-encoder rerank improves top-1 NDCG@10 on a known fixture (regression test)
- [ ] Backlinks/forward links query returns <=5ms for <=10k edges
- [ ] Citation streaming surfaces source chips in chat response

### B-R5 (Assistant)

- [ ] All seven `/rag-*` and `/asset-link` commands have unit + integration tests
- [ ] Chat bubble "🧠 Decomposed" chip renders `human_repr` excerpt on hover (visual e2e)
- [ ] Replay log captures `(input, model, output_hash)` per invocation; audit query returns same shape

### B-R6 (Gallery)

- [ ] Four-tab gallery renders all four tabs with <=200ms TTI on 10k docs
- [ ] Unified search bar returns hybrid results across tabs with provenance chips
- [ ] Four-pane preview toggles without re-fetching
- [ ] Cursor pagination works at offset >=10k
- [ ] Similarity panel returns >=1 cross-kind hit per anchor

### B-R7 (Content Structuring)

- [ ] Region/span selector saves W3C Web Annotation selectors
- [ ] "Extract as new document" creates a child doc with `parentRef` set
- [ ] OCR overlay is keyboard-accessible

## Dependencies

- **Hard:** `epic-rag-ingestion.md` (provides `documents` table), `epic-rag-vector-store.md` (vectors), `epic-asset-platform-capabilities.md` (B1 BLAKE3 dedup, B4 captioning, B5 ops language), `epic-aux-enrichment-pipeline.md` (model-role plumbing).
- **Soft:** `epic-frontend-gallery.md`, `epic-gallery-batch-operations.md`, `epic-assistant-gm-flows.md`, `epic-rag-enterprise.md` (audit), `epic-rag-context-sources.md` (URL ingestion), `epic-rag-ui.md` (admin search UX).
- **Standards libs (new deps, small):** `jsonld` (~30KB, MIT, type-stripped), `@iiif/parser` + `@iiif/presentation-3` (~40KB). Both pinned to known-good versions; tree-shaken.
- **Model providers (existing infra):** the per-role admin picker uses providers already registered in `src/admin/`.

## Non-Goals

- Full Web Annotation server (only consumer-side selectors; no public annotation endpoint)
- Linked-Data Platform (LDP) server (read-only JSON-LD; no SPARQL)
- Full IIIF Authentication (image asset auth reuses existing `epic-frontend-encryption.md`)
- Domain-specific ontologies (FRBR adoption is partial — only `work`/`expression` for version lineage)

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Decomposition drift** (re-running a decomposer changes `decomposition_version`; humans see new text) | `documents.decomposition_version` is monotonic; old versions retained; gallery shows "v3 (current) / v2 / v1" picker |
| **Vector + FTS5 cost** at 100k+ docs | Cursor pagination mandatory; per-tab indices; tag-matrix precomputed offline (nightly job); vector index stays separate from documents table |
| **JSON-LD context drift** (own context vs. Schema.org changes) | Pin context version (`/doc/v1`); bump + migration when Schema.org major changes |
| **Model-role explosion** (too many admin pickers) | Group in admin UI: "Generation roles" (default/gm/actor), "Analysis roles" (extraction/embedding/analysis), "Safety roles" (moderation/captioning) |
| **Hybrid ranking surprise** (results reorder when weights shift) | Config is per-user; ranking change requires user opt-in; tests assert monotonicity not specific scores |
| **Standards lock-in** | Pluggable decomposer registry; ship with JSON-LD + IIIF, allow Markdown + DocBook + custom via plugin |

## Open Questions (for the human / follow-on tickets)

1. **Standards:** ship with JSON-LD + IIIF + W3C Web Annotation as defaults, or pick a single canonical wire format (JSON-LD only) and keep IIIF as an optional image-decomposer output?
2. **Decomposition model defaults:** should `ModelRole.Extraction` default to a small VLM (e.g. qwen2-vl-7b) or admin-pickable on first run? Default is cheaper; per-kind override remains.
3. **Tag co-occurrence:** compute inline per write, or as a nightly job? Default = nightly (offline, cheap); admin can switch to inline for small instances.
4. **Hybrid ranking defaults:** `(0.5, 0.3, 0.1, 0.05, 0.05)` — vector-heavy by design; should this be admin-configurable per chat mode?
5. **Reference-graph depth:** limit traversal depth to 2 hops by default to keep `delta`-weighted ranking cheap, or unbounded? Default = 2 hops; admin can lift cap.

## Tickets (deferred to worktree after this epic lands)

- `TASK-rag-doc-object-foundation.md` — B-R1
- `TASK-rag-decomposer-image.md` / `-video.md` / `-audio.md` / `-file.md` / `-message.md` / `-character.md` / `-worldbook.md` / `-scenario.md` / `-url.md` — B-R2 family
- `TASK-rag-model-roles-admin.md` — B-R3
- `TASK-rag-hybrid-retrieval.md` — B-R4
- `TASK-rag-assistant-commands.md` — B-R5
- `TASK-rag-gallery-decomposition-ui.md` — B-R6
- `TASK-rag-content-structuring.md` — B-R7
- `TASK-rag-standards-survey.md` — research-only companion doc

## Related

- `epic-rag-document-processing.md` — parent RAG hub
- `epic-rag-ingestion.md`, `epic-rag-vector-store.md`, `epic-rag-retrieval.md`, `epic-rag-ui.md`, `epic-rag-enterprise.md`, `epic-rag-context-sources.md` — sibling RAG sub-epics
- `epic-asset-platform-capabilities.md` — asset substrate (B1 dedup, B4 captioning, B5 ops reused)
- `epic-frontend-gallery.md` + `epic-gallery-batch-operations.md` — gallery UI surface extended
- `epic-assistant-gm-flows.md` — assistant commands extended with RAG/asset tools
- `epic-aux-enrichment-pipeline.md` — model-role plumbing (rows 2, 4 closed)
- `epic-byok-local-models.md` — admin model surface extended with new roles
- `epic-matrix-integration.md` — add this epic to the integration matrix
- `matrix-emotion-avatar-assets.md` — extend with RAG<->asset references (AV-row for decomposition chips)
