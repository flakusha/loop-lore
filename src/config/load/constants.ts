// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/constants.ts — Config loader constants

import { envMap, } from "../schema-class";

// Map flat env var names to dot-separated config paths
// Source of truth: envMap() — auto-generated from the schema-class section defaults.
export const ENV_MAP: Record<string, string> = envMap();

// Config file candidates in priority order
export const CONFIG_FILES = ["config.yaml", "config.yml", "config.toml",];

// Optional config layers (merged in order, each overriding the previous):
//   config.default.* → team-shared defaults (committed to git)
//   config.local.*   → per-developer overrides (gitignored)
export const DEFAULT_CONFIG_FILES = ["config.default.yaml", "config.default.yml", "config.default.toml",];
export const LOCAL_CONFIG_FILES = ["config.local.yaml", "config.local.yml", "config.local.toml",];

// Domain config file patterns (config.<domain>.yaml/yml/toml)
export const DOMAIN_CONFIG_EXTENSIONS = [".yaml", ".yml", ".toml",];
export const DOMAINS = [
  "server",
  "database",
  "assets",
  "logging",
  "tui",
  "docs",
  "auth",
  "transport",
  "messages",
  "nsfw",
  "generation",
  "byokey",
  "encryption",
  "headers",
] as const;

/** Known network filesystem mount prefixes (Linux/macOS). */
export const NETWORK_FS_PREFIXES = [
  "/mnt/efs", // AWS EFS
  "/mnt/nfs", // generic NFS
  "/nfs/", // NFS mounts
  "/net/", // automount
  "/cifs/", // SMB/CIFS
  "/smb/", // SMB
  "/Volumes/", // macOS network volumes
  "/gpfs/", // IBM Spectrum Scale
  "/lustre/", // Lustre filesystem
  "/afs/", // Andrew File System
  "/orangefs/", // OrangeFS
  "/pvfs2/", // PVFS2
  "/beegfs/", // BeeGFS
];
