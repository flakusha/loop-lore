// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — local filesystem helpers
 */
import fs from "node:fs";
import { homedir, } from "node:os";
import { isAbsolute, join, posix, relative, resolve, sep, win32, } from "node:path";
import { resolveInstancePath, } from "../../config/instance-path";
import { resolveInstanceDir, } from "../../config/state-dir";

/**
 * Dangerous root paths that must never be used as upload directories.
 */
const FORBIDDEN_ROOTS = ["/", "/home", "/root", "/etc", "/usr", "/bin", "/lib", "/var", "/opt",];

/** POSIX baseline with each root's depth budget preserved. */
const BASELINE_ROOTS = FORBIDDEN_ROOTS.map((root,) => ({
  root,
  depth: root === "/" ? 0 : root === "/home" ? 1 : Infinity,
}));

/** Path API matching a path's separator style (win32 for drive-letter paths). */
function pathOpsFor(pathValue: string,) {
  return /^[A-Za-z]:[\\\/]/.test(pathValue,) ? win32 : posix;
}

/**
 * Whether an absolute path hits a forbidden root. `home` is injectable so
 * Windows/macOS shapes can be checked on any host. Depth budgets: 0 = root
 * only, 1 = root + direct children, Infinity = whole subtree.
 * @param absolutePath
 * @param home
 * @returns true when the path is a forbidden system location
 */
export function isForbiddenUploadPath(absolutePath: string, home: string = homedir(),): boolean {
  const ops = pathOpsFor(absolutePath,);
  const homeOps = pathOpsFor(home,);
  const rules = [
    { root: homeOps.parse(home,).root, depth: 0, },
    { root: homeOps.dirname(home,), depth: 1, },
    ...BASELINE_ROOTS,
    { root: home, depth: 1, },
  ];

  for (const { root, depth, } of rules) {
    const rel = ops.relative(root, absolutePath,);
    if (rel === "") { return true; }
    if (rel === ".." || rel.startsWith(`..${ops.sep}`,) || ops.isAbsolute(rel,)) { continue; }
    if (rel.split(ops.sep,).length <= depth) { return true; }
  }

  return false;
}

/** Options for {@link resolveUploadDir}. */
export interface ResolveUploadDirOptions {
  /**
   * Instance dir a relative upload dir resolves against. Defaults to this
   * instance's state dir.
   */
  instanceDir?: string;
}

/**
 * Resolve the upload directory path from config.
 * Relative paths resolve against the instance dir — never the process cwd, so
 * the location does not depend on where the app was launched. A path anchored
 * at the import-frozen DATA_DIR (the shipped default) is re-anchored onto the
 * runtime instance dir; every other absolute path wins as-is.
 * Throws if resolved path is a forbidden system root.
 * @param uploadDir
 * @param opts
 * @returns the resolved absolute upload directory
 * @throws Error when resolved path is a forbidden system root.
 */
export function resolveUploadDir(uploadDir: string, opts?: ResolveUploadDirOptions,): string {
  const base = opts?.instanceDir ?? resolveInstanceDir(process.env,);
  const resolved = resolveInstancePath(uploadDir, { instanceDir: base, },);
  const normalized = resolve(resolved,);

  // Block dangerous system roots
  if (isForbiddenUploadPath(normalized,)) {
    throw new Error(`Upload directory "${resolved}" resolves to forbidden system path "${normalized}"`,);
  }

  return normalized;
}

/**
 * Whether `target` is strictly inside `root`. Uses `relative()` so the check
 * works with either platform's separator and rejects sibling-prefix traps.
 * @param root - the resolved upload root
 * @param target - the resolved candidate path
 * @returns true only for a path under, but not equal to, the root
 */
function isInsideUploadRoot(root: string, target: string,): boolean {
  const rel = relative(root, target,);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`,) && !isAbsolute(rel,);
}

/**
 * Whether a stored `storage_path` resolves inside the given upload dir.
 *
 * `storage_path` is DB-controlled, so a row can point at bytes that live
 * outside this instance's upload dir (another instance's state dir, an
 * absolute path left by an older install). Such a row must never be served
 * or unlinked from here.
 * @param uploadDir
 * @param storagePath
 * @returns true when the path resolves inside the resolved upload dir
 */
export function isStoragePathInUploadDir(uploadDir: string, storagePath: string,): boolean {
  const root = resolveUploadDir(uploadDir,);
  const fullPath = resolve(root, storagePath,);
  return isInsideUploadRoot(root, fullPath,);
}

/**
 * Store a file on the local filesystem.
 * Returns the relative storage path (e.g., "ab/cd/uuid.jpg").
 * @param uploadDir
 * @param assetId
 * @param filename
 * @param buffer
 * @returns the relative storage path (e.g. "ab/cd/uuid.jpg")
 * @throws Error when the resolved target escapes the upload root.
 */
export function storeFile(uploadDir: string, assetId: string, filename: string, buffer: Buffer,): string {
  const root = resolveUploadDir(uploadDir,);
  const subDir = `${assetId.slice(0, 2,)}/${assetId.slice(2, 4,)}`;
  const fullDir = join(root, "raw", subDir,);
  fs.mkdirSync(fullDir, { recursive: true, mode: 0o700, },);

  // Preserve a sanitized extension only: basename (no separators), then a
  // strict charset/length whitelist. A raw filename like "../../evil" or
  // "x/../../../etc/cron" must never influence the on-disk path.
  const base = filename.replaceAll("\\", "/",).split("/",).pop() ?? "";
  const rawExt = base.includes(".",) ? (base.split(".",).pop() ?? "") : "";
  const ext = /^[a-z0-9]{1,10}$/i.test(rawExt,) ? rawExt.toLowerCase() : "";
  const storageFilename = ext ? `${assetId}.${ext}` : assetId;
  const storagePath = `raw/${subDir}/${storageFilename}`;

  const target = join(root, storagePath,);
  // Containment assert: the resolved target must stay inside the upload root.
  if (!isInsideUploadRoot(root, target,)) {
    throw new Error(`Refusing to write outside upload dir: ${target}`,);
  }

  fs.writeFileSync(target, buffer,);
  return storagePath;
}

/**
 * Delete a file from the local filesystem.
 * @param uploadDir
 * @param storagePath
 * @returns void
 * @throws Error when the resolved path escapes the upload root.
 */
export function deleteFile(uploadDir: string, storagePath: string,): void {
  const root = resolveUploadDir(uploadDir,);
  // Containment assert: `storage_path` is DB-controlled, so a tampered row
  // (`../../etc/passwd`, an absolute path, or a sibling-prefix trap such as
  // `../uploads-evil/x`) must never unlink a file outside the upload root.
  const fullPath = resolve(root, storagePath,);
  if (!isInsideUploadRoot(root, fullPath,)) {
    throw new Error(`Refusing to delete outside upload dir: ${fullPath}`,);
  }

  if (fs.existsSync(fullPath,)) { fs.unlinkSync(fullPath,); }
}

/**
 * Resolve the full file path for serving.
 * @param uploadDir
 * @param storagePath
 * @returns the resolved absolute path, guaranteed inside the upload root
 * @throws Error when the resolved path escapes the upload root.
 */
export function getAssetFilePath(uploadDir: string, storagePath: string,): string {
  const root = resolveUploadDir(uploadDir,);
  // Containment assert: `storage_path` is DB-controlled, so a tampered row
  // must never redirect a read outside the upload root.
  const fullPath = resolve(root, storagePath,);
  if (!isInsideUploadRoot(root, fullPath,)) {
    throw new Error(`Refusing to serve outside upload dir: ${fullPath}`,);
  }

  return fullPath;
}
