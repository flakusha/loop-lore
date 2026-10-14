<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Model metadata sidecar cache and hash lookup cascade

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** model-metadata-read
**Tags:** models, metadata, caching

**Summary:**

Persist per-model metadata in a `<file>`.cm-info.json-style sidecar next to the model (crash-safe, portable); rescans skip files whose sidecar exists (incremental). For files without a sidecar, resolve via cascade: content hash -> local DB -> remote API by hash, then write the sidecar. Store generation parameters embedded by trainers for one-click model defaults.

Reference: Stability Matrix MetadataImportService.cs ScanDirectoryForMissingInfo (FileHasNoCmInfo, IProgress reporting); Models/ConnectedModelInfo.cs; Helper/ModelFinder.cs LocalFindModel/RemoteFindModel (GetModelVersionByHash then GetModelById, graceful 404/timeout); Models/Database/LocalModelFile.cs.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
