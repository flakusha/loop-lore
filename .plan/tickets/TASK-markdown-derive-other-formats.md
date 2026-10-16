<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Derive EPUB / PDF / HTML / Plain Text From Canonical Markdown

**Status:** Not Started
**Priority:** low
**Effort:** Large
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-publication-export-formats.md`, `TASK-markdown-canonical-intermediate-contract.md`, `TASK-collapse-duplicate-markdown-exporter.md`, `epic-import-export-io.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The derivation pipeline: markdown to EPUB, markdown to PDF, markdown to HTML,
and markdown to plain text. One input, four renderers, all reading the same
stored unit markdown. **No writer of any of these four exists today**; this
ticket owns all of them.

## Context

Markdown is the canonical intermediate
(`TASK-markdown-canonical-intermediate-contract.md`). This ticket is the
outbound half: every other format is a function of the markdown, never a parallel
source of truth.

**Ground state: none of these writers exist.**

- No EPUB: no `text/epub`, no `application/epub+zip` anywhere in `src/`.
- No PDF writer: every `application/pdf` hit in `src/` is an **upload-validation
  MIME allowlist** — `src/assets/service/detect.ts:39` and
  `src/assets/service/validate.ts:23` — and the gallery rejects PDF. There is no
  pdfkit, no jsPDF, no pandoc invocation.
- No DOCX writer and no DOCX library; named here only to record that it is out of
  scope for this ticket.
- `jszip` ^3.10.2 is the only writer engine installed and is what EPUB must be
  built on (`package.json:174-198`).

**Placement decision: single-file format-switched writers, `chat-export/`-style,
not `export-shared/`.** The two existing export families have different shapes
and only one of them fits:

| Family | Shape |
| ------ | ----- |
| `src/routes/chat-export/` | `format.ts` (format switch: `formatMarkdown`, `formatJson`, `formatHtml`, `formatPlainText`) + `export-route.ts` returning a single `Content-Type` plus a `Content-Disposition` attachment |
| `src/routes/export-shared/` | ZIP-bundle. Every writer returns `Promise<void>` and writes **into** `ctx.zip`; `finalize.ts:69` is the sole serializer (`zip.generateAsync({type:"nodebuffer"})`) |

`ExportContext` (`src/routes/export-shared/types.ts:33-47`) is
`{ database, userId, zip: JSZip, checksums, format, chatIds?, counts, onItem?,
config? }`. The `zip: JSZip` member is required and non-optional, so a writer
cannot produce a bare PDF or a bare HTML file — it can only add files into a
zip. And `ExportItem.type` (`types.ts:23`) is a **closed union** over
`character`, `chat`, `world`, `location`, `story`, `asset`. It has no publication
member, so publication export into that family requires adding a member to a
union six existing domains depend on.

A PDF is not a zip. Forcing one through `ctx.zip` and having the route unzip a
single entry to hand back `application/pdf` is a worse shape than a format
switch that returns the bytes directly. So the writers go in a
`formatMarkdown`-shaped module — `src/routes/publication-export/`, mirroring
`src/routes/chat-export/`'s two-file shape — and `finalize.ts` plus the
checksums bundle machinery are reused **only** for the comic image-sequence
bundle, where a zip is genuinely the deliverable. Concretely: `ExportItem.type`
is **not** widened by this ticket, and that is the decision, not an oversight.

EPUB is the one format that *is* a zip, and it builds on `jszip` directly rather
than through `ExportContext`, because its container layout (`mimetype` stored
uncompressed, `META-INF/container.xml`, an OPF package, a spine, XHTML chapters)
is a different contract from a loose bundle of exported JSON files.

**The XSS hazard, stated plainly.** The server-side `markedParse`
(`src/generation/auto-gen/deps.ts:81`) returns `marked.parse(src, opts)` with
**no sanitization** and relies on the client to sanitize on render
(`src/frontend/chat-utils/render.ts:37`). That is safe today because those bytes
never become a file. The HTML derivation here DOES become a downloadable file,
so:

- It must NOT call `deps.markedParse`. It calls `marked.parse` and then
  `DOMPurify.sanitize(html, SANITIZE_CONFIG)` using the single allowlist at
  `src/frontend/alpine/chat-utils/sanitize.ts:9-47` — the same config the chat
  render path uses.
- `SANITIZE_CONFIG` allows `img` with `src`, and
  `src/assets/service/validate.ts:28` blocks `image/svg+xml` from upload. That
  combination is what stops an SVG payload riding in on an image reference; a
  test must cover it.
- The gate `src/scripts/check-frontend-innerhtml-xss.ts` reasons about
  client-side rendering. It does not cover a server-side writer and must not be
  cited as if it did.

EPUB and PDF consume the same `marked` HTML (EPUB embeds it as XHTML; PDF flows
it). A code-highlighting library does not exist in the repo, so generated
markdown is authored without syntax-highlight spans — do not add one here.

## Acceptance Criteria

- [ ] A single derivation entry point takes a publication's accepted unit
      markdown in `position` order and returns the bytes for the requested
      format; no writer reads the structured unit rows' prose independently of
      the markdown
- [ ] EPUB derivation produces a zip containing `mimetype`,
      `META-INF/container.xml`, an OPF package document, a spine in accepted-unit
      order, and one XHTML file per accepted unit — built with the installed
      `jszip`; a test unzips the output and asserts the spine order matches unit
      `position` order
- [ ] EPUB XHTML chapter bodies are the
      `DOMPurify.sanitize(marked.parse(...), SANITIZE_CONFIG)` rendering of the
      unit markdown; a test asserts a unit containing a script tag yields XHTML
      with no script element
- [ ] PDF derivation produces a valid PDF (header `%PDF-` and a nonzero page
      count) for a book by flowing the `marked` rendering of each accepted unit's
      markdown; a test asserts the header and page count
- [ ] HTML derivation produces a single self-contained `.html` file whose body is
      sanitized through `SANITIZE_CONFIG`; a test asserts a markdown body
      containing `<script>alert(1)</script>` produces no script element in the
      output
- [ ] HTML derivation does **not** call `markedParse` from
      `src/generation/auto-gen/deps.ts:81`; a test asserts no server-side export
      path uses the unsanitized deps parser
- [ ] An SVG reference in a unit body is neutralized: `SANITIZE_CONFIG` allows
      `img`/`src`, and the output HTML carries no executable SVG payload (test)
- [ ] Plain-text derivation strips markdown syntax to readable prose and asserts
      no heading markers, emphasis markers, or link syntax survive
- [ ] Editing one unit's markdown changes only that unit's bytes in every derived
      format (test per format)
- [ ] Rejected units (the `publication_status = PublicationStatus.Published`
      filter, `src/db/enums-story/items.ts:45`) and deleted artifacts appear in no
      derived format (test)
- [ ] The derivation entry point is exercised by a route returning the correct
      `Content-Type` per format (`application/epub+zip`, `application/pdf`,
      `text/html`, `text/plain`) and a `Content-Disposition` filename
- [ ] `ExportItem.type` (`src/routes/export-shared/types.ts:23`) is left
      unchanged; the placement rationale in ## Context is restated in the new
      module's header comment so the next reader does not "fix" it
- [ ] Owner authorization enforced on every derivation request; non-owners get
      404
- [ ] No new runtime dependency is added to `package.json` for EPUB or PDF beyond
      the already-installed `jszip`, `marked`, and `dompurify`