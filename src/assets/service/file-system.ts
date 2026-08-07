/**
 * Asset Service — local filesystem helpers
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";

/**
 * Dangerous root paths that must never be used as upload directories.
 */
const FORBIDDEN_ROOTS = ["/", "/home", "/root", "/etc", "/usr", "/bin", "/lib", "/var", "/opt",];

/**
 * Resolve the upload directory path from config.
 * Supports both absolute and relative paths.
 * Throws if resolved path is a forbidden system root.
 */
export function resolveUploadDir(uploadDir: string,): string {
  const resolved = uploadDir.startsWith("/",) ? uploadDir : join(process.cwd(), uploadDir,);
  const normalized = resolve(resolved,);

  // Block dangerous system roots
  for (const forbidden of FORBIDDEN_ROOTS) {
    if (normalized === forbidden || normalized.startsWith(`${forbidden}/`,)) {
      // /home is special: block root and direct children (/home/user),
      // but allow deeper paths (/home/user/projects)
      if (forbidden === "/home" && normalized !== "/home") {
        const afterHome = normalized.slice(forbidden.length + 1,);
        if (afterHome.includes("/",)) { continue; }
      }
      throw new Error(`Upload directory "${resolved}" resolves to forbidden system path "${normalized}"`,);
    }
  }

  return normalized;
}

/**
 * Store a file on the local filesystem.
 * Returns the relative storage path (e.g., "ab/cd/uuid.jpg").
 */
export function storeFile(uploadDir: string, assetId: string, filename: string, buffer: Buffer,): string {
  const subDir = `${assetId.slice(0, 2,)}/${assetId.slice(2, 4,)}`;
  const fullDir = join(resolveUploadDir(uploadDir,), "raw", subDir,);
  mkdirSync(fullDir, { recursive: true, },);

  // Preserve extension
  const ext = filename.split(".",).pop()?.toLowerCase() ?? "";
  const storageFilename = ext ? `${assetId}.${ext}` : assetId;
  const storagePath = `raw/${subDir}/${storageFilename}`;

  writeFileSync(join(resolveUploadDir(uploadDir,), storagePath,), buffer,);
  return storagePath;
}

/**
 * Delete a file from the local filesystem.
 */
export function deleteFile(uploadDir: string, storagePath: string,): void {
  const fullPath = join(resolveUploadDir(uploadDir,), storagePath,);
  if (existsSync(fullPath,)) { unlinkSync(fullPath,); }
}

/**
 * Resolve the full file path for serving.
 */
export function getAssetFilePath(uploadDir: string, storagePath: string,): string {
  return join(resolveUploadDir(uploadDir,), storagePath,);
}
