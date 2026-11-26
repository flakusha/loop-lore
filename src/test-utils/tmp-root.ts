// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared machine-temp root: every temp artifact lives under one app-owned dir.
 * @param subsystem - child bucket (test, honkbox, fake-acp, db-schema)
 * @returns honored LOOP_LORE_TMP_ROOT (trimmed) or tmpdir(), joined with loop-lore/<subsystem>
 */
import fs from "node:fs";
import { tmpdir, } from "node:os";
import { join, resolve, sep, } from "node:path";

export function appTmpRoot(subsystem: string,): string {
  const override = process.env.LOOP_LORE_TMP_ROOT?.trim();
  const base = override ? override : tmpdir();
  const root = resolve(join(base, "loop-lore", subsystem,),);
  fs.mkdirSync(root, { recursive: true, mode: 0o700, },);
  if (fs.lstatSync(root,).isSymbolicLink()) {
    throw new Error(`appTmpRoot escaped base: ${root}`,);
  }

  const realBase = fs.realpathSync(base,);
  const realRoot = fs.realpathSync(root,);
  if (realRoot !== realBase && !realRoot.startsWith(realBase + sep,)) {
    throw new Error(`appTmpRoot escaped base: ${realRoot}`,);
  }

  return root;
}
