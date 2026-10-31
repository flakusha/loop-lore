// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/guard/sandbox-members.ts — the fs members the Layer 3 sandbox
// intercepts. Pure data, kept beside the sandbox so the type, the read/write
// split and the two-path subset cannot drift from each other or the wrapper.

/** Which side of the filesystem policy a call falls under. */
export type FsScope = "read" | "write";

/**
 * A loose view over an fs module object: every member is an unknown callable.
 * The sandbox only ever calls a member it wrapped itself, so the loose type
 * is honest about what it touches.
 */
export type FsModule = Record<string, ((...args: unknown[]) => unknown) | undefined>;

/**
 * The `node:fs` / `node:fs/promises` members the sandbox intercepts as reads.
 */
export const FS_READ_MEMBERS = [
  "readFileSync",
  "readFile",
  "existsSync",
  "exists",
  "accessSync",
  "access",
  "statSync",
  "stat",
  "lstatSync",
  "lstat",
  "readdirSync",
  "readdir",
  "realpathSync",
  "realpath",
  "createReadStream",
] as const;

/**
 * The `node:fs` / `node:fs/promises` members the sandbox intercepts as writes.
 */
export const FS_WRITE_MEMBERS = [
  "writeFileSync",
  "writeFile",
  "appendFileSync",
  "appendFile",
  "mkdirSync",
  "mkdir",
  "unlinkSync",
  "unlink",
  "rmSync",
  "rm",
  "rmdirSync",
  "rmdir",
  "renameSync",
  "rename",
  "copyFileSync",
  "copyFile",
  "truncateSync",
  "truncate",
  "chmodSync",
  "chmod",
  "chownSync",
  "chown",
  "utimesSync",
  "utimes",
  "createWriteStream",
  "openSync",
  "open",
] as const;

/**
 * A member the sandbox patches. Derived from the two lists above, so the type
 * and the runtime sets cannot drift.
 */
export type FsMember = typeof FS_READ_MEMBERS[number] | typeof FS_WRITE_MEMBERS[number];

/**
 * Members whose first TWO arguments are paths (source and destination).
 * A subset of {@link FS_WRITE_MEMBERS}; membership decides the path count.
 */
export const FS_TWO_PATH_MEMBERS: ReadonlySet<FsMember> = new Set([
  "renameSync",
  "rename",
  "copyFileSync",
  "copyFile",
],);
