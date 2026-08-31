// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { addChecksum, prettyJson, } from "./helpers";
import type { FinalizeExportInput, } from "./types";

/**
 * Write the export metadata (export-info, schema-version, optional
 * asset-manifest), the manifest (with checksums), regenerate the manifest
 * with final checksums, and produce the ZIP buffer.
 *
 * Shared by both export handlers; the SSE handler passes `assetManifest`,
 * the plain handler omits it.
 * @param input
 */
export async function finalizeExportZip(input: FinalizeExportInput,): Promise<Buffer> {
  const { zip, checksums, counts, userId, now, format, include, assetManifest, } = input;

  let itemCount = 0;
  for (const n of Object.values(counts,)) { itemCount += n; }

  const exportInfo = {
    exported_at: now.toISOString(),
    exported_by: userId,
    format,
    includes: include,
    item_count: itemCount,
  };
  const schemaVersion = {
    schema_version: "1.0",
    export_format_version: "1.0",
  };

  const metadataFolder = zip.folder("metadata",);
  const exportInfoStr = prettyJson(exportInfo,);
  metadataFolder?.file("export-info.json", exportInfoStr,);
  addChecksum(checksums, "metadata/export-info.json", exportInfoStr,);

  const schemaVersionStr = prettyJson(schemaVersion,);
  metadataFolder?.file("schema-version.json", schemaVersionStr,);
  addChecksum(checksums, "metadata/schema-version.json", schemaVersionStr,);

  if (assetManifest) {
    const assetManifestStr = prettyJson(assetManifest,);
    metadataFolder?.file("asset-manifest.json", assetManifestStr,);
    addChecksum(checksums, "metadata/asset-manifest.json", assetManifestStr,);
  }

  const manifestBase = {
    version: "1.0",
    exported_at: now.toISOString(),
    exported_by: userId,
    format_version: "1.0",
    contents: counts,
    checksums,
  };
  const manifest = assetManifest ? { ...manifestBase, asset_manifest: assetManifest, } : manifestBase;
  const manifestStr = prettyJson(manifest,);
  zip.file("manifest.json", manifestStr,);
  addChecksum(checksums, "manifest.json", manifestStr,);

  // Regenerate ZIP with the final manifest (checksums updated)
  const finalManifest = assetManifest ? { ...manifestBase, asset_manifest: assetManifest, } : manifestBase;
  zip.file("manifest.json", prettyJson(finalManifest,),);

  return zip.generateAsync({ type: "nodebuffer", },);
}
